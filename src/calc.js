export function calculateTreeHeight(angleDeg, distanceM, eyeHeightM = 1.5) {
  const angleRad = (angleDeg * Math.PI) / 180;
  const heightAboveEye = distanceM * Math.tan(angleRad);
  const totalHeight = heightAboveEye + eyeHeightM;
  return Math.round(totalHeight * 100) / 100;
}

// 合理範圍上限:必須與 apps-script/Code.gs 的 MAX_DISTANCE_M / MAX_GIRTH_CM / MAX_HEIGHT_M 一致
// (後端一樣會檢查,前端先擋才不會在離線暫存後才被退回)。
const MAX_DISTANCE_M = 500;
const MAX_GIRTH_CM = 2000;
const MAX_HEIGHT_M = 100;

export function validateMeasurementInput({ angleDeg, distanceM, girthCm }) {
  const errors = [];
  const angleOk = angleDeg > 0 && angleDeg < 90;
  let distanceOk = distanceM > 0;

  if (!angleOk) {
    errors.push('角度必須大於0度且小於90度');
  }
  if (!distanceOk) {
    errors.push('水平距離必須大於0');
  } else if (distanceM > MAX_DISTANCE_M) {
    errors.push(`水平距離不可超過${MAX_DISTANCE_M}公尺`);
    distanceOk = false;
  }
  if (!(girthCm > 0)) {
    errors.push('樹圍必須大於0');
  } else if (girthCm > MAX_GIRTH_CM) {
    errors.push(`樹圍不可超過${MAX_GIRTH_CM}公分`);
  }
  if (angleOk && distanceOk && calculateTreeHeight(angleDeg, distanceM) > MAX_HEIGHT_M) {
    errors.push(`算出的樹高超過${MAX_HEIGHT_M}公尺,請確認角度與距離`);
  }

  return { valid: errors.length === 0, errors };
}
