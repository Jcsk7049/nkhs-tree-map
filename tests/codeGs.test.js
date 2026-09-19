import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// 載入「真正的」apps-script/Code.gs,只把 Google 提供的服務換成假物件,
// 所以測的是實際會部署的程式,不是另寫的複製版。
const SOURCE = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');

const HEADER = ['樹編號', '量測時間戳', '填寫人姓名', '填寫人班級座號', '仰角', '水平距離', '計算後樹高', '樹圍', '同步狀態', '用戶端紀錄編號'];
const row = (no, at, name, cls, height, girth, id) => [no, at, name, cls, 45, 10, height, girth, '已同步', id];

function loadScript(initialRows) {
  const rows = [HEADER, ...initialRows];
  const stats = { sheetReads: 0, fetches: 0, cacheRemoves: 0 };
  const cacheStore = new Map();

  const sheet = {
    getDataRange: () => ({ getValues: () => { stats.sheetReads += 1; return rows.map((r) => r.slice()); } }),
    getMaxColumns: () => 26,
    getLastRow: () => rows.length,
    getRange: (r, c, nr, nc) => ({
      setNumberFormat: () => {},
      setValues: (vals) => { vals.forEach((v, i) => { rows[r - 1 + i] = v; }); },
      getValues: () => rows.slice(r - 1, r - 1 + nr).map((x) => x.slice(c - 1, c - 1 + nc)),
    }),
  };

  const output = (text) => ({ text, setMimeType() { return this; } });
  const sandbox = {
    console,
    ContentService: { createTextOutput: output, MimeType: { JSON: 'json' } },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cacheStore.has(k) ? cacheStore.get(k) : null),
        put: (k, v) => { cacheStore.set(k, v); },
        remove: (k) => { stats.cacheRemoves += 1; cacheStore.delete(k); },
      }),
    },
    UrlFetchApp: {
      // 模擬 Google tokeninfo:格式不對的 token(不是 header.payload.sig)回 400,其餘視為有效。
      fetch: (url) => {
        stats.fetches += 1;
        const token = decodeURIComponent(String(url).split('id_token=')[1] || '');
        if (token.split('.').length !== 3) {
          return { getResponseCode: () => 400, getContentText: () => JSON.stringify({ error: 'invalid_token' }) };
        }
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ aud: sandbox.GOOGLE_CLIENT_ID, hd: sandbox.ALLOWED_DOMAIN, email: `t@${sandbox.ALLOWED_DOMAIN}` }),
        };
      },
    },
    Utilities: {
      base64DecodeWebSafe: (s) => Uint8Array.from(Buffer.from(s, 'base64')),
      newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
    },
  };
  vm.runInNewContext(SOURCE, sandbox);
  // Date 必須在 vm 內部建立,Code.gs 裡的 `instanceof Date` 才認得(跨 realm 的 Date 不相等)。
  const makeDate = (iso) => vm.runInContext(`new Date(${JSON.stringify(iso)})`, sandbox);
  return { sandbox, rows, stats, makeDate, json: (out) => JSON.parse(out.text) };
}

const summaryOf = (env) => env.json(env.sandbox.doGet({ parameter: { action: 'summary' } }));

describe('Code.gs summarizeRows', () => {
  it('每棵樹取「量測時間最新」那筆,與列的先後順序無關;n 是有效筆數', () => {
    const { sandbox } = loadScript([]);
    const result = sandbox.summarizeRows([
      row('43667', '2026-09-19T03:00:00.000Z', 'a', '1', 12.5, 90, 'i3'),
      row('43667', '2026-09-19T01:00:00.000Z', 'b', '2', 10, 70, 'i1'),
      row('43667', '2026-09-19T02:00:00.000Z', 'c', '3', 11, 80, 'i2'),
      row('43020', '2026-09-19T01:30:00.000Z', 'd', '4', 6, 40, 'i4'),
    ]);
    const byNo = Object.fromEntries(result.map((t) => [t.no, t]));
    expect(byNo['43667']).toEqual({ no: '43667', height: 12.5, girth: 90, at: '2026-09-19T03:00:00.000Z', n: 3 });
    expect(byNo['43020'].n).toBe(1);
    expect(result).toHaveLength(2);
  });

  it('壞資料(樹高 0、空白、非數字)與空樹號會被略過,不會污染結果', () => {
    const { sandbox } = loadScript([]);
    const result = sandbox.summarizeRows([
      row('1', '2026-09-19T01:00:00.000Z', 'a', '1', 0, 10, 'a'),
      row('1', '2026-09-19T02:00:00.000Z', 'a', '1', '', 10, 'b'),
      row('1', '2026-09-19T03:00:00.000Z', 'a', '1', 'abc', 10, 'c'),
      row('', '2026-09-19T04:00:00.000Z', 'a', '1', 9, 10, 'd'),
      row('2', '2026-09-19T05:00:00.000Z', 'a', '1', 8, 10, 'e'),
    ]);
    expect(result.map((t) => t.no)).toEqual(['2']);
  });

  it('樹號是數字、時間戳是 Date 物件(Sheets 自動轉型)也能處理', () => {
    const { sandbox, makeDate } = loadScript([]);
    const result = sandbox.summarizeRows([row(43667, makeDate('2026-09-19T01:00:00.000Z'), 'a', '1', 9, 30, 'x')]);
    expect(result[0].no).toBe('43667');
    expect(result[0].at).toBe('2026-09-19T01:00:00.000Z');
  });

  it('沒有樹圍時 girth 為 null,樹高照常回傳', () => {
    const { sandbox } = loadScript([]);
    const result = sandbox.summarizeRows([row('9', '2026-09-19T01:00:00.000Z', 'a', '1', 7, '', 'x')]);
    expect(result[0].height).toBe(7);
    expect(result[0].girth).toBeNull();
  });
});

describe('Code.gs doGet?action=summary(公開摘要)', () => {
  const data = [
    row('43667', '2026-09-19T01:00:00.000Z', '王小明', '301-12', 11.5, 80, 'i1'),
    row('43020', '2026-09-19T02:00:00.000Z', '李小華', '302-03', 6.2, 44, 'i2'),
  ];

  it('不需登入、不呼叫 Google 驗證,回傳 {status:ok, trees}', () => {
    const env = loadScript(data);
    const body = summaryOf(env);
    expect(body.status).toBe('ok');
    expect(body.trees).toHaveLength(2);
    expect(typeof body.generatedAt).toBe('string');
    expect(env.stats.fetches).toBe(0);
  });

  it('回應裡絕對不含學生姓名或班級座號(個資)', () => {
    const env = loadScript(data);
    const text = env.sandbox.doGet({ parameter: { action: 'summary' } }).text;
    for (const secret of ['王小明', '李小華', '301-12', '302-03', 'i1', 'i2']) {
      expect(text).not.toContain(secret);
    }
  });

  it('5 分鐘快取:第二次不再讀 Sheet', () => {
    const env = loadScript(data);
    summaryOf(env);
    summaryOf(env);
    expect(env.stats.sheetReads).toBe(1);
  });

  it('summary 參數不能被拿來繞過驗證:同時帶 treeId 也只回摘要,不回逐筆資料', () => {
    const env = loadScript(data);
    const text = env.sandbox.doGet({ parameter: { action: 'summary', treeId: '43667' } }).text;
    expect(text).not.toContain('王小明');
  });

  it('原本的逐棵查詢仍需要 token:沒帶 token 會被拒絕', () => {
    const env = loadScript(data);
    const body = env.json(env.sandbox.doGet({ parameter: { treeId: '43667' } }));
    expect(body.status).toBe('error');
    expect(body.code).toBe('AUTH_REJECTED');
  });
});

describe('Code.gs doPost 寫入後讓摘要快取失效', () => {
  const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = () => `${b64url({ alg: 'none' })}.${b64url({ exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
  const post = (env, extra = {}) =>
    env.json(
      env.sandbox.doPost({
        postData: {
          contents: JSON.stringify({
            treeId: '43667', timestamp: '2026-09-19T09:00:00.000Z', studentName: '測試', studentClassNo: '0012',
            angleDeg: 45, distanceM: 10, girthCm: 80, calculatedHeight: 11.5, clientRecordId: 'new-1', idToken: token(), ...extra,
          }),
        },
      }),
    );

  it('新資料寫入成功後,下一次摘要會重新讀 Sheet 並包含新量測', () => {
    const env = loadScript([row('43020', '2026-09-19T02:00:00.000Z', 'x', '1', 6, 40, 'i2')]);
    expect(summaryOf(env).trees.map((t) => t.no)).toEqual(['43020']);
    expect(env.stats.sheetReads).toBe(1);

    expect(post(env).status).toBe('ok');
    expect(env.stats.cacheRemoves).toBeGreaterThan(0);

    const after = summaryOf(env);
    expect(env.stats.sheetReads).toBeGreaterThan(1);
    expect(after.trees.map((t) => t.no).sort()).toEqual(['43020', '43667']);
  });

  it('被拒絕的寫入(壞 token)不會清掉快取', () => {
    const env = loadScript([]);
    summaryOf(env);
    const body = post(env, { idToken: 'garbage' });
    expect(body.status).toBe('error');
    expect(env.stats.cacheRemoves).toBe(0);
  });

  it('重複的 clientRecordId(重送)回 duplicate,不多寫一列', () => {
    const env = loadScript([]);
    expect(post(env).status).toBe('ok');
    const again = post(env);
    expect(again.duplicate).toBe(true);
    expect(env.rows).toHaveLength(2); // 標題列 + 1 筆
  });
});

describe('Code.gs doGet?action=history(單棵樹歷年量測,公開)', () => {
  const historyOf = (env, treeId) => env.json(env.sandbox.doGet({ parameter: { action: 'history', treeId } }));
  const data = [
    row('43667', '2026-09-19T03:00:00.000Z', '王小明', '301-12', 12.5, 90, 'i3'),
    row('43667', '2026-09-01T01:00:00.000Z', '李小華', '302-03', 10, 70, 'i1'),
    row('43020', '2026-09-05T01:00:00.000Z', '陳大同', '303-05', 6, 40, 'i4'),
    row('43667', '2026-09-10T01:00:00.000Z', '林小美', '304-07', 11, '', 'i2'),
    row('43667', '2026-09-12T01:00:00.000Z', '壞資料', '305-09', 0, 50, 'i5'),
  ];

  it('只回該棵樹的量測,依時間由舊到新,格式為 {at, height, girth}', () => {
    const env = loadScript(data);
    const body = historyOf(env, '43667');
    expect(body.status).toBe('ok');
    expect(body.treeId).toBe('43667');
    expect(body.points).toEqual([
      { at: '2026-09-01T01:00:00.000Z', height: 10, girth: 70 },
      { at: '2026-09-10T01:00:00.000Z', height: 11, girth: null },
      { at: '2026-09-19T03:00:00.000Z', height: 12.5, girth: 90 },
    ]);
  });

  it('不需登入,且回應不含姓名/座號/紀錄編號(個資)', () => {
    const env = loadScript(data);
    const text = env.sandbox.doGet({ parameter: { action: 'history', treeId: '43667' } }).text;
    expect(env.stats.fetches).toBe(0);
    for (const secret of ['王小明', '李小華', '林小美', '301-12', '302-03', 'i1', 'i2', 'i3']) {
      expect(text).not.toContain(secret);
    }
  });

  it('沒有量測的樹回傳空清單(不是錯誤)', () => {
    expect(historyOf(loadScript(data), '99999').points).toEqual([]);
  });

  it('最多回最近 200 筆(舊的被丟掉)', () => {
    const many = Array.from({ length: 250 }, (_, i) =>
      row('7', `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`, 'x', '1', 5 + (i % 10), 30, `id${i}`),
    );
    const body = historyOf(loadScript(many), '7');
    expect(body.points).toHaveLength(200);
    expect(body.points[0].at).toBe('2026-01-01T00:00:50.000Z'); // 第 51 筆(index 50)
  });

  it('treeId 缺少、空白或超過 40 字回 VALIDATION_FAILED,且不讀 Sheet', () => {
    for (const bad of [undefined, '', '   ', 'x'.repeat(41)]) {
      const env = loadScript(data);
      const body = historyOf(env, bad);
      expect(body.status).toBe('error');
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(env.stats.sheetReads).toBe(0);
    }
  });

  it('每棵樹各自快取:同一棵第二次不讀 Sheet,換一棵才讀', () => {
    const env = loadScript(data);
    historyOf(env, '43667');
    historyOf(env, '43667');
    expect(env.stats.sheetReads).toBe(1);
    historyOf(env, '43020');
    expect(env.stats.sheetReads).toBe(2);
  });

  it('寫入某棵樹的新量測後,只有那一棵的歷史快取失效', () => {
    const env = loadScript(data);
    historyOf(env, '43667');
    historyOf(env, '43020');
    expect(env.stats.sheetReads).toBe(2);

    const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const idToken = `${b64url({ alg: 'none' })}.${b64url({ exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
    const res = env.json(
      env.sandbox.doPost({
        postData: {
          contents: JSON.stringify({
            treeId: '43667', timestamp: '2026-09-20T01:00:00.000Z', studentName: '新', studentClassNo: '1',
            angleDeg: 45, distanceM: 10, girthCm: 95, calculatedHeight: 13, clientRecordId: 'hist-new', idToken,
          }),
        },
      }),
    );
    expect(res.status).toBe('ok');

    const updated = historyOf(env, '43667');
    expect(updated.points[updated.points.length - 1].height).toBe(13);
    expect(env.stats.sheetReads).toBe(3); // 43667 重讀
    historyOf(env, '43020');
    expect(env.stats.sheetReads).toBe(3); // 43020 仍走快取
  });
});
