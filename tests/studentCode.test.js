import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { normalizeClassNo, normalizeCode, isValidCodeFormat, checkChar } from '../src/studentCode.js';

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

describe('normalizeClassNo / normalizeCode', () => {
  it('班級座號:去掉所有空白、轉大寫', () => {
    expect(normalizeClassNo(' 3a 01 -12 ')).toBe('3A01-12');
    expect(normalizeClassNo(null)).toBe('');
  });

  it('通行碼:去掉空白與連字號、轉大寫', () => {
    expect(normalizeCode(' k7m-2qx-4 ')).toBe('K7M2QX4');
    expect(normalizeCode(undefined)).toBe('');
  });
});

describe('isValidCodeFormat', () => {
  it('長度不對、含易混字元(0/O/1/I)、檢查碼不符都無效', () => {
    expect(isValidCodeFormat('ABC')).toBe(false);
    expect(isValidCodeFormat('0000000')).toBe(false);
    expect(isValidCodeFormat('AAAAAAA')).toBe(false);
    expect(isValidCodeFormat(null)).toBe(false);
  });

  it('自己組一個合法的碼:6 碼 + 對應的檢查碼', () => {
    const body = 'K7M2QX';
    expect(isValidCodeFormat(body + checkChar(body))).toBe(true);
  });
});

// 前端與後端各有一份檢查碼演算法(前端要在離線時就能抓打錯字)。
// 這裡直接載入「真正的」Code.gs,確認兩邊對同一批碼的判斷完全一致。
describe('與 apps-script/Code.gs 的演算法一致', () => {
  const sandbox = { Utilities: { getUuid: () => randomUUID() } };
  vm.runInNewContext(readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), sandbox);

  it('後端產生的 200 組碼,前端都判定有效', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(isValidCodeFormat(sandbox.generateCode())).toBe(true);
    }
  });

  it('每個單字元錯誤,前後端的判定結果都相同(都無效)', () => {
    for (let n = 0; n < 20; n += 1) {
      const code = sandbox.generateCode();
      for (let pos = 0; pos < 7; pos += 1) {
        for (const alt of ALPHABET) {
          if (alt === code[pos]) continue;
          const typo = code.slice(0, pos) + alt + code.slice(pos + 1);
          expect(isValidCodeFormat(typo)).toBe(false);
          expect(sandbox.isValidCodeFormat(typo)).toBe(false);
        }
      }
    }
  });

  it('隨機字串:前後端判定永遠相同', () => {
    for (let i = 0; i < 500; i += 1) {
      let s = '';
      for (let j = 0; j < 7; j += 1) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      expect(isValidCodeFormat(s)).toBe(sandbox.isValidCodeFormat(s));
    }
  });

  it('前後端的正規化規則相同', () => {
    for (const s of [' k7m-2qx-4 ', 'ABC def', '', 'a-b-c', '  301-12  ']) {
      expect(normalizeCode(s)).toBe(sandbox.normalizeCode(s));
      expect(normalizeClassNo(s)).toBe(sandbox.normalizeClassNo(s));
    }
  });
});
