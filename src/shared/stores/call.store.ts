import { create } from "zustand";

export type CallType = "audio" | "video";
export type CallStatus = "idle" | "calling" | "incoming" | "connected";
export type CallMode = "direct" | "group";

export interface ActiveCallInfo {
  conversationId: string;
  targetUserId?: string;
  targetUserName?: string;
  targetUserAvatar?: string | null;
  callType: CallType;
  mode: CallMode;
  callerSocketId?: string;
}

export interface RemoteParticipant {
  socketId: string;
  userId: string;
  userName: string;
  userAvatar?: string | null;
  stream?: MediaStream;
  audioProducerId?: string;
  videoProducerId?: string;
  isAudioMuted?: boolean;
  isVideoMuted?: boolean;
  isSpeaking?: boolean;
}

interface CallState {
  status: CallStatus;
  activeCall: ActiveCallInfo | null;
  localStream: MediaStream | null;
  remoteStreams: Record<string, RemoteParticipant>; // socketId or userId -> RemoteParticipant
  isMicMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  callStartTime: number | null;
  durationSeconds: number;

  // Actions
  setCallStatus: (status: CallStatus) => void;
  setCallConnected: () => void;
  startCall: (info: ActiveCallInfo, stream?: MediaStream) => void;
  setIncomingCall: (info: ActiveCallInfo) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  addRemoteParticipant: (participant: RemoteParticipant) => void;
  removeRemoteParticipant: (id: string) => void;
  updateRemoteParticipant: (id: string, updates: Partial<RemoteParticipant>) => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  tickTimer: () => void;
  endCall: () => void;
}

export const useCallStore = create<CallState>((set, get) => ({
  status: "idle",
  activeCall: null,
  localStream: null,
  remoteStreams: {},
  isMicMuted: false,
  isCameraOff: false,
  isScreenSharing: false,
  callStartTime: null,
  durationSeconds: 0,

  setCallStatus: (status) => set({ status }),

  setCallConnected: () => {
    set({
      status: "connected",
      callStartTime: Date.now(),
      durationSeconds: 0,
    });
  },

  startCall: (info, stream) => {
    set({
      status: "calling",
      activeCall: info,
      localStream: stream || null,
      remoteStreams: {},
      isMicMuted: false,
      isCameraOff: false,
      callStartTime: null,
      durationSeconds: 0,
    });
  },

  setIncomingCall: (info) => {
    set({
      status: "incoming",
      activeCall: info,
      callStartTime: null,
      durationSeconds: 0,
    });
  },

  setLocalStream: (stream) => set({ localStream: stream }),

  addRemoteParticipant: (participant) => {
    set((state) => {
      const id = participant.socketId || participant.userId;
      const existing = state.remoteStreams[id];
      
      let finalStream = participant.stream;
      
      // If we already have a stream for this user, merge the tracks to prevent overwriting (e.g. audio track followed by video track)
      if (existing && existing.stream && participant.stream) {
        finalStream = existing.stream;
        participant.stream.getTracks().forEach((track) => {
          // Remove any existing track of the same kind to prevent duplicates
          const existingTracks = finalStream!.getTracks().filter((t) => t.kind === track.kind);
          existingTracks.forEach((t) => {
            finalStream!.removeTrack(t);
            t.stop();
          });
          finalStream!.addTrack(track);
        });
      }

      return {
        remoteStreams: {
          ...state.remoteStreams,
          [id]: {
            ...existing,
            ...participant,
            stream: finalStream,
          },
        },
      };
    });
  },

  removeRemoteParticipant: (id) => {
    set((state) => {
      const next = { ...state.remoteStreams };
      delete next[id];
      return { remoteStreams: next };
    });
  },

  updateRemoteParticipant: (id, updates) => {
    set((state) => {
      const existing = state.remoteStreams[id];
      if (!existing) return state;
      return {
        remoteStreams: {
          ...state.remoteStreams,
          [id]: { ...existing, ...updates },
        },
      };
    });
  },

  toggleMic: () => {
    const stream = get().localStream;
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      set((state) => ({ isMicMuted: !state.isMicMuted }));
    }
  },

  toggleCamera: () => {
    const stream = get().localStream;
    if (stream) {
      const videoTracks = stream.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      set((state) => ({ isCameraOff: !state.isCameraOff }));
    }
  },

  tickTimer: () => {
    set((state) => ({ durationSeconds: state.durationSeconds + 1 }));
  },

  endCall: () => {
    const stream = get().localStream;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    set({
      status: "idle",
      activeCall: null,
      localStream: null,
      remoteStreams: {},
      isMicMuted: false,
      isCameraOff: false,
      isScreenSharing: false,
      callStartTime: null,
      durationSeconds: 0,
    });
  },
}));
