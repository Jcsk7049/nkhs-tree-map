import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import qrcode from '../public/vendor/qrcode.mjs';
import { buildTreeUrl } from '../src/qrLabels.js';
import { parseTreeIdFromQr } from '../src/qrScan.js';

const official = new Set(['43667', '43020', '10']);

describe('parseTreeIdFromQr', () => {
  it('正式樹牌網址:取出 treeId', () => {
    expect(parseTreeIdFromQr('https://jcsk7049.github.io/nkhs-tree-map/public/tree.html?treeId=43667', official)).toEqual({ ok: true, treeId: '43667' });
  });
  it('換網域、多參數、前後空白也可以(只看 treeId)', () => {
    expect(parseTreeIdFromQr('  http://school.example/app/tree.html?x=1&treeId=43020#top \n', official)).toEqual({ ok: true, treeId: '43020' });
  });
  it('純數字樹號也接受', () => {
    expect(parseTreeIdFromQr('43667', official)).toEqual({ ok: true, treeId: '43667' });
  });
  it('不在官方名單 → unknown-tree', () => {
    expect(parseTreeIdFromQr('https://x.tw/tree.html?treeId=99999', official)).toEqual({ ok: false, reason: 'unknown-tree' });
    expect(parseTreeIdFromQr('99999', official)).toEqual({ ok: false, reason: 'unknown-tree' });
  });
  it('不是樹牌內容 → not-tree-qr', () => {
    for (const bad of ['', '   ', 'hello', 'WIFI:S:x;T:WPA;P:y;;', 'https://example.com/', 'https://x.tw/tree.html?treeId=', 'https://x.tw/tree.html?treeId=%20', null, undefined, 123]) {
      const r = parseTreeIdFromQr(bad, official);
      expect(r.ok, String(bad)).toBe(false);
    }
    expect(parseTreeIdFromQr('hello', official)).toEqual({ ok: false, reason: 'not-tree-qr' });
  });
  it('危險協定與超長內容一律拒絕且不丟例外', () => {
    expect(parseTreeIdFromQr('javascript:alert(1)//?treeId=43667', official).ok).toBe(false);
    expect(parseTreeIdFromQr('data:text/html,<script>?treeId=43667', official).ok).toBe(false);
    expect(parseTreeIdFromQr('ftp://x.tw/?treeId=43667', official).ok).toBe(false);
    expect(parseTreeIdFromQr(`https://x.tw/?treeId=43667&${'a'.repeat(3000)}`, official)).toEqual({ ok: false, reason: 'not-tree-qr' });
  });
  it('樹號含特殊字元(如 __proto__)不會被誤判為官方樹', () => {
    expect(parseTreeIdFromQr('https://x.tw/?treeId=__proto__', official)).toEqual({ ok: false, reason: 'unknown-tree' });
  });
});

// 端到端:用專案自己的 QR 產生器產生「真的樹牌 QR」,轉成像素,交給 jsQR 解碼,再交給 parseTreeIdFromQr。
describe('真實樹牌 QR → jsQR 解碼 → 解析', () => {
  // package.json 為 type:module,vitest 會把 jsQR.js(UMD)當 ESM 轉換,導致 module/exports 不存在。
  // 因此以 vm 在 CommonJS 樣貌的沙盒中執行原檔文字,取出 module.exports(不修改該檔)。
  const sandbox = { module: { exports: {} }, self: undefined };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(readFileSync(new URL('../public/vendor/jsqr/jsQR.js', import.meta.url), 'utf8'), sandbox);
  const jsQR = sandbox.module.exports;

  function renderToRgba(text, { scale = 4, margin = 4 } = {}) {
    const qr = qrcode(0, 'Q');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const size = (n + margin * 2) * scale;
    const data = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        if (!qr.isDark(r, c)) continue;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const i = (((r + margin) * scale + dy) * size + (c + margin) * scale + dx) * 4;
            data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
          }
        }
      }
    }
    return { data, size };
  }

  it('印出來的 QR(qrcodes.html 同樣的產生方式)能被解出網址並解析出樹號', () => {
    const url = buildTreeUrl('https://jcsk7049.github.io/nkhs-tree-map/public/tree.html', '43667');
    const { data, size } = renderToRgba(url);
    const decoded = jsQR(data, size, size, { inversionAttempts: 'dontInvert' });
    expect(decoded).not.toBeNull();
    expect(decoded.data).toBe(url);
    expect(parseTreeIdFromQr(decoded.data, official)).toEqual({ ok: true, treeId: '43667' });
  });
  it('縮小(scale=2)與較小安靜區(margin=2)仍可解碼', () => {
    const url = buildTreeUrl('https://jcsk7049.github.io/nkhs-tree-map/public/tree.html', '43020');
    const { data, size } = renderToRgba(url, { scale: 2, margin: 2 });
    const decoded = jsQR(data, size, size, { inversionAttempts: 'dontInvert' });
    expect(decoded && decoded.data).toBe(url);
  });
  it('沒有 QR 的空白畫面回傳 null(不會誤判)', () => {
    const size = 200;
    const blank = new Uint8ClampedArray(size * size * 4).fill(255);
    expect(jsQR(blank, size, size, { inversionAttempts: 'dontInvert' })).toBeNull();
  });
});
