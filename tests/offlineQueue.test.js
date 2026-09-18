import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { enqueue, listPending, remove } from '../src/offlineQueue.js';

const sampleRecord = {
  treeId: 'A-023',
  timestamp: '2026-09-18T09:00:00.000Z',
  studentName: '王小明',
  studentClassNo: '土木三甲-12',
  angleDeg: 45,
  distanceM: 10,
  girthCm: 80,
  calculatedHeight: 11.5,
};

describe('offlineQueue', () => {
  beforeEach(async () => {
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('tree-map-offline-queue');
      req.onsuccess = resolve;
      req.onerror = resolve;
      req.onblocked = resolve;
    });
  });

  it('enqueue後應該能在listPending看到該筆紀錄', async () => {
    await enqueue(sampleRecord);
    const pending = await listPending();
    expect(pending.length).toBe(1);
    expect(pending[0].record).toEqual(sampleRecord);
    expect(typeof pending[0].id).toBe('number');
  });

  it('remove後該筆紀錄應該從listPending消失', async () => {
    const id = await enqueue(sampleRecord);
    await remove(id);
    const pending = await listPending();
    expect(pending.find((p) => p.id === id)).toBeUndefined();
  });

  it('可以同時存在多筆待同步紀錄', async () => {
    await enqueue(sampleRecord);
    await enqueue({ ...sampleRecord, treeId: 'A-024' });
    const pending = await listPending();
    expect(pending.length).toBe(2);
  });
});
