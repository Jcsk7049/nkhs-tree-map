import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../public/${p}`, import.meta.url));
const manifest = JSON.parse(read('manifest.json').toString('utf8'));
const pngSize = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

describe('manifest.json', () => {
  it('以殼層為安裝起點與範圍', () => {
    expect(manifest.start_url).toBe('./app.html');
    expect(manifest.scope).toBe('./');
    expect(manifest.id).toBe('./app.html');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#2e7d32');
  });
  it('宣告 192 與 512 圖示,檔案存在且尺寸與宣告一致', () => {
    const sizes = manifest.icons.map((i) => i.sizes).sort();
    expect(sizes).toEqual(['192x192', '512x512']);
    for (const icon of manifest.icons) {
      const file = icon.src.replace('./', '');
      expect(existsSync(new URL(`../public/${file}`, import.meta.url)), file).toBe(true);
      const [w, h] = pngSize(read(file));
      expect(`${w}x${h}`).toBe(icon.sizes);
    }
  });
  it('圖示 purpose 為 any maskable', () => {
    for (const icon of manifest.icons) expect(icon.purpose).toBe('any maskable');
  });
  it('iOS 用的 180px 圖示存在且尺寸正確', () => {
    expect(pngSize(read('icon-180.png'))).toEqual([180, 180]);
  });
});
