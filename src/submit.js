import { enqueue, listPending, remove } from './offlineQueue.js';

async function postRecord(record, fetchImpl, apiUrl) {
  const response = await fetchImpl(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  if (!response.ok) {
    throw new Error(`API回應失敗: ${response.status}`);
  }
}

export async function submitMeasurement(record, fetchImpl, apiUrl) {
  try {
    await postRecord(record, fetchImpl, apiUrl);
    return { status: 'sent' };
  } catch (err) {
    await enqueue(record);
    return { status: 'queued' };
  }
}

export async function syncPendingQueue(fetchImpl, apiUrl) {
  const pending = await listPending();
  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      await postRecord(item.record, fetchImpl, apiUrl);
      await remove(item.id);
      synced += 1;
    } catch (err) {
      failed += 1;
    }
  }

  return { synced, failed };
}
