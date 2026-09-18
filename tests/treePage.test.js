import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildMeasurementRecord, getTreeIdFromUrl } from '../src/treePage.js';

afterEach(() => {
  // 放在 afterEach 而非 it 的最後一行:即使某個斷言失敗提早中斷,
  // 也不會把 fake timers 漏給同檔案的其他測試。
  vi.useRealTimers();
});

describe('getTreeIdFromUrl', () => {
  it('應從query string取出treeId', () => {
    expect(getTreeIdFromUrl('?treeId=A-023')).toBe('A-023');
  });

  it('沒有treeId參數時回傳空字串', () => {
    expect(getTreeIdFromUrl('?foo=bar')).toBe('');
  });
});

describe('buildMeasurementRecord', () => {
  const formValues = {
    studentName: '王小明',
    studentClassNo: '土木三甲-12',
    angleDeg: 45,
    distanceM: 10,
    girthCm: 80,
  };

  it('應該把表單輸入組成完整record並自動算出樹高', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T09:00:00.000Z'));

    const record = buildMeasurementRecord(formValues, 'A-023');
    const { clientRecordId, ...rest } = record;

    expect(rest).toEqual({
      treeId: 'A-023',
      timestamp: '2026-09-18T09:00:00.000Z',
      studentName: '王小明',
      studentClassNo: '土木三甲-12',
      angleDeg: 45,
      distanceM: 10,
      girthCm: 80,
      calculatedHeight: 11.5,
    });
  });

  it('應含有 clientRecordId 供後端做重複送出的去重判斷', () => {
    const record = buildMeasurementRecord(formValues, 'A-023');
    expect(typeof record.clientRecordId).toBe('string');
    expect(record.clientRecordId.length).toBeGreaterThan(0);
  });

  it('每次呼叫產生的 clientRecordId 都不同', () => {
    const ids = new Set(
      Array.from({ length: 50 }, () => buildMeasurementRecord(formValues, 'A-023').clientRecordId)
    );
    expect(ids.size).toBe(50);
  });
});
