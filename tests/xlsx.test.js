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
    const sheet = readZip(buildXlsx([['a\u0000b\bc', NaN, Infinity, 5]]))['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('abc');
    expect(sheet).not.toContain('\u0000');
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
