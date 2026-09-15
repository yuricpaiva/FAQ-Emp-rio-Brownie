const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const KNOWN_ROLES = ['admin', 'creator', 'production_manager', 'reader', 'store'];
const DEFAULT_AI_SETTINGS = Object.freeze({
  enabled: true,
  model: 'gpt-5.6-sol',
  imageModel: 'gpt-image-2',
  instructions: '',
  faqKnowledgeEnabled: true,
  salesEnabled: true,
  documentsEnabled: true,
  imagesEnabled: true,
  salesRoles: ['admin', 'production_manager', 'store'],
  maxOutputTokens: 3000,
  maxHistoryMessages: 20,
  maxSalesRangeDays: 366,
});

function hasApiKey() {
  return Boolean(String(process.env.OPENAI_API_KEY || '').trim());
}

function safeParse(value) {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeStoredSettings(value) {
  const parsed = safeParse(value);
  return {
    ...DEFAULT_AI_SETTINGS,
    ...parsed,
    salesRoles: Array.isArray(parsed.salesRoles)
      ? parsed.salesRoles.filter((role) => KNOWN_ROLES.includes(role))
      : [...DEFAULT_AI_SETTINGS.salesRoles],
  };
}

async function getAiSettings() {
  const settings = await prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
    select: { browninhoConfig: true },
  });
  return normalizeStoredSettings(settings.browninhoConfig);
}

function validateInteger(value, name, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw Object.assign(new Error(`${name} deve ser um número inteiro entre ${min} e ${max}.`), { status: 400 });
  }
  return parsed;
}

function normalizeSettingsInput(input = {}) {
  const booleanFields = ['enabled', 'faqKnowledgeEnabled', 'salesEnabled', 'documentsEnabled', 'imagesEnabled'];
  booleanFields.forEach((field) => {
    if (typeof input[field] !== 'boolean') {
      throw Object.assign(new Error(`O campo ${field} deve ser verdadeiro ou falso.`), { status: 400 });
    }
  });

  const model = String(input.model || '').trim();
  const imageModel = String(input.imageModel || '').trim();
  const instructions = String(input.instructions || '').trim();
  if (!model || model.length > 100) throw Object.assign(new Error('Informe um modelo de texto válido.'), { status: 400 });
  if (!imageModel || imageModel.length > 100) throw Object.assign(new Error('Informe um modelo de imagem válido.'), { status: 400 });
  if (instructions.length > 12000) throw Object.assign(new Error('As instruções podem ter no máximo 12.000 caracteres.'), { status: 400 });
  if (!Array.isArray(input.salesRoles)) throw Object.assign(new Error('Informe os perfis autorizados a consultar vendas.'), { status: 400 });

  const salesRoles = [...new Set(input.salesRoles.map((role) => String(role || '').trim()))];
  if (salesRoles.some((role) => !KNOWN_ROLES.includes(role))) {
    throw Object.assign(new Error('A lista de perfis de vendas possui um valor inválido.'), { status: 400 });
  }

  return {
    enabled: input.enabled,
    model,
    imageModel,
    instructions,
    faqKnowledgeEnabled: input.faqKnowledgeEnabled,
    salesEnabled: input.salesEnabled,
    documentsEnabled: input.documentsEnabled,
    imagesEnabled: input.imagesEnabled,
    salesRoles,
    maxOutputTokens: validateInteger(input.maxOutputTokens, 'O limite de resposta', 256, 16000),
    maxHistoryMessages: validateInteger(input.maxHistoryMessages, 'O histórico enviado ao modelo', 2, 60),
    maxSalesRangeDays: validateInteger(input.maxSalesRangeDays, 'O período máximo de vendas', 1, 1096),
  };
}

async function saveAiSettings(input) {
  const normalized = normalizeSettingsInput(input);
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: { browninhoConfig: JSON.stringify(normalized) },
    create: { id: 1, browninhoConfig: JSON.stringify(normalized) },
  });
  return normalized;
}

function publicSettings(settings, user) {
  return {
    enabled: settings.enabled,
    configured: hasApiKey(),
    capabilities: {
      faqKnowledge: settings.faqKnowledgeEnabled,
      sales: settings.salesEnabled && settings.salesRoles.includes(user?.role),
      documents: settings.documentsEnabled,
      images: settings.imagesEnabled,
    },
  };
}

module.exports = {
  DEFAULT_AI_SETTINGS,
  KNOWN_ROLES,
  getAiSettings,
  hasApiKey,
  normalizeSettingsInput,
  publicSettings,
  saveAiSettings,
};
