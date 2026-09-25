// 學號 8 碼:入學年 3 + 科別 2 + 班級 1(0 忠、1 孝)+ 座號 2,例 11205071。
// 後端 apps-script/Code.gs 的 STUDENT_ID_PATTERN 必須與這裡的格式一致。
export const DEPT_NAMES = { '05': '土木科' }; // ponytail: 其他科別代碼等老師提供再補
const CLASS_NAMES = { 0: '忠班', 1: '孝班' };

export function parseStudentId(raw) {
  const id = String(raw ?? '').replace(/\s+/g, '');
  const m = id.match(/^(\d{3})(\d{2})([01])(\d{2})$/);
  if (!m) return null;
  const [, year, dept, classDigit, seat] = m;
  const deptName = DEPT_NAMES[dept] || `${dept} 科`;
  const className = CLASS_NAMES[classDigit];
  return { id, year, dept, deptName, classDigit, className, seat, label: `${year} 級 ${deptName} ${className} ${Number(seat)} 號` };
}
