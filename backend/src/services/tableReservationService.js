const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();
const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_INPUT_PATTERN = /^[\d\s()+.-]+$/;
const PHONE_DIGITS_PATTERN = /^\d{10,11}$/;
const STATUS = Object.freeze({ CONFIRMED: 'CONFIRMADA', CHECKED_IN: 'COMPARECEU' });

class TableReservationError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function positiveId(value, field = 'Identificador') {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new TableReservationError(400, `${field} inválido.`);
  return parsed;
}

function requiredText(value, field, max) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TableReservationError(400, `${field} é obrigatório.`);
  if (normalized.length > max) throw new TableReservationError(400, `${field} deve ter no máximo ${max} caracteres.`);
  return normalized;
}

function validDate(value) {
  if (!DATE_PATTERN.test(String(value || ''))) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addDateDays(dateText, days) {
  const value = new Date(`${dateText}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function localInstant(date, time) {
  if (!validDate(date)) throw new TableReservationError(400, 'Informe uma data válida.');
  if (!TIME_PATTERN.test(String(time || ''))) throw new TableReservationError(400, 'Informe um horário válido.');
  const parsed = new Date(`${date}T${time}:00-03:00`);
  if (Number.isNaN(parsed.getTime())) throw new TableReservationError(400, 'Data ou horário inválido.');
  return parsed;
}

function dateRange(date) {
  if (!validDate(date)) throw new TableReservationError(400, 'Informe uma data válida no formato AAAA-MM-DD.');
  return {
    gte: new Date(`${date}T00:00:00-03:00`),
    lt: new Date(`${addDateDays(date, 1)}T00:00:00-03:00`),
  };
}

function formatLocalParts(value) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: SAO_PAULO_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(value);
  return { date, time };
}

async function capabilitiesFor(user) {
  if (!user?.id) return { hasAccess: false, canView: false, canCreate: false, canCheckIn: false, canManageTables: false, productionStoreId: null };
  const access = await prisma.tableReservationAccess.findUnique({ where: { userId: user.id } });
  const canCreate = Boolean(access?.canCreate);
  const canView = canCreate || Boolean(access?.canView);
  const productionStoreId = user.role === 'store' ? Number(user.productionStoreId) || null : null;
  const hasAccess = canView && (user.role !== 'store' || Boolean(productionStoreId));
  return {
    hasAccess,
    canView: hasAccess,
    canCreate: hasAccess && canCreate,
    canCheckIn: hasAccess && canCreate,
    canManageTables: user.role === 'admin',
    productionStoreId,
  };
}

async function assertStoreAccess(storeId, user, { requireCheckIn = false } = {}) {
  const id = positiveId(storeId, 'Unidade');
  const capabilities = await capabilitiesFor(user);
  if (!capabilities.hasAccess) throw new TableReservationError(403, 'Você não possui acesso à Central de Reservas.');
  if (capabilities.productionStoreId && capabilities.productionStoreId !== id) {
    throw new TableReservationError(403, 'Você só pode acessar reservas da sua unidade.');
  }
  if (requireCheckIn && !capabilities.canCheckIn) {
    throw new TableReservationError(403, 'Você não possui permissão para confirmar comparecimentos.');
  }
  return { id, capabilities };
}

const reservationInclude = {
  productionStore: true,
  createdBy: { select: { id: true, name: true } },
  checkedInBy: { select: { id: true, name: true } },
  tables: { include: { table: true }, orderBy: { restaurantTableId: 'asc' } },
};

function serializeTable(table) {
  return {
    id: table.id, productionStoreId: table.productionStoreId, name: table.name,
    capacity: table.capacity, active: table.active, createdAt: table.createdAt, updatedAt: table.updatedAt,
    ...(table.productionStore ? { unit: { id: table.productionStore.id, name: table.productionStore.displayName } } : {}),
  };
}

function serializeReservation(item, { includeCustomerPhone = false } = {}) {
  const local = formatLocalParts(item.reservationAt);
  return {
    id: item.id,
    unitId: item.productionStoreId,
    unit: { id: item.productionStore.id, name: item.productionStore.displayName },
    customerName: item.customerName,
    customerEmail: item.customerEmail,
    ...(includeCustomerPhone ? { customerPhone: item.customerPhone } : {}),
    reservationAt: item.reservationAt,
    reservationDate: local.date,
    reservationTime: local.time,
    peopleCount: item.peopleCount,
    status: item.status,
    tables: item.tables.map(({ table }) => serializeTable(table)),
    createdBy: item.createdBy,
    checkedInBy: item.checkedInBy,
    checkedInAt: item.checkedInAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function listUnits(user) {
  const capabilities = await capabilitiesFor(user);
  if (!capabilities.hasAccess) throw new TableReservationError(403, 'Você não possui acesso à Central de Reservas.');
  const units = await prisma.productionStore.findMany({
    where: { active: true, tableReservationsEnabled: true, ...(capabilities.productionStoreId ? { id: capabilities.productionStoreId } : {}) },
    select: { id: true, displayName: true }, orderBy: { displayName: 'asc' },
  });
  return units.map((unit) => ({ id: unit.id, name: unit.displayName }));
}

async function getActiveStore(storeId, user) {
  const { id } = await assertStoreAccess(storeId, user);
  const store = await prisma.productionStore.findFirst({
    where: { id, active: true, tableReservationsEnabled: true }, select: { id: true },
  });
  if (!store) throw new TableReservationError(404, 'Esta unidade não está habilitada para reservas de mesa.');
  return store;
}

async function listReservations(query, user) {
  const store = await getActiveStore(query?.unitId, user);
  const reservationAt = dateRange(String(query?.date || ''));
  const items = await prisma.tableReservation.findMany({
    where: { productionStoreId: store.id, reservationAt }, include: reservationInclude,
    orderBy: [{ reservationAt: 'asc' }, { id: 'asc' }],
  });
  return {
    items: items.map(serializeReservation),
    summary: {
      reservations: items.length,
      expectedPeople: items.reduce((total, item) => total + item.peopleCount, 0),
      checkedInPeople: items.filter((item) => item.status === STATUS.CHECKED_IN).reduce((total, item) => total + item.peopleCount, 0),
    },
  };
}

async function createReservation(data, user) {
  const capabilities = await capabilitiesFor(user);
  if (!capabilities.canCreate) throw new TableReservationError(403, 'Você não possui permissão para criar reservas.');
  const store = await getActiveStore(data?.unitId, user);
  const customerName = requiredText(data?.customerName, 'Nome completo', 160);
  const customerEmail = requiredText(data?.customerEmail, 'E-mail', 254).toLowerCase();
  if (!EMAIL_PATTERN.test(customerEmail)) throw new TableReservationError(400, 'Informe um e-mail válido.');
  const customerPhoneInput = requiredText(data?.customerPhone, 'Número do cliente', 24);
  const customerPhone = customerPhoneInput.replace(/\D/g, '');
  if (!PHONE_INPUT_PATTERN.test(customerPhoneInput) || !PHONE_DIGITS_PATTERN.test(customerPhone)) {
    throw new TableReservationError(400, 'Informe um telefone válido com DDD.');
  }
  const peopleCount = Number(data?.peopleCount);
  if (!Number.isInteger(peopleCount) || peopleCount < 1 || peopleCount > 500) {
    throw new TableReservationError(400, 'A quantidade de pessoas deve ser um número inteiro entre 1 e 500.');
  }
  const reservationAt = localInstant(String(data?.reservationDate || ''), String(data?.reservationTime || ''));
  if (reservationAt <= new Date()) throw new TableReservationError(400, 'Não é possível criar uma reserva no passado.');
  const created = await prisma.tableReservation.create({
    data: { productionStoreId: store.id, customerName, customerEmail, customerPhone, reservationAt, peopleCount, createdById: user.id },
    include: reservationInclude,
  });
  return serializeReservation(created);
}

async function getReservation(id, user) {
  const reservationId = positiveId(id, 'Reserva');
  const item = await prisma.tableReservation.findUnique({ where: { id: reservationId }, include: reservationInclude });
  if (!item) throw new TableReservationError(404, 'Reserva não encontrada.');
  await assertStoreAccess(item.productionStoreId, user);
  return serializeReservation(item, { includeCustomerPhone: true });
}

async function listTables(query, user) {
  const { id } = await assertStoreAccess(query?.unitId, user, { requireCheckIn: true });
  const tables = await prisma.restaurantTable.findMany({
    where: { productionStoreId: id, active: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  return tables.map(serializeTable);
}

async function checkInReservation(id, data, user) {
  const reservationId = positiveId(id, 'Reserva');
  const rawIds = Array.isArray(data?.tableIds) ? data.tableIds : [];
  const tableIds = [...new Set(rawIds.map((value) => positiveId(value, 'Mesa')))];
  if (!tableIds.length) throw new TableReservationError(400, 'Selecione pelo menos uma mesa.');
  if (tableIds.length > 30) throw new TableReservationError(400, 'Selecione no máximo 30 mesas.');

  const current = await prisma.tableReservation.findUnique({ where: { id: reservationId }, select: { id: true, productionStoreId: true, status: true } });
  if (!current) throw new TableReservationError(404, 'Reserva não encontrada.');
  await assertStoreAccess(current.productionStoreId, user, { requireCheckIn: true });
  if (current.status === STATUS.CHECKED_IN) throw new TableReservationError(409, 'O comparecimento desta reserva já foi confirmado.');

  const tables = await prisma.restaurantTable.findMany({
    where: { id: { in: tableIds }, productionStoreId: current.productionStoreId, active: true }, select: { id: true },
  });
  if (tables.length !== tableIds.length) throw new TableReservationError(400, 'Selecione apenas mesas ativas da unidade da reserva.');

  try {
    const checkedIn = await prisma.$transaction(async (tx) => {
      const updated = await tx.tableReservation.updateMany({
        where: { id: reservationId, status: STATUS.CONFIRMED, checkedInAt: null },
        data: { status: STATUS.CHECKED_IN, checkedInById: user.id, checkedInAt: new Date() },
      });
      if (updated.count !== 1) throw new TableReservationError(409, 'O comparecimento desta reserva já foi confirmado.');
      await tx.tableReservationAssignment.createMany({
        data: tableIds.map((restaurantTableId) => ({ tableReservationId: reservationId, restaurantTableId })),
      });
      return tx.tableReservation.findUnique({ where: { id: reservationId }, include: reservationInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 5000 });
    return serializeReservation(checkedIn, { includeCustomerPhone: true });
  } catch (error) {
    if (error instanceof TableReservationError) throw error;
    if (error?.code === 'P2002') throw new TableReservationError(409, 'O comparecimento desta reserva já foi confirmado.');
    throw error;
  }
}

async function getAccessSettings() {
  const [accesses, enabledUnits] = await Promise.all([
    prisma.tableReservationAccess.findMany({ orderBy: { userId: 'asc' } }),
    prisma.productionStore.findMany({
      where: { tableReservationsEnabled: true }, select: { id: true }, orderBy: { id: 'asc' },
    }),
  ]);
  return {
    creatorUserIds: accesses.filter((item) => item.canCreate).map((item) => item.userId),
    viewerUserIds: accesses.filter((item) => !item.canCreate && item.canView).map((item) => item.userId),
    enabledUnitIds: enabledUnits.map((unit) => unit.id),
  };
}

async function updateAccessSettings(data) {
  if (!Array.isArray(data?.creatorUserIds) || !Array.isArray(data?.viewerUserIds) || !Array.isArray(data?.enabledUnitIds)) {
    throw new TableReservationError(400, 'Informe as listas de usuários e unidades habilitadas.');
  }
  const creatorUserIds = [...new Set(data.creatorUserIds.map((value) => positiveId(value, 'Usuário')))];
  const creatorSet = new Set(creatorUserIds);
  const viewerUserIds = [...new Set(data.viewerUserIds.map((value) => positiveId(value, 'Usuário')))].filter((id) => !creatorSet.has(id));
  const allIds = [...creatorUserIds, ...viewerUserIds];
  const users = await prisma.user.findMany({
    where: { id: { in: allIds }, active: true }, select: { id: true },
  });
  if (users.length !== allIds.length) throw new TableReservationError(400, 'Selecione apenas usuários ativos.');
  const enabledUnitIds = [...new Set(data.enabledUnitIds.map((value) => positiveId(value, 'Unidade')))];
  const units = await prisma.productionStore.findMany({
    where: { id: { in: enabledUnitIds }, active: true }, select: { id: true },
  });
  if (units.length !== enabledUnitIds.length) throw new TableReservationError(400, 'Selecione apenas unidades ativas.');
  await prisma.$transaction([
    prisma.tableReservationAccess.deleteMany(),
    ...creatorUserIds.map((userId) => prisma.tableReservationAccess.create({ data: { userId, canCreate: true, canView: true } })),
    ...viewerUserIds.map((userId) => prisma.tableReservationAccess.create({ data: { userId, canCreate: false, canView: true } })),
    prisma.productionStore.updateMany({ where: { tableReservationsEnabled: true }, data: { tableReservationsEnabled: false } }),
    prisma.productionStore.updateMany({
      where: { id: { in: enabledUnitIds }, active: true }, data: { tableReservationsEnabled: true },
    }),
  ]);
  return { creatorUserIds, viewerUserIds, enabledUnitIds };
}

async function adminListTables(query) {
  const where = query?.unitId ? { productionStoreId: positiveId(query.unitId, 'Unidade') } : {};
  const tables = await prisma.restaurantTable.findMany({
    where, include: { productionStore: true }, orderBy: [{ productionStore: { displayName: 'asc' } }, { active: 'desc' }, { name: 'asc' }],
  });
  return tables.map(serializeTable);
}

async function saveTable(data, id) {
  const productionStoreId = positiveId(data?.unitId, 'Unidade');
  const name = requiredText(data?.name, 'Nome da mesa', 80);
  const capacity = data?.capacity === '' || data?.capacity === null || data?.capacity === undefined ? null : Number(data.capacity);
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 500)) {
    throw new TableReservationError(400, 'A capacidade deve ser um número inteiro entre 1 e 500.');
  }
  const active = data?.active === undefined ? true : Boolean(data.active);
  const store = await prisma.productionStore.findUnique({ where: { id: productionStoreId }, select: { id: true } });
  if (!store) throw new TableReservationError(404, 'Unidade não encontrada.');
  if (id) {
    const current = await prisma.restaurantTable.findUnique({ where: { id: positiveId(id, 'Mesa') }, select: { productionStoreId: true } });
    if (!current) throw new TableReservationError(404, 'Mesa não encontrada.');
    if (current.productionStoreId !== productionStoreId) {
      throw new TableReservationError(400, 'A unidade de uma mesa cadastrada não pode ser alterada.');
    }
  }
  try {
    const table = id
      ? await prisma.restaurantTable.update({
        where: { id: positiveId(id, 'Mesa') }, data: { productionStoreId, name, capacity, active }, include: { productionStore: true },
      })
      : await prisma.restaurantTable.create({ data: { productionStoreId, name, capacity, active }, include: { productionStore: true } });
    return serializeTable(table);
  } catch (error) {
    if (error?.code === 'P2002') throw new TableReservationError(409, 'Já existe uma mesa com esse nome nesta unidade.');
    if (error?.code === 'P2025') throw new TableReservationError(404, 'Mesa não encontrada.');
    throw error;
  }
}

module.exports = {
  STATUS, SAO_PAULO_TIME_ZONE, TableReservationError, capabilitiesFor, listUnits, listReservations,
  createReservation, getReservation, listTables, checkInReservation, getAccessSettings,
  updateAccessSettings, adminListTables, saveTable,
};
