import { describe, it, expect, vi } from 'vitest';
import { buildMeasurementRecord, getTreeIdFromUrl } from '../src/treePage.js';

describe('getTreeIdFromUrl', () => {
  it('應從query string取出treeId', () => {
    expect(getTreeIdFromUrl('?treeId=A-023')).toBe('A-023');
  });

  it('沒有treeId參數時回傳空字串', () => {
    expect(getTreeIdFromUrl('?foo=bar')).toBe('');
  });
});

describe('buildMeasurementRecord', () => {
  it('應該把表單輸入組成完整record並自動算出樹高', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T09:00:00.000Z'));

    const record = buildMeasurementRecord(
      {
        studentName: '王小明',
        studentClassNo: '土木三甲-12',
        angleDeg: 45,
        distanceM: 10,
        girthCm: 80,
      },
      'A-023'
    );

    expect(record).toEqual({
      treeId: 'A-023',
      timestamp: '2026-09-18T09:00:00.000Z',
      studentName: '王小明',
      studentClassNo: '土木三甲-12',
      angleDeg: 45,
      distanceM: 10,
      girthCm: 80,
      calculatedHeight: 11.5,
    });

    vi.useRealTimers();
  });
});
