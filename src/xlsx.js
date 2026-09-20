// src/xlsx.js
// 不靠外部函式庫,自己組最小可用的 .xlsx(ZIP 用 STORE 不壓縮)。純函式、瀏覽器與 Node 皆可跑。
const encoder = new TextEncoder();

let crcTable = null;
function table() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

export function crc32(bytes) {
  const t = table();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function w16(view, o, v) { view.setUint16(o, v, true); }
function w32(view, o, v) { view.setUint32(o, v >>> 0, true); }

// DOS 時間固定 1980-01-01 00:00:00,讓同樣輸入永遠產出同樣位元組。
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const UTF8_FLAG = 0x0800;

export function zipStore(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = file.data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    w32(lv, 0, 0x04034b50);
    w16(lv, 4, 20);
    w16(lv, 6, UTF8_FLAG);
    w16(lv, 8, 0);
    w16(lv, 10, DOS_TIME);
    w16(lv, 12, DOS_DATE);
    w32(lv, 14, crc);
    w32(lv, 18, data.length);
    w32(lv, 22, data.length);
    w16(lv, 26, name.length);
    w16(lv, 28, 0);
    local.set(name, 30);
    parts.push(local, data);

    const entry = new Uint8Array(46 + name.length);
    const cv = new DataView(entry.buffer);
    w32(cv, 0, 0x02014b50);
    w16(cv, 4, 20);
    w16(cv, 6, 20);
    w16(cv, 8, UTF8_FLAG);
    w16(cv, 10, 0);
    w16(cv, 12, DOS_TIME);
    w16(cv, 14, DOS_DATE);
    w32(cv, 16, crc);
    w32(cv, 20, data.length);
    w32(cv, 24, data.length);
    w16(cv, 28, name.length);
    w16(cv, 30, 0);
    w16(cv, 32, 0);
    w16(cv, 34, 0);
    w16(cv, 36, 0);
    w32(cv, 38, 0);
    w32(cv, 42, offset);
    entry.set(name, 46);
    central.push(entry);

    offset += local.length + data.length;
  }
  const centralSize = central.reduce((sum, e) => sum + e.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  w32(ev, 0, 0x06054b50);
  w16(ev, 8, files.length);
  w16(ev, 10, files.length);
  w32(ev, 12, centralSize);
  w32(ev, 16, offset);

  const all = [...parts, ...central, eocd];
  const out = new Uint8Array(all.reduce((sum, p) => sum + p.length, 0));
  let pos = 0;
  for (const p of all) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// XML 1.0 不允許的控制字元(保留 \t \n \r)一律移除,否則 Excel 會判定檔案損毀。
function cleanText(value) {
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
}
function escapeXml(value) {
  return cleanText(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function columnLetters(index) {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function cellXml(ref, value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `<c r="${ref}"><v>${value}</v></c>` : '';
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

export function buildXlsx(rows, { sheetName = '量測', columnWidths } = {}) {
  const sheetRows = rows
    .map((cells, r) => {
      const inner = cells.map((value, c) => cellXml(`${columnLetters(c)}${r + 1}`, value)).join('');
      return `<row r="${r + 1}">${inner}</row>`;
    })
    .join('');
  const cols = columnWidths && columnWidths.length
    ? `<cols>${columnWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const cleaned = cleanText(sheetName).replace(/[:\\/?*[\]]/g, ' ').replace(/^'+|'+$/g, '').trim();
  const name = escapeXml((cleaned || '量測').slice(0, 31));

  const parts = {
    '[Content_Types].xml': `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${XML_HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `${XML_HEAD}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'xl/worksheets/sheet1.xml': `${XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${sheetRows}</sheetData></worksheet>`,
  };
  return zipStore(Object.entries(parts).map(([n, text]) => ({ name: n, data: encoder.encode(text) })));
}

const TAIWAN_OFFSET_MS = 8 * 3600 * 1000;
export function xlsxFilename(nowMs) {
  const day = new Date(nowMs + TAIWAN_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, '');
  return `nkhs-trees-${day}.xlsx`;
}
