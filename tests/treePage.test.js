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
    studentClassNo: ' 301-12 ',
    studentCode: 'k7m-2qx-4',
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
      studentClassNo: '301-12',
      studentCode: 'K7M2QX4',
      angleDeg: 45,
      distanceM: 10,
      girthCm: 80,
      calculatedHeight: 11.5,
    });
  });

  it('記錄裡不含前端自填的姓名:填寫人由後端依名簿決定,不能自己打', () => {
    const record = buildMeasurementRecord({ ...formValues, studentName: '冒名者' }, 'A-023');
    expect(record).not.toHaveProperty('studentName');
  });

  it('班級座號與通行碼會先正規化(去空白/連字號、轉大寫),與後端比對規則一致', () => {
    const record = buildMeasurementRecord(formValues, 'A-023');
    expect(record.studentClassNo).toBe('301-12');
    expect(record.studentCode).toBe('K7M2QX4');
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
