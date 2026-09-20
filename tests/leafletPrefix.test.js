import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Leaflet 預設在地圖右下角放一個指向 leafletjs.com 的「Leaflet」連結。
// 在 iframe/獨立 App 裡誤點會把整個分頁帶到外站且沒有返回鍵(使用者 iPhone 實測發生過),所以兩張地圖都要移除這個連結前綴。
describe('地圖不放外站連結(Leaflet 前綴)', () => {
  for (const page of ['trees.html', 'map.html']) {
    it(`${page} 建立地圖後呼叫 attributionControl.setPrefix(false),圖資標示文字仍保留`, () => {
      const html = readFileSync(new URL(`../public/${page}`, import.meta.url), 'utf8');
      const created = html.indexOf("L.map('map'");
      const removed = html.indexOf('attributionControl.setPrefix(false)');
      expect(created).toBeGreaterThan(-1);
      expect(removed).toBeGreaterThan(created);
      expect(html).toContain('© 內政部國土測繪中心');
    });
  }
});
