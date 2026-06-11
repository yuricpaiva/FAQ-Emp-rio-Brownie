const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DEFAULT_POWER_BI_URL =
  'https://app.powerbi.com/view?r=eyJrIjoiYTZiZDBjNWItYWU0YS00NjA0LWE1NmMtNTk3YzQ0YTViYzg3IiwidCI6IjU4ODNmMjZmLTk1ZDQtNDE2YS04OThmLTBmZDhmYzMyNGQ0NSJ9&pageName=e4f916ca95bbd083114d';

async function ensureSettings() {
  return prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      poolEnabled: true,
      powerBiEnabled: true,
      powerBiUrl: DEFAULT_POWER_BI_URL
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
    url: hasAccess ? settings.powerBiUrl : ''
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
    userIds: accesses.map((access) => access.userId)
  });
}

async function updatePowerBiSettings(req, res) {
  const enabled = req.body?.enabled;
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  const rawUserIds = req.body?.userIds;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'O campo enabled deve ser booleano.' });
  }

  if (!url || !isValidHttpUrl(url)) {
    return res.status(400).json({ error: 'Informe um link http/https valido para o Power BI.' });
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

  await prisma.$transaction([
    prisma.appSettings.upsert({
      where: { id: 1 },
      update: { powerBiEnabled: enabled, powerBiUrl: url },
      create: {
        id: 1,
        poolEnabled: true,
        powerBiEnabled: enabled,
        powerBiUrl: url
      }
    }),
    prisma.powerBiAccess.deleteMany(),
    ...userIds.map((userId) => prisma.powerBiAccess.create({ data: { userId } }))
  ]);

  return res.json({ enabled, url, userIds });
}

module.exports = {
  getPowerBiConfiguration,
  getPowerBiSettingsAdmin,
  updatePowerBiSettings
};
