const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const RECURRENCES = new Set(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 24 * 60 * 60 * 1000;

class CalendarEventError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseDate(value, fieldName) {
  if (!ISO_DATE.test(String(value || ''))) {
    throw new CalendarEventError(400, `${fieldName} inválida.`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new CalendarEventError(400, `${fieldName} inválida.`);
  }
  return date;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, amount) {
  return new Date(date.getTime() + (amount * DAY_MS));
}

function addMonths(date, amount) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + amount;
  const day = date.getUTCDate();
  const candidate = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0)).getUTCDate();
  candidate.setUTCDate(Math.min(day, lastDay));
  return candidate;
}

function normalizePayload(body = {}) {
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const startDate = String(body.startDate || '');
  const endDate = String(body.endDate || '');
  const time = String(body.time || '');
  const imageUrl = String(body.imageUrl || '').trim();
  const recurrence = String(body.recurrence || 'NONE').toUpperCase();
  const recurrenceEndDate = recurrence === 'NONE' ? null : String(body.recurrenceEndDate || '');
  const allUsersParticipants = body.allUsersParticipants !== false;
  const participantIds = allUsersParticipants
    ? []
    : [...new Set((Array.isArray(body.participantIds) ? body.participantIds : []).map(Number))];

  if (!title) throw new CalendarEventError(400, 'Informe o título do evento.');
  if (title.length > 160) throw new CalendarEventError(400, 'O título deve ter no máximo 160 caracteres.');
  if (!description) throw new CalendarEventError(400, 'Informe a descrição do evento.');
  if (description.length > 5000) throw new CalendarEventError(400, 'A descrição deve ter no máximo 5.000 caracteres.');
  if (!TIME.test(time)) throw new CalendarEventError(400, 'Informe um horário válido.');
  if (!RECURRENCES.has(recurrence)) throw new CalendarEventError(400, 'Repetição inválida.');
  if (imageUrl.length > 2000) throw new CalendarEventError(400, 'A URL da imagem é muito longa.');
  if (participantIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new CalendarEventError(400, 'A lista de participantes é inválida.');
  }
  if (!allUsersParticipants && !participantIds.length) {
    throw new CalendarEventError(400, 'Selecione pelo menos um participante.');
  }

  const start = parseDate(startDate, 'Data inicial');
  const end = parseDate(endDate, 'Data final');
  if (end < start) throw new CalendarEventError(400, 'A data final não pode ser anterior à data inicial.');

  if (recurrence !== 'NONE') {
    const recurrenceEnd = parseDate(recurrenceEndDate, 'Data final da repetição');
    if (recurrenceEnd < start) {
      throw new CalendarEventError(400, 'A repetição não pode terminar antes do primeiro evento.');
    }
  }

  return {
    eventData: { title, description, startDate, endDate, time, imageUrl, recurrence, recurrenceEndDate, allUsersParticipants },
    participantIds
  };
}

async function validateParticipantIds(participantIds) {
  if (!participantIds.length) return;
  const users = await prisma.user.findMany({
    where: { id: { in: participantIds }, active: true },
    select: { id: true }
  });
  if (users.length !== participantIds.length) {
    throw new CalendarEventError(400, 'Um ou mais participantes não estão disponíveis.');
  }
}

function serializeEvent(event) {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    startDate: event.startDate,
    endDate: event.endDate,
    time: event.time,
    imageUrl: event.imageUrl,
    allUsersParticipants: event.allUsersParticipants,
    participants: (event.participants || []).map((participant) => participant.user),
    recurrence: event.recurrence,
    recurrenceEndDate: event.recurrenceEndDate,
    createdBy: event.createdBy ? { id: event.createdBy.id, name: event.createdBy.name } : null,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt
  };
}

function expandEvent(event, fromDate, toDate) {
  const baseStart = parseDate(event.startDate, 'Data inicial');
  const baseEnd = parseDate(event.endDate, 'Data final');
  const durationDays = Math.round((baseEnd - baseStart) / DAY_MS);
  const recurrenceEnd = event.recurrence === 'NONE'
    ? baseStart
    : parseDate(event.recurrenceEndDate, 'Data final da repetição');
  const occurrences = [];
  let occurrenceStart = baseStart;
  let occurrenceIndex = 0;

  if (event.recurrence !== 'NONE' && addDays(occurrenceStart, durationDays) < fromDate) {
    const latestUsefulStart = addDays(fromDate, -durationDays);
    if (event.recurrence === 'DAILY' || event.recurrence === 'WEEKLY') {
      const stepDays = event.recurrence === 'DAILY' ? 1 : 7;
      occurrenceIndex = Math.max(0, Math.floor((latestUsefulStart - baseStart) / DAY_MS / stepDays));
      occurrenceStart = addDays(baseStart, occurrenceIndex * stepDays);
    } else {
      const monthDistance = (
        (latestUsefulStart.getUTCFullYear() - baseStart.getUTCFullYear()) * 12
        + latestUsefulStart.getUTCMonth()
        - baseStart.getUTCMonth()
      );
      occurrenceIndex = Math.max(0, monthDistance - 1);
      occurrenceStart = addMonths(baseStart, occurrenceIndex);
    }

    while (addDays(occurrenceStart, durationDays) < fromDate) {
      occurrenceIndex += 1;
      if (event.recurrence === 'DAILY') occurrenceStart = addDays(baseStart, occurrenceIndex);
      if (event.recurrence === 'WEEKLY') occurrenceStart = addDays(baseStart, occurrenceIndex * 7);
      if (event.recurrence === 'MONTHLY') occurrenceStart = addMonths(baseStart, occurrenceIndex);
    }
  }

  while (occurrenceStart <= recurrenceEnd && occurrenceStart <= toDate) {
    const occurrenceEnd = addDays(occurrenceStart, durationDays);
    if (occurrenceEnd >= fromDate && occurrenceStart <= toDate) {
      occurrences.push({
        ...serializeEvent(event),
        occurrenceId: `${event.id}:${toIsoDate(occurrenceStart)}`,
        occurrenceStartDate: toIsoDate(occurrenceStart),
        occurrenceEndDate: toIsoDate(occurrenceEnd)
      });
    }

    if (event.recurrence === 'NONE') break;
    occurrenceIndex += 1;
    if (event.recurrence === 'DAILY') occurrenceStart = addDays(baseStart, occurrenceIndex);
    if (event.recurrence === 'WEEKLY') occurrenceStart = addDays(baseStart, occurrenceIndex * 7);
    if (event.recurrence === 'MONTHLY') occurrenceStart = addMonths(baseStart, occurrenceIndex);
  }

  return occurrences;
}

async function listOccurrences(query = {}, user) {
  const from = parseDate(query.from, 'Data inicial do período');
  const to = parseDate(query.to, 'Data final do período');
  if (to < from) throw new CalendarEventError(400, 'O fim do período não pode ser anterior ao início.');
  if ((to - from) / DAY_MS > 400) throw new CalendarEventError(400, 'Consulte um período de até 400 dias.');

  const visibility = user?.role === 'admin'
    ? {}
    : {
        OR: [
          { allUsersParticipants: true },
          { createdById: user?.id || -1 },
          { participants: { some: { userId: user?.id || -1 } } }
        ]
      };

  const events = await prisma.calendarEvent.findMany({
    where: {
      AND: [
        { startDate: { lte: query.to } },
        {
          OR: [
            { recurrence: 'NONE', endDate: { gte: query.from } },
            { recurrence: { not: 'NONE' } }
          ]
        },
        visibility
      ]
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      participants: { include: { user: { select: { id: true, name: true, email: true, photoUrl: true } } } }
    },
    orderBy: [{ startDate: 'asc' }, { time: 'asc' }, { title: 'asc' }]
  });

  return events
    .flatMap((event) => expandEvent(event, from, to))
    .sort((a, b) => (
      a.occurrenceStartDate.localeCompare(b.occurrenceStartDate)
      || a.time.localeCompare(b.time)
      || a.title.localeCompare(b.title, 'pt-BR')
    ));
}

async function createEvent(body, user) {
  const { eventData, participantIds } = normalizePayload(body);
  await validateParticipantIds(participantIds);
  const event = await prisma.calendarEvent.create({
    data: {
      ...eventData,
      createdById: user.id,
      participants: { create: participantIds.map((userId) => ({ userId })) }
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      participants: { include: { user: { select: { id: true, name: true, email: true, photoUrl: true } } } }
    }
  });
  return serializeEvent(event);
}

async function updateEvent(id, body, user) {
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) throw new CalendarEventError(400, 'Evento inválido.');
  const current = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
  if (!current) throw new CalendarEventError(404, 'Evento não encontrado.');
  if (user?.role !== 'admin' && current.createdById !== user?.id) {
    throw new CalendarEventError(403, 'Você só pode editar eventos criados por você.');
  }
  const { eventData, participantIds } = normalizePayload(body);
  await validateParticipantIds(participantIds);
  const event = await prisma.calendarEvent.update({
    where: { id: eventId },
    data: {
      ...eventData,
      participants: {
        deleteMany: {},
        create: participantIds.map((userId) => ({ userId }))
      }
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      participants: { include: { user: { select: { id: true, name: true, email: true, photoUrl: true } } } }
    }
  });
  return serializeEvent(event);
}

async function deleteEvent(id, user) {
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) throw new CalendarEventError(400, 'Evento inválido.');
  const current = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
  if (!current) throw new CalendarEventError(404, 'Evento não encontrado.');
  if (user?.role !== 'admin' && current.createdById !== user?.id) {
    throw new CalendarEventError(403, 'Você só pode excluir eventos criados por você.');
  }
  await prisma.calendarEvent.delete({ where: { id: eventId } });
  return { ok: true };
}

async function searchUsers(query = {}) {
  const term = String(query.q || '').trim();
  if (term.length < 2) return [];
  return prisma.user.findMany({
    where: {
      active: true,
      OR: [
        { name: { contains: term } },
        { email: { contains: term } }
      ]
    },
    select: { id: true, name: true, email: true, photoUrl: true },
    orderBy: { name: 'asc' },
    take: 20
  });
}

module.exports = {
  CalendarEventError,
  createEvent,
  deleteEvent,
  listOccurrences,
  normalizePayload,
  searchUsers,
  updateEvent
};
