import { describe, it, expect } from 'vitest';
import { tokenExpirySeconds, decideRestore } from '../src/session.js';

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const NOW = Date.parse('2026-09-19T12:00:00.000Z');
const tokenExpiringIn = (seconds) => `${b64url({ alg: 'RS256' })}.${b64url({ exp: NOW / 1000 + seconds, email: 'a@b.c' })}.sig`;

describe('tokenExpirySeconds', () => {
  it('讀出 JWT payload 的 exp', () => {
    expect(tokenExpirySeconds(tokenExpiringIn(600))).toBe(NOW / 1000 + 600);
  });

  it('格式壞掉、不是字串、沒有 exp 都回 null,不丟例外', () => {
    expect(tokenExpirySeconds('abc')).toBeNull();
    expect(tokenExpirySeconds('a.b.c')).toBeNull();
    expect(tokenExpirySeconds(null)).toBeNull();
    expect(tokenExpirySeconds(`x.${b64url({ email: 'a' })}.y`)).toBeNull();
  });

  it('payload 含中文姓名也讀得到 exp', () => {
    const t = `x.${Buffer.from(JSON.stringify({ name: '王小明', exp: 4102444800 })).toString('base64url')}.y`;
    expect(tokenExpirySeconds(t)).toBe(4102444800);
  });
});

describe('decideRestore(頁面開啟時要不要沿用上次的登入)', () => {
  it('還有效的登入:直接沿用', () => {
    expect(decideRestore({ token: tokenExpiringIn(1800), online: true, nowMs: NOW })).toBe('use');
    expect(decideRestore({ token: tokenExpiringIn(1800), online: false, nowMs: NOW })).toBe('use');
  });

  it('已過期且線上:要求重新登入(不要假裝還在登入)', () => {
    expect(decideRestore({ token: tokenExpiringIn(-60), online: true, nowMs: NOW })).toBe('require-login');
  });

  it('已過期但離線:沿用,讓學生還能填表存進本機佇列', () => {
    expect(decideRestore({ token: tokenExpiringIn(-60), online: false, nowMs: NOW })).toBe('use-offline');
  });

  it('快到期(5 分鐘內)視同過期,避免填到一半就失效', () => {
    expect(decideRestore({ token: tokenExpiringIn(120), online: true, nowMs: NOW })).toBe('require-login');
    expect(decideRestore({ token: tokenExpiringIn(301), online: true, nowMs: NOW })).toBe('use');
  });

  it('讀不出到期時間的 token 視為過期', () => {
    expect(decideRestore({ token: 'garbage', online: true, nowMs: NOW })).toBe('require-login');
    expect(decideRestore({ token: 'garbage', online: false, nowMs: NOW })).toBe('use-offline');
  });
});
