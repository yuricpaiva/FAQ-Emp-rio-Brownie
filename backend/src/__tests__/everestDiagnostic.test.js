const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildEverestDiagnosticReport,
  normalizeCode,
  normalizeText,
} = require('../services/everestDiagnostic');

test('Everest diagnostic highlights exact and normalized store and product matches', () => {
  const report = buildEverestDiagnosticReport({
    snapshot: {
      server: { database_name: 'everest', server_version: '8.0', server_now: '2026-07-18 10:00:00' },
      stockDate: '2026-07-18',
      latestStockDate: '2026-07-17',
      sampleDate: '2026-07-17',
      requestedDateRowCount: 0,
      summary: { rowCount: 2, storeCount: 1, productCount: 2 },
      stores: [{ fantasia: 'EMPORIO ALDEOTA', rowCount: 2 }],
      products: [{ cdItem: '123', rowCount: 1 }, { cdItem: '456', rowCount: 1 }],
      rows: [{ dtBase: '2026-07-17', fantasia: 'EMPORIO ALDEOTA', cdItem: '123', stockQuantity: 4 }],
      duplicates: [],
      limits: { stores: 200, products: 5000, rows: 100, duplicates: 100 },
    },
    stores: [{ displayName: 'Emporio Aldeota', sourceName: 'EMPORIO ALDEOTA' }],
    products: [
      { code: '00123', name: 'Brownie' },
      { code: '999', name: 'Produto sem saldo' },
    ],
    configuration: {
      enabled: true,
      host: 'localhost',
      port: 3306,
      database: 'everest',
      user: 'readonly',
      charset: 'LATIN1_GENERAL_CI',
      timezone: 'America/Fortaleza',
      passwordConfigured: true,
    },
    generatedBy: 'authenticated-admin',
  });

  assert.equal(report.storeMatching[0].exactDisplayNameMatch, false);
  assert.deepEqual(report.storeMatching[0].normalizedDisplayNameCandidates, ['EMPORIO ALDEOTA']);
  assert.equal(report.storeMatching[0].exactSourceNameMatch, true);
  assert.equal(report.productMatching[0].exactMatch, false);
  assert.deepEqual(report.productMatching[0].normalizedCandidates, ['123']);
  assert.equal(report.productMatching[1].normalizedCandidates.length, 0);
  assert.equal(report.connection.passwordConfigured, true);
  assert.equal(Object.hasOwn(report.connection, 'password'), false);
  assert.ok(report.warnings.some((warning) => warning.includes('data atual')));
});

test('Everest diagnostic normalizers handle accents, whitespace and leading zeroes', () => {
  assert.equal(normalizeText('  Empório   Aldeota '), 'EMPORIO ALDEOTA');
  assert.equal(normalizeCode('000123'), '123');
  assert.equal(normalizeCode('AB-001'), 'AB-001');
});
