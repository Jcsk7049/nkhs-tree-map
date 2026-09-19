import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// tree.html 的送出處理寫在頁面內的 inline script,沒有可 import 的函式,
// 所以用原始碼順序檢查:每次送出一開始就必須清掉上一次的結果訊息。
describe('tree.html 送出時清除舊的成功訊息', () => {
  const html = readFileSync(new URL('../public/tree.html', import.meta.url), 'utf8');
  const handler = html.slice(html.indexOf("form.addEventListener('submit'"));

  it('定義 hideResult 並在驗證/送出前呼叫,避免成功訊息與新錯誤同時顯示', () => {
    expect(html).toMatch(/function hideResult\(\)/);
    const clearAt = handler.indexOf('hideResult()');
    const validateAt = handler.indexOf('const formValues');
    expect(clearAt).toBeGreaterThan(-1);
    expect(clearAt).toBeLessThan(validateAt);
  });
});
