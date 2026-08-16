import { Socket } from "socket.io-client";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export class WebRTCP2PService {
  private pc: RTCPeerConnection | null = null;
  private socket: Socket;
  private onRemoteTrackCallback?: (stream: MediaStream) => void;

  constructor(socket: Socket) {
    this.socket = socket;
  }

  public initPeerConnection(
    targetSocketId: string,
    onRemoteTrack: (stream: MediaStream) => void
  ): RTCPeerConnection {
    this.cleanup();

    this.onRemoteTrackCallback = onRemoteTrack;
    this.pc = new RTCPeerConnection(ICE_SERVERS);

    const remoteStream = new MediaStream();

    this.pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
      if (this.onRemoteTrackCallback) {
        this.onRemoteTrackCallback(remoteStream);
      }
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit("ice:candidate", {
          targetSocketId,
          candidate: event.candidate,
        });
      }
    };

    return this.pc;
  }

  public addLocalStream(stream: MediaStream) {
    if (!this.pc) return;
    stream.getTracks().forEach((track) => {
      this.pc?.addTrack(track, stream);
    });
  }

  public async createOffer(targetSocketId: string): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error("PeerConnection not initialized");
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    this.socket.emit("call:offer", {
      targetSocketId,
      sdp: offer,
    });

    return offer;
  }

  public async handleOffer(
    senderSocketId: string,
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error("PeerConnection not initialized");
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    this.socket.emit("call:answer", {
      targetSocketId: senderSocketId,
      sdp: answer,
    });

    return answer;
  }

  public async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  public async handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.pc) return;
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("Failed to add ICE candidate", err);
    }
  }

  public cleanup() {
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.close();
      this.pc = null;
    }
  }
}
