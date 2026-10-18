import { describe, expect, it } from 'vitest';
import { defaultPurposeAnchor } from '../lib/createHabitValidation';
import {
  afternoonFocusCopy,
  HABIT_TARGET_COPY_TEMPLATES,
  habitTargetBody,
  morningMomentumCopy,
  nightWrapUpCopy,
} from './notificationService';

const firstTemplate = () => 0;
const genericBody = (name: string) => HABIT_TARGET_COPY_TEMPLATES[0].replace('{habit_name}', name);

describe('habitTargetBody', () => {
  it('uses the purpose anchor when one is set', () => {
    expect(habitTargetBody({ name: 'Morning run', purposeAnchor: '  So I feel energized all day.  ' })).toBe(
      'Morning run in 15 min — So I feel energized all day.'
    );
  });

  it('falls back to the generic copy when the purpose is missing or blank', () => {
    expect(habitTargetBody({ name: 'Read' }, firstTemplate)).toBe(genericBody('Read'));
    expect(habitTargetBody({ name: 'Read', purposeAnchor: '   ' }, firstTemplate)).toBe(genericBody('Read'));
  });

  it('treats the auto-generated purpose as no purpose', () => {
    expect(habitTargetBody({ name: 'Read', purposeAnchor: defaultPurposeAnchor('Read') }, firstTemplate)).toBe(
      genericBody('Read')
    );
  });

  it('treats the auto-generated purpose as no purpose after a rename', () => {
    expect(
      habitTargetBody({ name: 'Read 20 pages', purposeAnchor: defaultPurposeAnchor('Read') }, firstTemplate)
    ).toBe(genericBody('Read 20 pages'));
  });

  it('names a fallback habit when the name is blank', () => {
    expect(habitTargetBody({ name: '  ', purposeAnchor: 'So I stay sharp.' })).toBe(
      'your habit in 15 min — So I stay sharp.'
    );
  });
});

describe('daily window copy', () => {
  const chronicleWording = /chronicle|evening|wrap-up/i;

  it('morning and night notifications do not mention the chronicle', () => {
    const copies = [
      morningMomentumCopy('Read'),
      nightWrapUpCopy('Read', 2),
      nightWrapUpCopy('Read', 0),
      afternoonFocusCopy('Read', 2),
    ];
    for (const { title, body } of copies) {
      expect(`${title} ${body}`).not.toMatch(chronicleWording);
    }
  });
});
