import { calculateTreeHeight } from './calc.js';

export function getTreeIdFromUrl(search) {
  const params = new URLSearchParams(search);
  return params.get('treeId') || '';
}

/**
 * 產生一筆紀錄的用戶端唯一識別碼。
 * 用途:同一筆量測若因雙擊、離線重試、或同步競態而送出多次,後端可憑此值去重
 * (見 apps-script/Code.gs 的 findRowByClientRecordId),避免 Sheet 出現重複列。
 * `crypto.randomUUID` 需要安全內容(https / localhost);非安全內容或舊瀏覽器走備援。
 */
function createClientRecordId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function buildMeasurementRecord(formValues, treeId) {
  const { studentName, studentClassNo, angleDeg, distanceM, girthCm } = formValues;
  return {
    treeId,
    timestamp: new Date().toISOString(),
    studentName,
    studentClassNo,
    angleDeg,
    distanceM,
    girthCm,
    calculatedHeight: calculateTreeHeight(angleDeg, distanceM),
    clientRecordId: createClientRecordId(),
  };
}
