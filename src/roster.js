// 解析老師貼上的名單文字:每行「學號 姓名」,可用 Tab(從試算表複製)、逗號或空白分隔。
import { parseStudentId } from './studentId.js';

const HEADER_WORDS = ['學號', '班級座號', '座號'];
const BAD_ID = '學號格式不對(8 碼數字,第 6 碼 0 或 1)';

export function parseRosterText(text) {
  const students = [];
  const errors = [];
  String(text ?? '').split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line === '') return;

    const match = line.match(/^([^\s,，]+)[\s,，]+(.+)$/);
    if (!match) {
      if (!HEADER_WORDS.includes(line)) {
        errors.push({ line: index + 1, text: line, reason: '找不到姓名(格式:學號 姓名)' });
      }
      return;
    }
    if (HEADER_WORDS.includes(match[1])) return; // 標題列
    const parsed = parseStudentId(match[1]);
    if (!parsed) {
      errors.push({ line: index + 1, text: line, reason: BAD_ID });
      return;
    }
    students.push({ classNo: parsed.id, name: match[2].trim() });
  });
  return { students, errors };
}
