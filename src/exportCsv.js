// 匯出「每棵樹最新量測」CSV(給 Excel 開、回填官方平台)。純函式,不碰 DOM。只用公開摘要欄位,不含任何學生個資。
const TAIWAN_OFFSET_MS = 8 * 3600 * 1000;
const HEADER = ['官方樹號', '樹種', '最新樹高(m)', '樹圍(cm)', '量測時間(台灣)', '量測筆數'];

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

export function buildTreeCsv(trees, byNo, { onlyMeasured = true } = {}) {
  const rows = [...trees]
    .filter((t) => !onlyMeasured || byNo.has(t.no))
    .sort((a, b) => Number(a.no) - Number(b.no))
    .map((t) => {
      const m = byNo.get(t.no);
      return m
        ? [t.no, t.sp, m.height, m.girth, formatTaiwanTime(m.at), m.n]
        : [t.no, t.sp, '', '', '', ''];
    });
  const lines = [HEADER, ...rows].map((cells) => cells.map(csvEscape).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function csvFilename(nowMs) {
  const day = new Date(nowMs + TAIWAN_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, '');
  return `nkhs-trees-${day}.csv`;
}
