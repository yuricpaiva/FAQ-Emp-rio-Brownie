const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { getAiSettings, hasApiKey, publicSettings, saveAiSettings } = require('../services/aiSettingsService');
const { generateBrowninhoResponse, testOpenAIConnection } = require('../services/aiAgentService');
const { locateGeneratedFile, removeGeneratedFiles } = require('../services/aiStorageService');

const prisma = new PrismaClient();
const requestWindows = new Map();
const OPENAI_CREDIT_CODES = new Set([
  'billing_hard_limit_reached',
  'billing_not_active',
  'credit_balance_too_low',
  'insufficient_quota',
  'quota_exceeded',
]);

function isOpenAiCreditsError(error) {
  const codes = [error?.code, error?.type, error?.error?.code, error?.error?.type]
    .map((value) => String(value || '').toLowerCase());
  if (codes.some((code) => OPENAI_CREDIT_CODES.has(code))) return true;
  return /insufficient quota|exceeded your current quota|billing hard limit|credit balance.+too low|billing.+not active/i.test(String(error?.message || ''));
}

function parseMetadata(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function serializeAttachment(item) {
  return {
    id: item.id,
    name: item.name,
    type: item.mimeType,
    size: item.size,
    kind: item.kind,
    previewUrl: item.kind === 'generated_image' ? `/api/ai/attachments/${item.id}/content` : '',
  };
}

function serializeMessage(message) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    status: message.status,
    metadata: parseMetadata(message.metadata),
    createdAt: message.createdAt,
    attachments: (message.attachments || []).map(serializeAttachment),
  };
}

function serializeConversation(conversation, withMessages = true) {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    ...(withMessages ? { messages: (conversation.messages || []).map(serializeMessage) } : {}),
  };
}

function errorResponse(res, error, fallback) {
  console.error('[Browninho]', error?.code || error?.name || 'Error', error?.message);
  if (isOpenAiCreditsError(error)) {
    return res.status(402).json({
      error: 'Os créditos de inteligência artificial estão indisponíveis no momento.',
      code: 'AI_CREDITS_EXHAUSTED',
    });
  }
  const status = Number(error?.status || error?.statusCode);
  return res.status(status >= 400 && status < 600 ? status : 502).json({
    error: status >= 400 && status < 500 ? error.message : fallback,
    code: error?.code || 'BROWNINHO_ERROR',
  });
}

function enforceRateLimit(userId) {
  const now = Date.now();
  const current = (requestWindows.get(userId) || []).filter((time) => now - time < 60000);
  if (current.length >= 10) {
    const error = new Error('Aguarde alguns segundos antes de enviar outra mensagem.');
    error.status = 429;
    throw error;
  }
  current.push(now);
  requestWindows.set(userId, current);
}

async function getConfig(req, res) {
  try { return res.json(publicSettings(await getAiSettings(), req.user)); }
  catch (error) { return errorResponse(res, error, 'Não foi possível carregar o Browninho.'); }
}

async function listConversations(req, res) {
  try {
    const conversations = await prisma.aiConversation.findMany({
      where: { userId: req.user.id },
      include: { messages: { include: { attachments: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return res.json(conversations.map((item) => serializeConversation(item)));
  } catch (error) { return errorResponse(res, error, 'Não foi possível carregar as conversas.'); }
}

async function updateConversation(req, res) {
  try {
    const title = String(req.body?.title || '').trim();
    if (!title || title.length > 120) return res.status(400).json({ error: 'O título deve ter entre 1 e 120 caracteres.' });
    const result = await prisma.aiConversation.updateMany({ where: { id: Number(req.params.id), userId: req.user.id }, data: { title } });
    if (!result.count) return res.status(404).json({ error: 'Conversa não encontrada.' });
    const conversation = await prisma.aiConversation.findUnique({ where: { id: Number(req.params.id) } });
    return res.json(serializeConversation(conversation, false));
  } catch (error) { return errorResponse(res, error, 'Não foi possível renomear a conversa.'); }
}

async function deleteConversation(req, res) {
  try {
    const id = Number(req.params.id);
    const conversation = await prisma.aiConversation.findFirst({
      where: { id, userId: req.user.id },
      include: { messages: { include: { attachments: true } } },
    });
    if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada.' });
    const keys = conversation.messages.flatMap((message) => message.attachments.map((item) => item.storageKey).filter(Boolean));
    await prisma.aiConversation.delete({ where: { id } });
    await removeGeneratedFiles(keys);
    return res.status(204).end();
  } catch (error) { return errorResponse(res, error, 'Não foi possível excluir a conversa.'); }
}

async function sendMessage(req, res) {
  let conversation;
  let createdUserMessage;
  let generatedImages = [];
  let createdNewConversation = false;
  try {
    enforceRateLimit(req.user.id);
    const content = String(req.body?.content || '').trim();
    const files = req.files || [];
    if (!content && !files.length) return res.status(400).json({ error: 'Escreva uma mensagem ou adicione um arquivo.' });
    if (content.length > 30000) return res.status(400).json({ error: 'A mensagem pode ter no máximo 30.000 caracteres.' });
    const settings = await getAiSettings();
    if (!settings.enabled) return res.status(403).json({ error: 'O Browninho está desabilitado pelo administrador.' });
    if (!hasApiKey()) return res.status(503).json({ error: 'A chave da OpenAI ainda não foi configurada no servidor.', code: 'OPENAI_NOT_CONFIGURED' });
    if (files.length && !settings.documentsEnabled) return res.status(403).json({ error: 'A análise de arquivos está desabilitada.' });

    const conversationId = Number(req.body?.conversationId || 0);
    if (conversationId) {
      conversation = await prisma.aiConversation.findFirst({ where: { id: conversationId, userId: req.user.id } });
      if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada.' });
    } else {
      const title = (content.replace(/\s+/g, ' ').slice(0, 80) || files[0]?.originalname || 'Nova conversa').trim();
      conversation = await prisma.aiConversation.create({ data: { userId: req.user.id, title } });
      createdNewConversation = true;
    }

    const historyRows = await prisma.aiMessage.findMany({
      where: { conversationId: conversation.id, status: 'completed' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: settings.maxHistoryMessages,
    });
    const history = historyRows.reverse();
    createdUserMessage = await prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content,
        attachments: files.length ? { create: files.map((file) => ({ name: file.originalname, mimeType: file.mimetype, size: file.size, kind: 'upload' })) } : undefined,
      },
      include: { attachments: true },
    });

    const generated = await generateBrowninhoResponse({ user: req.user, settings, history, content, files });
    generatedImages = generated.generatedImages;
    const assistantMessage = await prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: generated.content,
        metadata: JSON.stringify(generated.metadata),
        attachments: generated.generatedImages.length ? { create: generated.generatedImages.map((item) => ({ name: item.name, mimeType: item.mimeType, size: item.size, kind: item.kind, storageKey: item.storageKey })) } : undefined,
      },
      include: { attachments: true },
    });
    await prisma.aiConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    return res.status(201).json({ conversationId: conversation.id, userMessage: serializeMessage(createdUserMessage), assistantMessage: serializeMessage(assistantMessage) });
  } catch (error) {
    if (createdUserMessage) await prisma.aiMessage.delete({ where: { id: createdUserMessage.id } }).catch(() => undefined);
    if (createdNewConversation && conversation) await prisma.aiConversation.delete({ where: { id: conversation.id } }).catch(() => undefined);
    if (generatedImages.length) await removeGeneratedFiles(generatedImages.map((item) => item.storageKey));
    return errorResponse(res, error, 'Não foi possível obter uma resposta do Browninho. Tente novamente.');
  }
}

async function getAttachmentContent(req, res) {
  try {
    const attachment = await prisma.aiAttachment.findFirst({
      where: { id: Number(req.params.id), message: { conversation: { userId: req.user.id } }, kind: 'generated_image' },
    });
    if (!attachment?.storageKey) return res.status(404).json({ error: 'Imagem não encontrada.' });
    const filePath = await locateGeneratedFile(attachment.storageKey);
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    if (error?.code === 'ENOENT') return res.status(404).json({ error: 'Imagem não encontrada.' });
    return errorResponse(res, error, 'Não foi possível abrir a imagem.');
  }
}

async function getAdminSettings(_req, res) {
  try { return res.json({ ...(await getAiSettings()), configured: hasApiKey(), keyEnvironmentVariable: 'OPENAI_API_KEY' }); }
  catch (error) { return errorResponse(res, error, 'Não foi possível carregar as configurações do Browninho.'); }
}

async function updateAdminSettings(req, res) {
  try { return res.json({ ...(await saveAiSettings(req.body)), configured: hasApiKey(), keyEnvironmentVariable: 'OPENAI_API_KEY' }); }
  catch (error) { return errorResponse(res, error, 'Não foi possível salvar as configurações do Browninho.'); }
}

async function testAdminConnection(_req, res) {
  try {
    const result = await testOpenAIConnection(await getAiSettings());
    return res.json({ ...result, message: `Conexão validada com o modelo ${result.model}.` });
  } catch (error) { return errorResponse(res, error, 'Não foi possível validar a conexão com a OpenAI.'); }
}

module.exports = { deleteConversation, getAdminSettings, getAttachmentContent, getConfig, isOpenAiCreditsError, listConversations, sendMessage, testAdminConnection, updateAdminSettings, updateConversation };
