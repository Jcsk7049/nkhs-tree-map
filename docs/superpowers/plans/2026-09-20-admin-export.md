# 匯出與教師管理(階段 3)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 老師可一鍵匯出「每棵樹最新量測」CSV,並在介面上解除單一學生鎖定、管理教師信箱。

**Architecture:** 後端 `Code.gs` 新增 4 個老師動作並讓 `roster-list` 回傳 `locked`;前端新增純函式 `src/exportCsv.js`、教師端第 4 分頁 `admin.html`(匯出 + 教師帳號),`roster.html` 顯示鎖定與解除按鈕。設計見 `docs/superpowers/specs/2026-09-20-admin-export-design.md`。

**Tech Stack:** Google Apps Script(V8,無法本機執行,以 `tests/codeGs.test.js` 的 vm + 假服務測)、原生 ES module、vitest。無新增相依。

## Global Constraints

- 既有動作與學生流程行為**不變**(`teacher-check`、`roster-import/reset/status`、學生送出、公開 `summary`/`history`)。
- 後端修改後**使用者要重新貼上 `Code.gs` 並新版本部署**才生效;前端在後端未更新時要顯示明確提示(收到 `VALIDATION_FAILED`/「不認得的動作」時),不得白畫面。
- 教師動作一律經 `handleTeacherAction` 的 `verifyTeacher` 驗證;不得新增任何不驗身分的寫入路徑。
- 信箱一律 `trim().toLowerCase()` 比對與儲存;寫入 Sheet 用 `sanitizeCellText`。
- 匯出資料只含公開摘要欄位(**不得含學生姓名/座號**)。
- 頁面不得寫死 `API_URL` / `GOOGLE_CLIENT_ID`,須由 `../src/config.js` 匯入(`tests/duplication-sync.test.js` 檢查頁面清單,Task 4 要把 `admin.html` 加入)。
- 快取:改動被快取檔案(`app.html`、`src/appShell.js`)時 `CACHE_NAME` 升 `tree-map-v15`(`public/sw.js`、`DEPLOY.md`、`docs/WORKLOG.md` 同步);`src/swCacheList.js` 與 `public/sw.js` 的 `CACHE_FILES` 逐字一致;`admin.html` 不進離線快取。
- 介面文字繁體中文;主題色 `#2e7d32`;測試 `npx vitest run`,每個 task 結束前全綠。
- commit 訊息結尾**必須**是:`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`(不得換成執行者自己的模型名)。

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `apps-script/Code.gs` | Modify | `roster-list` 加 `locked`;新增 `roster-unlock`、`teacher-list`、`teacher-add`、`teacher-remove` |
| `apps-script/README.md` | Modify | 動作/回應代碼表與重新部署提醒 |
| `tests/codeGs.test.js` | Modify | 假 Cache 加 `getAll`、假 Sheet 加 `deleteRow`,新增後端測試 |
| `src/exportCsv.js` | Create | 純函式:CSV 跳脫、台灣時間、組 CSV |
| `tests/exportCsv.test.js` | Create | 對應單元測試 |
| `public/roster.html` | Modify | 🔒 標示與「解除鎖定」按鈕 |
| `tests/rosterHtml.test.js` | Create | 原始碼層級檢查 |
| `public/admin.html` | Create | 管理頁:匯出 + 教師帳號 |
| `tests/adminHtml.test.js` | Create | 原始碼層級檢查 |
| `src/appShell.js` `tests/appShell.test.js` | Modify | 老師第 4 分頁「管理」 |
| `tests/duplication-sync.test.js` | Modify | `admin.html` 加入 config 匯入檢查清單 |
| `public/sw.js` `DEPLOY.md` `docs/WORKLOG.md` | Modify | 快取 v15 與文件 |

---

### Task 1: 後端 `Code.gs`(解除鎖定、locked 欄位、教師增刪)

**Files:**
- Modify: `apps-script/Code.gs`(`rosterList`、`handleTeacherAction`,新增函式放在 `rosterSetStatus` 之後、`handleTeacherAction` 之前)、`apps-script/README.md`
- Test: `tests/codeGs.test.js`

**Interfaces:**
- Produces(老師動作,請求皆為 `{action, idToken, ...}`):
  - `roster-list` → `{status:'ok', students:[{classNo,name,status,updatedAt,locked:boolean}]}`
  - `roster-unlock {classNo}` → `{status:'ok', classNo}`;找不到學生 → `VALIDATION_FAILED`
  - `teacher-list` → `{status:'ok', emails:string[]}`
  - `teacher-add {email}` → `{status:'ok', email, duplicate:boolean}`;格式錯 → `VALIDATION_FAILED` `信箱格式不正確`;達上限 → `VALIDATION_FAILED` `教師人數已達上限`
  - `teacher-remove {email}` → `{status:'ok', email}`;移除自己 → `VALIDATION_FAILED` `不能移除自己的帳號`;找不到 → `VALIDATION_FAILED` `名單裡找不到這個信箱`;只剩一位 → `VALIDATION_FAILED` `至少要保留一位老師`

- [ ] **Step 1: 擴充測試用假服務**

在 `tests/codeGs.test.js`:
- `FakeSheet` 加 `deleteRow(n) { this.rows.splice(n - 1, 1); }`
- 假 `CacheService.getScriptCache()` 回傳物件加:
```js
        getAll: (keys) => Object.fromEntries(keys.filter((k) => cacheStore.has(k)).map((k) => [k, cacheStore.get(k)])),
```
- 假 `getRange(...)` 回傳物件目前有 `setNumberFormat/setValue/setValues/getValues`;`setValue` 已存在,不需再改。

- [ ] **Step 2: Write the failing tests**

在檔尾新增(`withTeacher`、`teacherCall`、`enroll`、`submit`、`measurement`、`BOSS` 都是檔內既有輔助):

```js
describe('老師動作:解除鎖定與 locked 欄位', () => {
  const lockedSetup = () => {
    const env = withTeacher();
    const codes = enroll(env, [['301-12', '王小明'], ['301-13', '李小華']]);
    const bad = env.sandbox.formatCode(env.sandbox.generateCode());
    for (let i = 0; i < env.sandbox.MAX_FAILS; i += 1) submit(env, measurement({ studentClassNo: '301-12', studentCode: bad, clientRecordId: `x${i}` }));
    return { env, codes };
  };

  it('roster-list 標出被鎖定的學生,未鎖定為 false', () => {
    const { env } = lockedSetup();
    const list = teacherCall(env, 'roster-list').students;
    expect(list.find((s) => s.classNo === '301-12').locked).toBe(true);
    expect(list.find((s) => s.classNo === '301-13').locked).toBe(false);
  });

  it('roster-unlock 解除鎖定:學生可再用原通行碼送出,且不換通行碼', () => {
    const { env, codes } = lockedSetup();
    expect(submit(env, measurement({ studentClassNo: '301-12', studentCode: codes['301-12'] })).code).toBe('STUDENT_LOCKED');
    const res = teacherCall(env, 'roster-unlock', { classNo: '301-12' });
    expect(res).toEqual({ status: 'ok', classNo: '301-12' });
    expect(submit(env, measurement({ studentClassNo: '301-12', studentCode: codes['301-12'], clientRecordId: 'after' })).status).toBe('ok');
    expect(teacherCall(env, 'roster-list').students.find((s) => s.classNo === '301-12').locked).toBe(false);
  });

  it('roster-unlock 找不到學生 → VALIDATION_FAILED;非老師被拒', () => {
    const env = withTeacher();
    expect(teacherCall(env, 'roster-unlock', { classNo: '999-99' }).code).toBe('VALIDATION_FAILED');
    expect(teacherCall(env, 'roster-unlock', { classNo: '301-12' }, 'stranger@x.tw').code).toBe('TEACHER_REJECTED');
  });

  it('超過 100 位學生時 locked 仍正確(getAll 分批)', () => {
    const env = withTeacher();
    const list = Array.from({ length: 150 }, (_, i) => [`3${String(i).padStart(2, '0')}-01`, `學生${i}`]);
    enroll(env, list);
    const bad = env.sandbox.formatCode(env.sandbox.generateCode());
    for (let i = 0; i < env.sandbox.MAX_FAILS; i += 1) submit(env, measurement({ studentClassNo: '3149-01', studentCode: bad, clientRecordId: `y${i}` }));
    const students = teacherCall(env, 'roster-list').students;
    expect(students).toHaveLength(150);
    expect(students.filter((s) => s.locked).map((s) => s.classNo)).toEqual(['3149-01']);
  });
});

describe('老師動作:教師信箱管理', () => {
  it('teacher-list 回小寫信箱、略過空列', () => {
    const env = loadScript({ teachers: [['Boss@School.tw'], [''], ['b@x.tw']] });
    expect(teacherCall(env, 'teacher-list', {}, 'boss@school.tw').emails).toEqual(['boss@school.tw', 'b@x.tw']);
  });

  it('teacher-add:新增後該信箱可登入;轉小寫;重複回 duplicate 不多寫一列', () => {
    const env = withTeacher();
    const res = teacherCall(env, 'teacher-add', { email: '  New@School.TW ' });
    expect(res).toEqual({ status: 'ok', email: 'new@school.tw', duplicate: false });
    expect(teacherCall(env, 'teacher-check', {}, 'new@school.tw').status).toBe('ok');
    const again = teacherCall(env, 'teacher-add', { email: 'NEW@school.tw' });
    expect(again.duplicate).toBe(true);
    expect(env.sheets['教師名單'].rows).toHaveLength(3);
  });

  it('teacher-add:格式錯誤被拒(缺 @、空白、超長)', () => {
    const env = withTeacher();
    for (const bad of ['', 'abc', 'a@b', 'a b@c.tw', `${'x'.repeat(250)}@c.tw`, null]) {
      expect(teacherCall(env, 'teacher-add', { email: bad }).code, String(bad)).toBe('VALIDATION_FAILED');
    }
    expect(env.sheets['教師名單'].rows).toHaveLength(2);
  });

  it('teacher-add:達 100 位上限後拒絕', () => {
    const env = loadScript({ teachers: [[BOSS], ...Array.from({ length: 99 }, (_, i) => [`t${i}@school.tw`])] });
    expect(teacherCall(env, 'teacher-add', { email: 'one-more@school.tw' }).code).toBe('VALIDATION_FAILED');
  });

  it('teacher-add:以公式開頭的信箱格式不合法而被拒,不會寫進 Sheet', () => {
    const env = withTeacher();
    expect(teacherCall(env, 'teacher-add', { email: '=cmd@x.tw' }).status).toBe('ok'); // 合法信箱字元,寫入時被 sanitize
    expect(env.sheets['教師名單'].rows[2][0]).toBe("'=cmd@x.tw");
  });

  it('teacher-remove:可移除其他老師,被移除者立刻不能登入', () => {
    const env = loadScript({ teachers: [[BOSS], ['other@school.tw']] });
    expect(teacherCall(env, 'teacher-remove', { email: 'OTHER@school.tw' })).toEqual({ status: 'ok', email: 'other@school.tw' });
    expect(teacherCall(env, 'teacher-check', {}, 'other@school.tw').code).toBe('TEACHER_REJECTED');
  });

  it('teacher-remove:不能移除自己(大小寫不同也算)', () => {
    const env = loadScript({ teachers: [[BOSS], ['other@school.tw']] });
    const res = teacherCall(env, 'teacher-remove', { email: 'BOSS@school.tw' });
    expect(res.code).toBe('VALIDATION_FAILED');
    expect(res.error).toBe('不能移除自己的帳號');
    expect(env.sheets['教師名單'].rows).toHaveLength(3);
  });

  it('teacher-remove:找不到 → 錯誤;至少保留一位', () => {
    const env = withTeacher();
    expect(teacherCall(env, 'teacher-remove', { email: 'ghost@school.tw' }).error).toBe('名單裡找不到這個信箱');
    // 名單只剩呼叫者一位時,即使目標是別人(不存在)也不會清空名單
    expect(env.sheets['教師名單'].rows).toHaveLength(2);
  });

  it('非老師不能增刪教師', () => {
    const env = withTeacher();
    expect(teacherCall(env, 'teacher-add', { email: 'a@b.tw' }, 'stranger@x.tw').code).toBe('TEACHER_REJECTED');
    expect(teacherCall(env, 'teacher-remove', { email: BOSS }, 'stranger@x.tw').code).toBe('TEACHER_REJECTED');
    expect(teacherCall(env, 'teacher-list', {}, 'stranger@x.tw').code).toBe('TEACHER_REJECTED');
  });
});
```

註:`teacher-add` 的公式測試名稱說「被拒」但實際斷言是「通過並被 sanitize」——實作者請把該測試的 `it(...)` 標題改成 `'teacher-add:以 = 開頭的信箱寫入時被 sanitize 成純文字'` 再貼上,斷言不變。

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/codeGs.test.js`
Expected: 新增的 describe 內測試 FAIL(`不認得的動作`、`locked` 為 undefined 等)

- [ ] **Step 4: Implement in `apps-script/Code.gs`**

(a) 在 `rosterList` 上方新增:
```js
// 連錯計數存在 CacheService;getAll 一次最多 100 個鍵,所以分批查。快取查不到/出錯一律當作未鎖定。
var CACHE_GET_ALL_LIMIT = 100;

function lockedClassNos(classNos) {
  var locked = Object.create(null);
  try {
    var cache = CacheService.getScriptCache();
    for (var i = 0; i < classNos.length; i += CACHE_GET_ALL_LIMIT) {
      var keys = classNos.slice(i, i + CACHE_GET_ALL_LIMIT).map(function (c) {
        return FAIL_KEY_PREFIX + normalizeClassNo(c);
      });
      var got = cache.getAll(keys);
      for (var j = 0; j < keys.length; j++) {
        if (Number(got[keys[j]] || 0) >= MAX_FAILS) {
          locked[keys[j]] = true;
        }
      }
    }
  } catch (err) {
    console.warn('讀取鎖定狀態失敗,一律視為未鎖定: ' + err);
  }
  return locked;
}
```
(b) 改 `rosterList`:先收集 `students`,再 `var locked = lockedClassNos(students.map(function (s) { return s.classNo; }));`,回傳前對每位 `s.locked = Boolean(locked[FAIL_KEY_PREFIX + normalizeClassNo(s.classNo)]);`。

(c) 在 `rosterSetStatus` 之後新增:
```js
function rosterUnlock(classNoRaw) {
  var classNo = normalizeClassNo(classNoRaw);
  if (!findStudent(studentSheet(), classNo)) {
    return errorOutput('VALIDATION_FAILED', '名簿裡找不到這位學生');
  }
  CacheService.getScriptCache().remove(FAIL_KEY_PREFIX + classNo); // 只清連錯計數,不動通行碼
  return jsonOutput({ status: 'ok', classNo: classNo });
}

// ---------------------------------------------------------------------------
// 教師信箱管理(所有老師權限相同)
// ---------------------------------------------------------------------------

var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var MAX_EMAIL_LENGTH = 254;
var MAX_TEACHERS = 100;

function normalizeEmail(value) {
  return String(value === null || value === undefined ? '' : value).trim().toLowerCase();
}

function teacherSheet() {
  return getOrCreateSheet(SHEET_NAME_TEACHERS, TEACHER_HEADER);
}

/** 回傳 [{email, row}](row 為 1-based 列號),略過空列。 */
function teacherEntries(sheet) {
  var rows = sheet.getDataRange().getValues();
  var entries = [];
  for (var i = 1; i < rows.length; i++) {
    var email = normalizeEmail(rows[i][0]);
    if (email !== '') {
      entries.push({ email: email, row: i + 1 });
    }
  }
  return entries;
}

function teacherList() {
  return jsonOutput({
    status: 'ok',
    emails: teacherEntries(teacherSheet()).map(function (e) { return e.email; }),
  });
}

function teacherAdd(emailRaw) {
  var email = normalizeEmail(emailRaw);
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return errorOutput('VALIDATION_FAILED', '信箱格式不正確');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = teacherSheet();
    var entries = teacherEntries(sheet);
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].email === email) {
        return jsonOutput({ status: 'ok', email: email, duplicate: true });
      }
    }
    if (entries.length >= MAX_TEACHERS) {
      return errorOutput('VALIDATION_FAILED', '教師人數已達上限');
    }
    var newRow = sheet.getLastRow() + 1;
    sheet.getRange(newRow, 1, 1, 1).setNumberFormat('@');
    sheet.getRange(newRow, 1, 1, 1).setValues([[sanitizeCellText(email)]]);
    return jsonOutput({ status: 'ok', email: email, duplicate: false });
  } finally {
    lock.releaseLock();
  }
}

function teacherRemove(emailRaw, callerEmail) {
  var email = normalizeEmail(emailRaw);
  if (email === normalizeEmail(callerEmail)) {
    return errorOutput('VALIDATION_FAILED', '不能移除自己的帳號');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = teacherSheet();
    var entries = teacherEntries(sheet);
    var target = null;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].email === email) {
        target = entries[i];
        break;
      }
    }
    if (!target) {
      return errorOutput('VALIDATION_FAILED', '名單裡找不到這個信箱');
    }
    if (entries.length <= 1) {
      return errorOutput('VALIDATION_FAILED', '至少要保留一位老師');
    }
    sheet.deleteRow(target.row);
    return jsonOutput({ status: 'ok', email: email });
  } finally {
    lock.releaseLock();
  }
}
```
(d) `handleTeacherAction` 的 switch 在 `roster-status` 之後加:
```js
    case 'roster-unlock':
      return rosterUnlock(data.classNo);
    case 'teacher-list':
      return teacherList();
    case 'teacher-add':
      return teacherAdd(data.email);
    case 'teacher-remove':
      return teacherRemove(data.email, teacher.email);
```
並更新檔頭註解的動作說明(若有列出老師動作)。

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Expected: PASS(全部,含新測試與既有測試)

- [ ] **Step 6: 更新 `apps-script/README.md`**

在「兩種身分」表的「老師 能做什麼」補「解除單一學生鎖定、管理教師信箱」;在「回應代碼」前或附近新增「老師動作」小表(條列):`roster-list`(含 `locked`)、`roster-unlock`、`teacher-list/add/remove` 與各自的防呆(不能移除自己、至少保留一位、上限 100);「驗證清單」加兩項:被鎖定學生能在名單頁解除、教師信箱可新增與移除且被移除者立即無法登入;並在檔頭附近加一句醒目提醒:**更新 `Code.gs` 後必須重新貼上並以「新版本」重新部署**。

- [ ] **Step 7: Commit**

```bash
git add apps-script/Code.gs apps-script/README.md tests/codeGs.test.js
git commit -m "feat(後端): 解除單一學生鎖定、名單回傳 locked、教師信箱新增/移除" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: 匯出純函式 `src/exportCsv.js`

**Files:**
- Create: `src/exportCsv.js`
- Test: `tests/exportCsv.test.js`

**Interfaces:**
- Produces:
  - `csvEscape(value: string|number|null|undefined): string` — 數字直接 `String`;`null/undefined` → 空字串;字串以 `= + - @`(可含前置空白)開頭時前綴 `'`;含 `,` `"` `\r` `\n` 時以雙引號包起並把 `"` 變 `""`
  - `formatTaiwanTime(iso: string): string` — `YYYY-MM-DD HH:mm`(UTC+8);無法解析回 `''`
  - `buildTreeCsv(trees: Array<{no,sp}>, byNo: Map<string,{height,girth,at,n}>, opts?: {onlyMeasured?: boolean = true}): string` — 開頭 `﻿`;標題列 `官方樹號,樹種,最新樹高(m),樹圍(cm),量測時間(台灣),量測筆數`;列依樹號數字排序;行結尾 `\r\n`(含最後一行);未量測的列後四欄空白(`onlyMeasured:false` 才輸出)
  - `csvFilename(nowMs: number): string` — `nkhs-trees-YYYYMMDD.csv`(台灣日期)

- [ ] **Step 1: Write the failing test**

```js
// tests/exportCsv.test.js
import { describe, it, expect } from 'vitest';
import { csvEscape, formatTaiwanTime, buildTreeCsv, csvFilename } from '../src/exportCsv.js';

describe('csvEscape', () => {
  it('一般字串與數字原樣,null/undefined 為空字串', () => {
    expect(csvEscape('榕樹')).toBe('榕樹');
    expect(csvEscape(2.34)).toBe('2.34');
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });
  it('含逗號、雙引號、換行時加引號並跳脫', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('a\nb')).toBe('"a\nb"');
  });
  it('公式注入防護:字串以 = + - @ 開頭時前綴單引號', () => {
    expect(csvEscape('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvEscape('@cmd')).toBe("'@cmd");
    expect(csvEscape('+1')).toBe("'+1");
    expect(csvEscape('-1x')).toBe("'-1x");
    expect(csvEscape(-3)).toBe('-3'); // 數字不受影響
  });
});

describe('formatTaiwanTime', () => {
  it('UTC 轉台灣時間(+8)', () => {
    expect(formatTaiwanTime('2026-09-19T16:30:00.000Z')).toBe('2026-09-20 00:30');
  });
  it('無法解析回空字串', () => {
    expect(formatTaiwanTime('not a date')).toBe('');
    expect(formatTaiwanTime('')).toBe('');
  });
});

describe('buildTreeCsv', () => {
  const trees = [
    { no: '10', sp: '榕樹' },
    { no: '2', sp: '樟樹' },
    { no: '3', sp: '楓香,特別' },
  ];
  const byNo = new Map([
    ['10', { no: '10', height: 12.5, girth: 80, at: '2026-09-19T16:30:00.000Z', n: 3 }],
    ['3', { no: '3', height: 2.34, girth: null, at: '2026-09-01T02:00:00.000Z', n: 1 }],
  ]);

  it('開頭有 BOM 與標題列,行以 CRLF 結尾', () => {
    const csv = buildTreeCsv(trees, byNo);
    expect(csv.startsWith('﻿官方樹號,樹種,最新樹高(m),樹圍(cm),量測時間(台灣),量測筆數\r\n')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
  });
  it('預設只輸出有量測的樹,依樹號數字排序(3 在 10 前)', () => {
    const lines = buildTreeCsv(trees, byNo).split('\r\n');
    expect(lines[1]).toBe('3,"楓香,特別",2.34,,2026-09-01 10:00,1');
    expect(lines[2]).toBe('10,榕樹,12.5,80,2026-09-20 00:30,3');
    expect(lines).toHaveLength(4); // 標題 + 2 列 + 結尾空字串
  });
  it('onlyMeasured:false 時輸出全部,未量測的後四欄空白', () => {
    const lines = buildTreeCsv(trees, byNo, { onlyMeasured: false }).split('\r\n');
    expect(lines[1]).toBe('2,樟樹,,,,');
    expect(lines).toHaveLength(5);
  });
  it('沒有任何量測時仍輸出標題列', () => {
    const csv = buildTreeCsv(trees, new Map());
    expect(csv).toBe('﻿官方樹號,樹種,最新樹高(m),樹圍(cm),量測時間(台灣),量測筆數\r\n');
  });
  it('不修改輸入', () => {
    const copy = JSON.parse(JSON.stringify(trees));
    buildTreeCsv(trees, byNo, { onlyMeasured: false });
    expect(trees).toEqual(copy);
  });
});

describe('csvFilename', () => {
  it('用台灣日期', () => {
    expect(csvFilename(Date.parse('2026-09-19T20:00:00Z'))).toBe('nkhs-trees-20260920.csv');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/exportCsv.test.js`
Expected: FAIL(找不到 `../src/exportCsv.js`)

- [ ] **Step 3: Write implementation**

```js
// src/exportCsv.js
// 匯出「每棵樹最新量測」CSV(給 Excel 開、回填官方平台)。純函式,不碰 DOM。只用公開摘要欄位,不含任何學生個資。
const TAIWAN_OFFSET_MS = 8 * 3600 * 1000;
const HEADER = ['官方樹號', '樹種', '最新樹高(m)', '樹圍(cm)', '量測時間(台灣)', '量測筆數'];

export function csvEscape(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  let text = String(value);
  // 試算表會把 = + - @ 開頭的字串當公式執行,補單引號變純文字。
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function formatTaiwanTime(iso) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  return new Date(ms + TAIWAN_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
}

export function buildTreeCsv(trees, byNo, { onlyMeasured = true } = {}) {
  const rows = [...trees]
    .filter((t) => !onlyMeasured || byNo.has(t.no))
    .sort((a, b) => Number(a.no) - Number(b.no))
    .map((t) => {
      const m = byNo.get(t.no);
      return m
        ? [t.no, t.sp, m.height, m.girth, formatTaiwanTime(m.at), m.n]
        : [t.no, t.sp, '', '', '', ''];
    });
  const lines = [HEADER, ...rows].map((cells) => cells.map(csvEscape).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function csvFilename(nowMs) {
  const day = new Date(nowMs + TAIWAN_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, '');
  return `nkhs-trees-${day}.csv`;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/exportCsv.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/exportCsv.js tests/exportCsv.test.js
git commit -m "feat: 新增匯出 CSV 純函式(跳脫、公式注入防護、台灣時間、BOM)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: 名單頁的鎖定標示與解除按鈕

**Files:**
- Modify: `public/roster.html`(`loadRoster` 內建立狀態欄與按鈕處,約第 180-205 行;按鈕點擊處理約第 244-256 行)
- Test: `tests/rosterHtml.test.js`

**Interfaces:**
- Consumes: 後端 `roster-list` 的 `student.locked`(Task 1)、`roster-unlock`
- Produces: 名單列對被鎖定學生顯示「🔒 已鎖定」與 `data-action="unlock"` 按鈕;點擊呼叫 `teacher.call('roster-unlock', { classNo })`,成功後 `say('… 已解除鎖定','ok')` 並 `loadRoster()`

- [ ] **Step 1: Write the failing test**

```js
// tests/rosterHtml.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/rosterHtml.test.js`
Expected: FAIL(第一個與第二個測試)

- [ ] **Step 3: Implement in `public/roster.html`**

(a) 在 `loadRoster` 內、`actions.append(resetBtn, toggleBtn);` 之前加入:
```js
        if (student.locked) {
          const lockNote = document.createElement('span');
          lockNote.className = 'st-off';
          lockNote.textContent = '🔒 已鎖定';
          statusCell.append(' ', lockNote);
          const unlockBtn = document.createElement('button');
          unlockBtn.type = 'button';
          unlockBtn.className = 'small';
          unlockBtn.textContent = '解除鎖定';
          unlockBtn.dataset.action = 'unlock';
          unlockBtn.dataset.classNo = student.classNo;
          actions.append(unlockBtn);
        }
```
(注意:`statusCell.textContent = student.status` 已在前面執行,所以用 `append` 而不是覆寫;請把上面這段放在 `statusCell` 與 `actions` 皆已定義之後、`actions.append(resetBtn, toggleBtn)` 之前或之後皆可,只要順序上兩者已存在。)

(b) 把 `bodyEl.addEventListener('click', ...)` 內的分支改為三向:
```js
        if (button.dataset.action === 'reset') {
          await resetCodes([button.dataset.classNo]);
        } else if (button.dataset.action === 'unlock') {
          await teacher.call('roster-unlock', { classNo: button.dataset.classNo });
          say(`${button.dataset.classNo} 已解除鎖定`, 'ok');
          await loadRoster();
        } else {
          await teacher.call('roster-status', { classNo: button.dataset.classNo, newStatus: button.dataset.next });
          say(`${button.dataset.classNo} 已${button.dataset.next}`, 'ok');
          await loadRoster();
        }
```
沿用既有 `guarded(...)` 的錯誤處理(後端未更新時的「不認得的動作」會顯示在訊息區)。

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/roster.html tests/rosterHtml.test.js
git commit -m "feat: 名單頁顯示鎖定並可一鍵解除單一學生鎖定" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: 管理頁 `admin.html`、殼層第 4 分頁、快取與文件

**Files:**
- Create: `public/admin.html`、`tests/adminHtml.test.js`
- Modify: `src/appShell.js`、`tests/appShell.test.js`、`tests/duplication-sync.test.js`、`public/sw.js`(僅 `CACHE_NAME`)、`DEPLOY.md`、`docs/WORKLOG.md`

**Interfaces:**
- Consumes: `buildTreeCsv`、`csvFilename`(Task 2);`matchSummary`(`src/heightColors.js`);`requireTeacher`(`src/teacherGate.js`);`teacher.call('teacher-list' | 'teacher-add' | 'teacher-remove')`(Task 1);`applyEmbedMode`(`src/embed.js`);`API_URL`、`GOOGLE_CLIENT_ID`(`src/config.js`)
- Produces: 老師分頁 `{id:'admin', label:'管理', page:'admin.html'}`(第 4 個)

- [ ] **Step 1: 更新測試(先紅)**

`tests/appShell.test.js`:
- 把 `expect(TEACHER_TABS.map((t) => t.id)).toEqual(['roster', 'map', 'labels']);` 改為 `['roster', 'map', 'labels', 'admin']`(測試標題改「老師四個分頁:名單/地圖/QR 標籤/管理」)。
- 在 `frameSrc / buildHash` describe 內加:`expect(frameSrc('teacher', 'admin')).toBe('./admin.html?embed=1');`

`tests/duplication-sync.test.js`:把 `const pages = ['tree.html', 'map.html', 'qrcodes.html', 'teacher.html', 'roster.html'];` 加入 `'admin.html'`(若該陣列目前也含 `trees.html` 等請保留原內容,只追加)。

新增 `tests/adminHtml.test.js`:
```js
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
  it('教師帳號:列表、新增、移除,且自己那列不提供移除', () => {
    for (const a of ['teacher-list', 'teacher-add', 'teacher-remove']) {
      expect(html).toContain(`'${a}'`);
    }
    expect(html).toMatch(/window\.confirm\(/);
    expect(html).toMatch(/me\.email|teacher\.email/);
  });
  it('後端尚未更新時有明確提示', () => {
    expect(html).toContain('重新部署');
  });
});
```

Run: `npx vitest run` → 預期上述新增/修改的測試 FAIL(記錄失敗輸出)。

- [ ] **Step 2: `src/appShell.js`**

`TEACHER_TABS` 追加第 4 項:`{ id: 'admin', label: '管理', page: 'admin.html' },`。

- [ ] **Step 3: 建立 `public/admin.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant-TW">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>管理</title>
  <style>
    body { font-family: sans-serif; margin: 0; padding: 16px; color: #1b1b1b; }
    [hidden] { display: none !important; }
    #gate { max-width: 420px; margin: 60px auto; padding: 24px; border: 1px solid #ccc; border-radius: 8px; text-align: center; }
    #gate-status { color: #555; min-height: 1.4em; }
    main { max-width: 720px; margin: 0 auto; }
    section { border: 1px solid #ccc; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    h1 { font-size: 22px; } h2 { font-size: 18px; margin-top: 0; }
    .hint { color: #555; font-size: 14px; line-height: 1.6; }
    button { font-size: 15px; padding: 8px 14px; cursor: pointer; }
    button.primary { background: #2e7d32; color: #fff; border: 0; border-radius: 4px; }
    button.small { font-size: 13px; padding: 4px 10px; }
    input[type=email] { font-size: 15px; padding: 8px; width: 60%; min-width: 200px; }
    table { border-collapse: collapse; width: 100%; margin-top: 8px; }
    td { padding: 8px 6px; border-top: 1px solid #eee; }
    .msg { min-height: 1.4em; font-size: 14px; margin-top: 8px; }
    .msg.ok { color: #2e7d32; } .msg.error { color: #c62828; }
    .me { color: #888; font-size: 13px; }
  </style>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
</head>
<body>
  <div id="gate">
    <h1>教師登入</h1>
    <p id="gate-status"></p>
    <div id="gate-button" style="display:flex; justify-content:center"></div>
    <p style="color:#888; font-size:13px">此頁僅供老師使用。</p>
  </div>

  <main id="gated" hidden>
    <h1>管理</h1>

    <section>
      <h2>匯出量測(給 Excel / 回填官方平台)</h2>
      <p class="hint">每棵樹一列的最新量測:樹號、樹種、樹高、樹圍、量測時間、筆數。不含學生姓名。資料為公開摘要,剛送出的量測最多晚 5 分鐘出現。</p>
      <label><input type="checkbox" id="only-measured" checked /> 只匯出已有量測的樹</label>
      <p><button type="button" class="primary" id="export">下載 CSV</button></p>
      <div class="msg" id="export-msg"></div>
    </section>

    <section>
      <h2>教師帳號</h2>
      <p class="hint">列在這裡的 Google 信箱才能登入教師端。所有老師權限相同;不能移除自己,也至少要保留一位老師。</p>
      <table><tbody id="teacher-body"></tbody></table>
      <p>
        <input type="email" id="new-email" placeholder="新老師的 Google 信箱" autocomplete="off" />
        <button type="button" class="primary" id="add-teacher">新增</button>
      </p>
      <div class="msg" id="teacher-msg"></div>
    </section>
  </main>

  <script type="module">
    import { API_URL, GOOGLE_CLIENT_ID } from '../src/config.js';
    import { requireTeacher } from '../src/teacherGate.js';
    import { applyEmbedMode } from '../src/embed.js';
    import { matchSummary } from '../src/heightColors.js';
    import { buildTreeCsv, csvFilename } from '../src/exportCsv.js';

    applyEmbedMode(document, window.location.search);
    const me = await requireTeacher({ apiUrl: API_URL, clientId: GOOGLE_CLIENT_ID });

    function say(el, text, kind) {
      el.textContent = text;
      el.className = `msg ${kind || ''}`;
    }

    // 後端還沒換成新版時,新動作會回「不認得的動作」:給老師看得懂的提示。
    function explain(err) {
      const text = String(err && err.message ? err.message : err);
      return text.includes('不認得的動作')
        ? '後端還是舊版,請先把最新的 Code.gs 貼進 Apps Script 並重新部署(新版本)。'
        : text;
    }

    // ---- 匯出 ----
    const exportMsg = document.getElementById('export-msg');
    document.getElementById('export').addEventListener('click', async () => {
      const button = document.getElementById('export');
      button.disabled = true;
      say(exportMsg, '準備中…');
      try {
        const [treesRes, summaryRes] = await Promise.all([
          fetch('../data/nkhs-trees.json'),
          fetch(`${API_URL}?action=summary`),
        ]);
        if (!treesRes.ok) throw new Error(`官方樹木資料載入失敗(HTTP ${treesRes.status})`);
        if (!summaryRes.ok) throw new Error(`量測資料載入失敗(HTTP ${summaryRes.status})`);
        const { trees } = await treesRes.json();
        const body = await summaryRes.json();
        if (body.status !== 'ok') throw new Error(body.error || '後端回應異常');
        const { byNo, measured } = matchSummary(trees, body.trees);
        const onlyMeasured = document.getElementById('only-measured').checked;
        const csv = buildTreeCsv(trees, byNo, { onlyMeasured });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = csvFilename(Date.now());
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        say(exportMsg, `已下載 ${link.download}(${onlyMeasured ? measured : trees.length} 列)。資料更新時間 ${String(body.generatedAt).slice(0, 19).replace('T', ' ')} UTC`, 'ok');
      } catch (err) {
        say(exportMsg, `匯出失敗:${err.message}`, 'error');
      } finally {
        button.disabled = false;
      }
    });

    // ---- 教師帳號 ----
    const bodyEl = document.getElementById('teacher-body');
    const teacherMsg = document.getElementById('teacher-msg');

    async function loadTeachers() {
      const { emails } = await me.call('teacher-list');
      bodyEl.textContent = '';
      for (const email of emails) {
        const tr = bodyEl.insertRow();
        const isMe = email === String(me.email).trim().toLowerCase();
        tr.insertCell().textContent = email;
        const cell = tr.insertCell();
        cell.style.textAlign = 'right';
        if (isMe) {
          const tag = document.createElement('span');
          tag.className = 'me';
          tag.textContent = '(你)';
          cell.append(tag);
        } else {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'small';
          btn.textContent = '移除';
          btn.dataset.email = email;
          cell.append(btn);
        }
      }
    }

    async function guarded(fn) {
      say(teacherMsg, '處理中…');
      try {
        await fn();
      } catch (err) {
        say(teacherMsg, explain(err), 'error');
      }
    }

    bodyEl.addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-email]');
      if (!btn) return;
      if (!window.confirm(`確定移除 ${btn.dataset.email}?對方將立刻無法登入教師端。`)) return;
      guarded(async () => {
        await me.call('teacher-remove', { email: btn.dataset.email });
        say(teacherMsg, `已移除 ${btn.dataset.email}`, 'ok');
        await loadTeachers();
      });
    });

    document.getElementById('add-teacher').addEventListener('click', () => {
      const input = document.getElementById('new-email');
      const email = input.value.trim();
      if (!email) {
        say(teacherMsg, '請輸入信箱', 'error');
        return;
      }
      guarded(async () => {
        const res = await me.call('teacher-add', { email });
        say(teacherMsg, res.duplicate ? `${res.email} 已經在名單裡` : `已新增 ${res.email}`, 'ok');
        input.value = '';
        await loadTeachers();
      });
    });

    guarded(async () => {
      await loadTeachers();
      say(teacherMsg, '');
    });
  </script>
</body>
</html>
```

- [ ] **Step 4: 快取版本與文件**

`public/sw.js` 的 `CACHE_NAME` 改 `tree-map-v15`;`DEPLOY.md`、`docs/WORKLOG.md` 內的 `tree-map-v14` 一併改(**不要**改 WORKLOG 中「2026-09-20 … 實測」那些以 v13/v14 記載的歷史紀錄——只改「目前版本」的敘述,若不確定哪些是歷史紀錄請保留原樣並回報)。`docs/WORKLOG.md`:「頁面」表加 `admin.html`(管理:匯出 CSV、教師帳號);「待辦」把「Excel 匯出」「解除單一學生鎖定按鈕」「教師名單管理介面」標為完成;「使用者需要做的」加**重新貼上 Code.gs 並新版本部署**、並在 Sheet 驗證新功能;「未驗證」列出:新後端動作在真實 Apps Script 上、CSV 用 Excel 開啟的中文顯示。`DEPLOY.md`:新增「匯出與教師管理」小節(條列:CSV 用 Excel 開、欄位、只匯出已量測選項、教師帳號規則、需重新部署後端)。使用條列/表格。

- [ ] **Step 5: Run full tests**

Run: `npx vitest run`
Expected: PASS(全部)

- [ ] **Step 6: Commit**

```bash
git add public/admin.html tests/adminHtml.test.js src/appShell.js tests/appShell.test.js tests/duplication-sync.test.js public/sw.js DEPLOY.md docs/WORKLOG.md
git commit -m "feat: 教師端新增「管理」分頁(匯出 CSV、教師帳號管理),快取升 v15" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** 匯出 CSV 欄位/選項/BOM/公式防護(Task 2、4);`roster-list.locked` 與 `roster-unlock`(Task 1、3);`teacher-list/add/remove` 及防呆(不能移除自己、至少保留一位、上限、格式、小寫、ScriptLock)(Task 1、4);第 4 分頁(Task 4);後端未部署提示(Task 4 `explain`、Task 3 沿用 `guarded`);快取 v15 與文件(Task 4)。
- **Placeholder scan:** 無 TBD;Task 1 Step 2 有一處明確要求改測試標題的說明,實作者須照做。Task 3(a) 已說明插入位置與順序需求。
- **Type consistency:** `teacher.call(action, payload)` 回傳含 `emails`/`duplicate`/`email`;`me.email` 來自 `requireTeacher`;`matchSummary(...).byNo` 是 `Map`,`buildTreeCsv` 以 `Map.get/has` 使用;`csvFilename(Date.now())`;後端回應欄位與前端讀取一致。
- **已知取捨:** 教師頁與 `admin.html` 無瀏覽器自動測試,靠原始碼層級檢查 + 使用者實測;後端動作在真實 Apps Script 上未驗證(本機以 vm + 假服務測)。
