const decimalPattern = /^\d+(?:\.\d{0,4})?$/;

function normalizeDecimalText(value) {
  return String(value ?? '').trim().replace(',', '.');
}

function hasAtMostFourDecimalPlaces(value) {
  const normalized = normalizeDecimalText(value);
  return decimalPattern.test(normalized);
}

module.exports = {
  hasAtMostFourDecimalPlaces,
  normalizeDecimalText,
};
