export function calculateTreeHeight(angleDeg, distanceM, eyeHeightM = 1.5) {
  const angleRad = (angleDeg * Math.PI) / 180;
  const heightAboveEye = distanceM * Math.tan(angleRad);
  const totalHeight = heightAboveEye + eyeHeightM;
  return Math.round(totalHeight * 100) / 100;
}

export function validateMeasurementInput({ angleDeg, distanceM, girthCm }) {
  const errors = [];

  if (!(angleDeg > 0 && angleDeg < 90)) {
    errors.push('角度必須大於0度且小於90度');
  }
  if (!(distanceM > 0)) {
    errors.push('水平距離必須大於0');
  }
  if (!(girthCm > 0)) {
    errors.push('樹圍必須大於0');
  }

  return { valid: errors.length === 0, errors };
}
