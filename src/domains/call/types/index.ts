import { types } from "mediasoup-client";

export type CallType = "audio" | "video";
export type CallStatus = "idle" | "calling" | "incoming" | "connected";
export type CallMode = "direct" | "group";

export interface IncomingCallEvent {
  callId: string;
  callerUserId: string;
  callerName: string;
  callerAvatar?: string | null;
  conversationId: string;
  callType: CallType;
}

export interface MediasoupInitParams {
  routerRtpCapabilities: types.RtpCapabilities;
}

export interface TransportOptions {
  id: string;
  iceParameters: types.IceParameters;
  iceCandidates: types.IceCandidate[];
  dtlsParameters: types.DtlsParameters;
  sctpParameters?: types.SctpParameters;
}

export interface ConsumerData {
  id: string;
  producerId: string;
  kind: "audio" | "video";
  rtpParameters: types.RtpParameters;
  producerUserId: string;
  producerUserName: string;
}
