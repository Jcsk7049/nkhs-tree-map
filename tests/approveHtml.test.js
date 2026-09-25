import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/approve.html', import.meta.url), 'utf8');

describe('approve.html 核可頁(原始碼層級檢查)', () => {
  it('從 config.js 匯入、需教師登入、支援內嵌', () => {
    expect(html).toMatch(/import\s*\{[^}]*API_URL[^}]*GOOGLE_CLIENT_ID[^}]*\}\s*from\s*'\.\.\/src\/config\.js'/);
    expect(html).toMatch(/requireTeacher\(/);
    expect(html).toMatch(/applyEmbedMode\(/);
    expect(html).not.toMatch(/script\.google\.com/);
  });

  it('用公開 summary 的 pending 與官方樹木資料,只列官方樹號(不依賴可能是舊版快取的 heightColors.js)', () => {
    expect(html).toContain('?action=summary');
    expect(html).toContain('../data/nkhs-trees.json');
    expect(html).toMatch(/body\.pending/);
    expect(html).toMatch(/species\.has\(no\)/);
    expect(html).not.toMatch(/from\s*'\.\.\/src\/heightColors\.js'/);
  });

  it('呼叫 batch/approve/undo,送出整批 keys 與要撤銷的 id,處理 BATCH_CHANGED', () => {
    for (const a of ['approval-batch', 'approval-approve', 'approval-undo']) expect(html).toContain(`'${a}'`);
    expect(html).toMatch(/keys:/);
    expect(html).toMatch(/id:\s*last\.id/);
    expect(html).toContain('BATCH_CHANGED');
  });

  it('核可與撤銷前都要確認;用 groupValues 分組;圓餅用 conic-gradient;不用 innerHTML', () => {
    expect((html.match(/window\.confirm\(/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(html).toMatch(/groupValues\(/);
    expect(html).toMatch(/conic-gradient/);
    expect(html).not.toMatch(/innerHTML/);
  });

  it('組距選項:樹高 0.1/0.5/1 m、樹圍 1/5/10 cm,預設 0.5 m 與 5 cm', () => {
    expect(html).toMatch(/<option value="10">0\.1 公尺<\/option>/);
    expect(html).toMatch(/<option value="50" selected>0\.5 公尺<\/option>/);
    expect(html).toMatch(/<option value="100">1 公尺<\/option>/);
    expect(html).toMatch(/<option value="10">1 公分<\/option>/);
    expect(html).toMatch(/<option value="50" selected>5 公分<\/option>/);
    expect(html).toMatch(/<option value="100">10 公分<\/option>/);
  });

  it('同票時提醒老師確認', () => {
    expect(html).toContain('有兩組以上一樣多');
  });

  it('後端尚未更新時有明確提示', () => {
    expect(html).toContain('重新部署');
  });
});

describe('teacher.html 教師入口', () => {
  it('有「量測核可」卡片連到 approve.html', () => {
    const teacher = readFileSync(new URL('../public/teacher.html', import.meta.url), 'utf8');
    expect(teacher).toMatch(/<a class="card" href="\.\/approve\.html"><strong>量測核可<\/strong>/);
  });
});

describe('map.html 更新過渡期(不在離線快取,可能配到舊版 heightColors.js)', () => {
  const map = readFileSync(new URL('../public/map.html', import.meta.url), 'utf8');
  it('不從 heightColors.js 匯入新名稱 PENDING_COLOR,且拿不到 pendingByNo 時退回空 Map', () => {
    const importLine = map.match(/import\s*\{[^}]*\}\s*from\s*'\.\.\/src\/heightColors\.js'/)[0];
    expect(importLine).not.toContain('PENDING_COLOR');
    expect(map).toMatch(/pendingByNo = waiting \|\| new Map\(\)/);
  });
});
