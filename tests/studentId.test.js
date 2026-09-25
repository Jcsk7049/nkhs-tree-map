import { describe, it, expect } from 'vitest';
import { parseStudentId } from '../src/studentId.js';

describe('parseStudentId(8 碼學號拆解)', () => {
  it('11205071 → 112 級 土木科 忠班 71 號', () => {
    expect(parseStudentId('11205071')).toEqual({
      id: '11205071', year: '112', dept: '05', deptName: '土木科',
      classDigit: '0', className: '忠班', seat: '71', label: '112 級 土木科 忠班 71 號',
    });
  });

  it('第 6 碼 1 → 孝班;座號去前導 0', () => {
    expect(parseStudentId('11305107').label).toBe('113 級 土木科 孝班 7 號');
  });

  it('科別表查不到 → 顯示代碼', () => {
    expect(parseStudentId('11206071').deptName).toBe('06 科');
  });

  it('前後與中間空白可容忍(數字型別也可)', () => {
    expect(parseStudentId(' 1120 5071 ').id).toBe('11205071');
    expect(parseStudentId(11205071).id).toBe('11205071');
  });

  it('格式不對 → null', () => {
    for (const bad of ['', null, undefined, '1120507', '112050711', '11205271', '1120507A', '301-12']) {
      expect(parseStudentId(bad)).toBeNull();
    }
  });
});
