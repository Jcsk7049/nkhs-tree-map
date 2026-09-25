// 匯出「每棵樹的核可值」CSV/xlsx(給 Excel 開、回填官方平台)。純函式,不碰 DOM。只用公開摘要欄位,不含任何學生個資。
// 另有 buildRecordsXlsx:老師專用的完整量測紀錄(含姓名、學號)。
import { buildXlsx, xlsxFilename } from './xlsx.js';
import { parseStudentId } from './studentId.js';
export { xlsxFilename };

const TAIWAN_OFFSET_MS = 8 * 3600 * 1000;
const HEADER = ['官方樹號', '樹種', '核可樹高(m)', '樹圍(cm)', '量測日(台灣)', '採用人數'];
const RECORD_HEADER = ['樹號', '量測時間(台灣)', '姓名', '學號', '入學年', '科別', '班級', '座號', '樹高(m)', '樹圍(cm)', '核可狀態'];

export function csvEscape(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  let text = String(value);
  // 試算表會把 = + - @ 開頭的字串當公式執行,補單引號變純文字。
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function formatTaiwanTime(iso) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  return new Date(ms + TAIWAN_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
}

export function buildTreeRows(trees, byNo, { onlyMeasured = true } = {}) {
  const rows = [...trees]
    .filter((t) => !onlyMeasured || byNo.has(t.no))
    .sort((a, b) => Number(a.no) - Number(b.no))
    .map((t) => {
      const m = byNo.get(t.no);
      return m
        ? [t.no, t.sp, m.height, m.girth, formatTaiwanTime(m.at), m.n]
        : [t.no, t.sp, null, null, null, null];
    });
  return [HEADER, ...rows];
}

export function buildTreeCsv(trees, byNo, opts) {
  const lines = buildTreeRows(trees, byNo, opts).map((cells) => cells.map(csvEscape).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function buildTreeXlsx(trees, byNo, opts) {
  const rows = buildTreeRows(trees, byNo, opts).map((cells, i) => {
    // 樹號純數字時寫成數字儲存格(標題列除外);其餘維持字串。
    if (i === 0) return cells;
    return /^[1-9]\d{0,14}$/.test(String(cells[0])) ? [Number(cells[0]), ...cells.slice(1)] : cells;
  });
  return buildXlsx(rows, { columnWidths: [12, 16, 14, 12, 20, 10] });
}

export function buildRecordsRows(rows) {
  return [RECORD_HEADER, ...rows.map((r) => {
    const id = parseStudentId(r.classNo);
    return [
      String(r.treeId), formatTaiwanTime(r.at), r.name, r.classNo,
      id ? id.year : '', id ? id.deptName : '', id ? id.className : '', id ? String(Number(id.seat)) : '',
      r.height, r.girth, r.approved ? '已核可' : '待核可',
    ];
  })];
}

export function buildRecordsXlsx(rows) {
  return buildXlsx(buildRecordsRows(rows), { sheetName: '完整紀錄', columnWidths: [10, 18, 10, 12, 8, 10, 8, 6, 10, 10, 10] });
}

export function recordsXlsxFilename(nowMs) {
  return xlsxFilename(nowMs).replace('nkhs-trees-', 'nkhs-records-');
}

export function csvFilename(nowMs) {
  const day = new Date(nowMs + TAIWAN_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, '');
  return `nkhs-trees-${day}.csv`;
}
