// src/qrScan.js
// 學生端「掃描」分頁用的純函式:把掃到的 QR 文字轉成官方樹號。QR 內容視為不可信,只取 treeId 並須在官方名單內。
const MAX_QR_LENGTH = 2048;

export function parseTreeIdFromQr(text, officialNos) {
  const raw = String(text === null || text === undefined ? '' : text).trim();
  if (raw === '' || raw.length > MAX_QR_LENGTH) return { ok: false, reason: 'not-tree-qr' };

  let candidate = null;
  if (/^\d{1,15}$/.test(raw)) {
    candidate = raw;
  } else {
    try {
      const url = new URL(raw);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        const value = (url.searchParams.get('treeId') || '').trim();
        if (value !== '') candidate = value;
      }
    } catch (err) {
      candidate = null;
    }
  }
  if (candidate === null) return { ok: false, reason: 'not-tree-qr' };
  return officialNos.has(candidate) ? { ok: true, treeId: candidate } : { ok: false, reason: 'unknown-tree' };
}
