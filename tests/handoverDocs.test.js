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

describe('docs/HANDOVER.md 第 4 節環境安裝指引', () => {
  for (const h of ['### 4.1', '### 4.2', '### 4.3']) {
    it(`有 ${h} 標題`, () => {
      expect(doc.split('\n').some((l) => l.startsWith(h))).toBe(true);
    });
  }
  for (const s of ['Node.js', 'Live Server', 'Vitest', 'Prettier', 'F12', 'npm install', 'git clone']) {
    it(`提到 ${s}`, () => {
      expect(doc).toContain(s);
    });
  }
});

describe('CLAUDE.md / AGENTS.md(給 AI 工具的專案規則)', () => {
  it('兩份都存在且逐位元組相同', () => {
    expect(existsSync(resolve(root, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(resolve(root, 'AGENTS.md'))).toBe(true);
    expect(readFileSync(resolve(root, 'CLAUDE.md')).equals(readFileSync(resolve(root, 'AGENTS.md')))).toBe(true);
  });
  for (const s of ['npm test', 'CACHE_NAME', 'swCacheList', 'public/vendor', 'Code.gs', 'GOOGLE_CLIENT_ID', 'docs/HANDOVER.md']) {
    it(`提到 ${s}`, () => {
      expect(existsSync(resolve(root, 'CLAUDE.md')) && read('CLAUDE.md')).toContain(s);
    });
  }
  it('反引號內的檔案路徑都真的存在', () => {
    const paths = [...read('CLAUDE.md').matchAll(/`([^`\s]+)`/g)]
      .map((m) => m[1])
      .filter((p) => p.includes('/') && /\.[A-Za-z0-9]+$/.test(p) && !p.includes('*') && !/^https?:/.test(p));
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(existsSync(resolve(root, p)), p).toBe(true);
  });
  it('README.md 提到 CLAUDE.md 與 AGENTS.md', () => {
    const r = read('README.md');
    expect(r).toContain('CLAUDE.md');
    expect(r).toContain('AGENTS.md');
  });
});
