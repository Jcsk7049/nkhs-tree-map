// 殼層(app.html)的路由與分頁設定。純函式,不碰 DOM,方便測試。
export const STUDENT_TABS = [{ id: 'measure', label: '量測', page: 'tree.html' }];
export const TEACHER_TABS = [
  { id: 'roster', label: '名單', page: 'roster.html' },
  { id: 'map', label: '地圖', page: 'map.html' },
  { id: 'labels', label: 'QR 標籤', page: 'qrcodes.html' },
];

const ROLES = { student: STUDENT_TABS, teacher: TEACHER_TABS };

export function tabsFor(role) {
  return ROLES[role] || [];
}

const HOME = { role: null, tab: null, treeId: '' };

// 格式:#/<role>[/<tab>][?treeId=…]。任何不認得的內容都當首頁,絕不丟例外。
export function parseHash(hash) {
  const match = String(hash || '').match(/^#\/([^/?]*)(?:\/([^/?]*))?(?:\?(.*))?$/);
  if (!match) return { ...HOME };
  const tabs = tabsFor(match[1]);
  if (tabs.length === 0) return { ...HOME };
  const tab = tabs.some((t) => t.id === match[2]) ? match[2] : tabs[0].id;
  const treeId = new URLSearchParams(match[3] || '').get('treeId') || '';
  return { role: match[1], tab, treeId };
}

export function frameSrc(role, tabId, { treeId = '' } = {}) {
  const tab = tabsFor(role).find((t) => t.id === tabId);
  if (!tab) return null;
  if (role === 'student' && tabId === 'measure') {
    if (!treeId) return null;
    return `./${tab.page}?embed=1&treeId=${encodeURIComponent(treeId)}`;
  }
  return `./${tab.page}?embed=1`;
}

export function buildHash(role, tabId, { treeId = '' } = {}) {
  const base = `#/${role}/${tabId}`;
  return treeId ? `${base}?treeId=${encodeURIComponent(treeId)}` : base;
}
