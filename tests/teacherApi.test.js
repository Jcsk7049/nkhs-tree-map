import { describe, it, expect, vi } from 'vitest';
import { callTeacherApi, TeacherApiError } from '../src/teacherApi.js';

const jsonResponse = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: () => Promise.resolve(body) });
const base = { apiUrl: 'https://example.com/exec', idToken: 'tok', action: 'roster-list' };

describe('callTeacherApi', () => {
  it('以 text/plain 送出(避開 Apps Script 無法回應的 CORS preflight),body 含 action、idToken 與參數', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok', students: [] }));
    await callTeacherApi({ ...base, action: 'roster-status', payload: { classNo: '301-12', newStatus: '停用' }, fetchImpl });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://example.com/exec');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('text/plain;charset=utf-8');
    expect(JSON.parse(options.body)).toEqual({ action: 'roster-status', idToken: 'tok', classNo: '301-12', newStatus: '停用' });
  });

  it('status ok 時回傳整個 body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok', students: [{ classNo: '1' }] }));
    expect(await callTeacherApi({ ...base, fetchImpl })).toEqual({ status: 'ok', students: [{ classNo: '1' }] });
  });

  it('後端回錯誤:丟 TeacherApiError,帶 code 與給人看的訊息', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: 'error', code: 'TEACHER_REJECTED', error: '不在教師名單內' }));
    const err = await callTeacherApi({ ...base, fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(TeacherApiError);
    expect(err.code).toBe('TEACHER_REJECTED');
    expect(err.message).toBe('不在教師名單內');
  });

  it('網路錯誤、HTTP 非 2xx、回應不是 JSON:各有明確的 code', async () => {
    const net = await callTeacherApi({ ...base, fetchImpl: vi.fn().mockRejectedValue(new Error('offline')) }).catch((e) => e);
    expect(net.code).toBe('NETWORK_ERROR');
    const http = await callTeacherApi({ ...base, fetchImpl: vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 })) }).catch((e) => e);
    expect(http.code).toBe('HTTP_ERROR');
    const bad = await callTeacherApi({ ...base, fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: () => Promise.reject(new Error('html')) }) }).catch((e) => e);
    expect(bad.code).toBe('BAD_RESPONSE');
  });

  it('status 不是 ok 也沒帶 code 時,不會被當成成功', async () => {
    const err = await callTeacherApi({ ...base, fetchImpl: vi.fn().mockResolvedValue(jsonResponse({ hello: 'x' })) }).catch((e) => e);
    expect(err).toBeInstanceOf(TeacherApiError);
    expect(err.code).toBe('UNKNOWN_ERROR');
  });
});
