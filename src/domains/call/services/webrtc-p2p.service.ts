/**
 * One RTCPeerConnection for a 1-on-1 call.
 *
 * Signaling is delegated to the caller through `sendSignal`, which addresses the
 * server-side call by id (the server relays to the other participant).
 *
 * Remote ICE candidates that arrive before the remote description is set are
 * queued and applied afterwards — otherwise they are rejected by the browser
 * and connectivity becomes intermittent.
 */

type Signal =
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "candidate"; candidate: RTCIceCandidateInit };

interface P2POptions {
  iceServers: RTCIceServer[];
  sendSignal: (signal: Signal) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}

export class WebRTCP2PService {
  private pc: RTCPeerConnection;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteStream = new MediaStream();
  private closed = false;

  constructor(private options: P2POptions) {
    this.pc = new RTCPeerConnection({ iceServers: options.iceServers });

    this.pc.ontrack = (event) => {
      const tracks = event.streams[0]?.getTracks() ?? [event.track];
      tracks.forEach((track) => {
        if (!this.remoteStream.getTracks().some((t) => t.id === track.id)) {
          this.remoteStream.addTrack(track);
        }
      });
      this.options.onRemoteStream(this.remoteStream);
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.options.sendSignal({ type: "candidate", candidate: event.candidate.toJSON() });
      }
    };

    this.pc.onconnectionstatechange = () => {
      this.options.onConnectionStateChange?.(this.pc.connectionState);
    };
  }

  public addLocalStream(stream: MediaStream) {
    stream.getTracks().forEach((track) => this.pc.addTrack(track, stream));
  }

  /** Caller side: create and send the offer. */
  public async createOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.options.sendSignal({ type: "offer", sdp: offer });
  }

  /** Caller side: renegotiate with fresh ICE credentials after the connection failed. */
  public async restartIce() {
    if (this.closed) return;
    const offer = await this.pc.createOffer({ iceRestart: true });
    await this.pc.setLocalDescription(offer);
    this.options.sendSignal({ type: "offer", sdp: offer });
  }

  /** Callee side: apply the offer (initial or ICE restart) and send back an answer. */
  public async handleOffer(offer: RTCSessionDescriptionInit) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    await this.flushPendingCandidates();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.options.sendSignal({ type: "answer", sdp: answer });
  }

  /** Caller side: apply the answer. */
  public async handleAnswer(answer: RTCSessionDescriptionInit) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    await this.flushPendingCandidates();
  }

  public async addIceCandidate(candidate: RTCIceCandidateInit) {
    if (this.closed) return;
    if (!this.pc.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("Failed to add ICE candidate", err);
    }
  }

  private async flushPendingCandidates() {
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) {
      await this.addIceCandidate(candidate);
    }
  }

  public close() {
    if (this.closed) return;
    this.closed = true;
    this.pendingCandidates = [];
    this.pc.ontrack = null;
    this.pc.onicecandidate = null;
    this.pc.onconnectionstatechange = null;
    this.pc.close();
  }
}
