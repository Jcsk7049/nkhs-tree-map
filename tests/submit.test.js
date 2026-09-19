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

/**
 * Apps Script 的 ContentService 一律回 HTTP 200,成功與失敗只能靠 JSON body 區分,
 * 因此所有 mock 回應都必須提供 `json()`,模擬真實的後端契約。
 */
function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: () => Promise.resolve(body) };
}

const okResponse = () => jsonResponse({ status: 'ok' });

beforeEach(async () => {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('tree-map-offline-queue');
    req.onsuccess = resolve;
    req.onerror = resolve;
    req.onblocked = resolve;
  });
});

describe('submitMeasurement', () => {
  it('伺服器回 {status:"ok"} 時應直接回傳sent,不進佇列', async () => {
    const mockFetch = vi.fn().mockResolvedValue(okResponse());
    const result = await submitMeasurement(sampleRecord, mockFetch, 'https://example.com/api');
    expect(result.status).toBe('sent');
    expect(mockFetch).toHaveBeenCalledOnce();
    const pending = await listPending();
    expect(pending.length).toBe(0);
  });

  it('送出時 Content-Type 必須是簡單請求類型,避免觸發 Apps Script 無法回應的 CORS preflight', async () => {
    const mockFetch = vi.fn().mockResolvedValue(okResponse());
    await submitMeasurement(sampleRecord, mockFetch, 'https://example.com/api');
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Content-Type']).toBe('text/plain;charset=utf-8');
    expect(JSON.parse(options.body)).toEqual(sampleRecord);
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

  it('HTTP 200 但 body 不是 {status:"ok"} 時應視為失敗並存入佇列', async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ error: '非校網域帳號,拒絕存取' }));
    const result = await submitMeasurement(sampleRecord, mockFetch, 'https://example.com/api');
    expect(result.status).toBe('queued');
    const pending = await listPending();
    expect(pending.length).toBe(1);
  });

  it('回應不是合法 JSON 時應視為失敗並存入佇列', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    });
    const result = await submitMeasurement(sampleRecord, mockFetch, 'https://example.com/api');
    expect(result.status).toBe('queued');
    expect((await listPending()).length).toBe(1);
  });

  it('伺服器回 VALIDATION_FAILED 時應回報 rejected 且不入佇列(重試也不會成功)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse({ status: 'error', code: 'VALIDATION_FAILED', error: '角度必須大於0度且小於90度' })
    );
    const result = await submitMeasurement(sampleRecord, mockFetch, 'https://example.com/api');
    expect(result.status).toBe('rejected');
    expect(result.code).toBe('VALIDATION_FAILED');
    expect((await listPending()).length).toBe(0);
  });

  it('送出成功時帶回後端確認的填寫人姓名(名簿裡的,不是前端自己填的)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok', studentName: '王小明' }));
    const result = await submitMeasurement(sampleRecord, mockFetch, 'https://example.com/api');
    expect(result).toEqual({ status: 'sent', studentName: '王小明' });
  });

  it('STUDENT_REJECTED(班級座號/通行碼錯或被停用)→ rejected 且不入佇列:重送也不會變好', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse({ status: 'error', code: 'STUDENT_REJECTED', error: '班級座號或通行碼錯誤' })
    );
    const result = await submitMeasurement(sampleRecord, mockFetch, 'https://example.com/api');
    expect(result.status).toBe('rejected');
    expect(result.code).toBe('STUDENT_REJECTED');
    expect((await listPending()).length).toBe(0);
  });

  it('STUDENT_LOCKED(連錯太多次被暫時鎖定)→ 當場告訴學生,不入佇列(否則會把明碼存在本機等一個必敗的重送)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse({ status: 'error', code: 'STUDENT_LOCKED', error: '請 10 分鐘後再試' })
    );
    const result = await submitMeasurement(sampleRecord, mockFetch, 'https://example.com/api');
    expect(result).toEqual({ status: 'rejected', code: 'STUDENT_LOCKED', error: '請 10 分鐘後再試' });
    expect((await listPending()).length).toBe(0);
  });
});

describe('syncPendingQueue', () => {
  async function queueOne(record = sampleRecord) {
    const failingFetch = vi.fn().mockRejectedValue(new Error('offline'));
    await submitMeasurement(record, failingFetch, 'https://example.com/api');
  }

  it('佇列為空時各計數皆為0', async () => {
    const mockFetch = vi.fn().mockResolvedValue(okResponse());
    const result = await syncPendingQueue(mockFetch, 'https://example.com/api');
    expect(result).toEqual({ synced: 0, dropped: 0, failed: 0 });
  });

  it('佇列中的紀錄同步成功後應從佇列移除', async () => {
    await queueOne();

    const succeedingFetch = vi.fn().mockResolvedValue(okResponse());
    const result = await syncPendingQueue(succeedingFetch, 'https://example.com/api');

    expect(result).toEqual({ synced: 1, dropped: 0, failed: 0 });
    expect((await listPending()).length).toBe(0);
  });

  it('同步失敗(網路錯誤)的紀錄應保留在佇列中等下次重試', async () => {
    await queueOne();

    const stillFailingFetch = vi.fn().mockRejectedValue(new Error('still offline'));
    const result = await syncPendingQueue(stillFailingFetch, 'https://example.com/api');

    expect(result).toEqual({ synced: 0, dropped: 0, failed: 1 });
    expect((await listPending()).length).toBe(1);
  });

  it('被伺服器判定 VALIDATION_FAILED 的紀錄應移出佇列,不再無限重試', async () => {
    await queueOne();

    const rejectingFetch = vi.fn().mockResolvedValue(
      jsonResponse({ status: 'error', code: 'VALIDATION_FAILED', error: '水平距離必須大於0' })
    );
    const result = await syncPendingQueue(rejectingFetch, 'https://example.com/api');

    expect(result).toEqual({ synced: 0, dropped: 1, failed: 0 });
    expect((await listPending()).length).toBe(0);
  });

  it('STUDENT_REJECTED 的紀錄視為永久拒絕:移出佇列並計入 dropped(通行碼錯/被停用,重送不會變好)', async () => {
    await queueOne();

    const rejectedFetch = vi.fn().mockResolvedValue(
      jsonResponse({ status: 'error', code: 'STUDENT_REJECTED', error: '班級座號或通行碼錯誤' })
    );
    const result = await syncPendingQueue(rejectedFetch, 'https://example.com/api');

    expect(result).toEqual({ synced: 0, dropped: 1, failed: 0 });
    expect((await listPending()).length).toBe(0);
  });

  it('STUDENT_LOCKED 的紀錄留在佇列(只是暫時鎖住),而且不影響同一批其他同學的紀錄', async () => {
    await queueOne({ ...sampleRecord, studentClassNo: '301-12' });
    await queueOne({ ...sampleRecord, studentClassNo: '301-13', treeId: 'A-024' });

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'error', code: 'STUDENT_LOCKED', error: '鎖定中' }))
      .mockResolvedValueOnce(okResponse());
    const result = await syncPendingQueue(fetchImpl, 'https://example.com/api');

    expect(result).toEqual({ synced: 1, dropped: 0, failed: 1 });
    const remaining = await listPending();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].record.studentClassNo).toBe('301-12');
  });

  it('離線排隊的紀錄要把班級座號與通行碼一起帶著,補送時後端才驗得了身分', async () => {
    const recordWithCode = { ...sampleRecord, studentClassNo: '301-12', studentCode: 'K7M2QX4' };
    await queueOne(recordWithCode);

    const pendingBeforeSync = await listPending();
    expect(pendingBeforeSync[0].record).toEqual(recordWithCode);

    const succeedingFetch = vi.fn().mockResolvedValue(okResponse());
    const result = await syncPendingQueue(succeedingFetch, 'https://example.com/api');

    expect(result.synced).toBe(1);
    const [, options] = succeedingFetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual(recordWithCode);
    expect((await listPending()).length).toBe(0);
  });

  it('混合結果應分別計數', async () => {
    await queueOne();
    await queueOne({ ...sampleRecord, treeId: 'A-024' });
    await queueOne({ ...sampleRecord, treeId: 'A-025' });

    const mixedFetch = vi
      .fn()
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(jsonResponse({ status: 'error', code: 'VALIDATION_FAILED', error: 'bad' }))
      .mockRejectedValueOnce(new Error('offline'));

    const result = await syncPendingQueue(mixedFetch, 'https://example.com/api');

    expect(result).toEqual({ synced: 1, dropped: 1, failed: 1 });
    expect((await listPending()).length).toBe(1);
  });
});
