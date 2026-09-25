# 學號自動轉換 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 學生識別改用 8 碼學號,前端即時拆解顯示「112 級 土木科 忠班 71 號」,前後端都擋格式錯誤。

**Architecture:** 新增純函式 `src/studentId.js`(拆解+科別表),名單頁/量測頁共用;`src/roster.js` 解析時就檢查格式;`Code.gs` 匯入名單時用同一條正規式再擋一次。內部欄位名 `classNo`/`studentClassNo` 不改。

**Tech Stack:** 純 HTML/JS ES modules、Google Apps Script、vitest。

**Spec:** `docs/superpowers/specs/2026-09-25-student-id-design.md`

## Global Constraints
- 合法學號:去空白後符合 `^\d{5}[01]\d{2}$`;第 6 碼只接受 0(忠)、1(孝)。
- 科別表只有 `05 = 土木科`;查不到 → `「XX 科」`。
- 顯示文字格式:`112 級 土木科 忠班 71 號`(座號去前導 0)。
- 不改 `classNo` / `studentClassNo` 欄位名;不動通行碼/雜湊/鎖定。
- 改了 `swCacheList.js` 列的檔案 → `public/sw.js` 的 `CACHE_NAME` +1;兩處 `CACHE_FILES` 逐字一致。
- 不可用 `innerHTML` 顯示不可信文字;不新增 npm 套件;不 commit/push 除非使用者要求。
- 測試指令:`npx.cmd vitest run`(PowerShell)。

## Review Focus
1. 學生輸入學號前後帶空白(從紙條複製)→ 應視為合法,拆解正常。→ Task 1 測試涵蓋。
2. 老師從 Excel 貼上,學號被 Excel 吞掉前導字元或變成 7 碼 → 應列為錯誤行,不送後端。→ Task 2 測試涵蓋。
3. 繞過前端直接打 `roster-import` 帶亂碼學號 → 後端 `skipped`,不建立學生。→ Task 3 測試涵蓋。
4. 平板 localStorage 預填了舊格式班級座號(如 `301-12`)→ 量測頁載入即顯示「學號格式不對」,送出被擋。→ Task 4 瀏覽器檢查。
5. 離線佇列中舊格式的量測 → 仍照舊補送(後端驗證不查格式),不會被前端格式檢查卡住。→ Task 4 不改 `syncPendingQueue`,既有 submit 測試守住。

---

### Task 1: `src/studentId.js`

**Files:**
- Create: `src/studentId.js`
- Test: `tests/studentId.test.js`

**Interfaces:**
- Produces: `parseStudentId(raw: any) → null | { id, year, dept, deptName, classDigit, className, seat, label }`(全為字串);`DEPT_NAMES: Record<string,string>`

- [ ] **Step 1: 寫失敗測試** `tests/studentId.test.js`

```js
import { describe, it, expect } from 'vitest';
import { parseStudentId } from '../src/studentId.js';

describe('parseStudentId(8 碼學號拆解)', () => {
  it('11205071 → 112 級 土木科 忠班 71 號', () => {
    expect(parseStudentId('11205071')).toEqual({
      id: '11205071', year: '112', dept: '05', deptName: '土木科',
      classDigit: '0', className: '忠班', seat: '71', label: '112 級 土木科 忠班 71 號',
    });
  });

  it('第 6 碼 1 → 孝班;座號去前導 0', () => {
    expect(parseStudentId('11305107').label).toBe('113 級 土木科 孝班 7 號');
  });

  it('科別表查不到 → 顯示代碼', () => {
    expect(parseStudentId('11206071').deptName).toBe('06 科');
  });

  it('前後與中間空白可容忍(數字型別也可)', () => {
    expect(parseStudentId(' 1120 5071 ').id).toBe('11205071');
    expect(parseStudentId(11205071).id).toBe('11205071');
  });

  it('格式不對 → null', () => {
    for (const bad of ['', null, undefined, '1120507', '112050711', '11205271', '1120507A', '301-12']) {
      expect(parseStudentId(bad)).toBeNull();
    }
  });
});
```

- [ ] **Step 2: 跑測試確認失敗** — `npx.cmd vitest run tests/studentId.test.js`,預期 FAIL(找不到模組)。

- [ ] **Step 3: 實作** `src/studentId.js`

```js
// 學號 8 碼:入學年 3 + 科別 2 + 班級 1(0 忠、1 孝)+ 座號 2,例 11205071。
// 後端 apps-script/Code.gs 的 STUDENT_ID_PATTERN 必須與這裡的格式一致。
export const DEPT_NAMES = { '05': '土木科' }; // ponytail: 其他科別代碼等老師提供再補
const CLASS_NAMES = { 0: '忠班', 1: '孝班' };

export function parseStudentId(raw) {
  const id = String(raw ?? '').replace(/\s+/g, '');
  const m = id.match(/^(\d{3})(\d{2})([01])(\d{2})$/);
  if (!m) return null;
  const [, year, dept, classDigit, seat] = m;
  const deptName = DEPT_NAMES[dept] || `${dept} 科`;
  const className = CLASS_NAMES[classDigit];
  return { id, year, dept, deptName, classDigit, className, seat, label: `${year} 級 ${deptName} ${className} ${Number(seat)} 號` };
}
```

- [ ] **Step 4: 跑測試確認通過** — 同上指令,預期 PASS。

---

### Task 2: 名單解析檢查學號格式

**Files:**
- Modify: `src/roster.js`
- Test: `tests/roster.test.js`(測試資料 `301-xx` → 8 碼學號;新增格式錯誤案例)

**Interfaces:**
- Consumes: `parseStudentId`(Task 1)
- Produces: `parseRosterText(text) → { students: [{classNo, name}], errors: [{line, text, reason}] }`(形狀不變;`classNo` 為正規化後的 8 碼)

- [ ] **Step 1: 改測試** — `tests/roster.test.js` 全部 `301-12`→`11205012`、`301-13`→`11205013`、`301-14`→`11205014`;標題列案例改 `'學號\t姓名\n\n11205012\t王小明\n   \n'`,描述改「學號/班級座號/座號」;缺姓名案例 reason 改 `'找不到姓名(格式:學號 姓名)'`。新增:

```js
  it('學號格式不對的行列為錯誤(不送後端),其餘照常', () => {
    const { students, errors } = parseRosterText('11205012\t王小明\n1120501\t少一碼\n11205212\t班級碼錯\n301-12\t舊格式');
    expect(students).toEqual([{ classNo: '11205012', name: '王小明' }]);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(errors.every((e) => e.reason === '學號格式不對(8 碼數字,第 6 碼 0 或 1)')).toBe(true);
  });
```

- [ ] **Step 2: 跑測試確認失敗** — `npx.cmd vitest run tests/roster.test.js`,預期新案例 FAIL(舊格式被接受、reason 不符)。

- [ ] **Step 3: 實作** — `src/roster.js`:

```js
// 解析老師貼上的名單文字:每行「學號 姓名」,可用 Tab(從試算表複製)、逗號或空白分隔。
import { parseStudentId } from './studentId.js';

const HEADER_WORDS = ['學號', '班級座號', '座號'];
const BAD_ID = '學號格式不對(8 碼數字,第 6 碼 0 或 1)';
```
迴圈內:缺姓名 reason 改 `'找不到姓名(格式:學號 姓名)'`;標題列判斷後加:
```js
    const parsed = parseStudentId(match[1]);
    if (!parsed) {
      errors.push({ line: index + 1, text: line, reason: BAD_ID });
      return;
    }
    students.push({ classNo: parsed.id, name: match[2].trim() });
```

- [ ] **Step 4: 跑測試確認通過** — 同上。

---

### Task 3: 後端 `roster-import` 擋學號格式

**Files:**
- Modify: `apps-script/Code.gs`(`STUDENT_HEADER`、`rosterImport`、相關註解/訊息)
- Test: `tests/codeGs.test.js`

**Interfaces:**
- Produces: `rosterImport` 的 `skipped[].reason` 對格式錯誤為 `'學號格式不對(8 碼數字,第 6 碼 0 或 1)'`

- [ ] **Step 1: 遷移測試資料並加新測試** — `tests/codeGs.test.js`(用 replace-all):`'301-12'`→`'11205012'`、`'301-13'`→`'11205013'`、`'301-14'`→`'11205014'`、`'999-99'`→`'11205099'`;第 771 行改
  ```js
  const list = Array.from({ length: 150 }, (_, i) => [`11205${i < 100 ? 0 : 1}${String(i % 100).padStart(2, '0')}`, `學生${i}`]);
  ```
  第 774、777 行 `'3149-01'` → `'11205149'`。在「學生名單管理」describe 內「壞資料逐行略過」之後新增:
```js
  it('學號格式不對 → 略過並說明,不建立學生(前端可被繞過,後端再擋一次)', () => {
    const env = withTeacher();
    const res = teacherCall(env, 'roster-import', {
      students: [{ classNo: '11205012', name: '王小明' }, { classNo: '301-12', name: '舊格式' }, { classNo: '11205212', name: '班級碼錯' }],
    });
    expect(res.created.map((c) => c.classNo)).toEqual(['11205012']);
    expect(res.skipped).toEqual([
      { line: 2, classNo: '301-12', reason: '學號格式不對(8 碼數字,第 6 碼 0 或 1)' },
      { line: 3, classNo: '11205212', reason: '學號格式不對(8 碼數字,第 6 碼 0 或 1)' },
    ]);
  });
```

- [ ] **Step 2: 跑測試確認失敗** — `npx.cmd vitest run tests/codeGs.test.js`,預期只有新測試 FAIL(遷移後的既有測試應仍 PASS;若不是,先查原因)。

- [ ] **Step 3: 實作** — `Code.gs`:
  - `STUDENT_HEADER` 第 1 欄 `'班級座號'` → `'學號'`。
  - 常數區加 `var STUDENT_ID_PATTERN = /^\d{5}[01]\d{2}$/; // 與 src/studentId.js 一致`。
  - `rosterImport` 的判斷鏈:
    ```js
      if (classNo === '' || name === '') {
        reason = '學號與姓名都要填';
      } else if (!STUDENT_ID_PATTERN.test(classNo)) {
        reason = '學號格式不對(8 碼數字,第 6 碼 0 或 1)';
      } else if (name.length > MAX_FIELD_LENGTH) {
        reason = '姓名太長(上限 ' + MAX_FIELD_LENGTH + ' 字)';
      } else if (seen[classNo]) {
        reason = '名單中學號重複';
      }
    ```
  - 檔頭註解與 `verifyStudent` 的錯誤訊息「班級座號」→「學號」(`rejected.error`、STUDENT_REJECTED/LOCKED 註解、393 行 `'缺少班級座號'` → `'缺少學號'`)。

- [ ] **Step 4: 跑全部測試** — `npx.cmd vitest run`,預期全綠。若有測試斷言舊訊息字串,依新文字更新(是文字改名,不是弱化)。

---

### Task 4: 量測頁 `tree.html` 學號欄位+即時拆解

**Files:**
- Modify: `public/tree.html`、`src/swCacheList.js`、`public/sw.js`

**Interfaces:**
- Consumes: `parseStudentId`(Task 1)

- [ ] **Step 1: 改欄位** — 第 29–31 行換成:
```html
    <label>學號 <span class="hint">(8 碼,例:11205071)</span>
      <input type="text" id="studentClassNo" inputmode="numeric" required />
      <span class="hint" id="student-id-hint" aria-live="polite"></span>
    </label>
```
- [ ] **Step 2: 腳本** — import 加 `import { parseStudentId } from '../src/studentId.js';`,`normalizeClassNo` 若不再使用就從 import 移除。加:
```js
    const studentIdHint = document.getElementById('student-id-hint');
    function refreshStudentIdHint() {
      const raw = classNoInput.value.trim();
      const parsed = parseStudentId(raw);
      studentIdHint.textContent = raw === '' ? '' : parsed ? parsed.label : '學號格式不對(8 碼數字,例:11205071)';
    }
    classNoInput.addEventListener('input', refreshStudentIdHint);
```
  localStorage 預填之後呼叫一次 `refreshStudentIdHint();`。送出檢查改:
  `if (!parseStudentId(formValues.studentClassNo)) textErrors.push('請填寫正確的學號(8 碼數字,例:11205071)');`
  `explainRejection` 內「班級座號」→「學號」。
- [ ] **Step 3: 快取清單** — `src/swCacheList.js` 與 `public/sw.js` 的 `CACHE_FILES` 都加 `'./src/studentId.js'`(同位置、逐字一致);`CACHE_NAME` +1(`tree-map-v18` → `tree-map-v19`,以檔內現值為準)。
- [ ] **Step 4: 跑全部測試** — `npx.cmd vitest run`,預期全綠(duplication-sync 會檢查 import 在清單內)。

---

### Task 5: 名單頁 `roster.html` 與說明文字

**Files:**
- Modify: `public/roster.html`、`public/app.html`、`public/index.html`

**Interfaces:**
- Consumes: `parseStudentId`(Task 1)

- [ ] **Step 1: 名單頁** —
  - 說明:`每行一位:「學號 姓名」(學號 8 碼,例 11205071),可直接從試算表複製貼上(Tab)或用逗號、空白分隔。已在名單裡的學號只會更新姓名,不會重發通行碼。`
  - placeholder:`11205001&#9;王小明&#10;11205002&#9;李小華`
  - 表頭:`<th>班級座號</th>` → `<th>學號</th><th>科別班級座號</th>`;空名單 `td.colSpan = 6`。
  - `import { parseStudentId } from '../src/studentId.js';`
  - `loadRoster` 學號格之後加 `tr.insertCell().textContent = parseStudentId(student.classNo)?.label || '(學號格式不對)';`
  - 紙條:`['cls', \`學號 ${slip.classNo}　${parseStudentId(slip.classNo)?.label || ''}\`]`、how 改「掃樹上的 QRCode → 輸入學號與這組通行碼。請勿轉給別人。」
  - 若有 ≤600px 卡片式 CSS 依欄位順序(`nth-child`)標示,同步調整。
- [ ] **Step 2: 說明文字** — `app.html:42`、`index.html:26` 的「班級座號」→「學號」。
- [ ] **Step 3: 快取** — 若 `roster.html`/`app.html`/`index.html` 在 `CACHE_FILES` 內,Task 4 已升版即可(同一次上線只升一次)。
- [ ] **Step 4: 跑全部測試** — `npx.cmd vitest run`,預期全綠。

---

### Task 6: 瀏覽器實測

- [ ] `preview_start static-preview`,先 unregister SW + 清 caches。
- [ ] `tree.html?treeId=43667`:輸入 `11205071` → 顯示「112 級 土木科 忠班 71 號」;輸入 `301-12` → 「學號格式不對…」;送出被擋並顯示錯誤。
- [ ] `roster.html` 無法用假後端登入時,至少用 `javascript_tool` 確認頁面模組載入無 console error。
- [ ] 手機寬度(375px)看量測頁提示不溢出。
- [ ] 派 `verifier` 依 spec 驗收;回報使用者要把 `Code.gs` 貼到 Apps Script 重新部署。
