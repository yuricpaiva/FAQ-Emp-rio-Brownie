const { Pool } = require('pg');

let pool;

function getDwPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.DW_DB_HOST || '177.126.247.194',
      port: Number(process.env.DW_DB_PORT || 5437),
      database: process.env.DW_DB_NAME || 'brownie_3s',
      user: process.env.DW_DB_USER || 'admin',
      password: process.env.DW_DB_PASSWORD,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  return pool;
}

async function queryDw(text, params) {
  if (!process.env.DW_DB_PASSWORD) {
    throw new Error('DW_DB_PASSWORD nao configurado');
  }

  return getDwPool().query(text, params);
}

async function resetDwPool() {
  const currentPool = pool;
  pool = undefined;
  if (currentPool) await currentPool.end();
}

module.exports = {
  getDwPool,
  queryDw,
  resetDwPool,
};
