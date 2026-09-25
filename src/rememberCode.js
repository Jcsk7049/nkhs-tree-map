// 「記住我」:學生在自己的手機勾選後,把學號與通行碼存在這支手機的 localStorage(不上傳)。
// 取捨:存的是明碼,拿到手機又會開開發者工具的人看得到;手機遺失請老師重設通行碼即作廢。
// 共用平板不要勾(預設不勾)。storage 無法使用(無痕模式等)時一律安全失敗。
export const REMEMBER_KEY = 'tree-map-remembered-student';

export function loadRemembered(storage) {
  try {
    const v = JSON.parse(storage.getItem(REMEMBER_KEY));
    return v && typeof v.classNo === 'string' && typeof v.code === 'string' ? { classNo: v.classNo, code: v.code } : null;
  } catch {
    return null;
  }
}

export function saveRemembered(storage, classNo, code) {
  try {
    storage.setItem(REMEMBER_KEY, JSON.stringify({ classNo, code }));
    return true;
  } catch {
    return false;
  }
}

export function forgetRemembered(storage) {
  try {
    storage.removeItem(REMEMBER_KEY);
  } catch {
    // 清不掉也不影響使用
  }
}
