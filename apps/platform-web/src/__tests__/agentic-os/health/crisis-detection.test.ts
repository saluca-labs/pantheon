import { describe, it, expect } from 'vitest';
import { detectCrisisLanguage } from '@/lib/agentic-os/health/crisis-detection';

describe('detectCrisisLanguage', () => {
  it('returns false for null / empty input', () => {
    expect(detectCrisisLanguage(null).triggered).toBe(false);
    expect(detectCrisisLanguage('').triggered).toBe(false);
    expect(detectCrisisLanguage(undefined).triggered).toBe(false);
  });

  it.each([
    'I want to kill myself',
    "I'm thinking about suicide",
    'I want to die',
    'planning to kill myself this weekend',
    "I'd be better off dead",
    "I don't want to live anymore",
    'No reason to live',
    'I cut myself last night',
    'I keep hurting myself',
  ])('flags clear crisis language: %s', (text) => {
    expect(detectCrisisLanguage(text).triggered).toBe(true);
  });

  it('does not flag benign expressions', () => {
    expect(detectCrisisLanguage('killing it at the gym').triggered).toBe(false);
    expect(detectCrisisLanguage('this homework is killing me').triggered).toBe(false);
    expect(detectCrisisLanguage('I want to live my best life').triggered).toBe(false);
    expect(detectCrisisLanguage('end of the day').triggered).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(detectCrisisLanguage('I WANT TO DIE').triggered).toBe(true);
    expect(detectCrisisLanguage('Thinking About Suicide right now').triggered).toBe(true);
  });
});
