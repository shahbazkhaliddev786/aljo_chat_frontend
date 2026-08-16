import { Device, types } from "mediasoup-client";
import { Socket } from "socket.io-client";

interface RouterCapabilitiesResponse {
  error?: string;
  rtpCapabilities?: types.RtpCapabilities;
}

interface TransportParamsResponse {
  error?: string;
  transportParams?: types.TransportOptions;
}

interface ConnectTransportResponse {
  error?: string;
}

interface ProduceResponse {
  error?: string;
  id?: string;
}

interface ConsumeResponse {
  error?: string;
  consumerData?: {
    id: string;
    producerId: string;
    kind: "audio" | "video";
    rtpParameters: types.RtpParameters;
    producerUserId: string;
    producerUserName: string;
  };
}

export class MediasoupSFUService {
  private device: Device | null = null;
  private sendTransport: types.Transport | null = null;
  private recvTransport: types.Transport | null = null;
  private producers: Map<string, types.Producer> = new Map();
  private consumers: Map<string, types.Consumer> = new Map();
  private socket: Socket;

  constructor(socket: Socket) {
    this.socket = socket;
  }

  public async initDevice(conversationId: string): Promise<Device> {
    if (this.device && this.device.loaded) return this.device;

    this.device = new Device();

    const { rtpCapabilities } = await new Promise<{ rtpCapabilities: types.RtpCapabilities }>((resolve, reject) => {
      this.socket.emit("sfu:get-router-rtp-capabilities", { conversationId }, (res: RouterCapabilitiesResponse) => {
        if (res.error) reject(new Error(res.error));
        else if (res.rtpCapabilities) resolve({ rtpCapabilities: res.rtpCapabilities });
        else reject(new Error("No capabilities returned"));
      });
    });

    await this.device.load({ routerRtpCapabilities: rtpCapabilities });
    return this.device;
  }

  public async createSendTransport(conversationId: string): Promise<types.Transport> {
    if (!this.device) throw new Error("Device not initialized");

    const { transportParams } = await new Promise<{ transportParams: types.TransportOptions }>((resolve, reject) => {
      this.socket.emit("sfu:create-transport", { conversationId }, (res: TransportParamsResponse) => {
        if (res.error) reject(new Error(res.error));
        else if (res.transportParams) resolve({ transportParams: res.transportParams });
        else reject(new Error("No transport params returned"));
      });
    });

    this.sendTransport = this.device.createSendTransport(transportParams);

    this.sendTransport.on("connect", ({ dtlsParameters }: { dtlsParameters: types.DtlsParameters }, callback: () => void, errback: (err: Error) => void) => {
      this.socket.emit(
        "sfu:connect-transport",
        { conversationId, transportId: this.sendTransport!.id, dtlsParameters },
        (res: ConnectTransportResponse) => {
          if (res.error) errback(new Error(res.error));
          else callback();
        }
      );
    });

    this.sendTransport.on(
      "produce",
      ({ kind, rtpParameters }: { kind: types.MediaKind; rtpParameters: types.RtpParameters }, callback: (data: { id: string }) => void, errback: (err: Error) => void) => {
        this.socket.emit(
          "sfu:produce",
          { conversationId, transportId: this.sendTransport!.id, kind, rtpParameters },
          (res: ProduceResponse) => {
            if (res.error) errback(new Error(res.error));
            else if (res.id) callback({ id: res.id });
            else errback(new Error("No producer ID returned"));
          }
        );
      }
    );

    return this.sendTransport;
  }

  public async createRecvTransport(conversationId: string): Promise<types.Transport> {
    if (!this.device) throw new Error("Device not initialized");

    const { transportParams } = await new Promise<{ transportParams: types.TransportOptions }>((resolve, reject) => {
      this.socket.emit("sfu:create-transport", { conversationId }, (res: TransportParamsResponse) => {
        if (res.error) reject(new Error(res.error));
        else if (res.transportParams) resolve({ transportParams: res.transportParams });
        else reject(new Error("No transport params returned"));
      });
    });

    this.recvTransport = this.device.createRecvTransport(transportParams);

    this.recvTransport.on("connect", ({ dtlsParameters }: { dtlsParameters: types.DtlsParameters }, callback: () => void, errback: (err: Error) => void) => {
      this.socket.emit(
        "sfu:connect-transport",
        { conversationId, transportId: this.recvTransport!.id, dtlsParameters },
        (res: ConnectTransportResponse) => {
          if (res.error) errback(new Error(res.error));
          else callback();
        }
      );
    });

    return this.recvTransport;
  }

  public async produceTrack(track: MediaStreamTrack): Promise<types.Producer> {
    if (!this.sendTransport) throw new Error("Send transport not created");
    const producer = await this.sendTransport.produce({ track });
    this.producers.set(track.kind, producer);
    return producer;
  }

  public async consumeProducer(
    conversationId: string,
    producerId: string
  ): Promise<{ consumer: types.Consumer; stream: MediaStream; producerUserId: string; producerUserName: string }> {
    if (!this.recvTransport || !this.device) throw new Error("Recv transport not initialized");

    const { consumerData } = await new Promise<{
      consumerData: {
        id: string;
        producerId: string;
        kind: "audio" | "video";
        rtpParameters: types.RtpParameters;
        producerUserId: string;
        producerUserName: string;
      };
    }>((resolve, reject) => {
      this.socket.emit(
        "sfu:consume",
        {
          conversationId,
          transportId: this.recvTransport!.id,
          producerId,
          rtpCapabilities: this.device!.rtpCapabilities,
        },
        (res: ConsumeResponse) => {
          if (res.error) reject(new Error(res.error));
          else if (res.consumerData) resolve({ consumerData: res.consumerData });
          else reject(new Error("No consumer data returned"));
        }
      );
    });

    const consumer = await this.recvTransport.consume({
      id: consumerData.id,
      producerId: consumerData.producerId,
      kind: consumerData.kind,
      rtpParameters: consumerData.rtpParameters,
    });

    this.consumers.set(consumer.id, consumer);

    const stream = new MediaStream([consumer.track]);

    return {
      consumer,
      stream,
      producerUserId: consumerData.producerUserId,
      producerUserName: consumerData.producerUserName,
    };
  }

  public cleanup(conversationId?: string) {
    if (conversationId && this.socket) {
      this.socket.emit("sfu:leave-room", { conversationId });
    }

    this.producers.forEach((p) => p.close());
    this.producers.clear();

    this.consumers.forEach((c) => c.close());
    this.consumers.clear();

    if (this.sendTransport) {
      this.sendTransport.close();
      this.sendTransport = null;
    }

    if (this.recvTransport) {
      this.recvTransport.close();
      this.recvTransport = null;
    }

    this.device = null;
  }
}
