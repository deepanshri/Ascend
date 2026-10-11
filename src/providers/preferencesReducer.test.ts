import { describe, expect, it } from 'vitest';
import { preferencesReducer, toggleInterest, type PreferencesState } from './preferencesReducer';

const base: PreferencesState = {
  selectedInterests: ['Movies', 'Books'],
  notificationWindows: { morning: true, afternoon: true, night: false },
  eveningChronicle: { enabled: true, time: '20:00' },
  completionSound: true,
  hapticVibration: true,
  cycleDays: 7,
};

describe('preferencesReducer', () => {
  it('replaces interests with a list or an updater', () => {
    expect(preferencesReducer(base, { type: 'SET_INTERESTS', update: ['Anime'] }).selectedInterests).toEqual(['Anime']);
    expect(
      preferencesReducer(base, { type: 'SET_INTERESTS', update: (prev) => [...prev, 'Anime'] }).selectedInterests
    ).toEqual(['Movies', 'Books', 'Anime']);
  });

  it('toggles a single notification window without touching the others', () => {
    const next = preferencesReducer(base, { type: 'TOGGLE_NOTIFICATION_WINDOW', key: 'night' });
    expect(next.notificationWindows).toEqual({ morning: true, afternoon: true, night: true });
    expect(base.notificationWindows.night).toBe(false);
  });

  it('sets each scalar preference', () => {
    let state = preferencesReducer(base, { type: 'SET_COMPLETION_SOUND', enabled: false });
    state = preferencesReducer(state, { type: 'SET_HAPTIC_VIBRATION', enabled: false });
    state = preferencesReducer(state, { type: 'SET_CYCLE_DAYS', days: 10 });
    state = preferencesReducer(state, { type: 'SET_EVENING_CHRONICLE', settings: { enabled: false, time: '21:00' } });
    expect(state).toEqual({
      ...base,
      completionSound: false,
      hapticVibration: false,
      cycleDays: 10,
      eveningChronicle: { enabled: false, time: '21:00' },
    });
  });

  it('returns the same state object when a value does not change', () => {
    expect(preferencesReducer(base, { type: 'SET_COMPLETION_SOUND', enabled: true })).toBe(base);
    expect(preferencesReducer(base, { type: 'SET_CYCLE_DAYS', days: 7 })).toBe(base);
    expect(preferencesReducer(base, { type: 'SET_INTERESTS', update: (prev) => prev })).toBe(base);
  });

  it('RESET_ALL replaces everything with the given defaults', () => {
    const defaults: PreferencesState = {
      selectedInterests: ['Running'],
      notificationWindows: { morning: true, afternoon: true, night: true },
      eveningChronicle: { enabled: true, time: '20:00' },
      completionSound: true,
      hapticVibration: true,
      cycleDays: 7,
    };
    const changed = preferencesReducer(base, { type: 'SET_COMPLETION_SOUND', enabled: false });
    expect(preferencesReducer(changed, { type: 'RESET_ALL', defaults })).toBe(defaults);
  });
});

describe('toggleInterest', () => {
  it('adds an interest that is not selected', () => {
    expect(toggleInterest(['Movies'], 'Books')).toEqual(['Movies', 'Books']);
  });

  it('removes an interest regardless of case', () => {
    expect(toggleInterest(['Movies', 'Books'], 'books')).toEqual(['Movies']);
  });

  it('removes every entry for the same category, including aliases', () => {
    expect(toggleInterest(['Gym', 'Movies', 'Fitness Club'], 'Fitness')).toEqual(['Movies']);
    expect(toggleInterest(['Film', 'Books'], 'Movies')).toEqual(['Books']);
  });

  it('does not mutate the input list', () => {
    const interests = ['Movies'];
    toggleInterest(interests, 'Books');
    expect(interests).toEqual(['Movies']);
  });
});
