const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();
const ROLES = ['reader', 'creator', 'store', 'production_manager', 'admin'];
const RESULT_TYPES = ['SIMPLE', 'SCORE'];
const QUESTION_TYPES = ['TEXT', 'NUMBER', 'BOOLEAN', 'SCORE', 'PHOTO'];
const CALCULATION_TYPES = ['SIMPLE_AVERAGE', 'WEIGHTED_AVERAGE'];
const PERMISSION_TYPES = ['FILL', 'APPROVE'];
const STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'COMPLETED', 'APPROVED', 'REJECTED'];

class FormError extends Error {
  constructor(status, message, code = 'FORMS_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const fail = (status, message, code) => { throw new FormError(status, message, code); };
const text = (value) => typeof value === 'string' ? value.trim() : '';
const id = (value, label = 'ID') => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(400, `${label} inválido.`);
  return parsed;
};
const optionalId = (value, label = 'ID') => value === null || value === undefined || value === '' ? null : id(value, label);
const number = (value, label) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) fail(400, `${label} inválido.`);
  return parsed;
};
const unique = (values = []) => [...new Set(values)];
const decimalNumber = (value) => value === null || value === undefined ? null : Number(value);

function pagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 20));
  return { page, pageSize };
}

function parseSnapshot(raw) {
  try { return JSON.parse(raw); } catch { fail(500, 'Snapshot histórico inválido.', 'FORMS_INVALID_SNAPSHOT'); }
}

function hasSnapshotPermission(snapshot, user, kind) {
  if (user?.role === 'admin') return true;
  const permissions = snapshot?.permissions?.[kind] || {};
  return permissions.roles?.includes(user?.role) || permissions.userIds?.includes(Number(user?.id));
}

function canViewSubmission(submission, user) {
  return user?.role === 'admin'
    || submission.userId === Number(user?.id)
    || (submission.status !== 'DRAFT' && submission.observerId === Number(user?.id))
    || hasSnapshotPermission(parseSnapshot(submission.modelSnapshot), user, 'approve');
}

function normalizePermissions(input = {}) {
  const fillRoles = unique(Array.isArray(input.fillRoles) ? input.fillRoles.map(text) : []);
  const approveRoles = unique(Array.isArray(input.approveRoles) ? input.approveRoles.map(text) : []);
  const normalizeIds = (values) => unique((Array.isArray(values) ? values : []).map((value) => id(value, 'Usuário')));
  if ([...fillRoles, ...approveRoles].some((role) => !ROLES.includes(role))) fail(400, 'Papel de permissão inválido.');
  return { fillRoles, approveRoles, fillUserIds: normalizeIds(input.fillUserIds), approveUserIds: normalizeIds(input.approveUserIds) };
}

function validateModelInput(body = {}) {
  const name = text(body.name);
  const description = text(body.description);
  const resultType = text(body.resultType || 'SIMPLE').toUpperCase();
  const scoreCalculationType = text(body.scoreCalculationType || 'SIMPLE_AVERAGE').toUpperCase();
  const active = body.active === undefined ? true : body.active;
  const requiresApproval = body.requiresApproval === true;
  const requiresStore = body.requiresStore === undefined ? false : body.requiresStore;
  const defaultObserverId = optionalId(body.defaultObserverId, 'Observador padrão');
  if (!name || name.length > 160) fail(400, 'Informe um nome de até 160 caracteres.');
  if (description.length > 1000) fail(400, 'A descrição deve ter até 1000 caracteres.');
  if (typeof active !== 'boolean') fail(400, 'Status do modelo inválido.');
  if (typeof requiresStore !== 'boolean') fail(400, 'A opção Informar loja é inválida.');
  if (!RESULT_TYPES.includes(resultType)) fail(400, 'Tipo de resultado inválido.');
  if (!CALCULATION_TYPES.includes(scoreCalculationType)) fail(400, 'Método de cálculo inválido.');
  const scoreMin = number(body.scoreMin ?? 0, 'Nota mínima');
  const scoreMax = number(body.scoreMax ?? 10, 'Nota máxima');
  if (scoreMin >= scoreMax) fail(400, 'A nota mínima deve ser menor que a máxima.');
  const rawQuestions = Array.isArray(body.questions) ? body.questions : [];
  if (!rawQuestions.length) fail(400, 'Adicione pelo menos uma pergunta.');
  const questions = rawQuestions.map((question, index) => {
    const questionText = text(question.text);
    const type = text(question.type).toUpperCase();
    const weight = number(question.weight ?? 1, 'Peso');
    if (!questionText || questionText.length > 500) fail(400, `Pergunta ${index + 1} inválida.`);
    if (!QUESTION_TYPES.includes(type)) fail(400, `Tipo da pergunta ${index + 1} inválido.`);
    if (weight <= 0) fail(400, `O peso da pergunta ${index + 1} deve ser positivo.`);
    if (question.allowObservation !== undefined && typeof question.allowObservation !== 'boolean') {
      fail(400, `A opção de observação da pergunta ${index + 1} é inválida.`);
    }
    if (question.allowPhoto !== undefined && typeof question.allowPhoto !== 'boolean') {
      fail(400, `A opção de registro fotográfico da pergunta ${index + 1} é inválida.`);
    }
    if (question.photoRequired !== undefined && typeof question.photoRequired !== 'boolean') {
      fail(400, `A obrigatoriedade do registro fotográfico da pergunta ${index + 1} é inválida.`);
    }
    const photoRequired = question.photoRequired === true;
    const allowPhoto = question.allowPhoto === true || photoRequired || type === 'PHOTO';
    return { text: questionText, type, position: index + 1, required: question.required === true, allowPhoto, photoRequired, allowObservation: question.allowObservation === true, weight };
  });
  if (resultType === 'SCORE' && !questions.some((question) => question.type === 'SCORE')) {
    fail(400, 'Um modelo de pontuação precisa ter pelo menos uma pergunta do tipo Nota.');
  }
  return { name, description, resultType, scoreMin, scoreMax, scoreCalculationType, active, requiresApproval, requiresStore, defaultObserverId, questions, permissions: normalizePermissions(body.permissions) };
}

const modelInclude = {
  questions: { orderBy: { position: 'asc' } },
  rolePermissions: true,
  userPermissions: { include: { user: { select: { id: true, name: true, email: true, active: true } } } },
  createdBy: { select: { id: true, name: true } },
  defaultObserver: { select: { id: true, name: true, active: true } },
};

function serializeModel(model) {
  const permission = (kind) => ({
    roles: model.rolePermissions.filter((item) => item.permissionType === kind).map((item) => item.role),
    users: model.userPermissions.filter((item) => item.permissionType === kind).map((item) => item.user),
  });
  return {
    ...model,
    scoreMin: decimalNumber(model.scoreMin),
    scoreMax: decimalNumber(model.scoreMax),
    questions: model.questions.map((question) => ({ ...question, allowPhoto: question.allowPhoto || question.photoRequired || question.type === 'PHOTO', weight: decimalNumber(question.weight) })),
    permissions: { fill: permission('FILL'), approve: permission('APPROVE') },
    rolePermissions: undefined,
    userPermissions: undefined,
  };
}

async function assertUsersExist(userIds) {
  if (!userIds.length) return;
  const count = await prisma.user.count({ where: { id: { in: userIds }, active: true } });
  if (count !== userIds.length) fail(400, 'Uma ou mais permissões apontam para usuários inválidos ou inativos.');
}

async function assertActiveObserver(observerId) {
  if (!observerId) return null;
  const observer = await prisma.user.findFirst({ where: { id: observerId, active: true }, select: { id: true, name: true, role: true, formAccess: { select: { userId: true } } } });
  if (!observer) fail(400, 'Selecione um observador ativo.', 'FORM_OBSERVER_INVALID');
  if (observer.role !== 'admin' && !observer.formAccess) fail(400, 'O observador selecionado não possui acesso ao módulo Formulários.', 'FORM_OBSERVER_NO_MODULE_ACCESS');
  return observer;
}

function permissionCreates(modelId, permissions) {
  const roles = [
    ...permissions.fillRoles.map((role) => ({ modelId, permissionType: 'FILL', role })),
    ...permissions.approveRoles.map((role) => ({ modelId, permissionType: 'APPROVE', role })),
  ];
  const users = [
    ...permissions.fillUserIds.map((userId) => ({ modelId, permissionType: 'FILL', userId })),
    ...permissions.approveUserIds.map((userId) => ({ modelId, permissionType: 'APPROVE', userId })),
  ];
  return { roles, users };
}

async function saveModel(body, user, rawId) {
  const value = validateModelInput(body);
  await assertUsersExist(unique([...value.permissions.fillUserIds, ...value.permissions.approveUserIds]));
  await assertActiveObserver(value.defaultObserverId);
  const modelId = rawId === undefined ? null : id(rawId, 'Modelo');
  if (modelId && !(await prisma.formModel.findUnique({ where: { id: modelId }, select: { id: true } }))) fail(404, 'Modelo não encontrado.');
  const saved = await prisma.$transaction(async (tx) => {
    let target;
    if (modelId) {
      await tx.formQuestion.deleteMany({ where: { modelId } });
      await tx.formModelRolePermission.deleteMany({ where: { modelId } });
      await tx.formModelUserPermission.deleteMany({ where: { modelId } });
      target = await tx.formModel.update({ where: { id: modelId }, data: {
        name: value.name, description: value.description, active: value.active, resultType: value.resultType,
        scoreMin: value.scoreMin, scoreMax: value.scoreMax, scoreCalculationType: value.scoreCalculationType,
        requiresApproval: value.requiresApproval, requiresStore: value.requiresStore, defaultObserverId: value.defaultObserverId,
      } });
    } else {
      target = await tx.formModel.create({ data: {
        name: value.name, description: value.description, active: value.active, resultType: value.resultType,
        scoreMin: value.scoreMin, scoreMax: value.scoreMax, scoreCalculationType: value.scoreCalculationType,
        requiresApproval: value.requiresApproval, requiresStore: value.requiresStore, defaultObserverId: value.defaultObserverId, createdById: user.id,
      } });
    }
    await tx.formQuestion.createMany({ data: value.questions.map((question) => ({ ...question, modelId: target.id })) });
    const permissions = permissionCreates(target.id, value.permissions);
    if (permissions.roles.length) await tx.formModelRolePermission.createMany({ data: permissions.roles });
    if (permissions.users.length) await tx.formModelUserPermission.createMany({ data: permissions.users });
    return tx.formModel.findUnique({ where: { id: target.id }, include: modelInclude });
  });
  return serializeModel(saved);
}

async function listModels(query = {}) {
  const { page, pageSize } = pagination(query);
  const where = {};
  if (query.active === 'true' || query.active === 'false') where.active = query.active === 'true';
  if (text(query.search)) where.name = { contains: text(query.search) };
  const [items, total] = await prisma.$transaction([
    prisma.formModel.findMany({ where, include: modelInclude, orderBy: [{ active: 'desc' }, { name: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.formModel.count({ where }),
  ]);
  return { items: items.map(serializeModel), page, pageSize, total };
}

async function getModel(rawId) {
  const model = await prisma.formModel.findUnique({ where: { id: id(rawId, 'Modelo') }, include: modelInclude });
  if (!model) fail(404, 'Modelo não encontrado.');
  return serializeModel(model);
}

function livePermissionWhere(user, kind) {
  return { OR: [
    { rolePermissions: { some: { permissionType: kind, role: user.role } } },
    { userPermissions: { some: { permissionType: kind, userId: user.id } } },
  ] };
}

async function availableModels(user) {
  const where = user.role === 'admin' ? { active: true } : { active: true, ...livePermissionWhere(user, 'FILL') };
  const models = await prisma.formModel.findMany({ where, include: modelInclude, orderBy: { name: 'asc' } });
  return models.map(serializeModel);
}

async function capabilities(user) {
  let canApprove = user.role === 'admin' || Boolean(await prisma.formModel.findFirst({ where: { ...livePermissionWhere(user, 'APPROVE') }, select: { id: true } }));
  if (!canApprove) {
    const pending = await prisma.formSubmission.findMany({ where: { status: 'PENDING_APPROVAL' }, select: { modelSnapshot: true } });
    canApprove = pending.some((item) => hasSnapshotPermission(parseSnapshot(item.modelSnapshot), user, 'approve'));
  }
  return { canManageModels: user.role === 'admin', canApprove };
}

function snapshotFromModel(model) {
  return {
    version: 1,
    model: { id: model.id, name: model.name, description: model.description, resultType: model.resultType, scoreMin: Number(model.scoreMin), scoreMax: Number(model.scoreMax), scoreCalculationType: model.scoreCalculationType, requiresApproval: model.requiresApproval, requiresStore: model.requiresStore, defaultObserverId: model.defaultObserverId, defaultObserver: model.defaultObserver ? { id: model.defaultObserver.id, name: model.defaultObserver.name } : null },
    permissions: {
      fill: { roles: model.rolePermissions.filter((item) => item.permissionType === 'FILL').map((item) => item.role), userIds: model.userPermissions.filter((item) => item.permissionType === 'FILL').map((item) => item.userId) },
      approve: { roles: model.rolePermissions.filter((item) => item.permissionType === 'APPROVE').map((item) => item.role), userIds: model.userPermissions.filter((item) => item.permissionType === 'APPROVE').map((item) => item.userId) },
    },
    questions: model.questions.map((question) => ({ id: question.id, text: question.text, type: question.type, position: question.position, required: question.required, allowPhoto: question.allowPhoto || question.photoRequired || question.type === 'PHOTO', photoRequired: question.photoRequired, allowObservation: question.allowObservation, weight: Number(question.weight) })),
  };
}

const submissionInclude = {
  user: { select: { id: true, name: true, email: true } },
  observer: { select: { id: true, name: true, active: true } },
  productionStore: { select: { id: true, displayName: true, active: true } },
  answers: { include: { photo: true }, orderBy: { positionSnapshot: 'asc' } },
  approvedBy: { select: { id: true, name: true } },
  rejectedBy: { select: { id: true, name: true } },
};

function serializeSubmission(submission, { details = true } = {}) {
  const snapshot = parseSnapshot(submission.modelSnapshot);
  const base = {
    id: submission.id, modelId: submission.modelId, userId: submission.userId, status: submission.status,
    finalScore: decimalNumber(submission.finalScore), startedAt: submission.startedAt, finalizedAt: submission.finalizedAt,
    approvedAt: submission.approvedAt, approvedBy: submission.approvedBy, rejectedAt: submission.rejectedAt,
    rejectedBy: submission.rejectedBy, rejectionReason: submission.rejectionReason, createdAt: submission.createdAt,
    updatedAt: submission.updatedAt, user: submission.user, observer: submission.observer,
    store: submission.productionStoreId && submission.storeNameSnapshot
      ? { id: submission.productionStoreId, name: submission.storeNameSnapshot }
      : null,
    observerLocked: Boolean(snapshot.model.defaultObserverId), model: snapshot.model,
  };
  if (!details) return base;
  return { ...base, answers: submission.answers.map((answer) => ({
    id: answer.id, sourceQuestionId: answer.sourceQuestionId, text: answer.questionTextSnapshot,
    type: answer.questionTypeSnapshot, position: answer.positionSnapshot, required: answer.requiredSnapshot,
    photoAllowed: answer.photoAllowedSnapshot || answer.photoRequiredSnapshot || answer.questionTypeSnapshot === 'PHOTO',
    photoRequired: answer.photoRequiredSnapshot, observationAllowed: answer.observationAllowedSnapshot,
    observation: answer.observationText, weight: decimalNumber(answer.weightSnapshot), textValue: answer.textValue,
    numberValue: decimalNumber(answer.numberValue), booleanValue: answer.booleanValue, scoreValue: decimalNumber(answer.scoreValue),
    photo: answer.photo ? { id: answer.photo.id, mimeType: answer.photo.mimeType, size: answer.photo.size, createdAt: answer.photo.createdAt } : null,
  })) };
}

const eligibleStoreWhere = { active: true, users: { some: { active: true } } };

async function startSubmission(body, user) {
  const modelId = id(body.modelId, 'Modelo');
  const model = await prisma.formModel.findUnique({ where: { id: modelId }, include: modelInclude });
  if (!model || !model.active) fail(409, 'Este modelo não está disponível.', 'FORM_MODEL_UNAVAILABLE');
  if (user.role !== 'admin') {
    const allowed = model.rolePermissions.some((item) => item.permissionType === 'FILL' && item.role === user.role)
      || model.userPermissions.some((item) => item.permissionType === 'FILL' && item.userId === user.id);
    if (!allowed) fail(403, 'Você não possui permissão para preencher este modelo.');
  }
  if (model.defaultObserverId && !model.defaultObserver?.active) {
    fail(409, 'O observador padrão deste modelo está inativo. Solicite a correção do modelo.', 'FORM_DEFAULT_OBSERVER_INACTIVE');
  }
  if (model.defaultObserverId) await assertActiveObserver(model.defaultObserverId);
  if (model.defaultObserverId === user.id) {
    fail(409, 'O observador padrão não pode ser o autor do preenchimento.', 'FORM_OBSERVER_IS_AUTHOR');
  }
  if (model.requiresStore && !(await prisma.productionStore.findFirst({ where: eligibleStoreWhere, select: { id: true } }))) {
    fail(409, 'Nenhuma loja elegível está disponível. Solicite a configuração de uma loja ativa com usuário ativo vinculado.', 'FORM_STORE_UNAVAILABLE');
  }
  const snapshot = snapshotFromModel(model);
  const created = await prisma.$transaction(async (tx) => {
    const submission = await tx.formSubmission.create({ data: { modelId, userId: user.id, observerId: model.defaultObserverId, status: 'DRAFT', modelSnapshot: JSON.stringify(snapshot) } });
    await tx.formAnswer.createMany({ data: snapshot.questions.map((question) => ({
      submissionId: submission.id, sourceQuestionId: question.id, questionTextSnapshot: question.text,
      questionTypeSnapshot: question.type, positionSnapshot: question.position, requiredSnapshot: question.required,
      photoAllowedSnapshot: question.allowPhoto, photoRequiredSnapshot: question.photoRequired, observationAllowedSnapshot: question.allowObservation,
      weightSnapshot: question.weight,
    })) });
    return tx.formSubmission.findUnique({ where: { id: submission.id }, include: submissionInclude });
  });
  return serializeSubmission(created);
}

async function listSubmissions(query, user) {
  const { page, pageSize } = pagination(query);
  const scope = text(query.scope || 'mine').toLowerCase();
  if (!['mine', 'observing'].includes(scope)) fail(400, 'Escopo de preenchimentos inválido.');
  const where = scope === 'observing'
    ? { observerId: user.id, status: { not: 'DRAFT' } }
    : { userId: user.id };
  const status = text(query.status).toUpperCase();
  if (status) {
    if (!STATUSES.includes(status)) fail(400, 'Status inválido.');
    if (scope === 'observing' && status === 'DRAFT') fail(400, 'Rascunhos não ficam disponíveis para observadores.');
    where.status = status;
  }
  if (query.modelId) where.modelId = id(query.modelId, 'Modelo');
  const [items, total] = await prisma.$transaction([
    prisma.formSubmission.findMany({ where, include: submissionInclude, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.formSubmission.count({ where }),
  ]);
  return { items: items.map((item) => serializeSubmission(item, { details: false })), page, pageSize, total };
}

async function findSubmission(rawId) {
  const submission = await prisma.formSubmission.findUnique({ where: { id: id(rawId, 'Preenchimento') }, include: submissionInclude });
  if (!submission) fail(404, 'Preenchimento não encontrado.');
  return submission;
}

async function observerCandidates(query, user) {
  const search = text(query.search);
  return prisma.user.findMany({
    where: { active: true, NOT: { id: user.id }, OR: [{ role: 'admin' }, { formAccess: { isNot: null } }], ...(search ? { name: { contains: search } } : {}) },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: 50,
  });
}

async function stores() {
  return prisma.productionStore.findMany({
    where: eligibleStoreWhere,
    select: { id: true, displayName: true },
    orderBy: { displayName: 'asc' },
  });
}

async function updateObserver(rawId, body, user) {
  const submission = await findSubmission(rawId);
  if (submission.userId !== user.id) fail(403, 'Somente o autor pode definir o observador.');
  const snapshot = parseSnapshot(submission.modelSnapshot);
  if (snapshot.model.defaultObserverId) fail(409, 'O observador padrão deste modelo não pode ser alterado.', 'FORM_OBSERVER_LOCKED');
  const observerId = optionalId(body.observerId, 'Observador');
  if (observerId === user.id) fail(400, 'O autor não pode ser observador do próprio preenchimento.', 'FORM_OBSERVER_IS_AUTHOR');
  if (observerId) await assertActiveObserver(observerId);
  const transition = await prisma.formSubmission.updateMany({
    where: { id: submission.id, userId: user.id },
    data: { observerId },
  });
  if (transition.count !== 1) fail(409, 'O observador não pôde ser alterado.', 'FORM_OBSERVER_UPDATE_CONFLICT');
  const updated = await prisma.formSubmission.findUnique({ where: { id: submission.id }, include: submissionInclude });
  return { observer: updated.observer, observerLocked: false };
}

async function updateStore(rawId, body, user) {
  const submission = await findSubmission(rawId);
  if (submission.userId !== user.id) fail(403, 'Somente o autor pode definir a loja.');
  if (submission.status !== 'DRAFT') fail(409, 'A loja não pode ser alterada após a finalização.', 'FORM_STORE_LOCKED');
  const snapshot = parseSnapshot(submission.modelSnapshot);
  if (!snapshot.model.requiresStore) fail(409, 'Este preenchimento não exige a identificação de loja.', 'FORM_STORE_NOT_REQUIRED');
  const storeId = optionalId(body.storeId, 'Loja');
  const store = storeId ? await prisma.productionStore.findFirst({
    where: { ...eligibleStoreWhere, id: storeId },
    select: { id: true, displayName: true },
  }) : null;
  if (storeId && !store) fail(400, 'Selecione uma loja ativa com usuário ativo vinculado.', 'FORM_STORE_INVALID');
  const transition = await prisma.formSubmission.updateMany({
    where: { id: submission.id, userId: user.id, status: 'DRAFT' },
    data: { productionStoreId: store?.id || null, storeNameSnapshot: store?.displayName || null },
  });
  if (transition.count !== 1) fail(409, 'A loja não pôde ser alterada.', 'FORM_STORE_UPDATE_CONFLICT');
  return { store: store ? { id: store.id, name: store.displayName } : null };
}

async function getSubmission(rawId, user) {
  const submission = await findSubmission(rawId);
  if (!canViewSubmission(submission, user)) fail(403, 'Acesso negado.');
  return {
    ...serializeSubmission(submission),
    permissions: {
      canEdit: submission.status === 'DRAFT' && submission.userId === user.id,
      canManageObserver: submission.userId === user.id && !parseSnapshot(submission.modelSnapshot).model.defaultObserverId,
      canManageStore: submission.status === 'DRAFT' && submission.userId === user.id && Boolean(parseSnapshot(submission.modelSnapshot).model.requiresStore),
      canApprove: submission.status === 'PENDING_APPROVAL' && hasSnapshotPermission(parseSnapshot(submission.modelSnapshot), user, 'approve'),
    },
  };
}

function answerData(answer, rawValue) {
  const data = { textValue: null, numberValue: null, booleanValue: null, scoreValue: null };
  if (rawValue === null || rawValue === undefined || rawValue === '') return data;
  if (answer.questionTypeSnapshot === 'TEXT') {
    const value = text(rawValue);
    if (value.length > 5000) fail(400, 'A resposta deve ter até 5000 caracteres.');
    data.textValue = value || null;
  } else if (answer.questionTypeSnapshot === 'NUMBER') {
    data.numberValue = number(rawValue, 'Número');
  } else if (answer.questionTypeSnapshot === 'BOOLEAN') {
    if (typeof rawValue !== 'boolean') fail(400, 'A resposta deve ser Sim ou Não.');
    data.booleanValue = rawValue;
  } else if (answer.questionTypeSnapshot === 'SCORE') {
    const value = number(rawValue, 'Nota');
    const snapshot = parseSnapshot(answer.submission.modelSnapshot);
    if (value < snapshot.model.scoreMin || value > snapshot.model.scoreMax) fail(400, `A nota deve estar entre ${snapshot.model.scoreMin} e ${snapshot.model.scoreMax}.`);
    data.scoreValue = value;
  } else if (answer.questionTypeSnapshot !== 'PHOTO') fail(400, 'Tipo de pergunta inválido.');
  return data;
}

async function updateAnswer(rawSubmissionId, rawAnswerId, body, user) {
  const submissionId = id(rawSubmissionId, 'Preenchimento');
  const answerId = id(rawAnswerId, 'Resposta');
  return prisma.$transaction(async (tx) => {
    const submission = await tx.formSubmission.findUnique({ where: { id: submissionId }, include: submissionInclude });
    if (!submission) fail(404, 'Preenchimento não encontrado.');
    if (submission.userId !== user.id) fail(403, 'Somente o autor pode alterar este rascunho.');
    if (submission.status !== 'DRAFT') fail(409, 'Este preenchimento não pode mais ser alterado.', 'FORM_SUBMISSION_READ_ONLY');
    const answer = submission.answers.find((item) => item.id === answerId);
    if (!answer) fail(404, 'Resposta não encontrada neste preenchimento.');
    const updated = await tx.formAnswer.update({ where: { id: answerId }, data: answerData({ ...answer, submission }, body.value), include: { photo: true } });
    return serializeSubmission({ ...submission, answers: submission.answers.map((item) => item.id === answerId ? updated : item) }).answers.find((item) => item.id === answerId);
  });
}

async function updateObservation(rawSubmissionId, rawAnswerId, body, user) {
  const submissionId = id(rawSubmissionId, 'Preenchimento');
  const answerId = id(rawAnswerId, 'Resposta');
  if (body?.observation !== null && body?.observation !== undefined && typeof body.observation !== 'string') {
    fail(400, 'A observação deve ser um texto.');
  }
  const observation = text(body?.observation);
  if (observation.length > 1000) fail(400, 'A observação deve ter até 1000 caracteres.');
  return prisma.$transaction(async (tx) => {
    const submission = await tx.formSubmission.findUnique({ where: { id: submissionId }, include: submissionInclude });
    if (!submission) fail(404, 'Preenchimento não encontrado.');
    if (submission.userId !== user.id) fail(403, 'Somente o autor pode alterar a observação.');
    if (submission.status !== 'DRAFT') fail(409, 'Este preenchimento não pode mais ser alterado.', 'FORM_SUBMISSION_READ_ONLY');
    const answer = submission.answers.find((item) => item.id === answerId);
    if (!answer) fail(404, 'Resposta não encontrada neste preenchimento.');
    if (!answer.observationAllowedSnapshot) fail(409, 'Esta pergunta não aceita observação.', 'FORM_OBSERVATION_NOT_ALLOWED');
    const updated = await tx.formAnswer.update({ where: { id: answerId }, data: { observationText: observation || null } });
    return { observation: updated.observationText };
  });
}

function isAnswered(answer) {
  if (answer.questionTypeSnapshot === 'TEXT') return Boolean(text(answer.textValue));
  if (answer.questionTypeSnapshot === 'NUMBER') return answer.numberValue !== null;
  if (answer.questionTypeSnapshot === 'BOOLEAN') return answer.booleanValue !== null;
  if (answer.questionTypeSnapshot === 'SCORE') return answer.scoreValue !== null;
  if (answer.questionTypeSnapshot === 'PHOTO') return Boolean(answer.photo);
  return false;
}

async function finalizeSubmission(rawId, user) {
  const submission = await findSubmission(rawId);
  if (submission.userId !== user.id) fail(403, 'Somente o autor pode finalizar este preenchimento.');
  if (submission.status !== 'DRAFT') fail(409, 'Este preenchimento já foi finalizado.', 'FORM_ALREADY_FINALIZED');
  const snapshot = parseSnapshot(submission.modelSnapshot);
  if (snapshot.model.requiresStore) {
    if (!submission.productionStoreId || !submission.storeNameSnapshot) fail(400, 'Selecione a loja antes de finalizar o preenchimento.', 'FORM_STORE_REQUIRED');
    const storeAvailable = await prisma.productionStore.findFirst({ where: { ...eligibleStoreWhere, id: submission.productionStoreId }, select: { id: true } });
    if (!storeAvailable) fail(409, 'A loja selecionada não está mais disponível. Escolha outra loja antes de finalizar.', 'FORM_STORE_UNAVAILABLE');
  }
  for (const answer of submission.answers) {
    if (answer.requiredSnapshot && !isAnswered(answer)) fail(400, `Responda: ${answer.questionTextSnapshot}`);
    if (answer.photoRequiredSnapshot && !answer.photo) fail(400, `Adicione a foto obrigatória: ${answer.questionTextSnapshot}`);
  }
  let finalScore = null;
  if (snapshot.model.resultType === 'SCORE') {
    const scores = submission.answers.filter((answer) => answer.questionTypeSnapshot === 'SCORE' && answer.scoreValue !== null);
    if (!scores.length) fail(400, 'Informe pelo menos uma nota válida.');
    const weighted = snapshot.model.scoreCalculationType === 'WEIGHTED_AVERAGE';
    const numerator = scores.reduce((sum, answer) => sum + Number(answer.scoreValue) * (weighted ? Number(answer.weightSnapshot) : 1), 0);
    const denominator = scores.reduce((sum, answer) => sum + (weighted ? Number(answer.weightSnapshot) : 1), 0);
    finalScore = new Prisma.Decimal(numerator / denominator).toDecimalPlaces(4);
  }
  const status = snapshot.model.requiresApproval ? 'PENDING_APPROVAL' : 'COMPLETED';
  const transition = await prisma.formSubmission.updateMany({ where: { id: submission.id, status: 'DRAFT' }, data: { status, finalScore, finalizedAt: new Date() } });
  if (transition.count !== 1) fail(409, 'Este preenchimento já foi finalizado.', 'FORM_ALREADY_FINALIZED');
  const updated = await prisma.formSubmission.findUnique({ where: { id: submission.id }, include: submissionInclude });
  return serializeSubmission(updated);
}

async function listApprovals(query, user) {
  const { page, pageSize } = pagination(query);
  const pending = await prisma.formSubmission.findMany({ where: { status: 'PENDING_APPROVAL' }, include: submissionInclude, orderBy: { finalizedAt: 'asc' } });
  const allowed = pending.filter((submission) => hasSnapshotPermission(parseSnapshot(submission.modelSnapshot), user, 'approve'));
  const start = (page - 1) * pageSize;
  return { items: allowed.slice(start, start + pageSize).map((item) => serializeSubmission(item, { details: false })), page, pageSize, total: allowed.length };
}

async function decideSubmission(rawId, body, user, decision) {
  const submission = await findSubmission(rawId);
  if (submission.status !== 'PENDING_APPROVAL') fail(409, 'Este preenchimento não está aguardando aprovação.', 'FORM_NOT_PENDING');
  if (!hasSnapshotPermission(parseSnapshot(submission.modelSnapshot), user, 'approve')) fail(403, 'Você não possui permissão para esta aprovação.');
  const now = new Date();
  const data = decision === 'APPROVED'
    ? { status: 'APPROVED', approvedAt: now, approvedById: user.id }
    : { status: 'REJECTED', rejectedAt: now, rejectedById: user.id, rejectionReason: text(body.reason) };
  if (decision === 'REJECTED' && !data.rejectionReason) fail(400, 'Informe a justificativa da reprovação.');
  if (data.rejectionReason?.length > 1000) fail(400, 'A justificativa deve ter até 1000 caracteres.');
  const transition = await prisma.formSubmission.updateMany({ where: { id: submission.id, status: 'PENDING_APPROVAL' }, data });
  if (transition.count !== 1) fail(409, 'Este preenchimento já foi analisado.', 'FORM_NOT_PENDING');
  return serializeSubmission(await prisma.formSubmission.findUnique({ where: { id: submission.id }, include: submissionInclude }));
}

async function getPhotoRecord(rawPhotoId, user) {
  const photo = await prisma.formAnswerPhoto.findUnique({ where: { id: id(rawPhotoId, 'Foto') }, include: { answer: { include: { submission: true } } } });
  if (!photo) fail(404, 'Foto não encontrada.');
  if (!canViewSubmission(photo.answer.submission, user)) fail(403, 'Acesso negado.');
  return photo;
}

module.exports = {
  FormError, RESULT_TYPES, QUESTION_TYPES, CALCULATION_TYPES, PERMISSION_TYPES, STATUSES,
  capabilities, availableModels, observerCandidates, stores, listModels, getModel, saveModel, startSubmission, listSubmissions,
  getSubmission, updateObserver, updateStore, updateAnswer, updateObservation, finalizeSubmission, listApprovals,
  approveSubmission: (rawId, body, user) => decideSubmission(rawId, body, user, 'APPROVED'),
  rejectSubmission: (rawId, body, user) => decideSubmission(rawId, body, user, 'REJECTED'),
  findSubmission, getPhotoRecord, canViewSubmission, serializeSubmission,
};
