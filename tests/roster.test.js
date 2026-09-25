import { describe, it, expect } from 'vitest';
import { parseRosterText } from '../src/roster.js';

describe('parseRosterText(貼上的學生名單)', () => {
  it('Excel/試算表複製貼上(Tab 分隔)', () => {
    const { students, errors } = parseRosterText('11205012\t王小明\n11205013\t李小華\n');
    expect(students).toEqual([{ classNo: '11205012', name: '王小明' }, { classNo: '11205013', name: '李小華' }]);
    expect(errors).toEqual([]);
  });

  it('逗號(半形/全形)與空白也能分隔;姓名裡有空白(如英文名)完整保留', () => {
    const { students } = parseRosterText('11205012,王小明\n11205013，李小華\n11205014 Mary Ann');
    expect(students).toEqual([
      { classNo: '11205012', name: '王小明' },
      { classNo: '11205013', name: '李小華' },
      { classNo: '11205014', name: 'Mary Ann' },
    ]);
  });

  it('略過空行與標題列(學號/班級座號/座號 開頭)', () => {
    const { students } = parseRosterText('學號\t姓名\n\n11205012\t王小明\n   \n');
    expect(students).toEqual([{ classNo: '11205012', name: '王小明' }]);
  });

  it('只有一欄(缺姓名)的行回報行號與原因,其餘照常解析', () => {
    const { students, errors } = parseRosterText('11205012\t王小明\n11205013\n11205014\t丙');
    expect(students.map((s) => s.classNo)).toEqual(['11205012', '11205014']);
    expect(errors).toEqual([{ line: 2, text: '11205013', reason: '找不到姓名(格式:學號 姓名)' }]);
  });

  it('學號格式不對的行列為錯誤(不送後端),其餘照常', () => {
    const { students, errors } = parseRosterText('11205012\t王小明\n1120501\t少一碼\n11205212\t班級碼錯\n301-12\t舊格式');
    expect(students).toEqual([{ classNo: '11205012', name: '王小明' }]);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(errors.every((e) => e.reason === '學號格式不對(8 碼數字,第 6 碼 0 或 1)')).toBe(true);
  });

  it('Windows 換行與前後空白', () => {
    const { students } = parseRosterText('  11205012 \t 王小明 \r\n11205013\t李小華');
    expect(students).toEqual([{ classNo: '11205012', name: '王小明' }, { classNo: '11205013', name: '李小華' }]);
  });

  it('空字串或 null 回空結果', () => {
    expect(parseRosterText('')).toEqual({ students: [], errors: [] });
    expect(parseRosterText(null)).toEqual({ students: [], errors: [] });
  });
});
