const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Pool: PostgresPool } = require('pg');
const { getJwtSecret } = require('../middleware/authAdmin');
const { resetDwPool } = require('./dwDatabase');
const { resetEverestPool } = require('./everestDatabase');

const ENV_PATH = path.resolve(__dirname, '..', '..', '.env');
const SYSTEMS = {
  dw: {
    keys: {
      host: 'DW_DB_HOST',
      port: 'DW_DB_PORT',
      database: 'DW_DB_NAME',
      user: 'DW_DB_USER',
      password: 'DW_DB_PASSWORD',
    },
    defaults: {
      host: '177.126.247.194',
      port: 5437,
      database: 'brownie_3s',
      user: 'admin',
    },
  },
  everest: {
    keys: {
      enabled: 'EVEREST_DB_ENABLED',
      host: 'EVEREST_DB_HOST',
      port: 'EVEREST_DB_PORT',
      database: 'EVEREST_DB_NAME',
      user: 'EVEREST_DB_USER',
      password: 'EVEREST_DB_PASSWORD',
      charset: 'EVEREST_DB_CHARSET',
      timezone: 'EVEREST_STOCK_TIMEZONE',
    },
    defaults: {
      enabled: false,
      host: '',
      port: 3306,
      database: '',
      user: '',
      charset: 'LATIN1_GENERAL_CI',
      timezone: 'America/Fortaleza',
    },
  },
};

let saveQueue = Promise.resolve();

function getSystemDefinition(system) {
  const definition = SYSTEMS[system];
  if (!definition) throw Object.assign(new Error('Sistema de banco invalido.'), { statusCode: 404 });
  return definition;
}

function parseBoolean(value) {
  return value === true || String(value || '').toLowerCase() === 'true';
}

function getEffectiveConfiguration(system) {
  const definition = getSystemDefinition(system);
  const config = {};
  Object.entries(definition.keys).forEach(([field, envKey]) => {
    if (field === 'password') return;
    const fallback = definition.defaults[field];
    const rawValue = process.env[envKey];
    if (field === 'port') config[field] = Number(rawValue || fallback);
    else if (field === 'enabled') config[field] = rawValue === undefined ? fallback : parseBoolean(rawValue);
    else config[field] = String(rawValue ?? fallback ?? '');
  });
  config.passwordConfigured = Boolean(String(process.env[definition.keys.password] || '').trim());
  return config;
}

function normalizeConfiguration(system, input = {}, { useCurrentPassword = true } = {}) {
  const definition = getSystemDefinition(system);
  const current = getEffectiveConfiguration(system);
  const config = {};
  Object.keys(definition.keys).forEach((field) => {
    if (field === 'password') {
      const suppliedPassword = String(input.password ?? '');
      config.password = suppliedPassword || (useCurrentPassword ? String(process.env[definition.keys.password] || '') : '');
    } else if (field === 'port') {
      config.port = Number(input.port ?? current.port);
    } else if (field === 'enabled') {
      config.enabled = input.enabled === undefined ? current.enabled : parseBoolean(input.enabled);
    } else {
      config[field] = String(input[field] ?? current[field] ?? '').trim();
    }
  });
  return config;
}

function validateConfiguration(system, config) {
  const required = ['host', 'database', 'user', 'password'];
  const missing = required.filter((field) => !String(config[field] || '').trim());
  if (missing.length) return `Preencha os campos obrigatorios: ${missing.join(', ')}.`;
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) return 'Informe uma porta valida entre 1 e 65535.';
  if (system === 'everest' && (!config.charset || !config.timezone)) return 'Informe charset e timezone do Everest.';
  return '';
}

function configurationDigest(system, config) {
  const serialized = JSON.stringify({ system, config });
  return crypto.createHmac('sha256', getJwtSecret()).update(serialized).digest('hex');
}

function createValidationToken(system, config, userId) {
  return jwt.sign(
    { purpose: 'database-connection-save', system, userId, digest: configurationDigest(system, config) },
    getJwtSecret(),
    { expiresIn: '5m' }
  );
}

function verifyValidationToken(token, system, config, userId) {
  try {
    const payload = jwt.verify(String(token || ''), getJwtSecret());
    return payload.purpose === 'database-connection-save'
      && payload.system === system
      && Number(payload.userId) === Number(userId)
      && crypto.timingSafeEqual(Buffer.from(payload.digest || ''), Buffer.from(configurationDigest(system, config)));
  } catch (_error) {
    return false;
  }
}

function getBusinessDate(timezone = 'America/Fortaleza', now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch (_error) {
    throw Object.assign(new Error('Timezone invalido.'), { code: 'INVALID_TIMEZONE' });
  }
}

function safeConnectionError(error) {
  const code = String(error?.code || 'CONNECTION_FAILED');
  const messages = {
    '28P01': 'Usuario ou senha recusados pelo PostgreSQL.',
    '3D000': 'Banco de dados nao encontrado.',
    '42P01': 'Tabela necessaria nao encontrada.',
    '42501': 'Usuario sem permissao de leitura na tabela.',
    ER_ACCESS_DENIED_ERROR: 'Usuario ou senha recusados pelo MySQL.',
    ER_BAD_DB_ERROR: 'Banco de dados nao encontrado.',
    ER_NO_SUCH_TABLE: 'Tabela necessaria nao encontrada.',
    ER_TABLEACCESS_DENIED_ERROR: 'Usuario sem permissao de leitura na tabela.',
    ECONNREFUSED: 'Conexao recusada pelo servidor.',
    ETIMEDOUT: 'Tempo limite de conexao excedido.',
    ENOTFOUND: 'Host do banco nao encontrado.',
    INVALID_TIMEZONE: 'Timezone configurado e invalido.',
  };
  return { code, message: messages[code] || 'Nao foi possivel concluir a consulta ao banco.' };
}

async function runStage(logs, name, task) {
  const startedAt = new Date();
  const started = Date.now();
  try {
    const details = await task();
    logs.push({ name, status: 'success', timestamp: startedAt.toISOString(), durationMs: Date.now() - started, message: details?.message || 'Concluido.' });
    return details;
  } catch (error) {
    const safeError = safeConnectionError(error);
    logs.push({ name, status: 'error', timestamp: startedAt.toISOString(), durationMs: Date.now() - started, message: safeError.message, code: safeError.code });
    throw Object.assign(error, { safeError });
  }
}

async function testDwConnection(config, poolFactory = (poolConfig) => new PostgresPool(poolConfig)) {
  const logs = [];
  const businessDate = getBusinessDate();
  const pool = poolFactory({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: 1,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 1000,
  });
  try {
    await runStage(logs, 'Conexao', () => pool.query('SELECT 1'));
    await runStage(logs, 'Tabela de vendas', () => pool.query('SELECT 1 FROM dw.vendas LIMIT 1'));
    await runStage(logs, 'Tabela de produtos', () => pool.query('SELECT 1 FROM dw.produtos LIMIT 1'));
    const latest = await runStage(logs, 'Disponibilidade dos dados', async () => {
      const latestResult = await pool.query('SELECT data_movimento::date AS latest_date FROM dw.vendas WHERE data_movimento IS NOT NULL ORDER BY data_movimento DESC LIMIT 1');
      const countResult = await pool.query('SELECT COUNT(*)::int AS today_count FROM dw.vendas WHERE data_movimento >= $1::date AND data_movimento < $1::date + INTERVAL \'1 day\'', [businessDate]);
      return {
        latestDate: latestResult.rows[0]?.latest_date || null,
        todayCount: Number(countResult.rows[0]?.today_count || 0),
        message: `${Number(countResult.rows[0]?.today_count || 0)} registro(s) na data consultada.`,
      };
    });
    return { success: true, logs, businessDate, latestDate: latest.latestDate, todayCount: latest.todayCount };
  } catch (error) {
    return { success: false, logs, businessDate, error: error.safeError || safeConnectionError(error) };
  } finally {
    await pool.end().catch(() => {});
  }
}

async function testEverestConnection(config, poolFactory) {
  const logs = [];
  let pool;
  let businessDate = null;
  try {
    businessDate = getBusinessDate(config.timezone);
    const createPool = poolFactory || ((poolConfig) => {
      const mysql = require('mysql2/promise');
      return mysql.createPool(poolConfig);
    });
    pool = createPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      charset: config.charset,
      waitForConnections: true,
      connectionLimit: 1,
      connectTimeout: 10000,
      multipleStatements: false,
      decimalNumbers: true,
    });
    await runStage(logs, 'Conexao', () => pool.query('SELECT 1'));
    await runStage(logs, 'Tabela de estoque', () => pool.query('SELECT 1 FROM `525_saldo_estoque` LIMIT 1'));
    const latest = await runStage(logs, 'Disponibilidade dos dados', async () => {
      const [latestRows] = await pool.execute('SELECT dt_base AS latest_date FROM `525_saldo_estoque` WHERE dt_base IS NOT NULL ORDER BY dt_base DESC LIMIT 1');
      const [countRows] = await pool.execute('SELECT COUNT(*) AS today_count FROM `525_saldo_estoque` WHERE dt_base >= ? AND dt_base < DATE_ADD(?, INTERVAL 1 DAY)', [businessDate, businessDate]);
      return {
        latestDate: latestRows[0]?.latest_date || null,
        todayCount: Number(countRows[0]?.today_count || 0),
        message: `${Number(countRows[0]?.today_count || 0)} registro(s) na data consultada.`,
      };
    });
    return { success: true, logs, businessDate, latestDate: latest.latestDate, todayCount: latest.todayCount };
  } catch (error) {
    const safeError = error.safeError || safeConnectionError(error);
    if (!logs.length) logs.push({ name: 'Conexao', status: 'error', timestamp: new Date().toISOString(), durationMs: 0, message: safeError.message, code: safeError.code });
    return { success: false, logs, businessDate, error: safeError };
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}

async function testDatabaseConnection(system, input, userId) {
  const config = normalizeConfiguration(system, input);
  const validationError = validateConfiguration(system, config);
  if (validationError) throw Object.assign(new Error(validationError), { statusCode: 400 });
  const result = system === 'dw' ? await testDwConnection(config) : await testEverestConnection(config);
  if (result.success) result.validationToken = createValidationToken(system, config, userId);
  return result;
}

function envLineValue(value) {
  return JSON.stringify(String(value));
}

function updateEnvContents(contents, updates) {
  let next = contents;
  Object.entries(updates).forEach(([key, value]) => {
    const line = `${key}=${envLineValue(value)}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    next = pattern.test(next) ? next.replace(pattern, line) : `${next.replace(/\s*$/, '')}\n${line}\n`;
  });
  return next;
}

async function persistEnvironment(updates) {
  const operation = saveQueue.then(async () => {
    const current = await fs.readFile(ENV_PATH, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    const temporaryPath = `${ENV_PATH}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporaryPath, updateEnvContents(current, updates), { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporaryPath, ENV_PATH);
  });
  saveQueue = operation.catch(() => {});
  return operation;
}

async function saveDatabaseConnection(system, input, validationToken, userId) {
  const definition = getSystemDefinition(system);
  const config = normalizeConfiguration(system, input);
  const validationError = validateConfiguration(system, config);
  if (validationError) throw Object.assign(new Error(validationError), { statusCode: 400 });
  if (!verifyValidationToken(validationToken, system, config, userId)) {
    throw Object.assign(new Error('Teste a conexao novamente antes de salvar.'), { statusCode: 400 });
  }

  const updates = {};
  Object.entries(definition.keys).forEach(([field, envKey]) => {
    updates[envKey] = field === 'enabled' ? String(config[field]) : String(config[field]);
  });
  await persistEnvironment(updates);
  Object.entries(updates).forEach(([key, value]) => { process.env[key] = value; });
  if (system === 'dw') await resetDwPool();
  else await resetEverestPool();
  return getEffectiveConfiguration(system);
}

module.exports = {
  createValidationToken,
  getEffectiveConfiguration,
  normalizeConfiguration,
  saveDatabaseConnection,
  safeConnectionError,
  testDatabaseConnection,
  testDwConnection,
  testEverestConnection,
  updateEnvContents,
  verifyValidationToken,
};
