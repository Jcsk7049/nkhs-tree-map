import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadRemembered, saveRemembered, forgetRemembered, REMEMBER_KEY } from '../src/rememberCode.js';

const fakeStorage = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map };
};
const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };

describe('rememberCode(學生自己勾選才在自己手機記住學號與通行碼)', () => {
  it('存了讀得回來;忘記後讀不到', () => {
    const s = fakeStorage();
    expect(loadRemembered(s)).toBeNull();
    expect(saveRemembered(s, '11305001', 'BY9HBHH')).toBe(true);
    expect(loadRemembered(s)).toEqual({ classNo: '11305001', code: 'BY9HBHH' });
    forgetRemembered(s);
    expect(loadRemembered(s)).toBeNull();
  });
  it('存的內容壞掉或形狀不對 → null,不丟例外', () => {
    for (const bad of ['{oops', 'null', '"x"', '{"classNo":1,"code":"A"}', '{"classNo":"1"}']) {
      const s = fakeStorage();
      s.setItem(REMEMBER_KEY, bad);
      expect(loadRemembered(s)).toBeNull();
    }
  });
  it('無痕模式等 storage 無法使用時安全失敗', () => {
    expect(loadRemembered(broken)).toBeNull();
    expect(saveRemembered(broken, 'a', 'b')).toBe(false);
    expect(() => forgetRemembered(broken)).not.toThrow();
  });
});

describe('tree.html「記住我」(原始碼順序檢查)', () => {
  const html = readFileSync(new URL('../public/tree.html', import.meta.url), 'utf8');
  const handler = html.slice(html.indexOf("form.addEventListener('submit'"));
  it('勾選框預設不勾,文字說明只在自己的手機使用', () => {
    expect(html).toMatch(/<input type="checkbox" id="remember-me" \/>/);
    expect(html).toContain('在這支手機記住我的通行碼');
    expect(html).toContain('忘記這支手機');
  });
  it('只有送出成功(sent)且有勾選才存;沒勾就清掉已記住的', () => {
    const sentAt = handler.indexOf("status === 'sent'");
    const queuedAt = handler.indexOf("status === 'queued'");
    const saveAt = handler.indexOf('saveRemembered(');
    expect(saveAt).toBeGreaterThan(sentAt);
    expect(saveAt).toBeLessThan(queuedAt);
    expect(handler).toMatch(/if \(rememberBox\.checked\)/);
  });
  it('開頁時讀取記住的資料並自動勾選', () => {
    expect(html).toMatch(/loadRemembered\(store\)/);
    expect(html).toMatch(/rememberBox\.checked = true/);
  });
});
