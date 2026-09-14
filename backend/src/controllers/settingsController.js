const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DEFAULT_POWER_BI_URL =
  'https://app.powerbi.com/view?r=eyJrIjoiYTZiZDBjNWItYWU0YS00NjA0LWE1NmMtNTk3YzQ0YTViYzg3IiwidCI6IjU4ODNmMjZmLTk1ZDQtNDE2YS04OThmLTBmZDhmYzMyNGQ0NSJ9&pageName=e4f916ca95bbd083114d';
const DEFAULT_POWER_BI_REFRESH_INTERVAL_SECONDS = 300;
const MIN_POWER_BI_REFRESH_INTERVAL_SECONDS = 10;
const MAX_POWER_BI_REFRESH_INTERVAL_SECONDS = 24 * 60 * 60;

async function ensureSettings() {
  return prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      poolEnabled: true,
      powerBiEnabled: true,
      powerBiUrl: DEFAULT_POWER_BI_URL,
      powerBiRefreshIntervalSeconds: DEFAULT_POWER_BI_REFRESH_INTERVAL_SECONDS
    }
  });
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

async function getPowerBiConfiguration(req, res) {
  const [settings, access] = await Promise.all([
    ensureSettings(),
    prisma.powerBiAccess.findUnique({ where: { userId: req.user.id } })
  ]);
  const hasAccess = Boolean(settings.powerBiEnabled && access);

  return res.json({
    enabled: settings.powerBiEnabled,
    hasAccess,
    url: hasAccess ? settings.powerBiUrl : '',
    refreshIntervalSeconds: settings.powerBiRefreshIntervalSeconds
  });
}

async function getPowerBiSettingsAdmin(_req, res) {
  const [settings, accesses] = await Promise.all([
    ensureSettings(),
    prisma.powerBiAccess.findMany({
      where: { user: { active: true } },
      orderBy: { userId: 'asc' }
    })
  ]);

  return res.json({
    enabled: settings.powerBiEnabled,
    url: settings.powerBiUrl,
    refreshIntervalSeconds: settings.powerBiRefreshIntervalSeconds,
    userIds: accesses.map((access) => access.userId)
  });
}

async function updatePowerBiSettings(req, res) {
  const enabled = req.body?.enabled;
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  const rawRefreshIntervalSeconds = req.body?.refreshIntervalSeconds;
  const rawUserIds = req.body?.userIds;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'O campo enabled deve ser booleano.' });
  }

  if (!url || !isValidHttpUrl(url)) {
    return res.status(400).json({ error: 'Informe um link http/https valido para o Power BI.' });
  }

  const hasRefreshInterval = rawRefreshIntervalSeconds !== undefined;
  const refreshIntervalSeconds = hasRefreshInterval ? Number(rawRefreshIntervalSeconds) : null;
  if (
    hasRefreshInterval &&
    (!Number.isInteger(refreshIntervalSeconds) ||
      refreshIntervalSeconds < MIN_POWER_BI_REFRESH_INTERVAL_SECONDS ||
      refreshIntervalSeconds > MAX_POWER_BI_REFRESH_INTERVAL_SECONDS)
  ) {
    return res.status(400).json({
      error: 'A periodicidade do Power BI deve ser um numero inteiro entre 10 e 86400 segundos.'
    });
  }

  if (!Array.isArray(rawUserIds)) {
    return res.status(400).json({ error: 'A lista de usuarios autorizados e obrigatoria.' });
  }

  const userIds = [...new Set(rawUserIds.map(Number))];
  if (userIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return res.status(400).json({ error: 'A lista de usuarios possui IDs invalidos.' });
  }

  const validUsers = await prisma.user.findMany({
    where: { id: { in: userIds }, active: true },
    select: { id: true }
  });

  if (validUsers.length !== userIds.length) {
    return res.status(400).json({ error: 'Selecione apenas usuarios ativos e existentes.' });
  }

  const [savedSettings] = await prisma.$transaction([
    prisma.appSettings.upsert({
      where: { id: 1 },
      update: {
        powerBiEnabled: enabled,
        powerBiUrl: url,
        ...(hasRefreshInterval ? { powerBiRefreshIntervalSeconds: refreshIntervalSeconds } : {})
      },
      create: {
        id: 1,
        poolEnabled: true,
        powerBiEnabled: enabled,
        powerBiUrl: url,
        powerBiRefreshIntervalSeconds:
          refreshIntervalSeconds ?? DEFAULT_POWER_BI_REFRESH_INTERVAL_SECONDS
      }
    }),
    prisma.powerBiAccess.deleteMany(),
    ...userIds.map((userId) => prisma.powerBiAccess.create({ data: { userId } }))
  ]);

  return res.json({
    enabled,
    url,
    refreshIntervalSeconds: savedSettings.powerBiRefreshIntervalSeconds,
    userIds
  });
}

async function hasFormsAccess(user) {
  if (user?.role === 'admin') return true;
  if (!user?.id) return false;
  return Boolean(await prisma.formAccess.findUnique({ where: { userId: user.id }, select: { userId: true } }));
}

async function getFormsAccessConfiguration(req, res) {
  return res.json({ hasAccess: await hasFormsAccess(req.user) });
}

async function getFormsSettingsAdmin(_req, res) {
  const accesses = await prisma.formAccess.findMany({
    where: { user: { active: true, role: { not: 'admin' } } },
    orderBy: { userId: 'asc' },
    select: { userId: true }
  });
  return res.json({ userIds: accesses.map((access) => access.userId) });
}

async function updateFormsSettings(req, res) {
  const rawUserIds = req.body?.userIds;
  if (!Array.isArray(rawUserIds)) {
    return res.status(400).json({ error: 'A lista de usuários autorizados é obrigatória.' });
  }
  const userIds = [...new Set(rawUserIds.map(Number))];
  if (userIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return res.status(400).json({ error: 'A lista de usuários possui IDs inválidos.' });
  }
  const validUsers = await prisma.user.findMany({
    where: { id: { in: userIds }, active: true, role: { not: 'admin' } },
    select: { id: true }
  });
  if (validUsers.length !== userIds.length) {
    return res.status(400).json({ error: 'Selecione apenas usuários ativos e existentes. Administradores já possuem acesso.' });
  }
  await prisma.$transaction([
    prisma.formAccess.deleteMany(),
    ...userIds.map((userId) => prisma.formAccess.create({ data: { userId } }))
  ]);
  return res.json({ userIds });
}

module.exports = {
  getPowerBiConfiguration,
  getPowerBiSettingsAdmin,
  updatePowerBiSettings,
  hasFormsAccess,
  getFormsAccessConfiguration,
  getFormsSettingsAdmin,
  updateFormsSettings
};
