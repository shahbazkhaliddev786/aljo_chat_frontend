"use client";

import { useEffect } from "react";
import { useCallStore } from "@/shared/stores/call.store";

const POLL_MS = 200;
const SPEAKING_THRESHOLD = 0.02; // RMS of the waveform (0..1)

/**
 * Marks remote participants as "speaking" from the level of their audio.
 * One AudioContext with an analyser per remote stream; the store is only
 * updated when someone starts or stops speaking.
 */
export function useSpeakingIndicator(enabled: boolean) {
  const remoteStreams = useCallStore((s) => s.remoteStreams);

  useEffect(() => {
    if (!enabled) return;
    const participants = Object.values(remoteStreams).filter((p) => p.stream?.getAudioTracks().length);
    if (participants.length === 0) return;

    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    const analysers = participants.map((p) => {
      const source = ctx.createMediaStreamSource(new MediaStream(p.stream!.getAudioTracks()));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser); // analysis only: not connected to the speakers
      return { socketId: p.socketId, analyser, buffer: new Float32Array(analyser.fftSize) };
    });

    const timer = setInterval(() => {
      const { remoteStreams: current, updateRemoteParticipant } = useCallStore.getState();
      for (const { socketId, analyser, buffer } of analysers) {
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (const v of buffer) sum += v * v;
        const speaking = Math.sqrt(sum / buffer.length) > SPEAKING_THRESHOLD && !current[socketId]?.isAudioMuted;
        if (current[socketId] && !!current[socketId].isSpeaking !== speaking) {
          updateRemoteParticipant(socketId, { isSpeaking: speaking });
        }
      }
    }, POLL_MS);

    return () => {
      clearInterval(timer);
      void ctx.close();
    };
    // Re-attach when the set of streams changes, not on every speaking flag update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, Object.values(remoteStreams).map((p) => `${p.socketId}:${p.stream?.id}`).join("|")]);
}
