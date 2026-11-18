import { Device, types } from "mediasoup-client";
import { Socket } from "socket.io-client";

const REQUEST_TIMEOUT_MS = 10_000;

export interface RemoteProducerInfo {
  producerId: string;
  socketId: string;
  userId: string;
  userName: string;
}

export interface ConsumedTrack {
  consumer: types.Consumer;
  track: MediaStreamTrack;
  producerId: string;
  socketId: string;
  userId: string;
  userName: string;
}

interface ConsumerData {
  id: string;
  producerId: string;
  kind: "audio" | "video";
  rtpParameters: types.RtpParameters;
  producerUserId: string;
  producerUserName: string;
  producerSocketId: string;
}

/**
 * Client side of one group call on the mediasoup SFU.
 *
 * Lifecycle: join() → start(stream) → consume()… → close().
 * Every request is scoped to the conversation; the server additionally scopes
 * transports/producers/consumers to this socket.
 */
export class MediasoupSFUService {
  private device = new Device();
  private sendTransport: types.Transport | null = null;
  private recvTransport: types.Transport | null = null;
  private producers: types.Producer[] = [];
  private consumers = new Map<string, { consumer: types.Consumer; socketId: string }>(); // by producerId
  private pendingConsumes = new Set<string>();
  private closed = false;

  constructor(
    private socket: Socket,
    private conversationId: string,
    private iceServers: RTCIceServer[]
  ) {}

  private async request<T>(event: string, payload: Record<string, unknown> = {}): Promise<T> {
    const res = (await this.socket
      .timeout(REQUEST_TIMEOUT_MS)
      .emitWithAck(event, { conversationId: this.conversationId, ...payload })) as T & { error?: string };
    if (res?.error) throw new Error(res.error);
    return res;
  }

  public get isClosed() {
    return this.closed;
  }

  /** Whether transports are ready so remote producers can be consumed. */
  public get isReady() {
    return !!this.recvTransport && !this.closed;
  }

  /** Join the call (membership is checked server-side) and load the device. */
  public async join() {
    const { rtpCapabilities } = await this.request<{ rtpCapabilities: types.RtpCapabilities }>("sfu:join-room");
    await this.device.load({ routerRtpCapabilities: rtpCapabilities });
  }

  private async createTransport(direction: "send" | "recv"): Promise<types.Transport> {
    const { transportParams } = await this.request<{ transportParams: types.TransportOptions }>(
      "sfu:create-transport"
    );
    const options = { ...transportParams, iceServers: this.iceServers };
    const transport =
      direction === "send" ? this.device.createSendTransport(options) : this.device.createRecvTransport(options);

    transport.on("connect", ({ dtlsParameters }, callback, errback) => {
      this.request("sfu:connect-transport", { transportId: transport.id, dtlsParameters })
        .then(() => callback())
        .catch(errback);
    });

    if (direction === "send") {
      transport.on("produce", ({ kind, rtpParameters }, callback, errback) => {
        this.request<{ id: string }>("sfu:produce", { transportId: transport.id, kind, rtpParameters })
          .then(({ id }) => callback({ id }))
          .catch(errback);
      });
    }

    return transport;
  }

  /** Create both transports and publish the local tracks. */
  public async start(localStream: MediaStream) {
    this.sendTransport = await this.createTransport("send");
    this.recvTransport = await this.createTransport("recv");

    for (const track of localStream.getTracks()) {
      if (this.closed) return;
      this.producers.push(await this.sendTransport.produce({ track }));
    }
  }

  /** Producers of the other participants already in the call. */
  public async getExistingProducers(): Promise<RemoteProducerInfo[]> {
    const { producers } = await this.request<{ producers: RemoteProducerInfo[] }>("sfu:get-producers");
    return producers;
  }

  /** Consume a remote producer. Returns null if it is already being consumed. */
  public async consume(producerId: string): Promise<ConsumedTrack | null> {
    if (!this.recvTransport) throw new Error("Receive transport not ready");
    if (this.consumers.has(producerId) || this.pendingConsumes.has(producerId)) return null;

    this.pendingConsumes.add(producerId);
    try {
      return await this.consumeOnce(producerId, this.recvTransport);
    } finally {
      this.pendingConsumes.delete(producerId);
    }
  }

  private async consumeOnce(producerId: string, recvTransport: types.Transport): Promise<ConsumedTrack | null> {
    const { consumerData } = await this.request<{ consumerData: ConsumerData }>("sfu:consume", {
      transportId: recvTransport.id,
      producerId,
      rtpCapabilities: this.device.rtpCapabilities,
    });

    if (this.closed) return null;

    const consumer = await recvTransport.consume({
      id: consumerData.id,
      producerId: consumerData.producerId,
      kind: consumerData.kind,
      rtpParameters: consumerData.rtpParameters,
    });
    this.consumers.set(producerId, { consumer, socketId: consumerData.producerSocketId });
    consumer.on("transportclose", () => this.consumers.delete(producerId));

    return {
      consumer,
      track: consumer.track,
      producerId,
      socketId: consumerData.producerSocketId,
      userId: consumerData.producerUserId,
      userName: consumerData.producerUserName,
    };
  }

  /** Release the consumers of a participant who left (the server already closed its side). */
  public removeParticipant(socketId: string) {
    for (const [producerId, entry] of this.consumers) {
      if (entry.socketId === socketId) {
        entry.consumer.close();
        this.consumers.delete(producerId);
      }
    }
  }

  /** Leave the call and release every local media object. */
  public close() {
    if (this.closed) return;
    this.closed = true;

    this.socket.emit("sfu:leave-room", { conversationId: this.conversationId });

    this.producers.forEach((p) => p.close());
    this.producers = [];
    this.consumers.forEach(({ consumer }) => consumer.close());
    this.consumers.clear();
    this.sendTransport?.close();
    this.recvTransport?.close();
    this.sendTransport = null;
    this.recvTransport = null;
  }
}
