import { describe, it, expect } from 'vitest';
import {
  validateShot,
  formatShotLabel,
  estimatePageCount,
  SHOT_TYPES,
  CAMERA_MOVES,
} from '@/lib/agentic-os/filmmaker/shots';

describe('validateShot', () => {
  it('returns no errors for a valid shot entry', () => {
    const errors = validateShot({
      sceneNumber: '3',
      shotNumber: 'A',
      shotType: 'CU',
      cameraMove: 'STATIC',
      estimatedSeconds: 8,
    });
    expect(errors).toHaveLength(0);
  });

  it('requires sceneNumber', () => {
    const errors = validateShot({ sceneNumber: '', shotNumber: 'A', shotType: 'CU', cameraMove: 'STATIC' });
    expect(errors.some((e) => e.includes('Scene number'))).toBe(true);
  });

  it('requires shotNumber', () => {
    const errors = validateShot({ sceneNumber: '1', shotNumber: '', shotType: 'MS', cameraMove: 'PAN' });
    expect(errors.some((e) => e.includes('Shot number'))).toBe(true);
  });

  it('rejects unknown shot types', () => {
    const errors = validateShot({ sceneNumber: '1', shotNumber: 'A', shotType: 'FISHEYE' as never, cameraMove: 'STATIC' });
    expect(errors.some((e) => e.toLowerCase().includes('shot type'))).toBe(true);
  });

  it('rejects unknown camera moves', () => {
    const errors = validateShot({ sceneNumber: '1', shotNumber: 'A', shotType: 'WS', cameraMove: 'SPIN' as never });
    expect(errors.some((e) => e.toLowerCase().includes('camera move'))).toBe(true);
  });

  it('rejects negative estimatedSeconds', () => {
    const errors = validateShot({
      sceneNumber: '1',
      shotNumber: 'A',
      shotType: 'WS',
      cameraMove: 'STATIC',
      estimatedSeconds: -5,
    });
    expect(errors.some((e) => e.includes('duration'))).toBe(true);
  });

  it('rejects estimatedSeconds > 3600', () => {
    const errors = validateShot({
      sceneNumber: '1',
      shotNumber: 'A',
      shotType: 'WS',
      cameraMove: 'STATIC',
      estimatedSeconds: 3601,
    });
    expect(errors.some((e) => e.includes('duration'))).toBe(true);
  });
});

describe('formatShotLabel', () => {
  it('produces ASC-style label', () => {
    expect(
      formatShotLabel({ sceneNumber: '3', shotNumber: 'A', shotType: 'CU', cameraMove: 'DOLLY_IN' }),
    ).toBe('3A — CU DOLLY_IN');
  });
});

describe('estimatePageCount', () => {
  it('returns 1 for 0 shots (floor)', () => {
    expect(estimatePageCount(0)).toBe(1);
  });

  it('approximates 6 shots per page', () => {
    expect(estimatePageCount(6)).toBe(1);
    expect(estimatePageCount(12)).toBe(2);
    expect(estimatePageCount(60)).toBe(10);
  });
});

describe('SHOT_TYPES and CAMERA_MOVES enumerations', () => {
  it('includes standard ASC shot types', () => {
    expect(SHOT_TYPES).toContain('CU');
    expect(SHOT_TYPES).toContain('WS');
    expect(SHOT_TYPES).toContain('ECU');
    expect(SHOT_TYPES).toContain('MS');
  });

  it('includes STATIC camera move', () => {
    expect(CAMERA_MOVES).toContain('STATIC');
    expect(CAMERA_MOVES).toContain('DOLLY_IN');
    expect(CAMERA_MOVES).toContain('HANDHELD');
  });
});
