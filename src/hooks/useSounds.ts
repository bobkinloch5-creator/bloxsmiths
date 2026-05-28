import { useEffect, useRef } from "react";

const STORAGE_KEY = "bloxsmith.sounds.enabled";

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { __bsAudioCtx?: AudioContext };
  if (w.__bsAudioCtx) return w.__bsAudioCtx;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  w.__bsAudioCtx = new Ctor();
  return w.__bsAudioCtx;
}

export function soundsEnabled(): boolean {
  // Sounds are OFF by default. A user has to explicitly opt in via the
  // Chat Settings toggle, which writes "1" to this key. Anything else
  // (null / "0" / undefined storage) keeps the app silent.
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "1";
}

export function setSoundsEnabled(on: boolean) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
}

function tone(
  freq: number,
  durMs: number,
  opts: { type?: OscillatorType; vol?: number; delay?: number; slideTo?: number } = {},
) {
  if (!soundsEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const t0 = ctx.currentTime + (opts.delay ?? 0);
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(freq, t0);
  if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + durMs / 1000);
  const vol = opts.vol ?? 0.08;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + durMs / 1000 + 0.02);
}

export const sfx = {
  /** Soft confirm-tick for clicks/sends */
  tick: () => tone(880, 60, { type: "triangle", vol: 0.04 }),
  /** AI starts thinking: gentle rising chime */
  start: () => {
    tone(440, 110, { type: "sine", vol: 0.06, slideTo: 660 });
    tone(660, 140, { type: "sine", vol: 0.05, delay: 0.08, slideTo: 880 });
  },
  /** Looped soft "processing" pulse */
  pulse: () => tone(520, 180, { type: "sine", vol: 0.025, slideTo: 480 }),
  /** Success chime */
  done: () => {
    tone(660, 120, { type: "triangle", vol: 0.06 });
    tone(880, 140, { type: "triangle", vol: 0.06, delay: 0.09 });
    tone(1320, 220, { type: "sine", vol: 0.05, delay: 0.18 });
  },
  /** Error buzz */
  error: () => {
    tone(220, 180, { type: "sawtooth", vol: 0.06, slideTo: 140 });
    tone(180, 220, { type: "sawtooth", vol: 0.05, delay: 0.1, slideTo: 120 });
  },
};

/**
 * Plays start/loop/done sounds when an AI generation is in progress.
 * Pass the same `aiBusy` boolean used in your UI.
 */
export function useAiBusySounds(aiBusy: boolean) {
  const wasBusy = useRef(false);
  const pulseTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (aiBusy && !wasBusy.current) {
      wasBusy.current = true;
      sfx.start();
      pulseTimer.current = setInterval(() => sfx.pulse(), 2400);
    } else if (!aiBusy && wasBusy.current) {
      wasBusy.current = false;
      if (pulseTimer.current) clearInterval(pulseTimer.current);
      pulseTimer.current = null;
      sfx.done();
    }
    return () => {
      if (!aiBusy && pulseTimer.current) {
        clearInterval(pulseTimer.current);
        pulseTimer.current = null;
      }
    };
  }, [aiBusy]);
}

/** Mount once to unlock the AudioContext on first user gesture (browser policy). */
export function useUnlockAudio() {
  useEffect(() => {
    const unlock = () => {
      const ctx = getCtx();
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
}
