/**
 * Procedural audio chime & throttled haptic feedback utility for Ascend.
 * Pure Web Audio API synthesis (zero external audio files) + Capacitor Haptics.
 * Safe for rapid multi-swiping: throttled to prevent continuous vibration queues.
 * Does NOT mutate momentum_events.
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export const SOUND_SETTING_STORAGE_KEY = 'ascend_setting_sound';
export const COMPLETION_SOUND_STORAGE_KEY = 'ascend_completion_sound';
export const VIBRATION_SETTING_STORAGE_KEY = 'ascend_setting_vibration';

/**
 * Check if sound effects are enabled in user preferences.
 * Defaults to true for new installs.
 */
export function isCompletionSoundEnabled(): boolean {
  try {
    const setting = localStorage.getItem(SOUND_SETTING_STORAGE_KEY);
    if (setting !== null) {
      return setting !== 'false' && setting !== '0';
    }
    const legacy = localStorage.getItem(COMPLETION_SOUND_STORAGE_KEY);
    if (legacy !== null) {
      return legacy !== 'false' && legacy !== '0';
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Set sound effects preference in localStorage.
 */
export function setCompletionSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_SETTING_STORAGE_KEY, enabled ? 'true' : 'false');
    localStorage.setItem(COMPLETION_SOUND_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore storage errors */
  }
}

/**
 * Check if haptic vibration is enabled in user preferences.
 * Defaults to true for new installs.
 */
export function isHapticVibrationEnabled(): boolean {
  try {
    const setting = localStorage.getItem(VIBRATION_SETTING_STORAGE_KEY);
    if (setting !== null) {
      return setting !== 'false' && setting !== '0';
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Set haptic vibration preference in localStorage.
 */
export function setHapticVibrationEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(VIBRATION_SETTING_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    /* ignore storage errors */
  }
}

// Lazy AudioContext singleton (respects browser autoplay/suspend restrictions)
let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!sharedAudioContext) {
      sharedAudioContext = new AudioContextClass();
    }
    if (sharedAudioContext.state === 'suspended') {
      void sharedAudioContext.resume();
    }
    return sharedAudioContext;
  } catch {
    return null;
  }
}

/**
 * Triumphant victory fanfare — ascending C5→E5→G5→C6 major arpeggio with
 * layered triangle + sine oscillators for richness, a bright shimmer overtone,
 * a warm low-register thud on landing, and exponential decay tails.
 * Total duration ≈ 850ms. Plays on first user-gesture-unblocked AudioContext.
 */
export function playCompletionSound(): void {
  if (!isCompletionSoundEnabled()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const t0 = ctx.currentTime;

    // ── Master bus ─────────────────────────────────────────────────────────
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0, t0);
    master.gain.linearRampToValueAtTime(0.88, t0 + 0.008);
    master.connect(ctx.destination);

    // ── Helper: play one rich note ──────────────────────────────────────────
    function note(
      freq: number,
      startT: number,
      sustain: number,
      peakGain: number,
      waveform: OscillatorType = 'triangle'
    ) {
      // Primary oscillator (triangle = warm, bell-like)
      const osc1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      osc1.type = waveform;
      osc1.frequency.setValueAtTime(freq, startT);
      g1.gain.setValueAtTime(0.0001, startT);
      g1.gain.exponentialRampToValueAtTime(peakGain, startT + 0.015);
      g1.gain.exponentialRampToValueAtTime(0.0001, startT + sustain);
      osc1.connect(g1); g1.connect(master);
      osc1.start(startT); osc1.stop(startT + sustain + 0.05);

      // Sine harmonic an octave up — adds sparkle
      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 2, startT);
      g2.gain.setValueAtTime(0.0001, startT);
      g2.gain.exponentialRampToValueAtTime(peakGain * 0.22, startT + 0.018);
      g2.gain.exponentialRampToValueAtTime(0.0001, startT + sustain * 0.7);
      osc2.connect(g2); g2.connect(master);
      osc2.start(startT); osc2.stop(startT + sustain);
    }

    // ── Ascending major arpeggio: C5 → E5 → G5 → C6 ───────────────────────
    const spacing = 0.11;
    note(523.25,  t0,                  0.42, 0.55);  // C5
    note(659.25,  t0 + spacing,        0.38, 0.60);  // E5
    note(783.99,  t0 + spacing * 2,    0.35, 0.65);  // G5
    note(1046.50, t0 + spacing * 3,    0.60, 0.75);  // C6 — triumphant peak

    // ── High shimmer sparkle (sine, very brief) on the peak note ───────────
    const shimmer = ctx.createOscillator();
    const shimGain = ctx.createGain();
    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(2093, t0 + spacing * 3);       // C7
    shimGain.gain.setValueAtTime(0.0001, t0 + spacing * 3);
    shimGain.gain.exponentialRampToValueAtTime(0.18, t0 + spacing * 3 + 0.012);
    shimGain.gain.exponentialRampToValueAtTime(0.0001, t0 + spacing * 3 + 0.18);
    shimmer.connect(shimGain); shimGain.connect(master);
    shimmer.start(t0 + spacing * 3); shimmer.stop(t0 + spacing * 3 + 0.22);

    // ── Warm bass thud at the moment of landing (victory punch) ────────────
    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    const thudStart = t0 + spacing * 3 + 0.04;
    thud.type = 'sine';
    thud.frequency.setValueAtTime(130, thudStart);
    thud.frequency.exponentialRampToValueAtTime(55, thudStart + 0.14);
    thudGain.gain.setValueAtTime(0.0001, thudStart);
    thudGain.gain.exponentialRampToValueAtTime(0.70, thudStart + 0.010);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, thudStart + 0.28);
    thud.connect(thudGain); thudGain.connect(master);
    thud.start(thudStart); thud.stop(thudStart + 0.32);

  } catch {
    /* AudioContext might be blocked before first user gesture — silently ignore */
  }
}

// 100ms throttle timestamp to protect against queued vibrations during rapid multi-swipes
let lastHapticTimestamp = 0;
const HAPTIC_THROTTLE_MS = 100;

/**
 * Throttled, ultra-short haptic pulse.
 * Respects user vibration preference (ascend_setting_vibration).
 * Uses Capacitor Haptics (ImpactStyle.Light) with a 100ms throttle guard.
 * Rapidly swiping 2–3 cards in sequence produces distinct, crisp taps
 * instead of stacking into an unbroken vibration queue.
 */
export async function triggerCompletionHaptic(_kind?: 'full' | 'fallback'): Promise<void> {
  if (!isHapticVibrationEnabled()) return;

  const now = Date.now();
  if (now - lastHapticTimestamp < HAPTIC_THROTTLE_MS) {
    return;
  }
  lastHapticTimestamp = now;

  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({ style: _kind === 'fallback' ? ImpactStyle.Light : ImpactStyle.Medium });
      return;
    }
  } catch {
    /* fall back to web vibration if plugin fails */
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(_kind === 'fallback' ? 8 : 12);
    }
  } catch {
    /* ignore unsupported devices */
  }
}

/**
 * Convenience helper to fire both haptic and sound in one call.
 */
export function triggerCompletionFeedback(_kind?: 'full' | 'fallback'): void {
  void triggerCompletionHaptic(_kind);
  playCompletionSound();
}
