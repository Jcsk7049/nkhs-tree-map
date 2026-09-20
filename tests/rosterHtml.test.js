import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/roster.html', import.meta.url), 'utf8');

describe('roster.html 鎖定顯示與解除(原始碼層級檢查)', () => {
  it('依 student.locked 顯示鎖定標示與解除鎖定按鈕', () => {
    expect(html).toMatch(/student\.locked/);
    expect(html).toContain('🔒');
    expect(html).toContain('解除鎖定');
    expect(html).toMatch(/dataset\.action\s*=\s*'unlock'/);
  });
  it('點擊解除鎖定呼叫 roster-unlock 並重新載入名單', () => {
    expect(html).toMatch(/teacher\.call\('roster-unlock',\s*\{\s*classNo:/);
    const at = html.indexOf("'roster-unlock'");
    expect(html.indexOf('loadRoster()', at)).toBeGreaterThan(at);
  });
  it('既有的重設與停用/啟用仍在', () => {
    expect(html).toContain("teacher.call('roster-status'");
    expect(html).toContain('重設通行碼');
  });
});
