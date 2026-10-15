const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'calendar-event-test-secret';

const app = require('../app');
const prisma = new PrismaClient();

async function login(base, email, password) {
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  assert.equal(response.status, 200, await response.clone().text());
  return response.headers.get('set-cookie')?.split(';')[0] || '';
}

test('calendar events enforce creator access and expand recurring multi-day occurrences', async (t) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'events123';
  const passwordHash = await bcrypt.hash(password, 4);
  const creator = await prisma.user.create({
    data: { name: 'Criador Eventos', email: `creator-events-${suffix}@test.local`, passwordHash, role: 'creator', active: true }
  });
  const reader = await prisma.user.create({
    data: { name: 'Leitor Eventos', email: `reader-events-${suffix}@test.local`, passwordHash, role: 'reader', active: true }
  });
  const outsider = await prisma.user.create({
    data: { name: 'Leitor Sem Convite', email: `outsider-events-${suffix}@test.local`, passwordHash, role: 'reader', active: true }
  });
  const admin = await prisma.user.create({
    data: { name: 'Admin Eventos', email: `admin-events-${suffix}@test.local`, passwordHash, role: 'admin', active: true }
  });
  const server = app.listen(0);
  const eventIds = [];

  t.after(async () => {
    server.close();
    await prisma.calendarEvent.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [creator.id, reader.id, outsider.id, admin.id] } } });
    await prisma.$disconnect();
  });

  const base = `http://127.0.0.1:${server.address().port}/api`;
  const creatorCookie = await login(base, creator.email, password);
  const readerCookie = await login(base, reader.email, password);
  const outsiderCookie = await login(base, outsider.email, password);
  const adminCookie = await login(base, admin.email, password);
  const payload = {
    title: `Encontro ${suffix}`,
    description: 'Evento recorrente de integração.',
    startDate: '2026-10-05',
    endDate: '2026-10-06',
    time: '09:30',
    imageUrl: '',
    recurrence: 'WEEKLY',
    recurrenceEndDate: '2026-10-26'
  };

  const denied = await fetch(`${base}/events`, {
    method: 'POST',
    headers: { cookie: readerCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  assert.equal(denied.status, 403);

  const created = await fetch(`${base}/events`, {
    method: 'POST',
    headers: { cookie: creatorCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  assert.equal(created.status, 201, await created.clone().text());
  const eventId = (await created.json()).id;
  eventIds.push(eventId);

  const list = await fetch(`${base}/events?from=2026-10-01&to=2026-10-31`, { headers: { cookie: readerCookie } });
  assert.equal(list.status, 200, await list.clone().text());
  const occurrences = (await list.json()).filter((item) => item.id === eventId);
  assert.deepEqual(
    occurrences.map((item) => [item.occurrenceStartDate, item.occurrenceEndDate]),
    [
      ['2026-10-05', '2026-10-06'],
      ['2026-10-12', '2026-10-13'],
      ['2026-10-19', '2026-10-20'],
      ['2026-10-26', '2026-10-27']
    ]
  );

  const targeted = await fetch(`${base}/events`, {
    method: 'POST',
    headers: { cookie: creatorCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      title: `Evento direcionado ${suffix}`,
      startDate: '2026-10-16',
      endDate: '2026-10-16',
      recurrence: 'NONE',
      recurrenceEndDate: null,
      allUsersParticipants: false,
      participantIds: [reader.id]
    })
  });
  assert.equal(targeted.status, 201, await targeted.clone().text());
  const targetedPayload = await targeted.json();
  eventIds.push(targetedPayload.id);
  assert.equal(targetedPayload.allUsersParticipants, false);
  assert.deepEqual(targetedPayload.participants.map((participant) => participant.id), [reader.id]);

  async function visibleEventIds(cookie) {
    const response = await fetch(`${base}/events?from=2026-10-01&to=2026-10-31`, { headers: { cookie } });
    assert.equal(response.status, 200, await response.clone().text());
    return new Set((await response.json()).map((item) => item.id));
  }

  const readerEvents = await visibleEventIds(readerCookie);
  assert.equal(readerEvents.has(eventId), true);
  assert.equal(readerEvents.has(targetedPayload.id), true);

  const outsiderEvents = await visibleEventIds(outsiderCookie);
  assert.equal(outsiderEvents.has(eventId), true);
  assert.equal(outsiderEvents.has(targetedPayload.id), false);

  const adminEvents = await visibleEventIds(adminCookie);
  assert.equal(adminEvents.has(eventId), true);
  assert.equal(adminEvents.has(targetedPayload.id), true);

  const creatorEvents = await visibleEventIds(creatorCookie);
  assert.equal(creatorEvents.has(targetedPayload.id), true);

  const search = await fetch(`${base}/events/users?q=Leitor`, { headers: { cookie: creatorCookie } });
  assert.equal(search.status, 200, await search.clone().text());
  assert.equal((await search.json()).some((candidate) => candidate.id === reader.id), true);

  const deniedSearch = await fetch(`${base}/events/users?q=Leitor`, { headers: { cookie: readerCookie } });
  assert.equal(deniedSearch.status, 403);
});
