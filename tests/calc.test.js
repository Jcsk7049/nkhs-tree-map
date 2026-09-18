import { describe, it, expect } from 'vitest';
import { calculateTreeHeight, validateMeasurementInput } from '../src/calc.js';

describe('calculateTreeHeight', () => {
  it('45度角、距離10公尺時,樹高應為距離+眼高', () => {
    // tan(45deg) = 1, so height above eye = distance * 1 = 10
    const height = calculateTreeHeight(45, 10, 1.5);
    expect(height).toBeCloseTo(11.5, 2);
  });

  it('0度角時,樹高等於眼高', () => {
    const height = calculateTreeHeight(0, 10, 1.5);
    expect(height).toBeCloseTo(1.5, 2);
  });

  it('未指定眼高時預設為1.5公尺', () => {
    const height = calculateTreeHeight(45, 10);
    expect(height).toBeCloseTo(11.5, 2);
  });

  it('60度角、距離5公尺', () => {
    // tan(60deg) ≈ 1.7320508, height above eye ≈ 8.6603
    const height = calculateTreeHeight(60, 5, 1.5);
    expect(height).toBeCloseTo(10.16, 2);
  });
});

describe('validateMeasurementInput', () => {
  it('合法輸入應通過驗證', () => {
    const result = validateMeasurementInput({ angleDeg: 45, distanceM: 10, girthCm: 80 });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('角度為0應該不合法', () => {
    const result = validateMeasurementInput({ angleDeg: 0, distanceM: 10, girthCm: 80 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('角度必須大於0度且小於90度');
  });

  it('角度為90應該不合法', () => {
    const result = validateMeasurementInput({ angleDeg: 90, distanceM: 10, girthCm: 80 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('角度必須大於0度且小於90度');
  });

  it('距離為0或負數應該不合法', () => {
    const result = validateMeasurementInput({ angleDeg: 45, distanceM: 0, girthCm: 80 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('水平距離必須大於0');
  });

  it('樹圍為0或負數應該不合法', () => {
    const result = validateMeasurementInput({ angleDeg: 45, distanceM: 10, girthCm: -1 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('樹圍必須大於0');
  });

  it('多個欄位同時不合法應回傳多個錯誤訊息', () => {
    const result = validateMeasurementInput({ angleDeg: 0, distanceM: -5, girthCm: 0 });
    expect(result.errors.length).toBe(3);
  });
});
