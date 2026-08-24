export function normalizeRateCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "-");
}

export function isPositiveOmrRate(value: string) {
  return /^\d+(\.\d{1,2})?$/.test(value.trim()) && Number(value) > 0;
}
