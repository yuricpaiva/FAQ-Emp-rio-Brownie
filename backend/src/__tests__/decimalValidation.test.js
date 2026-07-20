const test = require('node:test');
const assert = require('node:assert/strict');

const { hasAtMostFourDecimalPlaces, normalizeDecimalText } = require('../utils/decimal');

test('decimal validation accepts comma, point and at most four decimal places', () => {
  for (const value of [0, '0', '12', '1,2', '1.2345', '0,0001']) {
    assert.equal(hasAtMostFourDecimalPlaces(value), true, String(value));
  }

  for (const value of ['', '1,2.3', 'abc', '-1', '1.23456', '1,23000']) {
    assert.equal(hasAtMostFourDecimalPlaces(value), false, String(value));
  }

  assert.equal(normalizeDecimalText(' 1,2345 '), '1.2345');
});
