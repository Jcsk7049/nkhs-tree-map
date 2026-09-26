import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { partitionOfficial } from '../src/qrLabels.js';

const html = readFileSync(new URL('../public/qrcodes.html', import.meta.url), 'utf8');

describe('QR 標籤只用官方樹號', () => {
  it('自己編號(前綴/起迄範圍)的功能已移除', () => {
    for (const id of ['range-prefix', 'range-start', 'range-end', 'range-pad', 'add-range']) expect(html).not.toContain(`id="${id}"`);
    expect(html).not.toMatch(/generateRange/);
  });
  it('清單標示為官方樹號;產生前比對官方資料,非官方號碼略過並列出;資料沒載入就不產生', () => {
    expect(html).toContain('官方樹號清單');
    expect(html).toMatch(/partitionOfficial\(/);
    expect(html).toContain('不是官方樹號,已略過');
    expect(html).toContain('官方樹木資料還沒載入');
  });
  it('partitionOfficial 依官方索引分成兩組並保留順序', () => {
    const index = new Map([['43667', {}], ['43020', {}]]);
    expect(partitionOfficial(['43667', 'A-001', '43020', '1'], index)).toEqual({ official: ['43667', '43020'], unknown: ['A-001', '1'] });
  });
});

describe('地圖說明框「列印這棵的 QR 標籤」', () => {
  const fake = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

  it('requestPrintOne 存入、takePrintOne 取出一次後清掉;storage 壞掉時安全', async () => {
    const { requestPrintOne, takePrintOne } = await import('../src/qrLabels.js');
    const s = fake();
    expect(takePrintOne(s)).toBe('');
    requestPrintOne(s, '43452');
    expect(takePrintOne(s)).toBe('43452');
    expect(takePrintOne(s)).toBe('');
    const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
    expect(() => requestPrintOne(broken, '1')).not.toThrow();
    expect(takePrintOne(broken)).toBe('');
    expect(takePrintOne(null)).toBe('');
  });

  it('map.html:說明框有按鈕,存入這棵後切到 QR 標籤分頁(內嵌)或開 qrcodes.html', () => {
    const map = readFileSync(new URL('../public/map.html', import.meta.url), 'utf8');
    expect(map).toContain('列印這棵的 QR 標籤');
    expect(map).toMatch(/requestPrintOne\(/);
    expect(map).toMatch(/buildHash\('teacher', 'labels'\)/);
    expect(map).toMatch(/'\.\/qrcodes\.html'/);
  });

  it('qrcodes.html:載入時與收到 storage 事件時取出這一棵,只放這棵並自動產生,不動地圖清單', () => {
    expect(html).toMatch(/takePrintOne\(/);
    expect(html).toMatch(/addEventListener\('storage'/);
    expect(html).toMatch(/PRINT_ONE_KEY/);
    const fn = html.slice(html.indexOf('function applyPrintOne'));
    expect(fn).toMatch(/listInput\.value = id/);
    expect(fn).toMatch(/getElementById\('generate'\)\.click\(\)/);
    expect(fn.slice(0, fn.indexOf('\n    }\n'))).not.toMatch(/removeItem\(KEY_LIST\)/);
  });
});
