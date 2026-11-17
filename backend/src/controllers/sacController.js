const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const WORKFLOW = new Set(['RASCUNHO', 'PENDENTE_AUDITORIA', 'DEVOLVIDA', 'AUDITADA']);
const OPTION_CATEGORIES = new Set(['PROBLEM_TYPE', 'LOCATION', 'STORE', 'OCCURRENCE_STATUS', 'COMPLAINT_TYPE']);
const OPTION_FIELDS = {
  problemTypeId: 'PROBLEM_TYPE',
  locationId: 'LOCATION',
  purchaseStoreId: 'STORE',
  suggestedOriginStoreId: 'STORE',
  occurrenceStatusId: 'OCCURRENCE_STATUS',
  complaintTypeId: 'COMPLAINT_TYPE'
};
const TEXT_FIELDS = ['customerName', 'complaintText', 'actionTaken', 'treatmentOwner', 'observation', 'resolution'];
const requiredTextFields = ['customerName', 'complaintText', 'actionTaken', 'treatmentOwner'];
const complaintInclude = {
  problemType: true,
  location: true,
  purchaseStore: true,
  suggestedOriginStore: true,
  offenderStore: true,
  occurrenceStatus: true,
  complaintType: true,
  createdBy: { select: { id: true, name: true, email: true } },
  auditedBy: { select: { id: true, name: true } }
};

function normalizeLabel(value) {
  return String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

async function capabilitiesFor(user) {
  const [access, settings] = await Promise.all([
    prisma.sacAccess.findUnique({ where: { userId: user.id } }),
    prisma.sacSettings.findUnique({ where: { id: 1 } })
  ]);
  const isAdmin = user.role === 'admin';
  const canAudit = settings?.auditorUserId === user.id;
  const canCreate = isAdmin || Boolean(access?.canCreate);
  return {
    hasAccess: isAdmin || canAudit || Boolean(access?.canCreate || access?.canView),
    canCreate,
    canAudit,
    canManage: isAdmin,
    auditorConfigured: Boolean(settings?.auditorUserId)
  };
}

async function requireSacAccess(req, res, next) {
  try {
    const capabilities = await capabilitiesFor(req.user);
    if (!capabilities.hasAccess) return res.status(403).json({ error: 'Você não possui acesso ao módulo SAC.' });
    req.sacCapabilities = capabilities;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function getAccess(req, res) {
  return res.json(await capabilitiesFor(req.user));
}

async function getCapabilities(req, res) {
  return res.json(req.sacCapabilities || await capabilitiesFor(req.user));
}

function serializeComplaint(item) {
  return { ...item, occurrenceDate: dateKey(item.occurrenceDate) };
}

function handleAction(handler, fallback) {
  return async (req, res, next) => {
    try { return await handler(req, res); }
    catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message });
      if (error.code === 'P2002') return res.status(409).json({ error: 'Já existe uma opção com este nome nesta lista.' });
      if (error.code === 'P2025') return res.status(404).json({ error: 'Registro não encontrado.' });
      console.error(fallback, error);
      return next(error);
    }
  };
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

async function validatePayload(body) {
  const data = {};
  for (const field of TEXT_FIELDS) data[field] = typeof body?.[field] === 'string' ? body[field].trim() : '';
  for (const field of requiredTextFields) {
    if (!data[field]) fail(400, 'Preencha todos os campos obrigatórios da reclamação.');
  }
  data.occurrenceDate = parseDate(body?.occurrenceDate);
  if (!data.occurrenceDate) fail(400, 'Informe uma data de ocorrência válida.');

  const optionPairs = Object.entries(OPTION_FIELDS).map(([field, category]) => [field, parseId(body?.[field]), category]);
  if (optionPairs.some(([, id]) => !id)) fail(400, 'Selecione todas as opções obrigatórias.');
  const ids = [...new Set(optionPairs.map(([, id]) => id))];
  const options = await prisma.sacOption.findMany({ where: { id: { in: ids } } });
  if (options.length !== ids.length) fail(400, 'Uma ou mais opções selecionadas não existem.');
  for (const [field, id, category] of optionPairs) {
    const option = options.find((item) => item.id === id);
    if (option.category !== category) fail(400, 'Uma opção foi selecionada em uma categoria incorreta.');
    if (!option.active) fail(400, `A opção “${option.label}” não está mais ativa.`);
    data[field] = id;
  }
  return data;
}

function diffComplaint(before, after) {
  const changed = {};
  for (const key of [...TEXT_FIELDS, 'occurrenceDate', ...Object.keys(OPTION_FIELDS)]) {
    const oldValue = key === 'occurrenceDate' ? dateKey(before[key]) : before[key];
    const newValue = key === 'occurrenceDate' ? dateKey(after[key]) : after[key];
    if (String(oldValue ?? '') !== String(newValue ?? '')) changed[key] = { from: oldValue, to: newValue };
  }
  return changed;
}

const listOptions = handleAction(async (_req, res) => {
  const options = await prisma.sacOption.findMany({ where: { active: true }, orderBy: [{ category: 'asc' }, { position: 'asc' }, { label: 'asc' }] });
  return res.json(options.reduce((groups, option) => {
    (groups[option.category] ||= []).push(option);
    return groups;
  }, {}));
}, 'Falha ao listar opções do SAC.');

const listComplaints = handleAction(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
  const where = {};
  const exactIds = ['problemTypeId', 'locationId', 'purchaseStoreId', 'suggestedOriginStoreId', 'offenderStoreId', 'occurrenceStatusId', 'complaintTypeId'];
  for (const field of exactIds) {
    const value = parseId(req.query[field]);
    if (value) where[field] = value;
  }
  if (WORKFLOW.has(req.query.workflowStatus)) where.workflowStatus = req.query.workflowStatus;
  const containsFields = ['customerName', 'complaintText', 'actionTaken', 'treatmentOwner', 'observation', 'resolution'];
  for (const field of containsFields) {
    const value = String(req.query[field] || '').trim();
    if (value) where[field] = { contains: value };
  }
  if (req.query.dateFrom || req.query.dateTo) {
    where.occurrenceDate = {};
    const from = parseDate(req.query.dateFrom);
    const to = parseDate(req.query.dateTo);
    if (req.query.dateFrom && !from) fail(400, 'Data inicial inválida.');
    if (req.query.dateTo && !to) fail(400, 'Data final inválida.');
    if (from) where.occurrenceDate.gte = from;
    if (to) where.occurrenceDate.lte = to;
  }
  const [total, items, pendingCount] = await Promise.all([
    prisma.sacComplaint.count({ where }),
    prisma.sacComplaint.findMany({ where, include: complaintInclude, orderBy: [{ occurrenceDate: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.sacComplaint.count({ where: { workflowStatus: 'PENDENTE_AUDITORIA' } })
  ]);
  return res.json({ items: items.map(serializeComplaint), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), pendingCount });
}, 'Falha ao listar reclamações.');

const createComplaint = handleAction(async (req, res) => {
  if (!req.sacCapabilities.canCreate) fail(403, 'Você não possui permissão para cadastrar reclamações.');
  const data = await validatePayload(req.body);
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.sacComplaint.create({ data: { ...data, createdById: req.user.id }, include: complaintInclude });
    await tx.sacComplaintHistory.create({ data: { complaintId: created.id, actorId: req.user.id, action: 'CRIADA' } });
    return created;
  });
  return res.status(201).json(serializeComplaint(item));
}, 'Falha ao criar reclamação.');

async function accessibleComplaint(id) {
  if (!id) fail(400, 'Identificador de reclamação inválido.');
  const item = await prisma.sacComplaint.findUnique({ where: { id }, include: complaintInclude });
  if (!item) fail(404, 'Reclamação não encontrada.');
  return item;
}

const getComplaint = handleAction(async (req, res) => {
  const item = await accessibleComplaint(parseId(req.params.id));
  const history = await prisma.sacComplaintHistory.findMany({
    where: { complaintId: item.id },
    include: { actor: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
  });
  return res.json({ ...serializeComplaint(item), history: history.map((entry) => ({ ...entry, changes: JSON.parse(entry.changesJson || '{}'), changesJson: undefined })) });
}, 'Falha ao carregar reclamação.');

const getAuditNavigation = handleAction(async (req, res) => {
  ensureAuditor(req);
  const id = parseId(req.params.id);
  if (!id) fail(400, 'Identificador de reclamação inválido.');
  const pending = await prisma.sacComplaint.findMany({
    where: { workflowStatus: 'PENDENTE_AUDITORIA' },
    select: { id: true, customerName: true, occurrenceDate: true },
    orderBy: [{ occurrenceDate: 'desc' }, { id: 'desc' }]
  });
  const index = pending.findIndex((item) => item.id === id);
  if (index < 0) return res.json({ position: 0, total: pending.length, previous: null, next: pending[0] || null });
  const serialize = (item) => item ? { ...item, occurrenceDate: dateKey(item.occurrenceDate) } : null;
  return res.json({
    position: index + 1,
    total: pending.length,
    previous: pending.length > 1 ? serialize(pending[(index - 1 + pending.length) % pending.length]) : null,
    next: pending.length > 1 ? serialize(pending[(index + 1) % pending.length]) : null
  });
}, 'Falha ao carregar a fila de auditoria.');

const updateComplaint = handleAction(async (req, res) => {
  const id = parseId(req.params.id);
  const before = await accessibleComplaint(id);
  const isOwnerEditable = before.createdById === req.user.id && ['RASCUNHO', 'DEVOLVIDA'].includes(before.workflowStatus);
  if (!isOwnerEditable && !req.sacCapabilities.canManage && !req.sacCapabilities.canAudit) fail(403, 'Esta reclamação não pode mais ser editada por você.');
  const data = await validatePayload(req.body);
  const changes = diffComplaint(before, data);
  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.sacComplaint.update({ where: { id }, data, include: complaintInclude });
    if (Object.keys(changes).length) await tx.sacComplaintHistory.create({ data: { complaintId: id, actorId: req.user.id, action: 'EDITADA', changesJson: JSON.stringify(changes) } });
    return updated;
  });
  return res.json(serializeComplaint(item));
}, 'Falha ao atualizar reclamação.');

const deleteComplaint = handleAction(async (req, res) => {
  const id = parseId(req.params.id);
  const item = await accessibleComplaint(id);
  if (item.workflowStatus !== 'RASCUNHO') fail(409, 'Somente rascunhos podem ser excluídos.');
  if (item.createdById !== req.user.id && !req.sacCapabilities.canManage) fail(403, 'Você não pode excluir este rascunho.');
  await prisma.sacComplaint.delete({ where: { id } });
  return res.status(204).end();
}, 'Falha ao excluir reclamação.');

const submitComplaint = handleAction(async (req, res) => {
  const id = parseId(req.params.id);
  const item = await accessibleComplaint(id);
  if (!['RASCUNHO', 'DEVOLVIDA'].includes(item.workflowStatus)) fail(409, 'Esta reclamação já foi enviada.');
  if (item.createdById !== req.user.id && !req.sacCapabilities.canManage) fail(403, 'Somente o autor pode enviar esta reclamação.');
  const action = item.workflowStatus === 'DEVOLVIDA' ? 'REENVIADA' : 'ENVIADA';
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.sacComplaint.update({ where: { id }, data: { workflowStatus: 'PENDENTE_AUDITORIA', submittedAt: new Date(), auditedAt: null, auditedById: null, offenderStoreId: null }, include: complaintInclude });
    await tx.sacComplaintHistory.create({ data: { complaintId: id, actorId: req.user.id, action } });
    return saved;
  });
  return res.json(serializeComplaint(updated));
}, 'Falha ao enviar reclamação.');

function ensureAuditor(req) {
  if (!req.sacCapabilities.canAudit) fail(403, 'Somente o auditor configurado pode realizar esta ação.');
}

const returnComplaint = handleAction(async (req, res) => {
  ensureAuditor(req);
  const id = parseId(req.params.id);
  const item = await accessibleComplaint(id);
  if (item.workflowStatus !== 'PENDENTE_AUDITORIA') fail(409, 'Somente reclamações pendentes podem ser devolvidas.');
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason) fail(400, 'Informe o motivo da devolução.');
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.sacComplaint.update({ where: { id }, data: { workflowStatus: 'DEVOLVIDA' }, include: complaintInclude });
    await tx.sacComplaintHistory.create({ data: { complaintId: id, actorId: req.user.id, action: 'DEVOLVIDA', reason } });
    return saved;
  });
  return res.json(serializeComplaint(updated));
}, 'Falha ao devolver reclamação.');

const auditComplaint = handleAction(async (req, res) => {
  ensureAuditor(req);
  const id = parseId(req.params.id);
  const item = await accessibleComplaint(id);
  if (item.workflowStatus !== 'PENDENTE_AUDITORIA') fail(409, 'Somente reclamações pendentes podem ser auditadas.');
  const offenderStoreId = parseId(req.body?.offenderStoreId);
  const store = offenderStoreId && await prisma.sacOption.findFirst({ where: { id: offenderStoreId, category: 'STORE', active: true } });
  if (!store) fail(400, 'Selecione uma loja ofensora ativa.');
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.sacComplaint.update({ where: { id }, data: { workflowStatus: 'AUDITADA', offenderStoreId, auditedById: req.user.id, auditedAt: new Date() }, include: complaintInclude });
    await tx.sacComplaintHistory.create({ data: { complaintId: id, actorId: req.user.id, action: 'AUDITADA', reason, changesJson: JSON.stringify({ offenderStoreId: { from: item.suggestedOriginStoreId, to: offenderStoreId } }) } });
    return saved;
  });
  return res.json(serializeComplaint(updated));
}, 'Falha ao auditar reclamação.');

const getAdminSettings = handleAction(async (_req, res) => {
  const [settings, accesses, options] = await Promise.all([
    prisma.sacSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
    prisma.sacAccess.findMany(),
    prisma.sacOption.findMany({ orderBy: [{ category: 'asc' }, { position: 'asc' }, { label: 'asc' }] })
  ]);
  return res.json({
    auditorUserId: settings.auditorUserId,
    creatorUserIds: accesses.filter((item) => item.canCreate).map((item) => item.userId),
    viewerUserIds: accesses.filter((item) => item.canView).map((item) => item.userId),
    options
  });
}, 'Falha ao carregar configurações do SAC.');

const updateAdminSettings = handleAction(async (req, res) => {
  if (!Array.isArray(req.body?.creatorUserIds) || !Array.isArray(req.body?.viewerUserIds)) fail(400, 'As listas de acesso são obrigatórias.');
  const creatorUserIds = [...new Set((req.body?.creatorUserIds || []).map(Number))];
  const viewerUserIds = [...new Set((req.body?.viewerUserIds || []).map(Number))];
  const auditorUserId = req.body?.auditorUserId === null || req.body?.auditorUserId === '' ? null : parseId(req.body?.auditorUserId);
  if (req.body?.auditorUserId !== null && req.body?.auditorUserId !== '' && !auditorUserId) fail(400, 'Selecione um auditor válido.');
  const allIds = [...new Set([...creatorUserIds, ...viewerUserIds, ...(auditorUserId ? [auditorUserId] : [])])];
  if (allIds.some((id) => !Number.isInteger(id) || id <= 0)) fail(400, 'A configuração possui usuários inválidos.');
  const users = await prisma.user.findMany({ where: { id: { in: allIds }, active: true }, select: { id: true } });
  if (users.length !== allIds.length) fail(400, 'Selecione apenas usuários ativos.');
  const accessIds = [...new Set([...creatorUserIds, ...viewerUserIds])];
  await prisma.$transaction([
    prisma.sacSettings.upsert({ where: { id: 1 }, update: { auditorUserId }, create: { id: 1, auditorUserId } }),
    prisma.sacAccess.deleteMany(),
    ...accessIds.map((userId) => prisma.sacAccess.create({ data: { userId, canCreate: creatorUserIds.includes(userId), canView: viewerUserIds.includes(userId) } }))
  ]);
  return res.json({ auditorUserId, creatorUserIds, viewerUserIds });
}, 'Falha ao salvar configurações do SAC.');

const createOption = handleAction(async (req, res) => {
  const category = String(req.body?.category || '');
  const label = String(req.body?.label || '').trim();
  if (!OPTION_CATEGORIES.has(category) || !label) fail(400, 'Informe uma categoria e um nome válidos.');
  const position = Number.isInteger(Number(req.body?.position)) ? Number(req.body.position) : 0;
  const option = await prisma.sacOption.create({ data: { category, label, normalizedLabel: normalizeLabel(label), position } });
  return res.status(201).json(option);
}, 'Falha ao criar opção do SAC.');

const updateOption = handleAction(async (req, res) => {
  const id = parseId(req.params.id);
  const current = await prisma.sacOption.findUnique({ where: { id } });
  if (!current) fail(404, 'Opção não encontrada.');
  const label = req.body?.label === undefined ? current.label : String(req.body.label).trim();
  if (!label) fail(400, 'O nome da opção é obrigatório.');
  const data = { label, normalizedLabel: normalizeLabel(label) };
  if (typeof req.body?.active === 'boolean') data.active = req.body.active;
  if (Number.isInteger(Number(req.body?.position))) data.position = Number(req.body.position);
  return res.json(await prisma.sacOption.update({ where: { id }, data }));
}, 'Falha ao atualizar opção do SAC.');

module.exports = {
  requireSacAccess,
  getAccess,
  getCapabilities,
  listOptions,
  listComplaints,
  createComplaint,
  getComplaint,
  getAuditNavigation,
  updateComplaint,
  deleteComplaint,
  submitComplaint,
  returnComplaint,
  auditComplaint,
  getAdminSettings,
  updateAdminSettings,
  createOption,
  updateOption
};
