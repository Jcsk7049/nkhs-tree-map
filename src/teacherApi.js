export class TeacherApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TeacherApiError';
    this.code = code;
  }
}

// Content-Type 用 text/plain:application/json 會觸發 CORS preflight,而 Apps Script 不會回應 preflight。
export async function callTeacherApi({ apiUrl, idToken, action, payload = {}, fetchImpl = fetch, timeoutMs = 30000 }) {
  let response;
  // Apps Script 偶爾很慢或不回應:設上限,不要讓畫面永遠停在「處理中」。
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    response = await fetchImpl(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, idToken, ...payload }),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new TeacherApiError('TIMEOUT', '伺服器太久沒有回應,請稍後重新整理頁面再試');
    }
    throw new TeacherApiError('NETWORK_ERROR', '無法連上伺服器,請確認網路後再試');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new TeacherApiError('HTTP_ERROR', `伺服器回應失敗(${response.status})`);
  }

  let body;
  try {
    body = await response.json();
  } catch (err) {
    throw new TeacherApiError('BAD_RESPONSE', '伺服器回應格式無法解析');
  }
  if (body && body.status === 'ok') return body;
  throw new TeacherApiError((body && body.code) || 'UNKNOWN_ERROR', (body && body.error) || '伺服器拒絕了這個請求');
}
