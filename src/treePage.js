import { calculateTreeHeight } from './calc.js';

export function getTreeIdFromUrl(search) {
  const params = new URLSearchParams(search);
  return params.get('treeId') || '';
}

export function buildMeasurementRecord(formValues, treeId) {
  const { studentName, studentClassNo, angleDeg, distanceM, girthCm } = formValues;
  return {
    treeId,
    timestamp: new Date().toISOString(),
    studentName,
    studentClassNo,
    angleDeg,
    distanceM,
    girthCm,
    calculatedHeight: calculateTreeHeight(angleDeg, distanceM),
  };
}
