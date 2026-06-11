const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const app = require('../app');
const prisma = new PrismaClient();

test('auth protects readers routes and admin routes use the session cookie', async (t) => {
  const passwordHash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@admin.com' },
    update: { passwordHash, role: 'admin', active: true },
    create: {
      name: 'Admin',
      email: 'admin@admin.com',
      passwordHash,
      role: 'admin',
      active: true
    }
  });

  const server = app.listen(0);
  t.after(async () => {
    server.close();
    await prisma.$disconnect();
  });

  const base = `http://127.0.0.1:${server.address().port}/api`;
  const blocked = await fetch(`${base}/knowledge/articles`);
  assert.equal(blocked.status, 401);

  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@admin.com', password: 'admin123' })
  });
  const cookie = login.headers.get('set-cookie')?.split(';')[0];

  assert.equal(login.status, 200);
  assert.ok(cookie);

  const articles = await fetch(`${base}/knowledge/articles`, { headers: { cookie } });
  assert.equal(articles.status, 200);

  const users = await fetch(`${base}/admin/users`, { headers: { cookie } });
  assert.equal(users.status, 200);

  const logout = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { cookie } });
  assert.equal(logout.status, 204);
});

test('pool ranking is readable by authenticated users and writable only by admins', async (t) => {
  const originalSettings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  const originalPowerBiAccess = await prisma.powerBiAccess.findMany({
    select: { userId: true }
  });
  const passwordHash = await bcrypt.hash('reader123', 10);
  const reader = await prisma.user.upsert({
    where: { email: 'reader-pool@test.local' },
    update: { passwordHash, role: 'reader', active: true },
    create: {
      name: 'Leitor Bolao',
      email: 'reader-pool@test.local',
      passwordHash,
      role: 'reader',
      active: true
    }
  });
  const creatorPasswordHash = await bcrypt.hash('creator123', 10);
  const creator = await prisma.user.upsert({
    where: { email: 'creator-pool@test.local' },
    update: { passwordHash: creatorPasswordHash, role: 'creator', active: true },
    create: {
      name: 'Criador Bolao',
      email: 'creator-pool@test.local',
      passwordHash: creatorPasswordHash,
      role: 'creator',
      active: true
    }
  });

  const server = app.listen(0);
  t.after(async () => {
    await prisma.appSettings.upsert({
      where: { id: 1 },
      update: {
        poolEnabled: originalSettings?.poolEnabled ?? true,
        powerBiEnabled: originalSettings?.powerBiEnabled ?? true,
        powerBiUrl: originalSettings?.powerBiUrl || 'https://app.powerbi.com/view'
      },
      create: {
        id: 1,
        poolEnabled: true,
        powerBiEnabled: true,
        powerBiUrl: 'https://app.powerbi.com/view'
      }
    });
    await prisma.powerBiAccess.deleteMany();
    if (originalPowerBiAccess.length) {
      await prisma.powerBiAccess.createMany({ data: originalPowerBiAccess });
    }
    await prisma.poolParticipant.deleteMany({
      where: { name: { startsWith: 'Teste Bolao' } }
    });
    await prisma.user.deleteMany({ where: { id: { in: [reader.id, creator.id] } } });
    server.close();
  });

  const base = `http://127.0.0.1:${server.address().port}/api`;
  const readerLogin = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'reader-pool@test.local', password: 'reader123' })
  });
  const readerCookie = readerLogin.headers.get('set-cookie')?.split(';')[0];

  const ranking = await fetch(`${base}/knowledge/pool-ranking`, {
    headers: { cookie: readerCookie }
  });
  assert.equal(ranking.status, 200);

  const forbiddenCreate = await fetch(`${base}/admin/pool-participants`, {
    method: 'POST',
    headers: { cookie: readerCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Teste Bolao Bloqueado',
      photoUrl: 'http://localhost/uploads/test.jpg',
      score: 5
    })
  });
  assert.equal(forbiddenCreate.status, 403);

  const creatorLogin = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'creator-pool@test.local', password: 'creator123' })
  });
  assert.equal(creatorLogin.status, 200, await creatorLogin.clone().text());
  const creatorCookie = creatorLogin.headers.get('set-cookie')?.split(';')[0];
  const creatorForbidden = await fetch(`${base}/admin/pool-participants`, {
    method: 'POST',
    headers: { cookie: creatorCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Teste Bolao Criador Bloqueado',
      photoUrl: 'http://localhost/uploads/test.jpg',
      score: 5
    })
  });
  assert.equal(creatorForbidden.status, 403);

  const settings = await fetch(`${base}/knowledge/pool-settings`, {
    headers: { cookie: readerCookie }
  });
  assert.equal(settings.status, 200);
  assert.equal(typeof (await settings.json()).poolEnabled, 'boolean');

  const readerSettingsUpdate = await fetch(`${base}/admin/pool-settings`, {
    method: 'PUT',
    headers: { cookie: readerCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ poolEnabled: false })
  });
  assert.equal(readerSettingsUpdate.status, 403);

  const readerPowerBiSettingsUpdate = await fetch(`${base}/admin/power-bi-settings`, {
    method: 'PUT',
    headers: { cookie: readerCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      enabled: true,
      url: 'https://app.powerbi.com/view?test=1',
      userIds: [reader.id]
    })
  });
  assert.equal(readerPowerBiSettingsUpdate.status, 403);

  const adminLogin = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@admin.com', password: 'admin123' })
  });
  const adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0];

  const powerBiSettingsUpdate = await fetch(`${base}/admin/power-bi-settings`, {
    method: 'PUT',
    headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      enabled: true,
      url: 'https://app.powerbi.com/view?test=1',
      userIds: [reader.id]
    })
  });
  assert.equal(powerBiSettingsUpdate.status, 200);

  const readerPowerBiConfig = await fetch(`${base}/knowledge/power-bi-config`, {
    headers: { cookie: readerCookie }
  });
  const readerPowerBiPayload = await readerPowerBiConfig.json();
  assert.equal(readerPowerBiConfig.status, 200);
  assert.equal(readerPowerBiPayload.hasAccess, true);
  assert.equal(readerPowerBiPayload.url, 'https://app.powerbi.com/view?test=1');

  const creatorPowerBiConfig = await fetch(`${base}/knowledge/power-bi-config`, {
    headers: { cookie: creatorCookie }
  });
  const creatorPowerBiPayload = await creatorPowerBiConfig.json();
  assert.equal(creatorPowerBiPayload.hasAccess, false);
  assert.equal(creatorPowerBiPayload.url, '');

  await fetch(`${base}/admin/power-bi-settings`, {
    method: 'PUT',
    headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      enabled: false,
      url: 'https://app.powerbi.com/view?test=1',
      userIds: [reader.id]
    })
  });

  const disabledPowerBiConfig = await fetch(`${base}/knowledge/power-bi-config`, {
    headers: { cookie: readerCookie }
  });
  assert.equal((await disabledPowerBiConfig.json()).hasAccess, false);

  const settingsUpdate = await fetch(`${base}/admin/pool-settings`, {
    method: 'PUT',
    headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ poolEnabled: false })
  });
  assert.equal(settingsUpdate.status, 200);
  assert.equal((await settingsUpdate.json()).poolEnabled, false);

  await fetch(`${base}/admin/pool-settings`, {
    method: 'PUT',
    headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ poolEnabled: true })
  });

  const invalidCreate = await fetch(`${base}/admin/pool-participants`, {
    method: 'POST',
    headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Teste Bolao Invalido', photoUrl: '', score: -1 })
  });
  assert.equal(invalidCreate.status, 400);

  const create = await fetch(`${base}/admin/pool-participants`, {
    method: 'POST',
    headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Teste Bolao Participante',
      photoUrl: 'http://localhost/uploads/test.jpg',
      score: 10
    })
  });
  assert.equal(create.status, 201);
  const participant = await create.json();

  const tiedCreate = await fetch(`${base}/admin/pool-participants`, {
    method: 'POST',
    headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Teste Bolao Empatado',
      photoUrl: 'http://localhost/uploads/test.jpg',
      score: 10
    })
  });
  assert.equal(tiedCreate.status, 201);

  const lowerCreate = await fetch(`${base}/admin/pool-participants`, {
    method: 'POST',
    headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Teste Bolao Menor',
      photoUrl: 'http://localhost/uploads/test.jpg',
      score: 2
    })
  });
  assert.equal(lowerCreate.status, 201);

  const orderedRanking = await fetch(`${base}/knowledge/pool-ranking`, {
    headers: { cookie: readerCookie }
  });
  const testParticipants = (await orderedRanking.json()).filter((item) =>
    item.name.startsWith('Teste Bolao')
  );
  assert.deepEqual(testParticipants.map((item) => item.score), [10, 10, 2]);

  const update = await fetch(`${base}/admin/pool-participants/${participant.id}`, {
    method: 'PUT',
    headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ score: 20 })
  });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).score, 20);

  const remove = await fetch(`${base}/admin/pool-participants/${participant.id}`, {
    method: 'DELETE',
    headers: { cookie: adminCookie }
  });
  assert.equal(remove.status, 204);
});
