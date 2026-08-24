const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();
const FORTALEZA_TIME_ZONE = 'America/Fortaleza';
const RESERVATION_MODES = new Set(['TIME_SLOT', 'PERIOD']);
const ATTRIBUTE_TYPES = new Set(['BOOLEAN', 'NUMBER', 'TEXT']);
const ATTRIBUTE_ICONS = new Set([
  'laptop', 'tv', 'capacity', 'projector', 'wifi', 'video', 'parking',
  'accessibility', 'air', 'charger', 'os', 'asset', 'location', 'other',
]);
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const FORTALEZA_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?-03:00$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class ReservationError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function positiveId(value, field = 'Identificador') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ReservationError(400, `${field} inválido.`);
  return id;
}

function text(value, field, { required = false, max = 500 } = {}) {
  const normalized = String(value ?? '').trim();
  if (required && !normalized) throw new ReservationError(400, `${field} é obrigatório.`);
  if (normalized.length > max) throw new ReservationError(400, `${field} deve ter no máximo ${max} caracteres.`);
  return normalized;
}

function booleanValue(value, fallback = true) {
  return value === undefined ? fallback : Boolean(value);
}

function validDate(value) {
  if (!DATE_PATTERN.test(String(value || ''))) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addUtcDays(dateText, amount) {
  const value = new Date(`${dateText}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function parseInstant(value, field, { requireFortalezaOffset = false } = {}) {
  const raw = String(value || '');
  const pattern = requireFortalezaOffset ? FORTALEZA_INSTANT_PATTERN : RFC3339_PATTERN;
  if (!pattern.test(raw)) {
    const suffix = requireFortalezaOffset ? ' com offset -03:00' : '';
    throw new ReservationError(400, `${field} deve estar em formato RFC 3339${suffix}.`);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new ReservationError(400, `${field} inválido.`);
  return parsed;
}

function normalizeInterval(input, mode, { requireFuture = true } = {}) {
  let startAt;
  let endAt;
  if (mode === 'PERIOD') {
    const startDate = String(input?.startDate || '');
    const endDate = String(input?.endDate || '');
    if (!validDate(startDate) || !validDate(endDate)) {
      throw new ReservationError(400, 'Informe datas inicial e final válidas.');
    }
    startAt = new Date(`${startDate}T03:00:00.000Z`);
    endAt = new Date(`${addUtcDays(endDate, 1)}T03:00:00.000Z`);
  } else {
    startAt = parseInstant(input?.startAt, 'Início', { requireFortalezaOffset: true });
    endAt = parseInstant(input?.endAt, 'Fim', { requireFortalezaOffset: true });
  }
  if (startAt >= endAt) throw new ReservationError(400, 'O início deve ser anterior ao fim.');
  if (requireFuture && startAt <= new Date()) throw new ReservationError(400, 'Não é possível reservar um período no passado.');
  return { startAt, endAt };
}

function parseAttributeDefinitions(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ReservationError(400, 'Parâmetros do tipo devem ser uma lista.');
  if (value.length > 20) throw new ReservationError(400, 'Cada tipo pode ter no máximo 20 parâmetros.');
  const keys = new Set();
  return value.map((definition, index) => {
    const key = text(definition?.key, `Chave do parâmetro ${index + 1}`, { required: true, max: 50 }).toLowerCase();
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      throw new ReservationError(400, `A chave ${key} deve começar com letra e usar apenas letras minúsculas, números e _.`);
    }
    if (keys.has(key)) throw new ReservationError(400, `A chave ${key} está duplicada.`);
    keys.add(key);
    const type = String(definition?.type || 'TEXT').toUpperCase();
    if (!ATTRIBUTE_TYPES.has(type)) throw new ReservationError(400, `Tipo inválido no parâmetro ${key}.`);
    const icon = String(definition?.icon || 'other').toLowerCase();
    if (!ATTRIBUTE_ICONS.has(icon)) throw new ReservationError(400, `Ícone inválido no parâmetro ${key}.`);
    return {
      key,
      label: text(definition?.label, `Nome do parâmetro ${index + 1}`, { required: true, max: 80 }),
      type,
      icon,
    };
  });
}

function parseAttributes(value, definitions = []) {
  const attributes = value ?? {};
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
    throw new ReservationError(400, 'Atributos devem ser um objeto com pares de chave e valor.');
  }
  const normalized = {};
  if (definitions.length) {
    for (const definition of definitions) {
      const rawValue = attributes[definition.key];
      if (definition.type === 'BOOLEAN') {
        normalized[definition.key] = rawValue === true || rawValue === 'true' || rawValue === 1 || rawValue === '1';
      } else if (definition.type === 'NUMBER') {
        if (rawValue === '' || rawValue === null || rawValue === undefined) continue;
        const number = Number(rawValue);
        if (!Number.isFinite(number) || number < 0) throw new ReservationError(400, `${definition.label} deve ser um número maior ou igual a zero.`);
        normalized[definition.key] = number;
      } else {
        const normalizedText = text(rawValue, definition.label, { max: 300 });
        if (normalizedText) normalized[definition.key] = normalizedText;
      }
    }
    return JSON.stringify(normalized);
  }
  for (const [rawKey, rawValue] of Object.entries(attributes)) {
    const key = text(rawKey, 'Nome do atributo', { required: true, max: 80 });
    if (!['string', 'number', 'boolean'].includes(typeof rawValue)) {
      throw new ReservationError(400, `O atributo ${key} deve ser texto, número ou booleano.`);
    }
    normalized[key] = typeof rawValue === 'string'
      ? text(rawValue, `Valor de ${key}`, { max: 300 })
      : rawValue;
  }
  const serialized = JSON.stringify(normalized);
  if (serialized.length > 4000) throw new ReservationError(400, 'Os atributos excedem o limite permitido.');
  return serialized;
}

function decodedAttributes(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function decodedAttributeDefinitions(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

const resourceInclude = { type: true };
const reservationInclude = { resource: { include: { type: true } }, user: true, cancelledBy: true };
const blockInclude = { resource: { include: { type: true } }, createdBy: true, cancelledBy: true };

function serializeType(type) {
  return {
    id: type.id, name: type.name, description: type.description, active: type.active,
    reservationMode: type.reservationMode,
    attributeDefinitions: decodedAttributeDefinitions(type.attributeDefinitions),
    createdAt: type.createdAt, updatedAt: type.updatedAt,
  };
}

function serializeResource(resource) {
  return {
    id: resource.id, typeId: resource.typeId, name: resource.name,
    description: resource.description, location: resource.location, active: resource.active,
    requiresApproval: resource.requiresApproval, attributes: decodedAttributes(resource.attributes),
    type: resource.type ? serializeType(resource.type) : undefined,
    createdAt: resource.createdAt, updatedAt: resource.updatedAt,
  };
}

function serializeReservation(reservation, viewer) {
  const canSeeDetails = viewer?.role === 'admin' || Number(viewer?.id) === reservation.userId;
  return {
    id: reservation.id, kind: 'RESERVATION', resourceId: reservation.resourceId,
    resource: serializeResource(reservation.resource), startAt: reservation.startAt,
    endAt: reservation.endAt, status: reservation.status, mine: Number(viewer?.id) === reservation.userId,
    ...(canSeeDetails ? {
      purpose: reservation.purpose,
      user: { id: reservation.user.id, name: reservation.user.name },
      cancelledAt: reservation.cancelledAt,
      cancellationReason: reservation.cancellationReason,
      cancelledBy: reservation.cancelledBy ? { id: reservation.cancelledBy.id, name: reservation.cancelledBy.name } : null,
    } : {}),
    createdAt: reservation.createdAt, updatedAt: reservation.updatedAt,
  };
}

function serializeBlock(block, viewer) {
  return {
    id: block.id, kind: 'BLOCK', resourceId: block.resourceId,
    resource: serializeResource(block.resource), startAt: block.startAt, endAt: block.endAt,
    status: block.status,
    ...(viewer?.role === 'admin' ? {
      reason: block.reason,
      createdBy: { id: block.createdBy.id, name: block.createdBy.name },
      cancelledAt: block.cancelledAt,
      cancellationReason: block.cancellationReason,
      cancelledBy: block.cancelledBy ? { id: block.cancelledBy.id, name: block.cancelledBy.name } : null,
    } : {}),
    createdAt: block.createdAt, updatedAt: block.updatedAt,
  };
}

async function getResourceOrThrow(client, resourceId, { requireActive = false } = {}) {
  const resource = await client.reservationResource.findUnique({ where: { id: positiveId(resourceId, 'Recurso') }, include: resourceInclude });
  if (!resource) throw new ReservationError(404, 'Recurso não encontrado.');
  if (requireActive && (!resource.active || !resource.type.active)) {
    throw new ReservationError(409, 'O recurso ou seu tipo está inativo e não pode ser reservado.');
  }
  return resource;
}

async function findConflict(client, resourceId, startAt, endAt) {
  const interval = { startAt: { lt: endAt }, endAt: { gt: startAt } };
  const [reservation, block] = await Promise.all([
    client.reservation.findFirst({ where: { resourceId, status: 'CONFIRMED', ...interval }, select: { id: true } }),
    client.reservationBlock.findFirst({ where: { resourceId, status: 'ACTIVE', ...interval }, select: { id: true } }),
  ]);
  return reservation ? 'RESERVATION' : block ? 'BLOCK' : null;
}

function conflictMessage(resourceName) {
  return `${resourceName} acabou de ser reservado ou bloqueado nesse horário. Escolha outro horário ou outro recurso.`;
}

function mapDatabaseConflict(error, resourceName = 'O recurso') {
  const message = String(error?.message || '');
  if (/RESERVATION_CONFLICT|RESERVATION_BLOCK_CONFLICT|BLOCK_RESERVATION_CONFLICT|BLOCK_CONFLICT/.test(message)) {
    return new ReservationError(409, conflictMessage(resourceName), { code: 'RESERVATION_CONFLICT' });
  }
  return null;
}

async function withWriteRetry(operation) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (error?.code !== 'P2034') throw error;
    }
  }
  throw lastError;
}

async function listResourceTypes({ admin = false } = {}) {
  const types = await prisma.reservationResourceType.findMany({
    where: admin ? {} : { active: true }, orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });
  return types.map(serializeType);
}

async function saveResourceType(data, id) {
  const name = text(data?.name, 'Nome', { required: true, max: 120 });
  const reservationMode = String(data?.reservationMode || 'TIME_SLOT').toUpperCase();
  if (!RESERVATION_MODES.has(reservationMode)) throw new ReservationError(400, 'Modo de reserva inválido.');
  const payload = {
    name, description: text(data?.description, 'Descrição', { max: 500 }),
    active: booleanValue(data?.active), reservationMode,
    attributeDefinitions: JSON.stringify(parseAttributeDefinitions(data?.attributeDefinitions)),
  };
  try {
    const type = id
      ? await prisma.reservationResourceType.update({ where: { id: positiveId(id, 'Tipo') }, data: payload })
      : await prisma.reservationResourceType.create({ data: payload });
    return serializeType(type);
  } catch (error) {
    if (error?.code === 'P2002') throw new ReservationError(409, 'Já existe um tipo de recurso com esse nome.');
    if (error?.code === 'P2025') throw new ReservationError(404, 'Tipo de recurso não encontrado.');
    throw error;
  }
}

async function listResources({ admin = false, typeId } = {}) {
  const where = {
    ...(admin ? {} : { active: true, type: { active: true } }),
    ...(typeId ? { typeId: positiveId(typeId, 'Tipo') } : {}),
  };
  const resources = await prisma.reservationResource.findMany({ where, include: resourceInclude, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  return resources.map(serializeResource);
}

async function saveResource(data, id) {
  const typeId = positiveId(data?.typeId, 'Tipo');
  const type = await prisma.reservationResourceType.findUnique({ where: { id: typeId } });
  if (!type) throw new ReservationError(404, 'Tipo de recurso não encontrado.');
  const payload = {
    typeId, name: text(data?.name, 'Nome', { required: true, max: 120 }),
    description: text(data?.description, 'Descrição', { max: 500 }),
    location: text(data?.location, 'Localização', { max: 180 }),
    active: booleanValue(data?.active), requiresApproval: booleanValue(data?.requiresApproval, false),
    attributes: parseAttributes(data?.attributes, decodedAttributeDefinitions(type.attributeDefinitions)),
  };
  try {
    const resource = id
      ? await prisma.reservationResource.update({ where: { id: positiveId(id, 'Recurso') }, data: payload, include: resourceInclude })
      : await prisma.reservationResource.create({ data: payload, include: resourceInclude });
    return serializeResource(resource);
  } catch (error) {
    if (error?.code === 'P2002') throw new ReservationError(409, 'Já existe um recurso com esse nome neste tipo.');
    if (error?.code === 'P2025') throw new ReservationError(404, 'Recurso não encontrado.');
    throw error;
  }
}

async function availability(query) {
  const typeId = positiveId(query?.typeId, 'Tipo');
  const type = await prisma.reservationResourceType.findUnique({ where: { id: typeId } });
  if (!type || !type.active) throw new ReservationError(409, 'O tipo de recurso está inativo ou não existe.');
  const { startAt, endAt } = normalizeInterval(query, type.reservationMode);
  const resources = await prisma.reservationResource.findMany({ where: { typeId, active: true }, include: resourceInclude, orderBy: { name: 'asc' } });
  const rows = await Promise.all(resources.map(async (resource) => {
    const conflict = await findConflict(prisma, resource.id, startAt, endAt);
    return { ...serializeResource(resource), available: !conflict, unavailableReason: conflict ? 'Ocupado no período selecionado.' : '' };
  }));
  rows.sort((left, right) => Number(right.available) - Number(left.available) || left.name.localeCompare(right.name, 'pt-BR'));
  return { startAt, endAt, resources: rows };
}

async function createReservation(data, user) {
  const resource = await getResourceOrThrow(prisma, data?.resourceId, { requireActive: true });
  const interval = normalizeInterval(data, resource.type.reservationMode);
  const purpose = text(data?.purpose, 'Finalidade', { required: true, max: 500 });
  try {
    const reservation = await withWriteRetry(() => prisma.$transaction(async (tx) => {
      const current = await getResourceOrThrow(tx, resource.id, { requireActive: true });
      if (await findConflict(tx, current.id, interval.startAt, interval.endAt)) {
        throw new ReservationError(409, conflictMessage(current.name), { code: 'RESERVATION_CONFLICT' });
      }
      return tx.reservation.create({
        data: { resourceId: current.id, userId: user.id, ...interval, purpose }, include: reservationInclude,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 5000 }));
    return serializeReservation(reservation, user);
  } catch (error) {
    throw mapDatabaseConflict(error, resource.name) || error;
  }
}

async function cancelReservation(id, data, user, { admin = false } = {}) {
  const reservationId = positiveId(id, 'Reserva');
  const current = await prisma.reservation.findUnique({ where: { id: reservationId }, include: reservationInclude });
  if (!current) throw new ReservationError(404, 'Reserva não encontrada.');
  if (!admin && current.userId !== user.id) throw new ReservationError(403, 'Você não pode cancelar a reserva de outro usuário.');
  if (!admin && current.startAt <= new Date()) throw new ReservationError(409, 'Somente reservas futuras podem ser canceladas.');
  if (current.status === 'CANCELLED') return serializeReservation(current, user);
  const updated = await prisma.reservation.update({
    where: { id: reservationId }, data: {
      status: 'CANCELLED', cancelledAt: new Date(), cancelledById: user.id,
      cancellationReason: text(data?.reason, 'Motivo', { max: 500 }),
    }, include: reservationInclude,
  });
  return serializeReservation(updated, user);
}

function parseRange(query) {
  const startAt = parseInstant(query?.startAt, 'Início');
  const endAt = parseInstant(query?.endAt, 'Fim');
  if (startAt >= endAt) throw new ReservationError(400, 'O início deve ser anterior ao fim.');
  if (endAt.getTime() - startAt.getTime() > 42 * 24 * 60 * 60 * 1000) throw new ReservationError(400, 'Consulte no máximo 42 dias por vez.');
  return { startAt, endAt };
}

async function calendar(query, viewer) {
  const { startAt, endAt } = parseRange(query);
  const resourceWhere = {
    ...(query?.typeId ? { typeId: positiveId(query.typeId, 'Tipo') } : {}),
    ...(query?.resourceId ? { id: positiveId(query.resourceId, 'Recurso') } : {}),
  };
  const interval = { startAt: { lt: endAt }, endAt: { gt: startAt } };
  const [reservations, blocks] = await Promise.all([
    prisma.reservation.findMany({ where: { status: 'CONFIRMED', ...interval, resource: resourceWhere }, include: reservationInclude, orderBy: { startAt: 'asc' } }),
    prisma.reservationBlock.findMany({ where: { status: 'ACTIVE', ...interval, resource: resourceWhere }, include: blockInclude, orderBy: { startAt: 'asc' } }),
  ]);
  return [...reservations.map((item) => serializeReservation(item, viewer)), ...blocks.map((item) => serializeBlock(item, viewer))]
    .sort((left, right) => new Date(left.startAt) - new Date(right.startAt));
}

async function mine(user) {
  const reservations = await prisma.reservation.findMany({ where: { userId: user.id }, include: reservationInclude, orderBy: { startAt: 'desc' } });
  return reservations.map((item) => serializeReservation(item, user));
}

async function createBlock(data, user) {
  const resource = await getResourceOrThrow(prisma, data?.resourceId);
  const interval = normalizeInterval(data, resource.type.reservationMode, { requireFuture: false });
  const reason = text(data?.reason, 'Motivo', { required: true, max: 500 });
  try {
    const block = await withWriteRetry(() => prisma.$transaction(async (tx) => {
      if (await findConflict(tx, resource.id, interval.startAt, interval.endAt)) {
        throw new ReservationError(409, 'Existe uma reserva ou bloqueio ativo nesse período.', { code: 'RESERVATION_CONFLICT' });
      }
      return tx.reservationBlock.create({ data: { resourceId: resource.id, createdById: user.id, ...interval, reason }, include: blockInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 5000 }));
    return serializeBlock(block, user);
  } catch (error) {
    throw mapDatabaseConflict(error, resource.name) || error;
  }
}

async function listBlocks(viewer) {
  const blocks = await prisma.reservationBlock.findMany({ include: blockInclude, orderBy: [{ startAt: 'desc' }, { id: 'desc' }] });
  return blocks.map((item) => serializeBlock(item, viewer));
}

async function cancelBlock(id, data, user) {
  const blockId = positiveId(id, 'Bloqueio');
  const current = await prisma.reservationBlock.findUnique({ where: { id: blockId }, include: blockInclude });
  if (!current) throw new ReservationError(404, 'Bloqueio não encontrado.');
  if (current.status === 'CANCELLED') return serializeBlock(current, user);
  const updated = await prisma.reservationBlock.update({
    where: { id: blockId }, data: {
      status: 'CANCELLED', cancelledAt: new Date(), cancelledById: user.id,
      cancellationReason: text(data?.reason, 'Motivo', { max: 500 }),
    }, include: blockInclude,
  });
  return serializeBlock(updated, user);
}

async function listAllReservations(query, viewer) {
  const page = Math.max(1, Number(query?.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query?.pageSize) || 50));
  const where = {
    ...(query?.status ? { status: String(query.status).toUpperCase() } : {}),
    ...(query?.resourceId ? { resourceId: positiveId(query.resourceId, 'Recurso') } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.reservation.findMany({ where, include: reservationInclude, orderBy: [{ startAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.reservation.count({ where }),
  ]);
  return { items: items.map((item) => serializeReservation(item, viewer)), page, pageSize, total };
}

module.exports = {
  FORTALEZA_TIME_ZONE, ReservationError, availability, calendar, cancelBlock, cancelReservation,
  createBlock, createReservation, listAllReservations, listBlocks, listResources, listResourceTypes,
  mine, normalizeInterval, parseAttributeDefinitions, parseAttributes, saveResource, saveResourceType,
};
