// 與 apps-script/Code.gs 的同名函式演算法必須一致(tests/studentCode.test.js 會拿真的 Code.gs 對照)。
// 前端也要會檢查:離線時學生打錯通行碼,不必等到補送才被後端退回。
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_BODY_LENGTH = 6;
// 權重都與 30 互質,所以任何「單一字元打錯」的加權和一定會變,檢查碼一定對不上。
const CODE_WEIGHTS = [1, 7, 11, 13, 17, 19];

export function normalizeClassNo(value) {
  return String(value ?? '').replace(/\s+/g, '').toUpperCase();
}

export function normalizeCode(value) {
  return String(value ?? '').replace(/[\s-]+/g, '').toUpperCase();
}

export function checkChar(body) {
  let sum = 0;
  for (let i = 0; i < CODE_BODY_LENGTH; i += 1) {
    sum += CODE_WEIGHTS[i] * CODE_ALPHABET.indexOf(body.charAt(i));
  }
  return CODE_ALPHABET.charAt(sum % CODE_ALPHABET.length);
}

export function isValidCodeFormat(code) {
  if (typeof code !== 'string' || code.length !== CODE_BODY_LENGTH + 1) return false;
  for (const ch of code) {
    if (!CODE_ALPHABET.includes(ch)) return false;
  }
  return checkChar(code.slice(0, CODE_BODY_LENGTH)) === code.charAt(CODE_BODY_LENGTH);
}
