"use client";

import { useRef, useCallback, useEffect } from "react";
import { useSocketStore } from "@/shared/stores/socket.store";
import { useCallStore, CallType } from "@/shared/stores/call.store";
import { WebRTCP2PService } from "@/domains/call/services/webrtc-p2p.service";
import { IConversation } from "@/domains/chat/types";
import { IUser } from "@/domains/user/types";

export function useDirectCall() {
  const socket = useSocketStore((s) => s.socket);
  const {
    activeCall,
    startCall,
    endCall: storeEndCall,
    setLocalStream,
    addRemoteParticipant,
    setCallConnected,
  } = useCallStore();

  const p2pServiceRef = useRef<WebRTCP2PService | null>(null);

  const getOrCreateP2PService = useCallback(() => {
    if (!socket) return null;
    if (!p2pServiceRef.current) {
      p2pServiceRef.current = new WebRTCP2PService(socket);
    }
    return p2pServiceRef.current;
  }, [socket]);

  // Handle incoming socket events for WebRTC signaling
  useEffect(() => {
    if (!socket) return;

    // 1. Caller receives 'call:accepted' from Callee
    const handleCallAccepted = async ({ acceptorSocketId }: { acceptorSocketId: string }) => {
      const p2p = getOrCreateP2PService();
      if (!p2p) return;

      const currentLocalStream = useCallStore.getState().localStream;

      p2p.initPeerConnection(acceptorSocketId, (remoteStream) => {
        addRemoteParticipant({
          socketId: acceptorSocketId,
          userId: acceptorSocketId,
          userName: activeCall?.targetUserName || "Partner",
          stream: remoteStream,
        });
      });

      if (currentLocalStream) {
        p2p.addLocalStream(currentLocalStream);
      }

      setCallConnected();
      await p2p.createOffer(acceptorSocketId);
    };

    // 2. Callee receives SDP offer from Caller
    const handleOffer = async ({ senderSocketId, sdp }: { senderSocketId: string; sdp: RTCSessionDescriptionInit }) => {
      const p2p = getOrCreateP2PService();
      if (!p2p) return;

      const currentLocalStream = useCallStore.getState().localStream;

      p2p.initPeerConnection(senderSocketId, (remoteStream) => {
        addRemoteParticipant({
          socketId: senderSocketId,
          userId: senderSocketId,
          userName: activeCall?.targetUserName || "Partner",
          stream: remoteStream,
        });
      });

      if (currentLocalStream) {
        p2p.addLocalStream(currentLocalStream);
      }

      await p2p.handleOffer(senderSocketId, sdp);
    };

    // 3. Caller receives SDP answer from Callee
    const handleAnswer = async ({ sdp }: { senderSocketId: string; sdp: RTCSessionDescriptionInit }) => {
      if (p2pServiceRef.current) {
        await p2pServiceRef.current.handleAnswer(sdp);
      }
    };

    // 4. Either side receives ICE candidate
    const handleIceCandidate = async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      if (p2pServiceRef.current) {
        await p2pServiceRef.current.handleIceCandidate(candidate);
      }
    };

    // 5. Call rejected by Callee
    const handleRejected = () => {
      if (p2pServiceRef.current) {
        p2pServiceRef.current.cleanup();
        p2pServiceRef.current = null;
      }
      storeEndCall();
    };

    socket.on("call:accepted", handleCallAccepted);
    socket.on("call:offer", handleOffer);
    socket.on("call:answer", handleAnswer);
    socket.on("ice:candidate", handleIceCandidate);
    socket.on("call:rejected", handleRejected);

    return () => {
      socket.off("call:accepted", handleCallAccepted);
      socket.off("call:offer", handleOffer);
      socket.off("call:answer", handleAnswer);
      socket.off("ice:candidate", handleIceCandidate);
      socket.off("call:rejected", handleRejected);
    };
  }, [socket, getOrCreateP2PService, addRemoteParticipant, setCallConnected, storeEndCall, activeCall]);

  const initiateCall = useCallback(
    async (conversation: IConversation, partner: IUser, callType: CallType) => {
      if (!socket) return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: callType === "video",
        });

        startCall(
          {
            conversationId: conversation.id,
            targetUserId: partner.id,
            targetUserName: partner.name,
            targetUserAvatar: partner.avatarUrl,
            callType,
            mode: "direct",
          },
          stream
        );

        socket.emit("call:invite", {
          targetUserId: partner.id,
          conversationId: conversation.id,
          callType,
        });
      } catch (err) {
        console.error("Failed to access media devices for call:", err);
      }
    },
    [socket, startCall]
  );

  const acceptCall = useCallback(
    async (callerSocketId: string, conversationId: string, callType: CallType) => {
      if (!socket) return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: callType === "video",
        });

        setLocalStream(stream);
        setCallConnected();

        const p2p = getOrCreateP2PService();
        if (p2p) {
          p2p.initPeerConnection(callerSocketId, (remoteStream) => {
            addRemoteParticipant({
              socketId: callerSocketId,
              userId: callerSocketId,
              userName: activeCall?.targetUserName || "Partner",
              stream: remoteStream,
            });
          });
          p2p.addLocalStream(stream);
        }

        socket.emit("call:accept", { callerSocketId });
      } catch (err) {
        console.error("Failed to accept call", err);
      }
    },
    [socket, setLocalStream, setCallConnected, getOrCreateP2PService, addRemoteParticipant, activeCall]
  );

  const rejectCall = useCallback(
    (callerSocketId: string) => {
      if (!socket) return;
      socket.emit("call:reject", { callerSocketId, reason: "declined" });
      if (p2pServiceRef.current) {
        p2pServiceRef.current.cleanup();
        p2pServiceRef.current = null;
      }
      storeEndCall();
    },
    [socket, storeEndCall]
  );

  const terminateCall = useCallback(() => {
    if (socket && activeCall) {
      if (activeCall.callerSocketId) {
        socket.emit("call:end", { targetSocketId: activeCall.callerSocketId, conversationId: activeCall.conversationId });
      } else {
        socket.emit("call:end", { conversationId: activeCall.conversationId });
      }
    }

    if (p2pServiceRef.current) {
      p2pServiceRef.current.cleanup();
      p2pServiceRef.current = null;
    }
    storeEndCall();
  }, [socket, activeCall, storeEndCall]);

  return {
    initiateCall,
    acceptCall,
    rejectCall,
    terminateCall,
    p2pServiceRef,
  };
}
