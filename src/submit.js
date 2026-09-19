import { enqueue, listPending, remove } from './offlineQueue.js';

/**
 * Apps Script 的 ContentService 無法設定非 200 的 HTTP 狀態碼 —— 就算後端拒絕了請求,
 * 瀏覽器看到的仍是 200 / `response.ok === true`。因此「成功」必須由 JSON body 明確宣告:
 * 只有 `{ status: 'ok' }` 才算送達,其他一律視為失敗。
 */
const SUCCESS_STATUS = 'ok';

/**
 * 後端的「永久拒絕」代碼:重送一百次也不會成功,必須移出離線佇列(見 syncPendingQueue),避免無限重試。
 *   VALIDATION_FAILED — 資料本身不合法。前端送出前已跑過同一套驗證,真的發生代表資料壞了。
 *   STUDENT_REJECTED  — 班級座號/通行碼錯誤,或這位同學已被老師停用。內容不變就永遠是同樣的結果。
 */
const NON_RETRYABLE_CODES = ['VALIDATION_FAILED', 'STUDENT_REJECTED'];

/**
 * 同一班級座號連續輸入錯誤太多次,後端暫時鎖定。這是「稍後就會好」的狀況:
 *   - 在同步佇列裡:視為暫時性失敗,資料保留(鎖定解除後才補得回來)。
 *   - 在學生剛按下送出時:當場告訴學生、不入佇列 —— 否則會把通行碼明碼存在本機,
 *     等一個必然失敗的重送,學生也不知道自己被鎖住了。
 */
export const STUDENT_LOCKED_CODE = 'STUDENT_LOCKED';

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
    return { ok: true, studentName: body.studentName };
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
 * @returns {Promise<{ status: 'sent' | 'queued' | 'rejected', code?: string, error?: string, studentName?: string }>}
 *   - `sent`:後端明確回 `{status:'ok'}`,並帶回名簿裡的填寫人姓名
 *   - `queued`:暫時性失敗(離線、伺服器錯誤),已存進本機佇列等之後同步
 *   - `rejected`:後端永久拒絕(資料不合法、通行碼錯/被停用),或學生被暫時鎖定 → 不入佇列,必須讓使用者知道
 */
export async function submitMeasurement(record, fetchImpl, apiUrl) {
  const result = await postRecord(record, fetchImpl, apiUrl);

  if (result.ok) {
    return { status: 'sent', studentName: result.studentName };
  }

  if (!result.retryable || result.code === STUDENT_LOCKED_CODE) {
    return { status: 'rejected', code: result.code, error: result.error };
  }

  await enqueue(record);
  return { status: 'queued', code: result.code, error: result.error };
}

/**
 * 逐筆嘗試送出佇列中的待同步紀錄。
 * @returns {Promise<{ synced: number, dropped: number, failed: number }>}
 *   - `synced`:送達並已移出佇列
 *   - `dropped`:被後端永久拒絕(資料不合法、通行碼錯/被停用)而移出佇列
 *   - `failed`:暫時性失敗(離線、伺服器錯誤、學生被暫時鎖定),仍留在佇列等下次重試
 *
 * 為什麼 `dropped` 的紀錄要「丟掉」而不是無限重試:
 * 內容不變的情況下重送永遠得到同樣的拒絕。若留在佇列,每次 `online` 事件都會重打一次後端,
 * 形成永久的無效流量,還會累計該學生的失敗次數把他鎖住。因此刻意移除 ——
 * 但一定要把 `dropped` 的數字往上回報給 UI,不能無聲吃掉學生的資料。
 */
export async function syncPendingQueue(fetchImpl, apiUrl) {
  const pending = await listPending();
  let synced = 0;
  let dropped = 0;
  let failed = 0;

  for (const item of pending) {
    const result = await postRecord(item.record, fetchImpl, apiUrl);

    if (result.ok) {
      await remove(item.id);
      synced += 1;
    } else if (!result.retryable) {
      await remove(item.id);
      dropped += 1;
    } else {
      failed += 1;
    }
  }

  return { synced, dropped, failed };
}
