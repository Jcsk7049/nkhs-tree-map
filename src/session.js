const EXPIRY_MARGIN_SEC = 300;

// 只讀 payload 的 exp 來判斷「還能不能用」;真正的驗證一律在後端做。
export function tokenExpirySeconds(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const exp = Number(payload && payload.exp);
    return exp > 0 ? exp : null;
  } catch (err) {
    return null;
  }
}

// 頁面開啟時要不要沿用上次存下的登入:
//   use            登入還有效
//   require-login  已過期且線上 → 必須重新登入,別讓學生以為還在登入狀態
//   use-offline    已過期但離線 → 仍沿用,學生才能填完存進本機佇列(補送時再要求登入)
export function decideRestore({ token, online, nowMs, marginSec = EXPIRY_MARGIN_SEC }) {
  const exp = tokenExpirySeconds(token);
  const fresh = exp !== null && exp * 1000 - marginSec * 1000 > nowMs;
  if (fresh) return 'use';
  return online ? 'require-login' : 'use-offline';
}
