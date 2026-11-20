/**
 * Call tones generated with Web Audio (no audio files to ship or load):
 * - incoming: a double ring every 2 seconds
 * - outgoing: a ringback tone (2s on, 4s off) while the other side is rung
 */
let ctx: AudioContext | null = null;
let interval: ReturnType<typeof setInterval> | null = null;
let current: "incoming" | "outgoing" | null = null;

function tone(frequencies: number[], start: number, duration: number, volume = 0.08) {
  if (!ctx) return;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.setValueAtTime(volume, start + duration - 0.03);
  gain.gain.linearRampToValueAtTime(0, start + duration);
  gain.connect(ctx.destination);
  for (const frequency of frequencies) {
    const osc = ctx.createOscillator();
    osc.frequency.value = frequency;
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + duration);
  }
}

export function playRingtone(kind: "incoming" | "outgoing") {
  if (current === kind) return;
  stopRingtone();
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {
    return; // audio unavailable: calls still work, just silently
  }
  current = kind;

  const ring = () => {
    if (!ctx) return;
    const now = ctx.currentTime;
    if (kind === "incoming") {
      tone([880, 1100], now, 0.35);
      tone([880, 1100], now + 0.5, 0.35);
    } else {
      tone([440, 480], now, 2, 0.05);
    }
  };
  ring();
  interval = setInterval(ring, kind === "incoming" ? 2000 : 6000);
}

export function stopRingtone() {
  if (interval) clearInterval(interval);
  interval = null;
  current = null;
}
