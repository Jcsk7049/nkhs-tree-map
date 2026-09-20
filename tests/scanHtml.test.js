import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/scan.html', import.meta.url), 'utf8');

describe('scan.html 掃描頁(原始碼層級檢查)', () => {
  it('載入本地 jsQR 與純函式模組,不載入教師登入或外部腳本', () => {
    expect(html).toContain('./vendor/jsqr/jsQR.js');
    expect(html).toMatch(/from\s+'\.\.\/src\/qrScan\.js'/);
    expect(html).toMatch(/from\s+'\.\.\/src\/embed\.js'/);
    expect(html).toMatch(/from\s+'\.\.\/src\/appShell\.js'/);
    expect(html).not.toMatch(/teacherGate|accounts\.google\.com|script\.google\.com/);
    expect(html).not.toMatch(/<script[^>]+src="https?:/);
  });
  it('按下按鈕才要求相機,後鏡頭優先,video 有 playsinline(iOS 必要)', () => {
    expect(html).toMatch(/getUserMedia\(/);
    expect(html).toMatch(/facingMode:\s*\{\s*ideal:\s*'environment'/);
    expect(html).toMatch(/<video[^>]*playsinline/);
    expect(html).toMatch(/id="start"/);
  });
  it('隱私:不存檔、不上傳(只讀樹木名單)', () => {
    expect(html).not.toMatch(/localStorage|sessionStorage|indexedDB|toDataURL|toBlob|XMLHttpRequest|sendBeacon/);
    const fetches = [...html.matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[1]);
    expect(fetches.length).toBeGreaterThan(0);
    for (const args of fetches) expect(args).toContain('nkhs-trees.json');
  });
  it('分頁隱藏/離開時關閉相機', () => {
    expect(html).toMatch(/type\s*!==\s*'tab-visibility'|type\s*===\s*'tab-visibility'/);
    expect(html).toMatch(/e\.origin\s*!==\s*(window\.)?location\.origin|event\.origin\s*!==\s*(window\.)?location\.origin/);
    expect(html).toContain("'pagehide'");
    expect(html).toContain('visibilitychange');
    expect(html).toMatch(/getTracks\(\)\.forEach\(\(\w+\) => \w+\.stop\(\)\)/);
  });
  it('掃到後用 textContent 顯示樹號與樹種,並以 trees.html 相同方式進入量測', () => {
    expect(html).toMatch(/parseTreeIdFromQr\(/);
    expect(html).toMatch(/window\.top\.location\.hash\s*=\s*buildHash\('student',\s*'measure'/);
    expect(html).toMatch(/tree\.html\?treeId=/);
    expect(html).not.toMatch(/innerHTML/);
  });
  it('有相機不可用時的替代說明,語言與 viewport 正確', () => {
    expect(html).toContain('相機 App');
    expect(html).toMatch(/<html lang="zh-Hant-TW"/);
    expect(html).toMatch(/name="viewport"/);
  });
});
