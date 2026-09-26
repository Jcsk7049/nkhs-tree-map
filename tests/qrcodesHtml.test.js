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
