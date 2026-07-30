const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { getJwtSecret } = require('../middleware/authAdmin');

const prisma = new PrismaClient();

const WINDOW_MS = 15 * 60 * 1000;
const PROGRESSION_RESET_MS = 24 * 60 * 60 * 1000;
const MAX_LOCK_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const STALE_RECORD_MS = 30 * 24 * 60 * 60 * 1000;

const POLICIES = {
  account: { threshold: 5, baseLockMs: 60 * 1000 },
  ip: { threshold: 30, baseLockMs: 5 * 60 * 1000 }
};

let lastCleanupAt = 0;

function normalizeAccount(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeIp(ip) {
  return String(ip || 'unknown').trim().toLowerCase();
}

function hashIdentifier(scope, value) {
  return crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${scope}:${value}`)
    .digest('hex');
}

function getThrottleIdentity(scope, value) {
  const normalized = scope === 'account'
    ? normalizeAccount(value)
    : normalizeIp(value);

  return {
    scope,
    keyHash: hashIdentifier(scope, normalized)
  };
}

function getLoginIdentities(email, ip) {
  return [
    getThrottleIdentity('account', email),
    getThrottleIdentity('ip', ip)
  ];
}

function retryAfterSeconds(lockedUntil, now) {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000));
}

function nextThrottleState(existing, scope, now = new Date()) {
  const policy = POLICIES[scope];
  if (!policy) {
    throw new Error(`Escopo de limitação desconhecido: ${scope}`);
  }

  const nowMs = now.getTime();
  const lastFailedAt = existing?.lastFailedAt
    ? new Date(existing.lastFailedAt)
    : null;
  const resetProgression = !lastFailedAt
    || nowMs - lastFailedAt.getTime() >= PROGRESSION_RESET_MS;
  const previousWindow = existing?.windowStartedAt
    ? new Date(existing.windowStartedAt)
    : null;
  const windowExpired = !previousWindow
    || nowMs - previousWindow.getTime() >= WINDOW_MS;

  let lockLevel = resetProgression ? 0 : (existing?.lockLevel || 0);
  let failureCount = resetProgression || windowExpired
    ? 1
    : (existing?.failureCount || 0) + 1;
  let windowStartedAt = resetProgression || windowExpired
    ? now
    : previousWindow;
  let lockedUntil = null;

  if (failureCount >= policy.threshold) {
    lockLevel += 1;
    const lockMs = Math.min(
      policy.baseLockMs * (2 ** Math.max(0, lockLevel - 1)),
      MAX_LOCK_MS
    );
    lockedUntil = new Date(nowMs + lockMs);
    failureCount = 0;
    windowStartedAt = now;
  }

  return {
    failureCount,
    lockLevel,
    windowStartedAt,
    lockedUntil,
    lastFailedAt: now
  };
}

async function checkLoginThrottle({ email, ip, now = new Date() }) {
  const identities = getLoginIdentities(email, ip);
  const records = await prisma.loginThrottle.findMany({
    where: { OR: identities }
  });

  let longestRetry = 0;
  for (const record of records) {
    if (record.lockedUntil && record.lockedUntil > now) {
      longestRetry = Math.max(
        longestRetry,
        retryAfterSeconds(record.lockedUntil, now)
      );
    }
  }

  return longestRetry > 0
    ? { blocked: true, retryAfterSeconds: longestRetry }
    : { blocked: false, retryAfterSeconds: 0 };
}

async function recordLoginFailure({ email, ip, now = new Date() }) {
  const identities = getLoginIdentities(email, ip);

  const results = await prisma.$transaction(async (tx) => {
    const updated = [];

    for (const identity of identities) {
      const existing = await tx.loginThrottle.findUnique({
        where: {
          scope_keyHash: identity
        }
      });
      const state = nextThrottleState(existing, identity.scope, now);

      updated.push(await tx.loginThrottle.upsert({
        where: {
          scope_keyHash: identity
        },
        create: {
          ...identity,
          ...state
        },
        update: state
      }));
    }

    return updated;
  });

  let longestRetry = 0;
  for (const record of results) {
    if (record.lockedUntil && record.lockedUntil > now) {
      longestRetry = Math.max(
        longestRetry,
        retryAfterSeconds(record.lockedUntil, now)
      );
    }
  }

  return longestRetry > 0
    ? { blocked: true, retryAfterSeconds: longestRetry }
    : { blocked: false, retryAfterSeconds: 0 };
}

async function clearAccountThrottle(email) {
  const identity = getThrottleIdentity('account', email);
  await prisma.loginThrottle.deleteMany({ where: identity });
}

async function cleanupStaleThrottles(now = new Date()) {
  const nowMs = now.getTime();
  if (nowMs - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = nowMs;

  const cutoff = new Date(nowMs - STALE_RECORD_MS);
  try {
    await prisma.loginThrottle.deleteMany({
      where: { updatedAt: { lt: cutoff } }
    });
  } catch {
    // A limpeza é oportunista e nunca deve impedir uma tentativa de login.
  }
}

module.exports = {
  WINDOW_MS,
  PROGRESSION_RESET_MS,
  MAX_LOCK_MS,
  POLICIES,
  normalizeAccount,
  normalizeIp,
  getThrottleIdentity,
  nextThrottleState,
  checkLoginThrottle,
  recordLoginFailure,
  clearAccountThrottle,
  cleanupStaleThrottles
};
