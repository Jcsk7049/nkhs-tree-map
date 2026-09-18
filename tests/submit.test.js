import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitMeasurement, syncPendingQueue } from '../src/submit.js';
import { listPending } from '../src/offlineQueue.js';

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

beforeEach(async () => {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('tree-map-offline-queue');
    req.onsuccess = resolve;
    req.onerror = resolve;
    req.onblocked = resolve;
  });
});

describe('submitMeasurement', () => {
  it('fetch成功時應直接回傳sent,不進佇列', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    const result = await submitMeasurement(sampleRecord, mockFetch, 'https://example.com/api');
    expect(result.status).toBe('sent');
    expect(mockFetch).toHaveBeenCalledOnce();
    const pending = await listPending();
    expect(pending.length).toBe(0);
  });

  it('fetch失敗(網路錯誤拋出例外)時應存入離線佇列', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('network error'));
    const result = await submitMeasurement(sampleRecord, mockFetch, 'https://example.com/api');
    expect(result.status).toBe('queued');
    const pending = await listPending();
    expect(pending.length).toBe(1);
    expect(pending[0].record).toEqual(sampleRecord);
  });

  it('fetch回應ok為false時應存入離線佇列', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const result = await submitMeasurement(sampleRecord, mockFetch, 'https://example.com/api');
    expect(result.status).toBe('queued');
    const pending = await listPending();
    expect(pending.length).toBe(1);
  });
});

describe('syncPendingQueue', () => {
  it('佇列為空時回傳synced:0, failed:0', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    const result = await syncPendingQueue(mockFetch, 'https://example.com/api');
    expect(result).toEqual({ synced: 0, failed: 0 });
  });

  it('佇列中的紀錄同步成功後應從佇列移除', async () => {
    const failingFetch = vi.fn().mockRejectedValue(new Error('offline'));
    await submitMeasurement(sampleRecord, failingFetch, 'https://example.com/api');

    const succeedingFetch = vi.fn().mockResolvedValue({ ok: true });
    const result = await syncPendingQueue(succeedingFetch, 'https://example.com/api');

    expect(result).toEqual({ synced: 1, failed: 0 });
    const pending = await listPending();
    expect(pending.length).toBe(0);
  });

  it('同步失敗的紀錄應保留在佇列中', async () => {
    const failingFetch = vi.fn().mockRejectedValue(new Error('offline'));
    await submitMeasurement(sampleRecord, failingFetch, 'https://example.com/api');

    const stillFailingFetch = vi.fn().mockRejectedValue(new Error('still offline'));
    const result = await syncPendingQueue(stillFailingFetch, 'https://example.com/api');

    expect(result).toEqual({ synced: 0, failed: 1 });
    const pending = await listPending();
    expect(pending.length).toBe(1);
  });
});
