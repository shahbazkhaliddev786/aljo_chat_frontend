"use client";

import { useRef, useCallback, useEffect } from "react";
import { useSocketStore } from "@/shared/stores/socket.store";
import { useCallStore, CallType } from "@/shared/stores/call.store";
import { MediasoupSFUService } from "@/domains/call/services/mediasoup-sfu.service";
import { IConversation } from "@/domains/chat/types";

export function useGroupCall() {
  const socket = useSocketStore((s) => s.socket);
  const {
    startCall,
    endCall: storeEndCall,
    addRemoteParticipant,
    removeRemoteParticipant,
    setCallConnected,
  } = useCallStore();

  const sfuServiceRef = useRef<MediasoupSFUService | null>(null);

  // Listen for SFU events: new-producer & user-left
  useEffect(() => {
    if (!socket) return;

    const handleNewProducer = async ({
      producerId,
      userId,
      userName,
      socketId,
    }: {
      producerId: string;
      userId: string;
      userName: string;
      socketId: string;
    }) => {
      const sfu = sfuServiceRef.current;
      const activeCall = useCallStore.getState().activeCall;

      if (sfu && activeCall && socketId !== socket.id) {
        try {
          const { stream: remoteStream, producerUserId, producerUserName } =
            await sfu.consumeProducer(activeCall.conversationId, producerId);

          addRemoteParticipant({
            socketId,
            userId: producerUserId || userId,
            userName: producerUserName || userName,
            stream: remoteStream,
          });

          // If we were the initiator waiting in "calling" state, transition to "connected"
          const currentStatus = useCallStore.getState().status;
          if (currentStatus === "calling") {
            useCallStore.getState().setCallConnected();
          }
        } catch (err) {
          console.error("Failed to consume new producer:", producerId, err);
        }
      }
    };

    const handleUserLeft = ({ socketId, userId }: { socketId: string; userId: string }) => {
      removeRemoteParticipant(socketId || userId);
    };

    socket.on("sfu:new-producer", handleNewProducer);
    socket.on("sfu:user-left", handleUserLeft);

    return () => {
      socket.off("sfu:new-producer", handleNewProducer);
      socket.off("sfu:user-left", handleUserLeft);
    };
  }, [socket, addRemoteParticipant, removeRemoteParticipant]);

  const joinGroupCall = useCallback(
    async (conversation: IConversation, callType: CallType, isInitiator: boolean = false) => {
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
            targetUserName: conversation.title || "Group Call",
            callType,
            mode: "group",
          },
          stream
        );

        if (isInitiator) {
          // Notify other group members FIRST — before SFU init which may fail
          socket.emit("sfu:initiate-call", {
            conversationId: conversation.id,
            callType,
          });
        }

        sfuServiceRef.current = new MediasoupSFUService(socket);
        const sfu = sfuServiceRef.current;

        await sfu.initDevice(conversation.id);
        await sfu.createSendTransport(conversation.id);
        await sfu.createRecvTransport(conversation.id);

        // Publish local audio track
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          await sfu.produceTrack(audioTrack);
        }

        // Publish local video track if present
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          await sfu.produceTrack(videoTrack);
        }

        // Consume existing producers in the room
        // If producers exist, we're joining an active call — connect immediately
        // If no producers, we're initiating — stay in "calling" until someone joins
        socket.emit("sfu:get-producers", { conversationId: conversation.id }, async (res: { error?: string; producers?: Array<{ producerId: string; kind: string; socketId: string; userId: string; userName: string }> }) => {
          if (res.producers) {
            let hasRemoteProducers = false;
            for (const prod of res.producers) {
              if (prod.socketId !== socket.id) {
                hasRemoteProducers = true;
                try {
                  const { stream: remoteStream, producerUserId, producerUserName } =
                    await sfu.consumeProducer(conversation.id, prod.producerId);

                  addRemoteParticipant({
                    socketId: prod.socketId,
                    userId: producerUserId || prod.userId,
                    userName: producerUserName || prod.userName,
                    stream: remoteStream,
                  });
                } catch (err) {
                  console.error("Failed to consume producer:", prod.producerId, err);
                }
              }
            }

            // If we found remote producers, we're joining an active call — connect now
            if (hasRemoteProducers) {
              setCallConnected();
            }
            // Otherwise, stay in "calling" — setCallConnected will be triggered
            // when handleNewProducer fires (someone else joins)
          }
        });
      } catch (err) {
        console.error("Failed to join group call:", err);
      }
    },
    [socket, startCall, setCallConnected, addRemoteParticipant]
  );

  const leaveGroupCall = useCallback(
    (conversationId: string) => {
      if (sfuServiceRef.current) {
        sfuServiceRef.current.cleanup(conversationId);
        sfuServiceRef.current = null;
      }
      storeEndCall();
    },
    [storeEndCall]
  );

  return {
    joinGroupCall,
    leaveGroupCall,
    sfuServiceRef,
  };
}
