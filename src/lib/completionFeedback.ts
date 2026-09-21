/**
 * Completion reward feedback — haptic + optional procedural chime.
 * Identity-reinforcing only (never used for misses). Does not touch momentum_events.
 * Unified with src/utils/feedback.ts for throttled, crisp feedback during rapid multi-swipes.
 */
export {
  SOUND_SETTING_STORAGE_KEY,
  COMPLETION_SOUND_STORAGE_KEY,
  VIBRATION_SETTING_STORAGE_KEY,
  isCompletionSoundEnabled,
  setCompletionSoundEnabled,
  isHapticVibrationEnabled,
  setHapticVibrationEnabled,
  playCompletionSound,
  playCompletionSound as playCompletionChime,
  triggerCompletionHaptic,
  triggerCompletionHaptic as pulseCompletionHaptic,
  triggerCompletionFeedback,
  triggerCompletionFeedback as playCompletionReward,
} from '../utils/feedback';
