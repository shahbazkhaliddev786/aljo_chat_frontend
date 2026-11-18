import { create } from "zustand";

export type CallType = "audio" | "video";
export type CallStatus = "idle" | "calling" | "incoming" | "connected";
export type CallMode = "direct" | "group";

export interface ActiveCallInfo {
  conversationId: string;
  /** Server-side id of a 1-on-1 call (absent for group calls and until the server acknowledges the invite). */
  callId?: string;
  targetUserId?: string;
  targetUserName?: string;
  targetUserAvatar?: string | null;
  callType: CallType;
  mode: CallMode;
  isInitiator?: boolean;
}

export interface RemoteParticipant {
  /** Stable key: the remote socket id (group) or "peer" (1-on-1). */
  socketId: string;
  userId: string;
  userName: string;
  userAvatar?: string | null;
  stream?: MediaStream;
  isAudioMuted?: boolean;
  isVideoMuted?: boolean;
  isSpeaking?: boolean;
}

interface CallState {
  status: CallStatus;
  activeCall: ActiveCallInfo | null;
  localStream: MediaStream | null;
  remoteStreams: Record<string, RemoteParticipant>; // keyed by RemoteParticipant.socketId
  isMicMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  callStartTime: number | null;
  durationSeconds: number;
  /** Short user-facing message about the last call outcome (declined, busy, failed…). */
  notice: string | null;

  // Actions
  setCallStatus: (status: CallStatus) => void;
  setCallConnected: () => void;
  startCall: (info: ActiveCallInfo, stream?: MediaStream) => void;
  setIncomingCall: (info: ActiveCallInfo) => void;
  patchActiveCall: (updates: Partial<ActiveCallInfo>) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  /** Add or replace a participant's stream as a whole (1-on-1 calls). */
  setRemoteStream: (participant: Omit<RemoteParticipant, "stream">, stream: MediaStream) => void;
  /** Add one track to a participant, replacing any previous track of the same kind (group calls). */
  addRemoteTrack: (participant: Omit<RemoteParticipant, "stream">, track: MediaStreamTrack) => void;
  removeRemoteParticipant: (socketId: string) => void;
  updateRemoteParticipant: (socketId: string, updates: Partial<RemoteParticipant>) => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  tickTimer: () => void;
  setNotice: (notice: string | null) => void;
  endCall: () => void;
}

const initialCallState = {
  status: "idle" as CallStatus,
  activeCall: null,
  localStream: null,
  remoteStreams: {},
  isMicMuted: false,
  isCameraOff: false,
  isScreenSharing: false,
  callStartTime: null,
  durationSeconds: 0,
};

export const useCallStore = create<CallState>((set, get) => ({
  ...initialCallState,
  notice: null,

  setCallStatus: (status) => set({ status }),

  setCallConnected: () => {
    if (get().status === "connected") return;
    set({ status: "connected", callStartTime: Date.now(), durationSeconds: 0 });
  },

  startCall: (info, stream) => {
    set({
      ...initialCallState,
      status: "calling",
      activeCall: info,
      localStream: stream || null,
      notice: null,
    });
  },

  setIncomingCall: (info) => {
    set({ ...initialCallState, status: "incoming", activeCall: info, notice: null });
  },

  patchActiveCall: (updates) => {
    set((state) => (state.activeCall ? { activeCall: { ...state.activeCall, ...updates } } : state));
  },

  setLocalStream: (stream) => set({ localStream: stream }),

  setRemoteStream: (participant, stream) => {
    set((state) => ({
      remoteStreams: {
        ...state.remoteStreams,
        [participant.socketId]: {
          ...state.remoteStreams[participant.socketId],
          ...participant,
          // A new MediaStream instance makes <video>/<audio> elements re-bind.
          stream: new MediaStream(stream.getTracks()),
        },
      },
    }));
  },

  addRemoteTrack: (participant, track) => {
    set((state) => {
      const existing = state.remoteStreams[participant.socketId];
      const otherTracks = existing?.stream?.getTracks().filter((t) => t.kind !== track.kind) ?? [];
      return {
        remoteStreams: {
          ...state.remoteStreams,
          [participant.socketId]: {
            ...existing,
            ...participant,
            stream: new MediaStream([...otherTracks, track]),
          },
        },
      };
    });
  },

  removeRemoteParticipant: (socketId) => {
    set((state) => {
      if (!state.remoteStreams[socketId]) return state;
      const next = { ...state.remoteStreams };
      delete next[socketId];
      return { remoteStreams: next };
    });
  },

  updateRemoteParticipant: (socketId, updates) => {
    set((state) => {
      const existing = state.remoteStreams[socketId];
      if (!existing) return state;
      return { remoteStreams: { ...state.remoteStreams, [socketId]: { ...existing, ...updates } } };
    });
  },

  toggleMic: () => {
    const stream = get().localStream;
    if (!stream) return;
    const muted = !get().isMicMuted;
    stream.getAudioTracks().forEach((track) => (track.enabled = !muted));
    set({ isMicMuted: muted });
  },

  toggleCamera: () => {
    const stream = get().localStream;
    if (!stream) return;
    const off = !get().isCameraOff;
    stream.getVideoTracks().forEach((track) => (track.enabled = !off));
    set({ isCameraOff: off });
  },

  tickTimer: () => {
    set((state) => ({ durationSeconds: state.durationSeconds + 1 }));
  },

  setNotice: (notice) => set({ notice }),

  endCall: () => {
    get().localStream?.getTracks().forEach((track) => track.stop());
    set({ ...initialCallState });
  },
}));
