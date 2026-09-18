import { enqueue, listPending, remove } from './offlineQueue.js';

/**
 * Apps Script 的 ContentService 無法設定非 200 的 HTTP 狀態碼 —— 就算後端拒絕了請求,
 * 瀏覽器看到的仍是 200 / `response.ok === true`。因此「成功」必須由 JSON body 明確宣告:
 * 只有 `{ status: 'ok' }` 才算送達,其他一律視為失敗。
 */
const SUCCESS_STATUS = 'ok';

/**
 * 後端的「永久拒絕」代碼:資料本身有問題,重送一百次也不會成功,必須移出離線佇列
 * (見 syncPendingQueue 的說明),避免無限重試。
 *
 * 這裡**只有** VALIDATION_FAILED:前端送出前已跑過同一套驗證,合法的紀錄不可能在
 * 後端被判 VALIDATION_FAILED,真的發生代表資料已經壞掉,留著也送不出去。
 * `AUTH_REJECTED` 曾經也在這份清單裡,但它是**環境問題**而非資料問題(見下方說明),
 * 丟掉會造成無法挽回的資料遺失,因此已移出。
 */
const NON_RETRYABLE_CODES = ['VALIDATION_FAILED'];

/** 登入權杖過期:資料還是好的,但要等使用者重新登入才能送 —— 保留在佇列。 */
export const AUTH_EXPIRED_CODE = 'AUTH_EXPIRED';

/**
 * 身分不被接受。**不等於資料有問題**:最常見的原因其實是部署設定貼錯 ——
 * `public/tree.html` 與 `apps-script/Code.gs` 兩處的 GOOGLE_CLIENT_ID 必須完全一致
 * (DEPLOY.md 有兩個各自獨立的人工貼上點),只要有一處打錯,`aud` 比對就會對**每一筆**
 * 送出都回 AUTH_REJECTED。若把這種紀錄丟出佇列,一個可修復的設定筆誤會在第一次同步時
 * 就把全班的量測資料永久刪光。因此改為「保留資料、暫停自動重送、提示找老師檢查設定」。
 */
export const AUTH_REJECTED_CODE = 'AUTH_REJECTED';

/**
 * 遇到這些代碼就:資料留在佇列、停止本次同步、把狀況往上報給 UI。
 * 兩者都不是「資料壞掉」,而是「現在送不出去」,差別只在誰能修好(學生重新登入 vs 老師改設定)。
 */
const AUTH_PAUSE_CODES = [AUTH_EXPIRED_CODE, AUTH_REJECTED_CODE];

/**
 * 送出單筆紀錄,回傳一個結果物件(不丟例外,呼叫端據此決定入列/丟棄/重試):
 *   { ok: true }
 *   { ok: false, code, error, retryable }
 *
 * 注意 Content-Type 用 `text/plain;charset=utf-8`:`application/json` 會讓這個 POST
 * 變成非簡單請求並觸發 CORS preflight(OPTIONS),而 Apps Script `/exec` 不會回應
 * preflight,瀏覽器會直接擋掉請求。body 仍然是 JSON 字串,`Code.gs` 的 doPost 讀
 * `e.postData.contents` 後 JSON.parse,與宣告的 Content-Type 無關。
 */
async function postRecord(record, fetchImpl, apiUrl) {
  let response;
  try {
    response = await fetchImpl(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(record),
    });
  } catch (err) {
    return { ok: false, code: 'NETWORK_ERROR', error: String(err && err.message), retryable: true };
  }

  if (!response.ok) {
    return { ok: false, code: 'HTTP_ERROR', error: `API回應失敗: ${response.status}`, retryable: true };
  }

  let body;
  try {
    body = await response.json();
  } catch (err) {
    // Apps Script 出錯時會回一頁 HTML,解析不出 JSON —— 當成暫時性失敗保留重試。
    return { ok: false, code: 'BAD_RESPONSE', error: '伺服器回應格式無法解析', retryable: true };
  }

  if (body && body.status === SUCCESS_STATUS) {
    return { ok: true };
  }

  const code = (body && body.code) || 'UNKNOWN_ERROR';
  return {
    ok: false,
    code,
    error: (body && body.error) || '伺服器拒絕了這筆資料',
    retryable: !NON_RETRYABLE_CODES.includes(code),
  };
}

/**
 * 送出一筆量測紀錄。
 * @returns {Promise<{ status: 'sent' | 'queued' | 'rejected', code?: string, error?: string }>}
 *   - `sent`:後端明確回 `{status:'ok'}`
 *   - `queued`:暫時性失敗(離線、伺服器錯誤、登入過期、身分驗證失敗),已存進本機佇列等之後同步
 *   - `rejected`:後端判定資料不合法(VALIDATION_FAILED),不入佇列,必須讓使用者知道要重填
 */
export async function submitMeasurement(record, fetchImpl, apiUrl) {
  const result = await postRecord(record, fetchImpl, apiUrl);

  if (result.ok) {
    return { status: 'sent' };
  }

  if (!result.retryable) {
    return { status: 'rejected', code: result.code, error: result.error };
  }

  await enqueue(record);
  return { status: 'queued', code: result.code, error: result.error };
}

/**
 * 逐筆嘗試送出佇列中的待同步紀錄。
 * @returns {Promise<{ synced: number, dropped: number, failed: number, authPaused: boolean, authCode: string|null }>}
 *   - `synced`:送達並已移出佇列
 *   - `dropped`:被後端判定資料不合法(VALIDATION_FAILED)而移出佇列
 *   - `failed`:暫時性失敗,仍留在佇列等下次重試
 *   - `authPaused`:遇到 AUTH_EXPIRED / AUTH_REJECTED,已中止本次同步,資料全數保留
 *   - `authCode`:造成中止的代碼(供 UI 決定要提示「重新登入」還是「找老師檢查設定」),沒中止則為 null
 *
 * 為什麼 `dropped` 的紀錄要「丟掉」而不是無限重試:
 * 後端回 VALIDATION_FAILED 代表這筆資料本身不合法,內容不變的情況下重送永遠會得到同樣的
 * 拒絕。若留在佇列,每次 `online` 事件都會重打一次後端,形成永久的無效流量,而且會卡住
 * 後面正常紀錄的處理。因此刻意移除 —— 但一定要把 `dropped` 的數字往上回報給 UI,
 * 不能無聲吃掉學生的資料。
 *
 * 為什麼 AUTH_REJECTED 不在 `dropped` 裡:它反映的是「部署設定」而不是「資料內容」
 * (見 AUTH_REJECTED_CODE 的說明),丟掉就再也救不回來了。
 */
export async function syncPendingQueue(fetchImpl, apiUrl) {
  const pending = await listPending();
  let synced = 0;
  let dropped = 0;
  let failed = 0;
  let authPaused = false;
  let authCode = null;

  for (const item of pending) {
    const result = await postRecord(item.record, fetchImpl, apiUrl);

    if (result.ok) {
      await remove(item.id);
      synced += 1;
      continue;
    }

    if (AUTH_PAUSE_CODES.includes(result.code)) {
      // 身分這一關過不了,同一批的其他紀錄必然也會被拒 —— 立刻收手,別連環重送。
      // 資料**全數保留**在佇列:過期等使用者重新登入,設定不符等老師改好 Client ID 後再刷。
      authPaused = true;
      authCode = result.code;
      failed += pending.length - (synced + dropped);
      break;
    }

    if (!result.retryable) {
      await remove(item.id);
      dropped += 1;
      continue;
    }

    failed += 1;
  }

  return { synced, dropped, failed, authPaused, authCode };
}
