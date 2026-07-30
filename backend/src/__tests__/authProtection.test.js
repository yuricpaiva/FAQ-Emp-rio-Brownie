const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'auth-protection-test-secret';
process.env.TRUST_PROXY = 'true';

const app = require('../app');
const {
  MAX_LOCK_MS,
  nextThrottleState,
  getThrottleIdentity
} = require('../services/loginThrottle');

const prisma = new PrismaClient();

function addMilliseconds(date, milliseconds) {
  return new Date(date.getTime() + milliseconds);
}

function cookieFrom(response) {
  return response.headers.get('set-cookie')?.split(';')[0] || '';
}

async function request(base, path, {
  method = 'GET',
  cookie,
  body,
  ip = '198.51.100.77'
} = {}) {
  const headers = { 'X-Forwarded-For': ip };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  return fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

test('progressão dobra bloqueios, respeita o teto e reinicia após 24 horas', () => {
  const start = new Date('2026-07-30T12:00:00.000Z');
  let record = null;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    record = nextThrottleState(record, 'account', start);
  }
  assert.equal(record.lockLevel, 1);
  assert.equal(record.lockedUntil.getTime() - start.getTime(), 60 * 1000);

  for (let level = 2; level <= 8; level += 1) {
    const afterLock = addMilliseconds(record.lockedUntil, 1);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      record = nextThrottleState(record, 'account', afterLock);
    }
    assert.equal(record.lockLevel, level);
  }
  assert.equal(
    record.lockedUntil.getTime() - record.lastFailedAt.getTime(),
    MAX_LOCK_MS
  );

  const afterDecay = addMilliseconds(record.lastFailedAt, 24 * 60 * 60 * 1000);
  const decayed = nextThrottleState(record, 'account', afterDecay);
  assert.equal(decayed.lockLevel, 0);
  assert.equal(decayed.failureCount, 1);
  assert.equal(decayed.lockedUntil, null);
});

test('janelas e limites de conta e IP são independentes', () => {
  const start = new Date('2026-07-30T12:00:00.000Z');
  let accountRecord = null;
  let ipRecord = null;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    accountRecord = nextThrottleState(accountRecord, 'account', start);
  }
  assert.equal(accountRecord.lockedUntil, null);

  const afterWindow = addMilliseconds(start, 15 * 60 * 1000);
  accountRecord = nextThrottleState(accountRecord, 'account', afterWindow);
  assert.equal(accountRecord.failureCount, 1);
  assert.equal(accountRecord.lockedUntil, null);

  for (let attempt = 1; attempt <= 29; attempt += 1) {
    ipRecord = nextThrottleState(ipRecord, 'ip', start);
  }
  assert.equal(ipRecord.lockedUntil, null);
  ipRecord = nextThrottleState(ipRecord, 'ip', start);
  assert.equal(ipRecord.lockedUntil.getTime() - start.getTime(), 5 * 60 * 1000);
});

test('login limita tentativas e alterações críticas revogam todos os tokens', async (t) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const adminEmail = `auth-admin-${suffix}@test.local`;
  const userEmail = `auth-user-${suffix}@test.local`;
  const missingEmail = `auth-missing-${suffix}@test.local`;
  const ip = `198.51.100.${Math.floor(Math.random() * 150) + 1}`;
  const accountIdentities = [
    getThrottleIdentity('account', adminEmail),
    getThrottleIdentity('account', userEmail),
    getThrottleIdentity('account', missingEmail)
  ];
  const ipIdentity = getThrottleIdentity('ip', ip);
  const passwordHash = await bcrypt.hash('senha-inicial', 10);

  const admin = await prisma.user.create({
    data: {
      name: 'Admin Proteção',
      email: adminEmail,
      passwordHash,
      role: 'admin',
      active: true
    }
  });
  const user = await prisma.user.create({
    data: {
      name: 'Usuário Proteção',
      email: userEmail,
      passwordHash,
      role: 'reader',
      active: true
    }
  });

  const server = app.listen(0);
  t.after(async () => {
    server.close();
    await prisma.loginThrottle.deleteMany({
      where: { OR: [...accountIdentities, ipIdentity] }
    });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, user.id] } } });
    await prisma.$disconnect();
  });

  const base = `http://127.0.0.1:${server.address().port}/api`;

  const userLogin = await request(base, '/auth/login', {
    method: 'POST',
    body: { email: userEmail, password: 'senha-inicial' },
    ip
  });
  assert.equal(userLogin.status, 200);
  const userCookie = cookieFrom(userLogin);

  const legacyToken = jwt.sign(
    { id: user.id, email: userEmail, role: 'reader' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  const legacyCookie = `auth=${legacyToken}`;
  const legacyMe = await request(base, '/auth/me', { cookie: legacyCookie, ip });
  assert.equal(legacyMe.status, 200);

  const adminLogin = await request(base, '/auth/login', {
    method: 'POST',
    body: { email: adminEmail, password: 'senha-inicial' },
    ip
  });
  assert.equal(adminLogin.status, 200);
  const adminCookie = cookieFrom(adminLogin);

  const harmlessUpdate = await request(base, `/admin/users/${user.id}`, {
    method: 'PUT',
    cookie: adminCookie,
    body: { name: 'Usuário Renomeado' },
    ip
  });
  assert.equal(harmlessUpdate.status, 200);
  assert.equal((await request(base, '/auth/me', { cookie: userCookie, ip })).status, 200);

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const failure = await request(base, '/auth/login', {
      method: 'POST',
      body: { email: userEmail, password: 'senha-incorreta' },
      ip
    });
    assert.equal(failure.status, 401);
    assert.equal((await failure.json()).error, 'Credenciais inválidas.');
  }

  const fifthFailure = await request(base, '/auth/login', {
    method: 'POST',
    body: { email: userEmail, password: 'senha-incorreta' },
    ip
  });
  const fifthPayload = await fifthFailure.json();
  assert.equal(fifthFailure.status, 429);
  assert.ok(Number(fifthFailure.headers.get('retry-after')) >= 1);
  assert.ok(fifthPayload.retryAfterSeconds >= 1);

  const correctWhileBlocked = await request(base, '/auth/login', {
    method: 'POST',
    body: { email: userEmail, password: 'senha-inicial' },
    ip
  });
  assert.equal(correctWhileBlocked.status, 429);

  const missingFailure = await request(base, '/auth/login', {
    method: 'POST',
    body: { email: missingEmail, password: 'senha-incorreta' },
    ip
  });
  assert.equal(missingFailure.status, 401);
  assert.equal((await missingFailure.json()).error, 'Credenciais inválidas.');

  const resetPassword = await request(base, `/admin/users/${user.id}`, {
    method: 'PUT',
    cookie: adminCookie,
    body: { password: 'senha-alterada' },
    ip
  });
  assert.equal(resetPassword.status, 200);
  assert.equal(
    await prisma.loginThrottle.findUnique({
      where: { scope_keyHash: getThrottleIdentity('account', userEmail) }
    }),
    null
  );
  assert.ok(
    await prisma.loginThrottle.findUnique({
      where: { scope_keyHash: ipIdentity }
    })
  );
  assert.equal((await request(base, '/auth/me', { cookie: userCookie, ip })).status, 401);
  assert.equal((await request(base, '/auth/me', { cookie: legacyCookie, ip })).status, 401);

  const changedLogin = await request(base, '/auth/login', {
    method: 'POST',
    body: { email: userEmail, password: 'senha-alterada' },
    ip
  });
  assert.equal(changedLogin.status, 200);
  const changedCookie = cookieFrom(changedLogin);

  const deactivate = await request(base, `/admin/users/${user.id}`, {
    method: 'PUT',
    cookie: adminCookie,
    body: { active: false },
    ip
  });
  assert.equal(deactivate.status, 200);
  assert.equal((await request(base, '/auth/me', { cookie: changedCookie, ip })).status, 401);
  const inactiveLogin = await request(base, '/auth/login', {
    method: 'POST',
    body: { email: userEmail, password: 'senha-alterada' },
    ip
  });
  assert.equal(inactiveLogin.status, 401);
  assert.equal((await inactiveLogin.json()).error, 'Credenciais inválidas.');

  const reactivate = await request(base, `/admin/users/${user.id}`, {
    method: 'PUT',
    cookie: adminCookie,
    body: { active: true },
    ip
  });
  assert.equal(reactivate.status, 200);
  assert.equal((await request(base, '/auth/me', { cookie: changedCookie, ip })).status, 401);

  const reactivatedLogin = await request(base, '/auth/login', {
    method: 'POST',
    body: { email: userEmail, password: 'senha-alterada' },
    ip
  });
  assert.equal(reactivatedLogin.status, 200);
  const reactivatedCookie = cookieFrom(reactivatedLogin);

  const selfPasswordChange = await request(base, '/admin/users/me', {
    method: 'PUT',
    cookie: reactivatedCookie,
    body: { password: 'senha-final' },
    ip
  });
  assert.equal(selfPasswordChange.status, 200);
  assert.match(selfPasswordChange.headers.get('set-cookie') || '', /auth=;/);
  assert.equal((await request(base, '/auth/me', { cookie: reactivatedCookie, ip })).status, 401);

  const finalLogin = await request(base, '/auth/login', {
    method: 'POST',
    body: { email: userEmail, password: 'senha-final' },
    ip
  });
  assert.equal(finalLogin.status, 200);
});
