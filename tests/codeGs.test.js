import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import vm from 'node:vm';

// 載入「真正的」apps-script/Code.gs,只把 Google 提供的服務換成假物件,
// 所以測的是實際會部署的程式,不是另寫的複製版。
const SOURCE = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');

const RECORD_HEADER = ['樹編號', '量測時間戳', '填寫人姓名', '填寫人班級座號', '仰角', '水平距離', '計算後樹高', '樹圍', '同步狀態', '用戶端紀錄編號'];
const STUDENT_HEADER = ['班級座號', '姓名', '通行碼雜湊', '狀態', '更新時間'];
const TEACHER_HEADER = ['教師 Google 信箱'];
const row = (no, at, name, cls, height, girth, id) => [no, at, name, cls, 45, 10, height, girth, '已同步', id];

class FakeSheet {
  constructor(rows) {
    this.rows = rows;
    this.reads = 0;
  }
  getDataRange() {
    return { getValues: () => { this.reads += 1; return this.rows.map((r) => r.slice()); } };
  }
  getMaxColumns() { return 26; }
  getLastRow() { return this.rows.length; }
  deleteRow(n) { this.rows.splice(n - 1, 1); }
  getRange(r, c, nr = 1, nc = 1) {
    const sheet = this;
    return {
      setNumberFormat() {},
      setValue(v) { (sheet.rows[r - 1] ||= [])[c - 1] = v; },
      setValues(vals) { vals.forEach((v, i) => { const target = (sheet.rows[r - 1 + i] ||= []); v.forEach((x, j) => { target[c - 1 + j] = x; }); }); },
      getValues() { return sheet.rows.slice(r - 1, r - 1 + nr).map((x) => x.slice(c - 1, c - 1 + nc)); },
    };
  }
}

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const NOW_SEC = () => Math.floor(Date.now() / 1000);
const googleToken = (email, { exp = NOW_SEC() + 3600, verified } = {}) =>
  `${b64url({ alg: 'none' })}.${b64url({ exp, email, ...(verified === undefined ? {} : { email_verified: verified }) })}.sig`;

/**
 * records/students/teachers:各分頁「標題列以外」的資料列。省略(undefined)代表分頁還不存在,
 * 由後端在第一次用到時自動建立。
 */
function loadScript({ records = [], students, teachers } = {}) {
  const stats = { fetches: 0, cacheRemoves: 0 };
  const cacheStore = new Map();
  const props = new Map();
  const sheets = { 量測紀錄: new FakeSheet([RECORD_HEADER, ...records]) };
  if (students) sheets['學生名單'] = new FakeSheet([STUDENT_HEADER, ...students]);
  if (teachers) sheets['教師名單'] = new FakeSheet([TEACHER_HEADER, ...teachers]);

  const output = (text) => ({ text, setMimeType() { return this; } });
  const sandbox = {
    console,
    ContentService: { createTextOutput: output, MimeType: { JSON: 'json' } },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (name) => sheets[name] || null,
        insertSheet: (name) => { sheets[name] = new FakeSheet([]); return sheets[name]; },
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cacheStore.has(k) ? cacheStore.get(k) : null),
        getAll: (keys) => Object.fromEntries(keys.filter((k) => cacheStore.has(k)).map((k) => [k, cacheStore.get(k)])),
        put: (k, v) => { cacheStore.set(k, v); },
        remove: (k) => { stats.cacheRemoves += 1; cacheStore.delete(k); },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => { props.set(k, v); },
      }),
    },
    UrlFetchApp: {
      // 模擬 Google tokeninfo:格式不對的 token 回 400;其餘從 payload 取 email,aud 固定是我們的用戶端 ID。
      fetch: (url) => {
        stats.fetches += 1;
        const token = decodeURIComponent(String(url).split('id_token=')[1] || '');
        const parts = token.split('.');
        if (parts.length !== 3) {
          return { getResponseCode: () => 400, getContentText: () => JSON.stringify({ error: 'invalid_token' }) };
        }
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            aud: payload.aud || sandbox.GOOGLE_CLIENT_ID,
            email: payload.email,
            email_verified: payload.email_verified === undefined ? 'true' : payload.email_verified,
          }),
        };
      },
    },
    Utilities: {
      getUuid: () => randomUUID(),
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      // Apps Script 回傳有號位元組(-128~127),這裡照樣模擬,才測得到 (b+256)%256 的轉換。
      computeDigest: (_algo, text) => Array.from(createHash('sha256').update(text, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      base64DecodeWebSafe: (s) => Uint8Array.from(Buffer.from(s, 'base64')),
      newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
    },
  };
  vm.runInNewContext(SOURCE, sandbox);
  const makeDate = (iso) => vm.runInContext(`new Date(${JSON.stringify(iso)})`, sandbox);
  return { sandbox, sheets, stats, cacheStore, makeDate, json: (out) => JSON.parse(out.text) };
}

const BOSS = 'boss@school.tw';
const withTeacher = (extra = {}) => loadScript({ teachers: [[BOSS]], ...extra });

function teacherCall(env, action, payload = {}, email = BOSS) {
  return env.json(env.sandbox.doPost({ postData: { contents: JSON.stringify({ action, idToken: googleToken(email), ...payload }) } }));
}

/** 用老師身分匯入名單,回傳 {classNo: 通行碼}。 */
function enroll(env, list) {
  const res = teacherCall(env, 'roster-import', { students: list.map(([classNo, name]) => ({ classNo, name })) });
  expect(res.status).toBe('ok');
  return Object.fromEntries(res.created.map((c) => [c.classNo, c.code]));
}

const measurement = (extra = {}) => ({
  treeId: '43667', timestamp: '2026-09-19T09:00:00.000Z', studentClassNo: '301-12', studentCode: '',
  angleDeg: 45, distanceM: 10, girthCm: 80, calculatedHeight: 11.5, clientRecordId: 'rec-1', ...extra,
});
const submit = (env, data) => env.json(env.sandbox.doPost({ postData: { contents: JSON.stringify(data) } }));

// ---------------------------------------------------------------------------

describe('通行碼', () => {
  const env = loadScript();
  const { sandbox } = env;
  const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

  it('產生 7 碼、只含易讀字元、格式(含檢查碼)有效,且每次不同', () => {
    const codes = new Set();
    for (let i = 0; i < 50; i += 1) {
      const code = sandbox.generateCode();
      expect(code).toHaveLength(7);
      expect([...code].every((ch) => ALPHABET.includes(ch))).toBe(true);
      expect(sandbox.isValidCodeFormat(code)).toBe(true);
      codes.add(code);
    }
    expect(codes.size).toBe(50);
  });

  it('任何「單一字元打錯」都會被檢查碼抓到', () => {
    for (let n = 0; n < 15; n += 1) {
      const code = sandbox.generateCode();
      for (let pos = 0; pos < 7; pos += 1) {
        for (const alt of ALPHABET) {
          if (alt === code[pos]) continue;
          expect(sandbox.isValidCodeFormat(code.slice(0, pos) + alt + code.slice(pos + 1))).toBe(false);
        }
      }
    }
  });

  it('長度不對、含非法字元(0/O/1/I)、非字串都無效', () => {
    expect(sandbox.isValidCodeFormat('ABC')).toBe(false);
    expect(sandbox.isValidCodeFormat('0000000')).toBe(false);
    expect(sandbox.isValidCodeFormat(null)).toBe(false);
  });

  it('normalizeCode 忽略大小寫、空白與連字號;formatCode 分成 3-3-1', () => {
    expect(sandbox.normalizeCode(' k7m-2qx-4 ')).toBe('K7M2QX4');
    expect(sandbox.formatCode('K7M2QX4')).toBe('K7M-2QX-4');
  });

  it('雜湊:同輸入同結果、換班級座號或通行碼就不同、不含明碼', () => {
    const a = sandbox.hashCode('301-12', 'K7M2QX4');
    expect(sandbox.hashCode('301-12', 'K7M2QX4')).toBe(a);
    expect(sandbox.hashCode('301-13', 'K7M2QX4')).not.toBe(a);
    expect(sandbox.hashCode('301-12', 'K7M2QX5')).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('K7M2QX4');
  });
});

describe('學生驗證 verifyStudent', () => {
  it('正確的班級座號 + 通行碼 → 回傳名簿裡的姓名', () => {
    const env = withTeacher();
    const codes = enroll(env, [['301-12', '王小明']]);
    const ok = env.sandbox.verifyStudent('301-12', codes['301-12']);
    expect(ok.ok).toBe(true);
    expect(ok.name).toBe('王小明');
  });

  it('大小寫、空白、連字號寫法不同都能通過', () => {
    const env = withTeacher();
    const codes = enroll(env, [['A301-12', '王小明']]);
    expect(env.sandbox.verifyStudent(' a301-12 ', codes['A301-12'].toLowerCase().replace(/-/g, ' ')).ok).toBe(true);
  });

  it('錯碼、不存在的座號、被停用:三種情況回相同的模糊訊息(不透露哪一種)', () => {
    const env = withTeacher();
    const codes = enroll(env, [['301-12', '王小明'], ['301-13', '李小華']]);
    teacherCall(env, 'roster-status', { classNo: '301-13', newStatus: '停用' });

    const wrongCode = env.sandbox.verifyStudent('301-12', env.sandbox.formatCode(env.sandbox.generateCode()));
    const unknown = env.sandbox.verifyStudent('999-99', codes['301-12']);
    const disabled = env.sandbox.verifyStudent('301-13', codes['301-13']);
    for (const r of [wrongCode, unknown, disabled]) {
      expect(r.ok).toBe(false);
      expect(r.code).toBe('STUDENT_REJECTED');
    }
    expect(new Set([wrongCode.error, unknown.error, disabled.error]).size).toBe(1);
  });

  it('連錯 MAX_FAILS 次後鎖定:下一次即使碼正確也回 STUDENT_LOCKED', () => {
    const env = withTeacher();
    const codes = enroll(env, [['301-12', '王小明']]);
    const bad = env.sandbox.formatCode(env.sandbox.generateCode());
    for (let i = 0; i < env.sandbox.MAX_FAILS; i += 1) expect(env.sandbox.verifyStudent('301-12', bad).code).toBe('STUDENT_REJECTED');
    expect(env.sandbox.verifyStudent('301-12', codes['301-12']).code).toBe('STUDENT_LOCKED');
  });

  it('鎖定只針對該班級座號,不影響其他同學', () => {
    const env = withTeacher();
    const codes = enroll(env, [['301-12', '甲'], ['301-13', '乙']]);
    const bad = env.sandbox.formatCode(env.sandbox.generateCode());
    for (let i = 0; i < env.sandbox.MAX_FAILS; i += 1) env.sandbox.verifyStudent('301-12', bad);
    expect(env.sandbox.verifyStudent('301-13', codes['301-13']).ok).toBe(true);
  });

  it('成功一次就清掉失敗計數(先錯 MAX-1 次、對 1 次、再錯 MAX-1 次仍不鎖)', () => {
    const env = withTeacher();
    const codes = enroll(env, [['301-12', '王小明']]);
    const bad = env.sandbox.formatCode(env.sandbox.generateCode());
    for (let i = 0; i < env.sandbox.MAX_FAILS - 1; i += 1) env.sandbox.verifyStudent('301-12', bad);
    expect(env.sandbox.verifyStudent('301-12', codes['301-12']).ok).toBe(true);
    for (let i = 0; i < env.sandbox.MAX_FAILS - 1; i += 1) env.sandbox.verifyStudent('301-12', bad);
    expect(env.sandbox.verifyStudent('301-12', codes['301-12']).ok).toBe(true);
  });

  it('檢查碼不對的碼直接拒絕,而且也計入失敗次數(不能拿來無限試)', () => {
    const env = withTeacher();
    enroll(env, [['301-12', '王小明']]);
    for (let i = 0; i < env.sandbox.MAX_FAILS; i += 1) expect(env.sandbox.verifyStudent('301-12', 'AAAAAAA').code).toBe('STUDENT_REJECTED');
    expect(env.sandbox.verifyStudent('301-12', 'AAAAAAA').code).toBe('STUDENT_LOCKED');
  });

  it('名簿裡只存雜湊:整個「學生名單」分頁找不到任何通行碼明碼', () => {
    const env = withTeacher();
    const codes = enroll(env, [['301-12', '王小明'], ['301-13', '李小華']]);
    const dump = JSON.stringify(env.sheets['學生名單'].rows);
    for (const code of Object.values(codes)) {
      expect(dump).not.toContain(code);
      expect(dump).not.toContain(code.replace(/-/g, ''));
    }
    expect(env.sheets['學生名單'].rows[1][2]).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('學生送出量測 doPost', () => {
  const setup = () => {
    const env = withTeacher();
    const codes = enroll(env, [['301-12', '王小明']]);
    return { env, code: codes['301-12'] };
  };

  it('驗證通過:寫入一列,姓名與班級座號取自名簿,忽略前端傳來的姓名', () => {
    const { env, code } = setup();
    const res = submit(env, measurement({ studentCode: code, studentClassNo: ' 301-12 ', studentName: '冒名者', clientRecordId: 'r1' }));
    expect(res).toEqual({ status: 'ok', studentName: '王小明' });
    const written = env.sheets['量測紀錄'].rows[1];
    expect(written[2]).toBe('王小明');
    expect(written[3]).toBe('301-12');
    expect(written[4]).toBe(45);
    expect(written[8]).toBe('已同步');
    expect(JSON.stringify(env.sheets['量測紀錄'].rows)).not.toContain('冒名者');
  });

  it('通行碼錯 → STUDENT_REJECTED,不寫入任何資料', () => {
    const { env } = setup();
    const res = submit(env, measurement({ studentCode: env.sandbox.formatCode(env.sandbox.generateCode()) }));
    expect(res.status).toBe('error');
    expect(res.code).toBe('STUDENT_REJECTED');
    expect(env.sheets['量測紀錄'].rows).toHaveLength(1);
  });

  it('被鎖定 → STUDENT_LOCKED(前端會保留在佇列稍後再試)', () => {
    const { env, code } = setup();
    const bad = env.sandbox.formatCode(env.sandbox.generateCode());
    for (let i = 0; i < env.sandbox.MAX_FAILS; i += 1) submit(env, measurement({ studentCode: bad, clientRecordId: `x${i}` }));
    expect(submit(env, measurement({ studentCode: code })).code).toBe('STUDENT_LOCKED');
  });

  it('缺班級座號或通行碼 → VALIDATION_FAILED', () => {
    const { env } = setup();
    expect(submit(env, measurement({ studentCode: '', studentClassNo: '301-12' })).code).toBe('VALIDATION_FAILED');
    expect(submit(env, measurement({ studentCode: 'X', studentClassNo: '' })).code).toBe('VALIDATION_FAILED');
  });

  it('數值驗證仍在:仰角 95 → VALIDATION_FAILED,不寫入', () => {
    const { env, code } = setup();
    const res = submit(env, measurement({ studentCode: code, angleDeg: 95 }));
    expect(res.code).toBe('VALIDATION_FAILED');
    expect(env.sheets['量測紀錄'].rows).toHaveLength(1);
  });

  it('壞 JSON → VALIDATION_FAILED', () => {
    const { env } = setup();
    expect(env.json(env.sandbox.doPost({ postData: { contents: '{not json' } })).code).toBe('VALIDATION_FAILED');
  });

  it('同一個 clientRecordId 重送:回 duplicate,不多寫一列', () => {
    const { env, code } = setup();
    expect(submit(env, measurement({ studentCode: code })).status).toBe('ok');
    const again = submit(env, measurement({ studentCode: code }));
    expect(again.duplicate).toBe(true);
    expect(env.sheets['量測紀錄'].rows).toHaveLength(2);
  });

  it('查重複只看最近 DEDUPE_WINDOW_ROWS 列:窗內的重送仍被擋、不會多寫', () => {
    const { env, code } = setup();
    const filler = Array.from({ length: env.sandbox.DEDUPE_WINDOW_ROWS + 50 }, (_, i) => row('A', '2026-01-01T00:00:00.000Z', 'x', 'y', 1, 1, `old${i}`));
    env.sheets['量測紀錄'].rows.push(...filler);
    expect(submit(env, measurement({ studentCode: code, clientRecordId: 'fresh' })).status).toBe('ok');
    const before = env.sheets['量測紀錄'].rows.length;
    expect(submit(env, measurement({ studentCode: code, clientRecordId: 'fresh' })).duplicate).toBe(true);
    expect(env.sheets['量測紀錄'].rows).toHaveLength(before);
  });

  it('預設不附耗時;請求帶 timing:true 才回各階段毫秒數', () => {
    const { env, code } = setup();
    expect(submit(env, measurement({ studentCode: code, clientRecordId: 't1' })).ms).toBeUndefined();
    const timed = submit(env, measurement({ studentCode: code, clientRecordId: 't2', timing: true }));
    expect(Object.keys(timed.ms).sort()).toEqual(['dedupe', 'lock', 'total', 'verify', 'write']);
  });

  it('樹號以 = 開頭(公式注入)會被加上單引號變純文字', () => {
    const { env, code } = setup();
    submit(env, measurement({ studentCode: code, treeId: '=IMPORTXML("http://evil","//a")' }));
    expect(env.sheets['量測紀錄'].rows[1][0].startsWith("'")).toBe(true);
  });

  it('寫入成功後摘要快取失效;被拒絕的寫入不會清快取', () => {
    const { env, code } = setup();
    env.json(env.sandbox.doGet({ parameter: { action: 'summary' } }));
    const before = env.stats.cacheRemoves;
    submit(env, measurement({ studentCode: 'AAAAAAA', clientRecordId: 'bad' }));
    expect(env.stats.cacheRemoves).toBe(before);
    submit(env, measurement({ studentCode: code, clientRecordId: 'good' }));
    expect(env.stats.cacheRemoves).toBeGreaterThan(before);
  });

  it('學生送出不需要、也不看 Google 登入(不呼叫 tokeninfo)', () => {
    const { env, code } = setup();
    const fetchesBefore = env.stats.fetches; // 匯入名單時老師驗證用掉的次數
    submit(env, measurement({ studentCode: code }));
    expect(env.stats.fetches).toBe(fetchesBefore);
  });
});

describe('被拒絕的鎖定策略:放寬門檻、失敗計數不丟失', () => {
  it('門檻放寬到 10 次、鎖 5 分鐘(通行碼熵約 2^29,線上暴力猜本來就不可行,鎖定太嚴只會被拿來搗亂)', () => {
    const { sandbox } = loadScript();
    expect(sandbox.MAX_FAILS).toBe(10);
    expect(sandbox.LOCK_SECONDS).toBe(300);
  });

  it('失敗計數用短鎖包起來做「讀取+1+寫回」,並發請求不會彼此覆蓋', () => {
    const env = withTeacher();
    enroll(env, [['301-12', '王小明']]);
    const events = [];
    const realLock = env.sandbox.LockService.getScriptLock;
    env.sandbox.LockService.getScriptLock = () => {
      const lock = realLock();
      return { waitLock: (ms) => { events.push('lock'); lock.waitLock(ms); }, releaseLock: () => { events.push('unlock'); lock.releaseLock(); } };
    };
    env.sandbox.verifyStudent('301-12', 'AAAAAAA');
    expect(events).toEqual(['lock', 'unlock']);
  });

  it('老師「重設」會解除鎖定;鎖定訊息說明可以找老師處理', () => {
    const env = withTeacher();
    enroll(env, [['301-12', '王小明']]);
    for (let i = 0; i < env.sandbox.MAX_FAILS; i += 1) env.sandbox.verifyStudent('301-12', 'AAAAAAA');
    const locked = env.sandbox.verifyStudent('301-12', 'AAAAAAA');
    expect(locked.code).toBe('STUDENT_LOCKED');
    expect(locked.error).toContain('老師');
    const fresh = teacherCall(env, 'roster-reset', { classNos: ['301-12'] }).reset[0].code;
    expect(env.sandbox.verifyStudent('301-12', fresh).ok).toBe(true);
  });
});

describe('學生送來的樹高與時間不可信:後端自己算、自己校時', () => {
  const setup = () => {
    const env = withTeacher();
    const codes = enroll(env, [['301-12', '王小明']]);
    return { env, code: codes['301-12'] };
  };
  const written = (env) => env.sheets['量測紀錄'].rows[1];

  it('樹高由仰角與距離重算(眼高 1.5 m,四捨五入到 0.01),忽略前端傳來的 calculatedHeight', () => {
    const { env, code } = setup();
    submit(env, measurement({ studentCode: code, angleDeg: 45, distanceM: 10, calculatedHeight: 999999 }));
    expect(written(env)[6]).toBe(11.5);
    submit(env, measurement({ studentCode: code, angleDeg: 8.5, distanceM: 10, calculatedHeight: 1, clientRecordId: 'b' }));
    expect(env.sheets['量測紀錄'].rows[2][6]).toBe(2.99);
  });

  it('算出的樹高超過 100 m、距離超過 500 m、樹圍超過 2000 cm 一律 VALIDATION_FAILED,不寫入', () => {
    const { env, code } = setup();
    expect(submit(env, measurement({ studentCode: code, angleDeg: 89.9, distanceM: 500 })).code).toBe('VALIDATION_FAILED');
    expect(submit(env, measurement({ studentCode: code, distanceM: 501, angleDeg: 1, clientRecordId: 'c' })).code).toBe('VALIDATION_FAILED');
    expect(submit(env, measurement({ studentCode: code, girthCm: 2001, clientRecordId: 'd' })).code).toBe('VALIDATION_FAILED');
    expect(submit(env, measurement({ studentCode: code, distanceM: 1e9, angleDeg: 1, clientRecordId: 'e' })).code).toBe('VALIDATION_FAILED');
    expect(env.sheets['量測紀錄'].rows).toHaveLength(1);
  });

  it('時間戳壞掉(zzzz)或在未來 → 改用伺服器時間,不會把某棵樹「釘」在最新', () => {
    const { env, code } = setup();
    const before = Date.now();
    submit(env, measurement({ studentCode: code, timestamp: 'zzzz', clientRecordId: 't1' }));
    submit(env, measurement({ studentCode: code, timestamp: '2999-01-01T00:00:00.000Z', clientRecordId: 't2' }));
    for (const r of [env.sheets['量測紀錄'].rows[1], env.sheets['量測紀錄'].rows[2]]) {
      const at = Date.parse(r[1]);
      expect(at).toBeGreaterThanOrEqual(before - 1000);
      expect(at).toBeLessThanOrEqual(Date.now() + 1000);
    }
  });

  it('合理的過去時間(離線佇列補送)原樣保留,並正規化成 ISO 格式', () => {
    const { env, code } = setup();
    submit(env, measurement({ studentCode: code, timestamp: '2026-09-18T10:00:00+08:00', clientRecordId: 'ok' }));
    expect(written(env)[1]).toBe('2026-09-18T02:00:00.000Z');
  });

  it('太久以前(超過一年)的時間視同不可信,改用伺服器時間', () => {
    const { env, code } = setup();
    submit(env, measurement({ studentCode: code, timestamp: '2001-01-01T00:00:00.000Z', clientRecordId: 'old' }));
    expect(Date.parse(written(env)[1])).toBeGreaterThan(Date.parse('2020-01-01'));
  });

  it('壞資料無法再蓋掉真實量測:先送 zzzz 的樹,之後正常量測仍成為「最新」', () => {
    const { env, code } = setup();
    submit(env, measurement({ studentCode: code, timestamp: 'zzzz', calculatedHeight: 1e9, clientRecordId: 'evil' }));
    const summary = env.json(env.sandbox.doGet({ parameter: { action: 'summary' } }));
    expect(summary.trees[0].height).toBe(11.5);
    expect(summary.trees[0].at).not.toBe('zzzz');
  });
});

describe('老師驗證(Google ID Token + 教師名單)', () => {
  const check = (env, token) =>
    env.json(env.sandbox.doPost({ postData: { contents: JSON.stringify({ action: 'teacher-check', idToken: token }) } }));

  it('在教師名單內(不分大小寫)→ ok', () => {
    const env = loadScript({ teachers: [['Boss@School.TW']] });
    expect(check(env, googleToken('boss@school.tw'))).toEqual({ status: 'ok', email: 'boss@school.tw' });
  });

  it('有效的 Google 帳號但不在名單 → TEACHER_REJECTED', () => {
    const env = withTeacher();
    expect(check(env, googleToken('student@school.tw')).code).toBe('TEACHER_REJECTED');
  });

  it('權杖過期 → AUTH_EXPIRED(不必打 tokeninfo);壞掉的權杖 → AUTH_REJECTED', () => {
    const env = withTeacher();
    expect(check(env, googleToken(BOSS, { exp: NOW_SEC() - 10 })).code).toBe('AUTH_EXPIRED');
    expect(env.stats.fetches).toBe(0);
    expect(check(env, 'garbage').code).toBe('AUTH_REJECTED');
    expect(check(env, undefined).code).toBe('AUTH_REJECTED');
  });

  it('信箱未驗證 → AUTH_REJECTED', () => {
    const env = withTeacher();
    expect(check(env, googleToken(BOSS, { verified: 'false' })).code).toBe('AUTH_REJECTED');
  });

  it('教師名單分頁不存在時自動建立(空的),任何人都是「不在名單」', () => {
    const env = loadScript();
    expect(check(env, googleToken(BOSS)).code).toBe('TEACHER_REJECTED');
    expect(env.sheets['教師名單'].rows[0]).toEqual(TEACHER_HEADER);
  });
});

describe('學生名單管理(老師專用)', () => {
  it('沒有老師身分不能動名單:什麼都不會被寫入', () => {
    const env = withTeacher();
    const res = env.json(env.sandbox.doPost({ postData: { contents: JSON.stringify({ action: 'roster-import', students: [{ classNo: '1', name: 'x' }] }) } }));
    expect(res.status).toBe('error');
    const outsider = teacherCall(env, 'roster-import', { students: [{ classNo: '1', name: 'x' }] }, 'evil@x.com');
    expect(outsider.code).toBe('TEACHER_REJECTED');
    expect(env.sheets['學生名單']).toBeUndefined();
  });

  it('匯入:建立學生並回傳一次性明碼;分頁自動建立', () => {
    const env = withTeacher();
    const res = teacherCall(env, 'roster-import', { students: [{ classNo: '301-12', name: '王小明' }, { classNo: '301-13', name: '李小華' }] });
    expect(res.created).toHaveLength(2);
    expect(res.created[0].code).toMatch(/^[0-9A-Z]{3}-[0-9A-Z]{3}-[0-9A-Z]$/);
    expect(res.updated).toBe(0);
    expect(env.sheets['學生名單'].rows[0]).toEqual(STUDENT_HEADER);
    expect(env.sheets['學生名單'].rows).toHaveLength(3);
  });

  it('列表不含雜湊或通行碼', () => {
    const env = withTeacher();
    const codes = enroll(env, [['301-12', '王小明']]);
    const res = teacherCall(env, 'roster-list');
    expect(res.students).toEqual([{ classNo: '301-12', name: '王小明', status: '啟用', updatedAt: expect.any(String), locked: false }]);
    const text = JSON.stringify(res);
    expect(text).not.toContain(codes['301-12']);
    expect(text).not.toMatch(/[0-9a-f]{64}/);
  });

  it('重複匯入同一班級座號:只更新姓名,原通行碼仍有效、不會重發', () => {
    const env = withTeacher();
    const codes = enroll(env, [['301-12', '王小明']]);
    const again = teacherCall(env, 'roster-import', { students: [{ classNo: '301-12', name: '王小明(改)' }] });
    expect(again.created).toEqual([]);
    expect(again.updated).toBe(1);
    const ok = env.sandbox.verifyStudent('301-12', codes['301-12']);
    expect(ok.ok).toBe(true);
    expect(ok.name).toBe('王小明(改)');
  });

  it('壞資料逐行略過並說明原因:空白、太長、名單內重複', () => {
    const env = withTeacher();
    const res = teacherCall(env, 'roster-import', {
      students: [
        { classNo: '301-12', name: '王小明' },
        { classNo: '', name: '沒座號' },
        { classNo: '301-14', name: '' },
        { classNo: 'X'.repeat(21), name: '太長' },
        { classNo: '301-12', name: '重複' },
      ],
    });
    expect(res.created).toHaveLength(1);
    expect(res.skipped.map((s) => s.line)).toEqual([2, 3, 4, 5]);
    expect(res.skipped.every((s) => typeof s.reason === 'string' && s.reason.length > 0)).toBe(true);
  });

  it('空名單、超過上限、不是陣列 → VALIDATION_FAILED', () => {
    const env = withTeacher();
    expect(teacherCall(env, 'roster-import', { students: [] }).code).toBe('VALIDATION_FAILED');
    expect(teacherCall(env, 'roster-import', { students: 'x' }).code).toBe('VALIDATION_FAILED');
    const tooMany = Array.from({ length: 501 }, (_, i) => ({ classNo: `C${i}`, name: 'n' }));
    expect(teacherCall(env, 'roster-import', { students: tooMany }).code).toBe('VALIDATION_FAILED');
  });

  it('姓名以 = 開頭(公式注入)存成純文字', () => {
    const env = withTeacher();
    teacherCall(env, 'roster-import', { students: [{ classNo: '301-12', name: '=HYPERLINK(1)' }] });
    expect(env.sheets['學生名單'].rows[1][1].startsWith("'")).toBe(true);
  });

  it('重設通行碼:舊碼立刻失效、新碼可用、鎖定一併解除', () => {
    const env = withTeacher();
    const codes = enroll(env, [['301-12', '王小明']]);
    const bad = env.sandbox.formatCode(env.sandbox.generateCode());
    for (let i = 0; i < env.sandbox.MAX_FAILS; i += 1) env.sandbox.verifyStudent('301-12', bad);
    expect(env.sandbox.verifyStudent('301-12', codes['301-12']).code).toBe('STUDENT_LOCKED');

    const res = teacherCall(env, 'roster-reset', { classNos: ['301-12', '999-99'] });
    expect(res.reset).toHaveLength(1);
    expect(res.skipped).toEqual([{ classNo: '999-99', reason: '名簿裡找不到' }]);
    const fresh = res.reset[0].code;
    expect(fresh).not.toBe(codes['301-12']);
    expect(env.sandbox.verifyStudent('301-12', codes['301-12']).code).toBe('STUDENT_REJECTED');
    expect(env.sandbox.verifyStudent('301-12', fresh).ok).toBe(true);
  });

  it('重設不會把被停用的學生重新啟用', () => {
    const env = withTeacher();
    enroll(env, [['301-12', '王小明']]);
    teacherCall(env, 'roster-status', { classNo: '301-12', newStatus: '停用' });
    const fresh = teacherCall(env, 'roster-reset', { classNos: ['301-12'] }).reset[0].code;
    expect(env.sandbox.verifyStudent('301-12', fresh).code).toBe('STUDENT_REJECTED');
  });

  it('停用 → 立刻不能送出;再啟用 → 恢復', () => {
    const env = withTeacher();
    const codes = enroll(env, [['301-12', '王小明']]);
    expect(teacherCall(env, 'roster-status', { classNo: '301-12', newStatus: '停用' }).status).toBe('ok');
    expect(submit(env, measurement({ studentCode: codes['301-12'] })).code).toBe('STUDENT_REJECTED');
    expect(teacherCall(env, 'roster-status', { classNo: '301-12', newStatus: '啟用' }).status).toBe('ok');
    expect(submit(env, measurement({ studentCode: codes['301-12'], clientRecordId: 'again' })).status).toBe('ok');
  });

  it('狀態值不合法、學生不存在、不認得的動作 → VALIDATION_FAILED', () => {
    const env = withTeacher();
    enroll(env, [['301-12', '王小明']]);
    expect(teacherCall(env, 'roster-status', { classNo: '301-12', newStatus: '刪除' }).code).toBe('VALIDATION_FAILED');
    expect(teacherCall(env, 'roster-status', { classNo: '000', newStatus: '停用' }).code).toBe('VALIDATION_FAILED');
    expect(teacherCall(env, 'do-something-else').code).toBe('VALIDATION_FAILED');
  });
});

describe('Code.gs summarizeRows', () => {
  it('每棵樹取「量測時間最新」那筆,與列的先後順序無關;n 是有效筆數', () => {
    const { sandbox } = loadScript();
    const result = sandbox.summarizeRows([
      row('43667', '2026-09-19T03:00:00.000Z', 'a', '1', 12.5, 90, 'i3'),
      row('43667', '2026-09-01T01:00:00.000Z', 'b', '2', 10, 70, 'i1'),
      row('43667', '2026-09-10T01:00:00.000Z', 'c', '3', 11, 80, 'i2'),
      row('43020', '2026-09-19T01:30:00.000Z', 'd', '4', 6, 40, 'i4'),
    ]);
    const byNo = Object.fromEntries(result.map((t) => [t.no, t]));
    expect(byNo['43667']).toEqual({ no: '43667', height: 12.5, girth: 90, at: '2026-09-19T03:00:00.000Z', n: 3 });
    expect(byNo['43020'].n).toBe(1);
  });

  it('壞資料(樹高 0、空白、非數字)與空樹號被略過', () => {
    const { sandbox } = loadScript();
    const result = sandbox.summarizeRows([
      row('1', '2026-09-19T01:00:00.000Z', 'a', '1', 0, 10, 'a'),
      row('1', '2026-09-19T02:00:00.000Z', 'a', '1', '', 10, 'b'),
      row('1', '2026-09-19T03:00:00.000Z', 'a', '1', 'abc', 10, 'c'),
      row('', '2026-09-19T04:00:00.000Z', 'a', '1', 9, 10, 'd'),
      row('2', '2026-09-19T05:00:00.000Z', 'a', '1', 8, 10, 'e'),
    ]);
    expect(result.map((t) => t.no)).toEqual(['2']);
  });

  it('樹號是數字、時間戳是 Date 物件也能處理;沒有樹圍時 girth 為 null', () => {
    const { sandbox, makeDate } = loadScript();
    const result = sandbox.summarizeRows([row(43667, makeDate('2026-09-19T01:00:00.000Z'), 'a', '1', 9, '', 'x')]);
    expect(result[0].no).toBe('43667');
    expect(result[0].at).toBe('2026-09-19T01:00:00.000Z');
    expect(result[0].girth).toBeNull();
  });
});

describe('學生可控的樹號不能弄壞摘要(__proto__ / constructor 等特殊鍵)', () => {
  it('樹號是 __proto__、constructor、toString 時,summarizeRows 仍正常且不污染 Object.prototype', () => {
    const { sandbox } = loadScript();
    const result = sandbox.summarizeRows([
      row('__proto__', '2026-09-19T01:00:00.000Z', 'a', '1', 5, 30, 'a'),
      row('__proto__', '2026-09-19T02:00:00.000Z', 'a', '1', 6, 31, 'b'),
      row('constructor', '2026-09-19T01:00:00.000Z', 'a', '1', 7, 32, 'c'),
      row('toString', '2026-09-19T01:00:00.000Z', 'a', '1', 8, 33, 'd'),
      row('43667', '2026-09-19T01:00:00.000Z', 'a', '1', 9, 34, 'e'),
    ]);
    const byNo = Object.fromEntries(result.map((t) => [t.no, t]));
    expect(result).toHaveLength(4);
    expect(byNo['__proto__']).toEqual({ no: '__proto__', height: 6, girth: 31, at: '2026-09-19T02:00:00.000Z', n: 2 });
    expect(byNo['constructor'].height).toBe(7);
    expect(byNo['toString'].height).toBe(8);
    expect(({}).n).toBeUndefined();
    expect(vm.runInContext('Object.prototype.n', sandbox)).toBeUndefined();
  });
});

describe('Code.gs 公開端點:summary / history / 其他 GET', () => {
  const data = [
    row('43667', '2026-09-19T03:00:00.000Z', '王小明', '301-12', 12.5, 90, 'i3'),
    row('43667', '2026-09-01T01:00:00.000Z', '李小華', '302-03', 10, 70, 'i1'),
    row('43020', '2026-09-05T01:00:00.000Z', '陳大同', '303-05', 6, 40, 'i4'),
    row('43667', '2026-09-10T01:00:00.000Z', '林小美', '304-07', 11, '', 'i2'),
    row('43667', '2026-09-12T01:00:00.000Z', '壞資料', '305-09', 0, 50, 'i5'),
  ];
  const get = (env, parameter) => env.sandbox.doGet({ parameter });
  const SECRETS = ['王小明', '李小華', '陳大同', '林小美', '301-12', '302-03', '303-05', 'i1', 'i2', 'i3', 'i4'];

  it('summary:不需登入,每棵樹一筆,回應絕對不含姓名/座號/紀錄編號', () => {
    const env = loadScript({ records: data });
    const out = get(env, { action: 'summary' });
    const body = JSON.parse(out.text);
    expect(body.status).toBe('ok');
    expect(body.trees).toHaveLength(2);
    expect(env.stats.fetches).toBe(0);
    for (const secret of SECRETS) expect(out.text).not.toContain(secret);
  });

  it('summary 有 5 分鐘快取:第二次不再讀 Sheet', () => {
    const env = loadScript({ records: data });
    get(env, { action: 'summary' });
    get(env, { action: 'summary' });
    expect(env.sheets['量測紀錄'].reads).toBe(1);
  });

  it('history:只回該棵樹、由舊到新、只有 {at,height,girth},不含個資', () => {
    const env = loadScript({ records: data });
    const out = get(env, { action: 'history', treeId: '43667' });
    expect(JSON.parse(out.text).points).toEqual([
      { at: '2026-09-01T01:00:00.000Z', height: 10, girth: 70 },
      { at: '2026-09-10T01:00:00.000Z', height: 11, girth: null },
      { at: '2026-09-19T03:00:00.000Z', height: 12.5, girth: 90 },
    ]);
    for (const secret of SECRETS) expect(out.text).not.toContain(secret);
  });

  it('history:最多回最近 200 筆;沒量測的樹回空清單', () => {
    const many = Array.from({ length: 250 }, (_, i) =>
      row('7', `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`, 'x', '1', 5, 30, `id${i}`));
    const env = loadScript({ records: many });
    const body = JSON.parse(get(env, { action: 'history', treeId: '7' }).text);
    expect(body.points).toHaveLength(200);
    expect(body.points[0].at).toBe('2026-01-01T00:00:50.000Z');
    expect(JSON.parse(get(env, { action: 'history', treeId: '99999' }).text).points).toEqual([]);
  });

  it('history:treeId 缺少、空白或超過 40 字 → VALIDATION_FAILED,且不讀 Sheet', () => {
    for (const bad of [undefined, '', '   ', 'x'.repeat(41)]) {
      const env = loadScript({ records: data });
      const body = JSON.parse(get(env, { action: 'history', treeId: bad }).text);
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(env.sheets['量測紀錄'].reads).toBe(0);
    }
  });

  it('history 每棵樹各自快取;寫入某棵樹後只有那一棵失效', () => {
    const env = withTeacher({ records: data });
    const codes = enroll(env, [['301-12', '王小明']]);
    get(env, { action: 'history', treeId: '43667' });
    get(env, { action: 'history', treeId: '43020' });
    get(env, { action: 'history', treeId: '43667' });
    expect(env.sheets['量測紀錄'].reads).toBe(2);

    expect(submit(env, measurement({ studentCode: codes['301-12'], treeId: '43667', calculatedHeight: 13, timestamp: '2026-09-20T01:00:00.000Z', clientRecordId: 'hn' })).status).toBe('ok');
    const updated = JSON.parse(get(env, { action: 'history', treeId: '43667' }).text);
    expect(updated.points[updated.points.length - 1].height).toBe(11.5); // 後端由仰角 45°/距離 10 m 重算,不採信前端的 13
    expect(env.sheets['量測紀錄'].reads).toBe(3);
    get(env, { action: 'history', treeId: '43020' });
    expect(env.sheets['量測紀錄'].reads).toBe(3);
  });

  it('沒有 action 或不認得的 GET(包含舊的「逐棵含個資查詢」)一律拒絕,不洩漏任何資料', () => {
    const env = loadScript({ records: data });
    for (const parameter of [{}, { treeId: '43667' }, { treeId: '43667', idToken: 'x' }, { action: 'records' }]) {
      const out = get(env, parameter);
      expect(JSON.parse(out.text).code).toBe('VALIDATION_FAILED');
      for (const secret of SECRETS) expect(out.text).not.toContain(secret);
    }
  });
});

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

  it('teacher-add:以 = + - @ 開頭的信箱被拒絕,不會寫進 Sheet', () => {
    const env = withTeacher();
    for (const bad of ['=cmd@x.tw', '+a@x.tw', '-a@x.tw', '@a@x.tw']) {
      expect(teacherCall(env, 'teacher-add', { email: bad }).code, bad).toBe('VALIDATION_FAILED');
    }
    expect(env.sheets['教師名單'].rows).toHaveLength(2);
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
