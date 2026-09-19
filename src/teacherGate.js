import { callTeacherApi, TeacherApiError } from './teacherApi.js';
import { decideRestore } from './session.js';

const TOKEN_KEY = 'tree-map-teacher-token';
const AUTH_ERRORS = ['AUTH_EXPIRED', 'AUTH_REJECTED'];

function waitForGoogle(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('Google 登入元件載入逾時'));
      }
    }, 100);
  });
}

function saved() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch (err) {
    return null;
  }
}

function store(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch (err) {
    // 存不了只是重新整理後要再登入一次。
  }
}

/**
 * 教師頁閘門:頁面需有 #gate(登入區,內含 #gate-status、#gate-button)與 #gated(登入後才顯示的內容)。
 * 只有 Google 登入且 email 在後端「教師名單」內才會解鎖;每次開頁都會向後端確認,不是只看本機。
 *
 * 誠實說明:這道閘門擋的是「介面」。靜態網站的檔案本身仍可被下載,真正受保護的是後端
 * (學生名單、通行碼、寫入權限),沒有老師身分的請求一律被後端拒絕。
 * @returns {Promise<{email: string, idToken: string, call: (action: string, payload?: object) => Promise<object>}>}
 */
export function requireTeacher({ apiUrl, clientId }) {
  const gate = document.getElementById('gate');
  const gated = document.getElementById('gated');
  const statusEl = document.getElementById('gate-status');
  const buttonEl = document.getElementById('gate-button');

  return new Promise((resolve) => {
    function unlock(email, idToken) {
      gate.hidden = true;
      gated.hidden = false;
      resolve({
        email,
        idToken,
        async call(action, payload) {
          try {
            return await callTeacherApi({ apiUrl, idToken, action, payload });
          } catch (err) {
            if (err instanceof TeacherApiError && AUTH_ERRORS.includes(err.code)) {
              store(null);
              err.message = '登入已過期,請重新整理頁面重新登入';
            }
            throw err;
          }
        },
      });
    }

    async function verify(idToken) {
      statusEl.textContent = '驗證教師身分中…';
      try {
        const { email } = await callTeacherApi({ apiUrl, idToken, action: 'teacher-check' });
        store(idToken);
        unlock(email, idToken);
        return true;
      } catch (err) {
        store(null);
        statusEl.textContent = err instanceof TeacherApiError ? err.message : '驗證失敗,請重新整理頁面再試';
        return false;
      }
    }

    async function startSignIn() {
      statusEl.textContent = statusEl.textContent || '請用教師的 Google 帳號登入。';
      try {
        await waitForGoogle();
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response && response.credential) verify(response.credential);
            else statusEl.textContent = '登入失敗,請再試一次。';
          },
        });
        window.google.accounts.id.renderButton(buttonEl, { theme: 'outline', size: 'large', text: 'signin_with' });
      } catch (err) {
        statusEl.textContent = '目前無法連上 Google 登入服務,請確認網路後重新整理頁面。';
      }
    }

    (async () => {
      const token = saved();
      if (token && decideRestore({ token, online: true, nowMs: Date.now() }) === 'use') {
        if (await verify(token)) return;
      } else if (token) {
        store(null);
        statusEl.textContent = '登入已過期,請重新登入。';
      }
      startSignIn();
    })();
  });
}
