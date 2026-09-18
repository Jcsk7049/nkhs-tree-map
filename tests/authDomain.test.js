import { describe, it, expect } from 'vitest';
import { isAllowedDomain } from '../src/authDomain.js';

describe('isAllowedDomain', () => {
  it('校網域帳號應該通過', () => {
    expect(isAllowedDomain('student@nkhs.edu.tw', 'nkhs.edu.tw')).toBe(true);
  });

  it('非校網域帳號應該被拒絕', () => {
    expect(isAllowedDomain('someone@gmail.com', 'nkhs.edu.tw')).toBe(false);
  });

  it('網域比對應該不分大小寫', () => {
    expect(isAllowedDomain('student@NKHS.EDU.TW', 'nkhs.edu.tw')).toBe(true);
  });

  it('格式不正確的email應該回傳false', () => {
    expect(isAllowedDomain('not-an-email', 'nkhs.edu.tw')).toBe(false);
    expect(isAllowedDomain('', 'nkhs.edu.tw')).toBe(false);
    expect(isAllowedDomain(null, 'nkhs.edu.tw')).toBe(false);
  });
});
