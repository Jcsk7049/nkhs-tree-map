// 守住交接說明書:「想改什麼→改哪裡」對照表的檔案與關鍵字必須真的存在,程式改動後文件才不會說謊。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const doc = read('docs/HANDOVER.md');

function pointerRows() {
  const start = doc.indexOf('<!-- pointers:start -->');
  const end = doc.indexOf('<!-- pointers:end -->');
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const rows = [];
  for (const line of doc.slice(start, end).split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const file = /^`([^`]+)`$/.exec(cells[1] || '');
    const kw = /^`([^`]+)`$/.exec(cells[2] || '');
    if (!file || !kw) continue; // 標題列與分隔列沒有反引號,自然略過
    rows.push({ file: file[1], keyword: kw[1] });
  }
  return rows;
}

describe('docs/HANDOVER.md 對照表', () => {
  const rows = pointerRows();
  it('至少 10 列', () => {
    expect(rows.length).toBeGreaterThanOrEqual(10);
  });
  for (const { file, keyword } of rows) {
    it(`${file} 含有「${keyword}」`, () => {
      expect(existsSync(resolve(root, file))).toBe(true);
      expect(read(file)).toContain(keyword);
    });
  }
});

describe('docs/HANDOVER.md 內容', () => {
  for (let n = 0; n <= 10; n++) {
    it(`有第 ${n} 節標題`, () => {
      expect(doc.split('\n').some((l) => l.startsWith(`## ${n}. `))).toBe(true);
    });
  }
  for (const phrase of ['CODE_PEPPER', 'CACHE_NAME', 'npm test', '不是 Java']) {
    it(`提到 ${phrase}`, () => {
      expect(doc).toContain(phrase);
    });
  }
});

describe('入口文件與 CI', () => {
  it('README.md 連到 docs/HANDOVER.md', () => {
    expect(read('README.md')).toContain('docs/HANDOVER.md');
  });
  it('test.yml 設定正確', () => {
    const p = '.github/workflows/test.yml';
    expect(existsSync(resolve(root, p))).toBe(true);
    const y = read(p);
    for (const s of ['npm ci', 'npm test', 'pull_request', 'actions/checkout']) expect(y).toContain(s);
  });
});
