const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const {
  createValidationToken,
  getEffectiveConfiguration,
  testDwConnection,
  testEverestConnection,
  updateEnvContents,
  verifyValidationToken,
} = require('../services/databaseConnectionSettings');

const dwConfig = {
  host: 'localhost',
  port: 5437,
  database: 'brownie_3s',
  user: 'admin',
  password: 'secret',
};

const everestConfig = {
  enabled: true,
  host: 'localhost',
  port: 3306,
  database: 'everest',
  user: 'readonly',
  password: 'secret',
  charset: 'LATIN1_GENERAL_CI',
  timezone: 'America/Fortaleza',
};

test('connection settings never expose the configured password', () => {
  const original = process.env.DW_DB_PASSWORD;
  process.env.DW_DB_PASSWORD = 'must-not-leak';
  try {
    const configuration = getEffectiveConfiguration('dw');
    assert.equal(configuration.passwordConfigured, true);
    assert.equal(Object.hasOwn(configuration, 'password'), false);
    assert.equal(JSON.stringify(configuration).includes('must-not-leak'), false);
  } finally {
    if (original === undefined) delete process.env.DW_DB_PASSWORD;
    else process.env.DW_DB_PASSWORD = original;
  }
});

test('validation token is bound to the user and exact configuration', () => {
  const token = createValidationToken('dw', dwConfig, 17);
  assert.equal(verifyValidationToken(token, 'dw', dwConfig, 17), true);
  assert.equal(verifyValidationToken(token, 'dw', { ...dwConfig, port: 5438 }, 17), false);
  assert.equal(verifyValidationToken(token, 'dw', dwConfig, 18), false);
});

test('env updater preserves unrelated keys and replaces only selected values', () => {
  const original = 'PORT=4000\nDW_DB_HOST="old"\nJWT_SECRET="keep-me"\n';
  const updated = updateEnvContents(original, { DW_DB_HOST: 'new-host', DW_DB_PORT: '5437' });
  assert.match(updated, /^PORT=4000/m);
  assert.match(updated, /^JWT_SECRET="keep-me"/m);
  assert.match(updated, /^DW_DB_HOST="new-host"/m);
  assert.match(updated, /^DW_DB_PORT="5437"/m);
  assert.equal(updated.includes('DW_DB_HOST="old"'), false);
});

test('DW test validates tables and returns safe availability metadata', async () => {
  let ended = false;
  const fakePool = {
    async query(sql) {
      if (sql.includes('ORDER BY data_movimento')) return { rows: [{ latest_date: '2026-07-15' }] };
      if (sql.includes('COUNT(*)')) return { rows: [{ today_count: 12 }] };
      return { rows: [{ ok: 1 }] };
    },
    async end() { ended = true; },
  };
  const result = await testDwConnection(dwConfig, () => fakePool);
  assert.equal(result.success, true);
  assert.equal(result.todayCount, 12);
  assert.equal(result.logs.length, 4);
  assert.equal(ended, true);
});

test('DW test sanitizes authentication failures', async () => {
  const fakePool = {
    async query() { throw Object.assign(new Error('raw password detail'), { code: '28P01' }); },
    async end() {},
  };
  const result = await testDwConnection(dwConfig, () => fakePool);
  assert.equal(result.success, false);
  assert.equal(result.error.code, '28P01');
  assert.equal(JSON.stringify(result).includes('raw password detail'), false);
});

test('Everest test validates the stock table and closes its temporary pool', async () => {
  let ended = false;
  const fakePool = {
    async query() { return [[{ ok: 1 }]]; },
    async execute(sql) {
      if (sql.includes('ORDER BY dt_base')) return [[{ latest_date: '2026-07-16' }]];
      return [[{ today_count: 31 }]];
    },
    async end() { ended = true; },
  };
  const result = await testEverestConnection(everestConfig, () => fakePool);
  assert.equal(result.success, true);
  assert.equal(result.todayCount, 31);
  assert.equal(result.logs.length, 3);
  assert.equal(ended, true);
});
