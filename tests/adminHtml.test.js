import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');

describe('admin.html 管理頁(原始碼層級檢查)', () => {
  it('從 config.js 匯入設定,需教師登入,支援內嵌模式', () => {
    expect(html).toMatch(/import\s*\{[^}]*API_URL[^}]*GOOGLE_CLIENT_ID[^}]*\}\s*from\s*'\.\.\/src\/config\.js'/);
    expect(html).toMatch(/requireTeacher\(/);
    expect(html).toMatch(/applyEmbedMode\(/);
    expect(html).not.toMatch(/script\.google\.com/);
  });
  it('匯出:只用公開摘要與官方樹木資料,呼叫 buildTreeCsv/csvFilename,提供只匯出已量測選項', () => {
    expect(html).toMatch(/from\s+'\.\.\/src\/exportCsv\.js'/);
    expect(html).toContain('../data/nkhs-trees.json');
    expect(html).toContain('?action=summary');
    expect(html).toMatch(/buildTreeCsv\(/);
    expect(html).toMatch(/csvFilename\(/);
    expect(html).toContain('只匯出已有量測的樹');
    expect(html).toMatch(/id="only-measured"[^>]*checked/);
    expect(html).not.toMatch(/roster-list/); // 匯出不得碰含個資的名單
  });
  it('主按鈕下載 .xlsx,次要按鈕下載 CSV,兩者共用同一份資料', () => {
    expect(html).toMatch(/id="export-xlsx"/);
    expect(html).toMatch(/id="export-csv"/);
    expect(html).toMatch(/buildTreeXlsx\(/);
    expect(html).toMatch(/buildTreeCsv\(/);
    expect(html).toMatch(/xlsxFilename\(/);
    expect(html).toMatch(/csvFilename\(/);
    expect(html).toContain('下載 Excel');
  });
  it('教師帳號:列表、新增、移除,且自己那列不提供移除', () => {
    for (const a of ['teacher-list', 'teacher-add', 'teacher-remove']) {
      expect(html).toContain(`'${a}'`);
    }
    expect(html).toMatch(/window\.confirm\(/);
    expect(html).toMatch(/me\.email|teacher\.email/);
  });
  it('資料更新時間以台灣時間顯示,不再出現 UTC', () => {
    expect(html).toMatch(/formatTaiwanTime\(/);
    expect(html).not.toContain('UTC');
  });
  it('後端尚未更新時有明確提示', () => {
    expect(html).toContain('重新部署');
  });
});
