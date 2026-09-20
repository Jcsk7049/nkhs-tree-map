# 匯出改為真正的 .xlsx Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理頁的匯出改為下載真正的 `.xlsx`(欄位一定分開、數字為數字、不受 Windows 清單分隔符號影響);保留 CSV 為次要選項。

**Why:** 使用者實測 CSV 在他的 Excel 全擠在 A 欄(Excel 依 Windows「清單分隔符號」拆欄,不是逗號)。設計文件當時把 `.xlsx` 列為「本次不做」,現在有實證需求。

**Architecture:** 純函式模組 `src/xlsx.js`:不加任何外部函式庫,用「STORE(不壓縮)」ZIP 自行組出最小可用的 xlsx(5 個部件,字串用 `inlineStr`)。`src/exportCsv.js` 抽出共用的 `buildTreeRows`,CSV 與 xlsx 共用同一份資料列。`admin.html` 主按鈕改「下載 Excel (.xlsx)」,次要按鈕「改下載 CSV」。

**Tech Stack:** 原生 ES module(瀏覽器與 Node 皆可跑)、`Uint8Array`/`TextEncoder`、vitest。無新增相依。

## Global Constraints

- 匯出資料只含公開摘要欄位(不得含學生姓名/座號);欄位順序與名稱不變:官方樹號、樹種、最新樹高(m)、樹圍(cm)、量測時間(台灣)、量測筆數。
- 既有 `csvEscape`、`formatTaiwanTime`、`buildTreeCsv`、`csvFilename` 的**行為與簽名不變**(既有測試必須維持綠,不得為了過測試而改弱)。
- `xlsx.js` 必須是純函式、不碰 DOM、不用 Node 專屬 API(瀏覽器要能跑);測試才可用 `node:zlib`/`node:fs`。
- xlsx 內字串一律用 `inlineStr` 並做 XML 跳脫(`& < > "`)與移除 XML 1.0 不允許的控制字元;字串不會被當公式執行(不需要 CSV 那套單引號前綴)。
- 樹號:純數字(`/^[1-9]\d{0,14}$/`)寫成數字儲存格,其餘寫成字串;高度/圍/筆數為數字;`null`/空值為空白儲存格(不輸出 `<c>` 的值)。
- 頁面不得寫死 `API_URL`/`GOOGLE_CLIENT_ID`(沿用既有寫法,不動);介面文字繁體中文;主題色 `#2e7d32`。
- 本次改動 `admin.html`(不在離線快取)與新增 `src/xlsx.js`(不在離線快取)、`src/exportCsv.js`(不在離線快取);**不改** `app.html`/`appShell.js`/`CACHE_FILES`,因此**不升** `CACHE_NAME`。
- 測試 `npx vitest run`,結束前全綠。commit 訊息結尾**必須**是:`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`(不得換成執行者自己的模型名)。

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `src/xlsx.js` | Create | `crc32`、`zipStore`、`buildXlsx(rows, opts)`、`xlsxFilename(nowMs)` |
| `tests/xlsx.test.js` | Create | 結構與內容測試(用 Node 解讀產出的 zip) |
| `src/exportCsv.js` | Modify | 抽出 `buildTreeRows`;新增 `buildTreeXlsx` 與 `xlsxFilename` 轉出 |
| `tests/exportCsv.test.js` | Modify | `buildTreeRows`/`buildTreeXlsx` 測試 |
| `public/admin.html` | Modify | 主按鈕下載 .xlsx,次要按鈕下載 CSV |
| `tests/adminHtml.test.js` | Modify | 配合新按鈕的原始碼檢查 |
| `DEPLOY.md` `docs/WORKLOG.md` | Modify | 匯出說明改為 xlsx 主、CSV 次 |

---

### Task 1: `src/xlsx.js`、共用資料列、管理頁改下載 xlsx

**Files:** 如上表。

**Interfaces:**
- `crc32(bytes: Uint8Array): number` — 標準 CRC-32(IEEE 802.3),回傳無號 32 位整數
- `zipStore(files: Array<{name: string, data: Uint8Array}>): Uint8Array` — 未壓縮(method 0)ZIP;檔名 UTF-8(設 general purpose bit 11);固定 DOS 時間 `1980-01-01 00:00:00`;含 central directory 與 EOCD
- `buildXlsx(rows: Array<Array<string|number|null|undefined>>, opts?: {sheetName?: string = '量測', columnWidths?: number[]}): Uint8Array`
- `xlsxFilename(nowMs: number): string` — `nkhs-trees-YYYYMMDD.xlsx`(台灣日期,與 `csvFilename` 同規則)
- `buildTreeRows(trees, byNo, {onlyMeasured = true} = {}): Array<Array<string|number|null>>` — 第一列為標題;之後每棵樹一列 `[no, sp, height, girth, formatTaiwanTime(at), n]`,未量測的樹(onlyMeasured:false)後四欄為 `null`;依樹號數字排序;不修改輸入
- `buildTreeXlsx(trees, byNo, opts): Uint8Array` = `buildXlsx(buildTreeRows(...), { columnWidths: [12, 16, 14, 12, 20, 10] })`
- `buildTreeCsv` 改為以 `buildTreeRows` 為資料來源(輸出**逐字不變**)

xlsx 部件(全部 UTF-8,字串內容如下,`sheetName` 需 XML 跳脫且 ≤31 字元):

`[Content_Types].xml`
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>
```
`_rels/.rels`
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>
```
`xl/workbook.xml`(`{SHEET}` 為跳脫後的工作表名稱)
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="{SHEET}" sheetId="1" r:id="rId1"/></sheets></workbook>
```
`xl/_rels/workbook.xml.rels`
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>
```
`xl/worksheets/sheet1.xml`:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">{COLS}<sheetData>{ROWS}</sheetData></worksheet>
```
- `{COLS}`:有 `columnWidths` 時為 `<cols><col min="1" max="1" width="12" customWidth="1"/>…</cols>`(每欄一個,min/max 為 1 起算欄號),否則為空字串
- `{ROWS}`:每列 `<row r="N">…</row>`;儲存格位址為「欄字母+列號」(A、B、…、Z、AA…);數字 `<c r="C2"><v>7.99</v></c>`;字串 `<c r="B2" t="inlineStr"><is><t xml:space="preserve">榕樹</t></is></c>`;`null`/`undefined`/`''` 不輸出該儲存格;非有限數字(NaN/Infinity)當作空白

- [ ] **Step 1: Write the failing tests**

`tests/xlsx.test.js`(用 `node:zlib` 的 `inflateRawSync` 不需要,因為是 STORE;用自己的小型讀取器解 zip):
```js
import { describe, it, expect } from 'vitest';
import { crc32, zipStore, buildXlsx, xlsxFilename } from '../src/xlsx.js';

const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

// 以 central directory 讀出 zip 內容,順便驗證 offset/size/CRC 一致(STORE 不壓縮)。
function readZip(bytes) {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
  }
  expect(eocd).toBeGreaterThanOrEqual(0);
  const count = u16(bytes, eocd + 10);
  let p = u32(bytes, eocd + 16);
  const files = {};
  for (let i = 0; i < count; i += 1) {
    expect(u32(bytes, p)).toBe(0x02014b50);
    const method = u16(bytes, p + 10);
    const crc = u32(bytes, p + 16);
    const size = u32(bytes, p + 24);
    const nameLen = u16(bytes, p + 28);
    const extraLen = u16(bytes, p + 30);
    const commentLen = u16(bytes, p + 32);
    const localOff = u32(bytes, p + 42);
    const name = dec(bytes.slice(p + 46, p + 46 + nameLen));
    expect(method).toBe(0);
    expect(u32(bytes, localOff)).toBe(0x04034b50);
    const lNameLen = u16(bytes, localOff + 26);
    const lExtraLen = u16(bytes, localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const data = bytes.slice(dataStart, dataStart + size);
    expect(crc32(data)).toBe(crc);
    files[name] = dec(data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

describe('crc32', () => {
  it('標準測試向量', () => {
    expect(crc32(enc('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('zipStore', () => {
  it('可被讀回:檔名、內容、CRC 都一致,含中文檔名與內容', () => {
    const zip = zipStore([
      { name: 'a.txt', data: enc('hello') },
      { name: '資料/b.txt', data: enc('中文內容') },
    ]);
    const files = readZip(zip);
    expect(files).toEqual({ 'a.txt': 'hello', '資料/b.txt': '中文內容' });
  });
  it('空檔案清單也是合法 zip(只有 EOCD)', () => {
    expect(zipStore([])).toHaveLength(22);
  });
});

describe('buildXlsx', () => {
  const rows = [
    ['官方樹號', '樹種', '最新樹高(m)'],
    [43667, '肯氏蒲桃', 2.34],
    ['A-1', '=SUM(A1) & <b>"x"</b>', null],
  ];
  const files = readZip(buildXlsx(rows, { columnWidths: [12, 16] }));

  it('包含 5 個必要部件', () => {
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
  });
  it('每個 XML 部件都以 XML 宣告開頭(格式良好性由 Step 6 的 Python minidom 解析驗證)', () => {
    for (const [name, xml] of Object.entries(files)) {
      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'), name).toBe(true);
    }
  });
  it('工作表:數字為數字儲存格、字串為 inlineStr、空值不輸出', () => {
    const sheet = files['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('<c r="A2"><v>43667</v></c>');
    expect(sheet).toContain('<c r="C2"><v>2.34</v></c>');
    expect(sheet).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">官方樹號</t></is></c>');
    expect(sheet).toContain('<c r="A3" t="inlineStr">');
    expect(sheet).not.toContain('r="C3"');
  });
  it('字串做 XML 跳脫,公式字串維持純文字', () => {
    const sheet = files['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('=SUM(A1) &amp; &lt;b&gt;&quot;x&quot;&lt;/b&gt;');
    expect(sheet).not.toContain('<f>');
  });
  it('欄寬與工作表名稱', () => {
    expect(files['xl/worksheets/sheet1.xml']).toContain('<cols><col min="1" max="1" width="12" customWidth="1"/><col min="2" max="2" width="16" customWidth="1"/></cols>');
    expect(files['xl/workbook.xml']).toContain('<sheet name="量測" sheetId="1" r:id="rId1"/>');
  });
  it('欄位字母超過 Z 時正確(AA=第 27 欄)', () => {
    const wide = Array.from({ length: 28 }, (_, i) => i + 1);
    const sheet = readZip(buildXlsx([wide]))['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('<c r="Z1"><v>26</v></c>');
    expect(sheet).toContain('<c r="AA1"><v>27</v></c>');
    expect(sheet).toContain('<c r="AB1"><v>28</v></c>');
  });
  it('移除 XML 不允許的控制字元、非有限數字當空白', () => {
    const sheet = readZip(buildXlsx([['a bc', NaN, Infinity, 5]]))['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('abc');
    expect(sheet).not.toContain(' ');
    expect(sheet).not.toContain('r="B1"');
    expect(sheet).not.toContain('r="C1"');
    expect(sheet).toContain('<c r="D1"><v>5</v></c>');
  });
  it('工作表名稱過長會截斷到 31 字元並跳脫', () => {
    const f = readZip(buildXlsx([[1]], { sheetName: `A&B${'x'.repeat(40)}` }));
    const m = f['xl/workbook.xml'].match(/<sheet name="([^"]*)"/)[1];
    expect(m.startsWith('A&amp;B')).toBe(true);
    expect(m.replace(/&amp;/g, '&').length).toBeLessThanOrEqual(31);
  });
});

describe('xlsxFilename', () => {
  it('用台灣日期', () => {
    expect(xlsxFilename(Date.parse('2026-09-19T20:00:00Z'))).toBe('nkhs-trees-20260920.xlsx');
  });
});
```
在 `tests/exportCsv.test.js` 追加:
```js
import { buildTreeRows, buildTreeXlsx } from '../src/exportCsv.js';

describe('buildTreeRows', () => {
  const trees = [{ no: '10', sp: '榕樹' }, { no: '2', sp: '樟樹' }, { no: '3', sp: '楓香,特別' }];
  const byNo = new Map([
    ['10', { no: '10', height: 12.5, girth: 80, at: '2026-09-19T16:30:00.000Z', n: 3 }],
    ['3', { no: '3', height: 2.34, girth: null, at: '2026-09-01T02:00:00.000Z', n: 1 }],
  ]);
  it('第一列標題;預設只含有量測的樹,依樹號數字排序,數字保持數字', () => {
    const rows = buildTreeRows(trees, byNo);
    expect(rows[0]).toEqual(['官方樹號', '樹種', '最新樹高(m)', '樹圍(cm)', '量測時間(台灣)', '量測筆數']);
    expect(rows[1]).toEqual(['3', '楓香,特別', 2.34, null, '2026-09-01 10:00', 1]);
    expect(rows[2]).toEqual(['10', '榕樹', 12.5, 80, '2026-09-20 00:30', 3]);
    expect(rows).toHaveLength(3);
  });
  it('onlyMeasured:false 時含未量測的樹,後四欄為 null;不修改輸入', () => {
    const copy = JSON.parse(JSON.stringify(trees));
    const rows = buildTreeRows(trees, byNo, { onlyMeasured: false });
    expect(rows[1]).toEqual(['2', '樟樹', null, null, null, null]);
    expect(rows).toHaveLength(4);
    expect(trees).toEqual(copy);
  });
});

describe('buildTreeXlsx', () => {
  it('產出 zip(PK 開頭),且樹號寫成數字儲存格', () => {
    const bytes = buildTreeXlsx([{ no: '43667', sp: '肯氏蒲桃' }], new Map([['43667', { no: '43667', height: 2.34, girth: 35, at: '2026-09-19T16:15:00.000Z', n: 3 }]]));
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('<c r="A2"><v>43667</v></c>');
    expect(text).toContain('<c r="C2"><v>2.34</v></c>');
  });
});
```
(既有的 `buildTreeCsv` 測試必須原樣保留並通過。)

在 `tests/adminHtml.test.js` 追加/調整(`html` 為既有的讀檔變數):
```js
  it('主按鈕下載 .xlsx,次要按鈕下載 CSV,兩者共用同一份資料', () => {
    expect(html).toMatch(/id="export-xlsx"/);
    expect(html).toMatch(/id="export-csv"/);
    expect(html).toMatch(/buildTreeXlsx\(/);
    expect(html).toMatch(/buildTreeCsv\(/);
    expect(html).toMatch(/xlsxFilename\(/);
    expect(html).toMatch(/csvFilename\(/);
    expect(html).toContain('下載 Excel');
  });
```
並把既有測試中對 `id="export"` 或 `下載 CSV` 的斷言(若有)改為對應新 id/文字,**不得刪除**「不得碰 roster-list」等既有斷言。

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/xlsx.test.js tests/exportCsv.test.js tests/adminHtml.test.js`
Expected: FAIL(找不到 `../src/xlsx.js`;`buildTreeRows`/`buildTreeXlsx` 未匯出;admin 新斷言失敗)。記錄失敗輸出。

- [ ] **Step 3: Implement `src/xlsx.js`**

```js
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
  return String(value).replace(/[ --￾￿]/g, '');
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
  const name = escapeXml(cleanText(sheetName).slice(0, 31));

  const parts = {
    '[Content_Types].xml': `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    '_rels/.rels': `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${XML_HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': `${XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${sheetRows}</sheetData></worksheet>`,
  };
  return zipStore(Object.entries(parts).map(([n, text]) => ({ name: n, data: encoder.encode(text) })));
}

const TAIWAN_OFFSET_MS = 8 * 3600 * 1000;
export function xlsxFilename(nowMs) {
  const day = new Date(nowMs + TAIWAN_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, '');
  return `nkhs-trees-${day}.xlsx`;
}
```

- [ ] **Step 4: Refactor `src/exportCsv.js`**

在檔內新增(放在 `buildTreeCsv` 之前),並讓 `buildTreeCsv` 以它為資料來源,**輸出必須與現在逐字相同**(既有 `buildTreeCsv` 測試不變):
```js
import { buildXlsx, xlsxFilename } from './xlsx.js';
export { xlsxFilename };

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

export function buildTreeXlsx(trees, byNo, opts) {
  const rows = buildTreeRows(trees, byNo, opts).map((cells, i) => {
    // 樹號純數字時寫成數字儲存格(標題列除外);其餘維持字串。
    if (i === 0) return cells;
    return /^[1-9]\d{0,14}$/.test(String(cells[0])) ? [Number(cells[0]), ...cells.slice(1)] : cells;
  });
  return buildXlsx(rows, { columnWidths: [12, 16, 14, 12, 20, 10] });
}
```
`buildTreeCsv` 改為:
```js
export function buildTreeCsv(trees, byNo, opts) {
  const lines = buildTreeRows(trees, byNo, opts).map((cells) => cells.map(csvEscape).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}
```
(`csvEscape(null)` 已回空字串,所以未量測的列仍輸出 `2,樟樹,,,,`。)

- [ ] **Step 5: Update `public/admin.html`**

匯出區改為:
```html
      <p>
        <button type="button" class="primary" id="export-xlsx">下載 Excel (.xlsx)</button>
        <button type="button" class="small" id="export-csv">改下載 CSV</button>
      </p>
```
(移除原 `id="export"` 的單一按鈕;`#only-measured` 勾選與 `#export-msg` 保留。)腳本改為共用一個 `runExport(kind)`:載入官方樹木與公開摘要(維持現有的 `Promise.all`、錯誤處理、Blob 下載與清理),其中:
- `kind === 'xlsx'`:`const bytes = buildTreeXlsx(trees, byNo, { onlyMeasured });` → `new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })`,檔名 `xlsxFilename(Date.now())`
- `kind === 'csv'`:沿用現有 `buildTreeCsv` 與 `csvFilename`
- 兩個按鈕在執行期間都 `disabled`,結束(含失敗)後恢復
- 成功訊息維持現有格式(列數、`formatTaiwanTime(body.generatedAt) || '未知'`、`(台灣時間)`)
- 匯入改為 `import { buildTreeCsv, buildTreeXlsx, csvFilename, xlsxFilename, formatTaiwanTime } from '../src/exportCsv.js';`
- 說明文字補一句:「用 Excel 開啟 .xlsx 即可;CSV 給需要純文字格式的系統使用。」

- [ ] **Step 6: 額外驗證(非單元測試,結果寫進報告)**

用 Python 標準函式庫驗證產出檔能被通用 ZIP/XML 解析器讀取(沒有 Excel 可用時的替代驗證):
```bash
node -e "import('./src/exportCsv.js').then(m=>{const b=m.buildTreeXlsx([{no:'43667',sp:'肯氏蒲桃'},{no:'2',sp:'樟樹'}],new Map([['43667',{no:'43667',height:2.34,girth:35,at:'2026-09-19T16:15:00.000Z',n:3}]]),{onlyMeasured:false});require('fs').writeFileSync(process.env.TEMP+'/probe.xlsx',b)})"
python -c "import zipfile,os,xml.dom.minidom as m; p=os.environ['TEMP']+'/probe.xlsx'; z=zipfile.ZipFile(p); print('testzip:',z.testzip()); [m.parseString(z.read(n)) for n in z.namelist()]; print('all parts parse OK:',z.namelist())"
```
(若 `node -e` 在此環境引號有問題,改寫成暫存 `.mjs` 檔執行後再刪除或放在 scratchpad,不要提交。)Expected: `testzip: None` 且五個 XML 部件全部 parse 成功。

- [ ] **Step 7: 文件**

`DEPLOY.md` 的「匯出與教師管理」與 `docs/WORKLOG.md`:匯出說明改為「主:.xlsx(欄位一定分開、數字為數字);次:CSV」;加註原因(Excel 依 Windows 清單分隔符號拆 CSV,使用者實測擠在 A 欄);「未驗證」改為「.xlsx 用 Excel 開啟」。條列即可。

- [ ] **Step 8: Run full tests**

Run: `npx vitest run`
Expected: PASS(全部,含既有 `buildTreeCsv` 測試原樣通過)

- [ ] **Step 9: Commit**

```bash
git add src/xlsx.js tests/xlsx.test.js src/exportCsv.js tests/exportCsv.test.js public/admin.html tests/adminHtml.test.js DEPLOY.md docs/WORKLOG.md
git commit -m "feat: 匯出改為真正的 .xlsx(欄位不受 Excel 清單分隔符號影響),CSV 保留為次要選項" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec/需求覆蓋:** 欄位一定分開(xlsx 儲存格)、數字為數字(樹號/高度/圍/筆數)、CSV 保留(次要按鈕)、既有 CSV 行為不變(共用 `buildTreeRows`、`buildTreeCsv` 輸出逐字不變)、無外部函式庫(自寫 STORE zip)、不改快取(不升版)。
- **Placeholder scan:** 無 TBD;所有部件 XML 與函式皆完整。
- **Type consistency:** `buildTreeRows`→`buildTreeXlsx`/`buildTreeCsv`;`xlsxFilename` 由 `xlsx.js` 定義並在 `exportCsv.js` 轉出;admin.html 匯入清單與匯出一致。
- **已知取捨:** 無法在此環境用真實 Excel 驗證,以「zip 結構自解測試 + Python zipfile/minidom 解析」替代;最終以使用者用 Excel 開啟為準。`inlineStr` 為 Excel 支援的標準寫法。
