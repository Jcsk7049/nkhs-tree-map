import { describe, it, expect } from 'vitest';
import { parseRosterText } from '../src/roster.js';

describe('parseRosterText(貼上的學生名單)', () => {
  it('Excel/試算表複製貼上(Tab 分隔)', () => {
    const { students, errors } = parseRosterText('301-12\t王小明\n301-13\t李小華\n');
    expect(students).toEqual([{ classNo: '301-12', name: '王小明' }, { classNo: '301-13', name: '李小華' }]);
    expect(errors).toEqual([]);
  });

  it('逗號(半形/全形)與空白也能分隔;姓名裡有空白(如英文名)完整保留', () => {
    const { students } = parseRosterText('301-12,王小明\n301-13，李小華\n301-14 Mary Ann');
    expect(students).toEqual([
      { classNo: '301-12', name: '王小明' },
      { classNo: '301-13', name: '李小華' },
      { classNo: '301-14', name: 'Mary Ann' },
    ]);
  });

  it('略過空行與標題列(班級座號/座號 開頭)', () => {
    const { students } = parseRosterText('班級座號\t姓名\n\n301-12\t王小明\n   \n');
    expect(students).toEqual([{ classNo: '301-12', name: '王小明' }]);
  });

  it('只有一欄(缺姓名)的行回報行號與原因,其餘照常解析', () => {
    const { students, errors } = parseRosterText('301-12\t王小明\n301-13\n301-14\t丙');
    expect(students.map((s) => s.classNo)).toEqual(['301-12', '301-14']);
    expect(errors).toEqual([{ line: 2, text: '301-13', reason: '找不到姓名(格式:班級座號 姓名)' }]);
  });

  it('Windows 換行與前後空白', () => {
    const { students } = parseRosterText('  301-12 \t 王小明 \r\n301-13\t李小華');
    expect(students).toEqual([{ classNo: '301-12', name: '王小明' }, { classNo: '301-13', name: '李小華' }]);
  });

  it('空字串或 null 回空結果', () => {
    expect(parseRosterText('')).toEqual({ students: [], errors: [] });
    expect(parseRosterText(null)).toEqual({ students: [], errors: [] });
  });
});
