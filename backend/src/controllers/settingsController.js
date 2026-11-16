const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DEFAULT_POWER_BI_URL =
  'https://app.powerbi.com/view?r=eyJrIjoiYTZiZDBjNWItYWU0YS00NjA0LWE1NmMtNTk3YzQ0YTViYzg3IiwidCI6IjU4ODNmMjZmLTk1ZDQtNDE2YS04OThmLTBmZDhmYzMyNGQ0NSJ9&pageName=e4f916ca95bbd083114d';
const DEFAULT_POWER_BI_REFRESH_INTERVAL_SECONDS = 300;
const MIN_POWER_BI_REFRESH_INTERVAL_SECONDS = 10;
const MAX_POWER_BI_REFRESH_INTERVAL_SECONDS = 24 * 60 * 60;
const MAX_PURCHASE_SIGNATURE_THRESHOLD_CENTS = 1_000_000_000;
const MAX_PURCHASE_SIGNATURE_LABEL_LENGTH = 80;

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

function purchaseSettingsPayload(settings) {
  const signatureLabel = String(settings.purchaseSignatureLabel || '').trim();
  const signatureThresholdCents = Number(settings.purchaseSignatureThresholdCents) || 0;
  return {
    signatureRequired: signatureThresholdCents > 0 && Boolean(signatureLabel),
    signatureThresholdCents,
    signatureLabel
  };
}

async function getPurchaseSettings(_req, res) {
  return res.json(purchaseSettingsPayload(await ensureSettings()));
}

async function getPurchaseSettingsAdmin(_req, res) {
  const [settings, accesses] = await Promise.all([
    ensureSettings(),
    prisma.purchaseAccess.findMany({
      where: { user: { active: true, role: 'creator' } },
      orderBy: { userId: 'asc' },
      select: { userId: true }
    })
  ]);
  return res.json({ ...purchaseSettingsPayload(settings), userIds: accesses.map((access) => access.userId) });
}

async function updatePurchaseSettings(req, res) {
  const signatureThresholdCents = Number(req.body?.signatureThresholdCents);
  const signatureLabel = typeof req.body?.signatureLabel === 'string' ? req.body.signatureLabel.trim() : '';

  if (
    !Number.isInteger(signatureThresholdCents)
    || signatureThresholdCents < 0
    || signatureThresholdCents > MAX_PURCHASE_SIGNATURE_THRESHOLD_CENTS
  ) {
    return res.status(400).json({ error: 'Informe um valor minimo valido para a assinatura.' });
  }
  if (signatureLabel.length > MAX_PURCHASE_SIGNATURE_LABEL_LENGTH) {
    return res.status(400).json({ error: 'A identificacao da assinatura deve ter no maximo 80 caracteres.' });
  }
  if (signatureThresholdCents > 0 && !signatureLabel) {
    return res.status(400).json({ error: 'Informe quem deve assinar os pedidos que atingirem o valor minimo.' });
  }

  const rawUserIds = req.body?.userIds;
  if (rawUserIds !== undefined && !Array.isArray(rawUserIds)) {
    return res.status(400).json({ error: 'A lista de compradores autorizados é obrigatória.' });
  }
  const userIds = rawUserIds === undefined ? null : [...new Set(rawUserIds.map(Number))];
  if (userIds?.some((id) => !Number.isInteger(id) || id <= 0)) {
    return res.status(400).json({ error: 'A lista de compradores possui IDs inválidos.' });
  }
  if (userIds) {
    const validUsers = await prisma.user.findMany({
      where: { id: { in: userIds }, active: true, role: 'creator' },
      select: { id: true }
    });
    if (validUsers.length !== userIds.length) {
      return res.status(400).json({ error: 'Selecione apenas usuários ativos com perfil Criador.' });
    }
  }

  const transaction = [
    prisma.appSettings.upsert({
      where: { id: 1 },
      update: { purchaseSignatureThresholdCents: signatureThresholdCents, purchaseSignatureLabel: signatureLabel },
      create: {
        id: 1,
        poolEnabled: true,
        powerBiEnabled: true,
        powerBiUrl: DEFAULT_POWER_BI_URL,
        powerBiRefreshIntervalSeconds: DEFAULT_POWER_BI_REFRESH_INTERVAL_SECONDS,
        purchaseSignatureThresholdCents: signatureThresholdCents,
        purchaseSignatureLabel: signatureLabel
      }
    })
  ];
  if (userIds) {
    transaction.push(
      prisma.purchaseAccess.deleteMany(),
      ...userIds.map((userId) => prisma.purchaseAccess.create({ data: { userId } }))
    );
  }
  const [settings] = await prisma.$transaction(transaction);
  const savedAccesses = userIds ?? (await prisma.purchaseAccess.findMany({ select: { userId: true } })).map((item) => item.userId);
  return res.json({ ...purchaseSettingsPayload(settings), userIds: savedAccesses });
}

async function hasPurchaseAccess(user) {
  if (user?.role === 'admin') return true;
  if (!user?.id || user.role !== 'creator') return false;
  return Boolean(await prisma.purchaseAccess.findUnique({ where: { userId: user.id }, select: { userId: true } }));
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
  getPurchaseSettings,
  getPurchaseSettingsAdmin,
  updatePurchaseSettings,
  hasPurchaseAccess,
  hasFormsAccess,
  getFormsAccessConfiguration,
  getFormsSettingsAdmin,
  updateFormsSettings
};
