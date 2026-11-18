import { Socket } from "socket.io-client";
import { useSocketStore } from "@/shared/stores/socket.store";
import { useAuthStore } from "@/shared/stores/auth.store";
import { useCallStore, CallType } from "@/shared/stores/call.store";
import { IConversation } from "@/domains/chat/types";
import { WebRTCP2PService } from "./webrtc-p2p.service";
import { MediasoupSFUService } from "./mediasoup-sfu.service";
import { getIceServers } from "./ice";

/**
 * The single owner of call state for the whole app.
 *
 * Previously every component that used the call hooks got its own copy of the
 * peer connection / SFU client and its own socket listeners, so one call
 * created several peer connections and "End call" often closed the wrong one.
 * Now there is exactly one peer connection or SFU client at a time, socket
 * listeners are attached once (see CallProvider), and UI components only call
 * the exported actions.
 */

const ACK_TIMEOUT_MS = 10_000;
const NOTICE_MS = 4_000;
const GROUP_RING_TIMEOUT_MS = 45_000;
/** How long an answered call may take to get media flowing. */
const CONNECT_TIMEOUT_MS = 30_000;
/** Grace period for a "disconnected" peer connection to recover by itself. */
const DISCONNECT_GRACE_MS = 8_000;
/** How long an ICE restart may take before the call is dropped. */
const ICE_RESTART_TIMEOUT_MS = 15_000;

interface RemotePeer {
  userId: string;
  userName: string;
  userAvatar?: string | null;
}

interface AckResponse {
  error?: string;
  code?: string;
  callId?: string;
}

let p2p: WebRTCP2PService | null = null;
let sfu: MediasoupSFUService | null = null;
/** New-producer events that arrived before the SFU transports were ready. */
let pendingProducerIds: string[] = [];
/** Incremented for every group join; stale async steps compare against it. */
let groupSession = 0;
let groupRingTimer: ReturnType<typeof setTimeout> | null = null;
let isAccepting = false;
let connectTimer: ReturnType<typeof setTimeout> | null = null;
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
let iceRestartAttempted = false;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

const store = () => useCallStore.getState();
const getSocket = () => useSocketStore.getState().socket;
const stopStream = (stream: MediaStream) => stream.getTracks().forEach((t) => t.stop());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function showCallNotice(message: string) {
  store().setNotice(message);
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    if (store().notice === message) store().setNotice(null);
  }, NOTICE_MS);
}

async function getLocalMedia(callType: CallType): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: callType === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
  });
}

function mediaErrorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError") return "Microphone/camera permission was denied";
  if (name === "NotFoundError") return "No microphone or camera was found";
  if (name === "NotReadableError") return "Your microphone or camera is in use by another app";
  return "Could not access your microphone or camera";
}

async function emitWithAck(socket: Socket, event: string, payload: Record<string, unknown>): Promise<AckResponse> {
  try {
    return (await socket.timeout(ACK_TIMEOUT_MS).emitWithAck(event, payload)) as AckResponse;
  } catch {
    return { error: "The server did not respond" };
  }
}

function clearConnectTimers() {
  if (connectTimer) clearTimeout(connectTimer);
  if (disconnectTimer) clearTimeout(disconnectTimer);
  connectTimer = null;
  disconnectTimer = null;
}

/**
 * Enter the "connecting" state. If media is not flowing within `timeoutMs`,
 * the call is dropped instead of hanging forever.
 */
function beginConnecting(timeoutMs = CONNECT_TIMEOUT_MS, failureNotice = "Could not connect the call") {
  store().setCallStatus("connecting");
  if (connectTimer) clearTimeout(connectTimer);
  connectTimer = setTimeout(() => {
    connectTimer = null;
    if (store().status === "connecting") hangUp(failureNotice);
  }, timeoutMs);
}

/** Media is flowing. */
function markConnected() {
  clearConnectTimers();
  store().setCallConnected();
}

/** Release every media object of the current call and reset the store. */
function teardown(notice?: string) {
  clearConnectTimers();
  iceRestartAttempted = false;
  if (groupRingTimer) clearTimeout(groupRingTimer);
  groupRingTimer = null;
  groupSession++;
  isAccepting = false;
  pendingProducerIds = [];

  p2p?.close();
  p2p = null;
  sfu?.close(); // also tells the server we left the group call
  sfu = null;

  store().endCall();
  if (notice) showCallNotice(notice);
}

// ---------------------------------------------------------------------------
// Public actions
// ---------------------------------------------------------------------------

/** Hang up whatever call is active (direct or group). */
export function hangUp(notice?: string) {
  const call = store().activeCall;
  if (call?.mode === "direct" && call.callId) {
    getSocket()?.emit("call:end", { callId: call.callId });
  }
  teardown(notice);
}

export async function startCall(conversation: IConversation, callType: CallType) {
  if (conversation.type === "group") return joinGroupCall(conversation, callType, true);

  const currentUserId = useAuthStore.getState().user?.id;
  const partner = conversation.members.find((m) => m.id !== currentUserId);
  if (!partner) return showCallNotice("There is no one to call in this conversation");
  return startDirectCall(conversation, partner, callType);
}

/** Accept the ringing call. For group calls the conversation must be provided. */
export async function acceptIncomingCall(conversation?: IConversation) {
  const call = store().activeCall;
  if (store().status !== "incoming" || !call || isAccepting) return;

  if (call.mode === "group") {
    if (!conversation) return teardown("This group is no longer available");
    return joinGroupCall(conversation, call.callType, false);
  }

  const socket = getSocket();
  const callId = call.callId;
  if (!socket || !callId) return teardown();

  isAccepting = true;
  beginConnecting();
  let stream: MediaStream;
  try {
    stream = await getLocalMedia(call.callType);
  } catch (err) {
    socket.emit("call:reject", { callId });
    return teardown(mediaErrorMessage(err));
  }

  const iceServers = await getIceServers();
  if (store().activeCall?.callId !== callId) {
    // The caller hung up while we were getting ready.
    stopStream(stream);
    isAccepting = false;
    return;
  }

  store().setLocalStream(stream);
  // Create the peer connection before accepting so the caller's offer always finds it.
  const service = createP2P(callId, iceServers, {
    userId: call.targetUserId || "",
    userName: call.targetUserName || "Partner",
    userAvatar: call.targetUserAvatar,
  });
  p2p = service;
  service.addLocalStream(stream);

  const res = await emitWithAck(socket, "call:accept", { callId });
  if (p2p !== service) return; // hung up while waiting
  isAccepting = false;
  if (res.error) return teardown("This call is no longer available");
  // Stays "connecting" until the peer connection reports media is flowing.
}

export function rejectIncomingCall() {
  const call = store().activeCall;
  if (call?.mode === "direct" && call.callId) {
    getSocket()?.emit("call:reject", { callId: call.callId, reason: "declined" });
  }
  teardown();
}

// ---------------------------------------------------------------------------
// 1-on-1 calls (P2P)
// ---------------------------------------------------------------------------

function createP2P(callId: string, iceServers: RTCIceServer[], peer: RemotePeer): WebRTCP2PService {
  const service: WebRTCP2PService = new WebRTCP2PService({
    iceServers,
    sendSignal: (signal) => {
      const socket = getSocket();
      if (!socket) return;
      if (signal.type === "candidate") socket.emit("ice:candidate", { callId, candidate: signal.candidate });
      else socket.emit(signal.type === "offer" ? "call:offer" : "call:answer", { callId, sdp: signal.sdp });
    },
    onRemoteStream: (stream) => {
      if (p2p === service) store().setRemoteStream({ socketId: "peer", ...peer }, stream);
    },
    onConnectionStateChange: (state) => {
      if (p2p === service) handleP2PConnectionState(service, state);
    },
  });
  return service;
}

/**
 * Recovery for 1-on-1 calls: a short network blip ("disconnected") gets a grace
 * period, and a failed connection gets one ICE restart (driven by the caller)
 * before the call is dropped.
 */
function handleP2PConnectionState(service: WebRTCP2PService, state: RTCPeerConnectionState) {
  if (state === "connected") {
    markConnected();
    return;
  }

  if (state === "disconnected") {
    if (disconnectTimer) return;
    disconnectTimer = setTimeout(() => {
      disconnectTimer = null;
      if (p2p === service && store().status === "connected") recoverP2P(service);
    }, DISCONNECT_GRACE_MS);
    return;
  }

  if (state === "failed") recoverP2P(service);
}

function recoverP2P(service: WebRTCP2PService) {
  if (iceRestartAttempted) return hangUp("The call connection was lost");
  iceRestartAttempted = true;

  // Only the caller restarts ICE (avoids both sides sending offers at once);
  // the callee waits for the caller's new offer.
  beginConnecting(ICE_RESTART_TIMEOUT_MS, "The call connection was lost");
  if (store().activeCall?.isInitiator) {
    service.restartIce().catch((err) => {
      console.error("ICE restart failed", err);
      hangUp("The call connection was lost");
    });
  }
}

async function startDirectCall(
  conversation: IConversation,
  partner: { id: string; name: string; avatarUrl?: string | null },
  callType: CallType
) {
  const socket = getSocket();
  if (!socket?.connected) return showCallNotice("You are offline. Please wait for the connection to return.");
  if (store().status !== "idle") return;

  let stream: MediaStream;
  try {
    stream = await getLocalMedia(callType);
  } catch (err) {
    return showCallNotice(mediaErrorMessage(err));
  }
  if (store().status !== "idle") return stopStream(stream);

  store().startCall(
    {
      conversationId: conversation.id,
      targetUserId: partner.id,
      targetUserName: partner.name,
      targetUserAvatar: partner.avatarUrl,
      callType,
      mode: "direct",
      isInitiator: true,
    },
    stream
  );

  const res = await emitWithAck(socket, "call:invite", { conversationId: conversation.id, callType });

  // The user may have hung up while waiting for the server.
  if (store().localStream !== stream) {
    if (res.callId) socket.emit("call:end", { callId: res.callId });
    return;
  }

  if (res.error || !res.callId) {
    const messages: Record<string, string> = {
      offline: `${partner.name} is offline`,
      busy: `${partner.name} is on another call`,
      "self-busy": "You are already in a call",
    };
    return teardown((res.code && messages[res.code]) || res.error || "Could not start the call");
  }

  store().patchActiveCall({ callId: res.callId });
}

const isCurrentDirectCall = (callId: unknown) => {
  const call = store().activeCall;
  return !!call && call.mode === "direct" && !!call.callId && call.callId === callId;
};

async function handleCallAccepted({ callId }: { callId: string }) {
  if (!isCurrentDirectCall(callId) || p2p) return;
  const call = store().activeCall!;

  const iceServers = await getIceServers();
  if (!isCurrentDirectCall(callId) || p2p) return;

  p2p = createP2P(callId, iceServers, {
    userId: call.targetUserId || "",
    userName: call.targetUserName || "Partner",
    userAvatar: call.targetUserAvatar,
  });
  const local = store().localStream;
  if (local) p2p.addLocalStream(local);
  beginConnecting();

  try {
    await p2p.createOffer();
  } catch (err) {
    console.error("Failed to create offer", err);
    hangUp("Could not connect the call");
  }
}

async function handleOffer({ callId, sdp }: { callId: string; sdp: RTCSessionDescriptionInit }) {
  if (!isCurrentDirectCall(callId) || !p2p) return;
  try {
    await p2p.handleOffer(sdp);
  } catch (err) {
    console.error("Failed to handle offer", err);
    hangUp("Could not connect the call");
  }
}

async function handleAnswer({ callId, sdp }: { callId: string; sdp: RTCSessionDescriptionInit }) {
  if (!isCurrentDirectCall(callId) || !p2p) return;
  try {
    await p2p.handleAnswer(sdp);
  } catch (err) {
    console.error("Failed to handle answer", err);
    hangUp("Could not connect the call");
  }
}

function handleIceCandidate({ callId, candidate }: { callId: string; candidate: RTCIceCandidateInit }) {
  if (isCurrentDirectCall(callId) && p2p) void p2p.addIceCandidate(candidate);
}

function handleIncomingCall(data: {
  callId: string;
  conversationId: string;
  callType: CallType;
  callerUserId: string;
  callerName: string;
  callerAvatar?: string | null;
}) {
  if (store().status !== "idle") {
    getSocket()?.emit("call:reject", { callId: data.callId, reason: "busy" });
    return;
  }
  store().setIncomingCall({
    conversationId: data.conversationId,
    callId: data.callId,
    targetUserId: data.callerUserId,
    targetUserName: data.callerName,
    targetUserAvatar: data.callerAvatar,
    callType: data.callType,
    mode: "direct",
  });
}

function handleCallRejected({ callId, reason }: { callId: string; reason?: string }) {
  if (!isCurrentDirectCall(callId)) return;
  const name = store().activeCall?.targetUserName || "The user";
  teardown(reason === "busy" ? `${name} is on another call` : `${name} declined the call`);
}

function handleCallEnded({ callId, reason }: { callId: string; reason?: string }) {
  if (!isCurrentDirectCall(callId)) return;
  const notices: Record<string, string> = {
    "no-answer": "No answer",
    unavailable: "The user is unavailable",
    disconnected: "The call ended because the other side lost connection",
  };
  teardown(reason ? notices[reason] : undefined);
}

// ---------------------------------------------------------------------------
// Group calls (mediasoup SFU)
// ---------------------------------------------------------------------------

async function consumeRemote(service: MediasoupSFUService, producerId: string) {
  try {
    const consumed = await service.consume(producerId);
    if (!consumed || sfu !== service) return;
    store().addRemoteTrack(
      { socketId: consumed.socketId, userId: consumed.userId, userName: consumed.userName },
      consumed.track
    );
    markConnected();
  } catch (err) {
    console.error("Failed to consume producer", producerId, err);
  }
}

async function joinGroupCall(conversation: IConversation, callType: CallType, isInitiator: boolean) {
  const socket = getSocket();
  if (!socket?.connected) return showCallNotice("You are offline. Please wait for the connection to return.");

  const { status, activeCall } = store();
  const isAnsweringThisCall = status === "incoming" && activeCall?.conversationId === conversation.id;
  if (status !== "idle" && !isAnsweringThisCall) return;
  if (isAnsweringThisCall && isAccepting) return;
  isAccepting = true;

  const session = ++groupSession;
  let stream: MediaStream;
  try {
    stream = await getLocalMedia(callType);
  } catch (err) {
    return teardown(mediaErrorMessage(err));
  }
  if (session !== groupSession) return stopStream(stream);

  store().startCall(
    {
      conversationId: conversation.id,
      targetUserName: conversation.title || "Group Call",
      callType,
      mode: "group",
      isInitiator,
    },
    stream
  );
  isAccepting = false;
  // Someone joining an existing call connects right away; the initiator rings.
  if (!isInitiator) beginConnecting();

  const service: MediasoupSFUService = new MediasoupSFUService(socket, conversation.id, await getIceServers(), () => {
    if (sfu === service) teardown("The call connection was lost");
  });
  if (session !== groupSession) return;
  sfu = service;

  try {
    await service.join();
    await service.start(stream);
    if (sfu !== service) return;

    if (isInitiator) {
      // Ring the group only once our media is published, so anyone who
      // answers immediately already finds us in the call.
      const res = await emitWithAck(socket, "sfu:initiate-call", { conversationId: conversation.id, callType });
      if (res.error) throw new Error(res.error);
      groupRingTimer = setTimeout(() => {
        if (sfu === service && store().status === "calling") hangUp("No one answered");
      }, GROUP_RING_TIMEOUT_MS);
    }

    const existing = await service.getExistingProducers();
    if (sfu !== service) return;

    if (!isInitiator && existing.length === 0) {
      return teardown("This call has already ended");
    }

    const queued = pendingProducerIds;
    pendingProducerIds = [];
    await Promise.all([...existing.map((p) => p.producerId), ...queued].map((id) => consumeRemote(service, id)));
  } catch (err) {
    console.error("Failed to join group call", err);
    if (sfu === service) teardown("Could not join the call");
  }
}

function handleNewProducer({ conversationId, producerId }: { conversationId: string; producerId: string }) {
  const call = store().activeCall;
  if (!sfu || call?.mode !== "group" || call.conversationId !== conversationId) return;
  if (!sfu.isReady) {
    pendingProducerIds.push(producerId);
    return;
  }
  void consumeRemote(sfu, producerId);
}

function handleUserLeft({ conversationId, socketId }: { conversationId: string; socketId: string }) {
  const call = store().activeCall;
  if (call?.mode !== "group" || call.conversationId !== conversationId) return;
  sfu?.removeParticipant(socketId);
  store().removeRemoteParticipant(socketId);
}

function handleGroupCallStarted(data: {
  conversationId: string;
  callType: CallType;
  callerUserId: string;
  callerName: string;
  callerAvatar?: string | null;
}) {
  if (store().status !== "idle") return;
  store().setIncomingCall({
    conversationId: data.conversationId,
    targetUserId: data.callerUserId,
    targetUserName: data.callerName,
    targetUserAvatar: data.callerAvatar,
    callType: data.callType,
    mode: "group",
  });
}

function handleGroupCallEnded({ conversationId }: { conversationId: string }) {
  const { status, activeCall } = store();
  if (status === "incoming" && activeCall?.mode === "group" && activeCall.conversationId === conversationId) {
    teardown();
  }
}

// ---------------------------------------------------------------------------
// Membership changes & connectivity
// ---------------------------------------------------------------------------

function handleRemovedFromConversation({
  conversationId,
  removedUserId,
}: {
  conversationId: string;
  removedUserId?: string;
}) {
  const currentUserId = useAuthStore.getState().user?.id;
  if (removedUserId && removedUserId !== currentUserId) return;
  if (store().activeCall?.conversationId === conversationId) teardown("This conversation is no longer available");
}

function handleDisconnect() {
  // The server ends every call of a disconnected socket, so the call cannot resume.
  if (store().status !== "idle") teardown("Connection lost. The call has ended.");
}

/** Attach all call-related socket listeners. Returns a function that detaches them. */
export function attachCallHandlers(socket: Socket): () => void {
  const handlers: Array<[string, (...args: never[]) => void]> = [
    ["call:incoming", handleIncomingCall],
    ["call:accepted", handleCallAccepted],
    ["call:rejected", handleCallRejected],
    ["call:ended", handleCallEnded],
    ["call:offer", handleOffer],
    ["call:answer", handleAnswer],
    ["ice:candidate", handleIceCandidate],
    ["sfu:new-producer", handleNewProducer],
    ["sfu:user-left", handleUserLeft],
    ["group:call:started", handleGroupCallStarted],
    ["group:call:ended", handleGroupCallEnded],
    ["member_removed_from_group", handleRemovedFromConversation],
    ["group_deleted", handleRemovedFromConversation],
    ["conversation_deleted", handleRemovedFromConversation],
    ["disconnect", handleDisconnect],
  ];

  handlers.forEach(([event, handler]) => socket.on(event, handler as (...args: unknown[]) => void));
  return () => handlers.forEach(([event, handler]) => socket.off(event, handler as (...args: unknown[]) => void));
}
