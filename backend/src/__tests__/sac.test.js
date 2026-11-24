const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'sac-test-secret';
const app = require('../app');
const prisma = new PrismaClient();

async function login(base, email, password) {
  const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 200, await response.clone().text());
  return response.headers.get('set-cookie')?.split(';')[0] || '';
}

async function request(base, path, cookie, options = {}) {
  return fetch(`${base}${path}`, { ...options, headers: { cookie, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
}

test('SAC enforces access and preserves the complete complaint audit workflow', async (t) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'sac12345';
  const passwordHash = await bcrypt.hash(password, 4);
  const [admin, creator, viewer, auditor] = await Promise.all([
    prisma.user.create({ data: { name: 'Admin SAC', email: `admin-sac-${suffix}@test.local`, passwordHash, role: 'admin' } }),
    prisma.user.create({ data: { name: 'Cadastro SAC', email: `creator-sac-${suffix}@test.local`, passwordHash, role: 'reader' } }),
    prisma.user.create({ data: { name: 'Consulta SAC', email: `viewer-sac-${suffix}@test.local`, passwordHash, role: 'reader' } }),
    prisma.user.create({ data: { name: 'Auditor SAC', email: `auditor-sac-${suffix}@test.local`, passwordHash, role: 'reader' } })
  ]);
  const previousSettings = await prisma.sacSettings.findUnique({ where: { id: 1 } });
  await prisma.sacSettings.upsert({ where: { id: 1 }, update: { auditorUserId: auditor.id }, create: { id: 1, auditorUserId: auditor.id } });
  await prisma.sacAccess.createMany({ data: [{ userId: creator.id, canCreate: true, canView: false }, { userId: viewer.id, canCreate: false, canView: true }] });
  const optionRows = await Promise.all([
    ['PROBLEM_TYPE', 'Produto'], ['LOCATION', 'Loja'], ['STORE', 'Matriz'], ['STORE', 'Eusébio'], ['OCCURRENCE_STATUS', 'Em andamento'], ['COMPLAINT_TYPE', 'Qualidade']
  ].map(([category, label], position) => prisma.sacOption.create({ data: { category, label: `${label} ${suffix}`, normalizedLabel: `${normalize(label)} ${suffix}`, position } })));
  const [problemType, location, purchaseStore, offenderStore, occurrenceStatus, complaintType] = optionRows;
  const server = app.listen(0);

  t.after(async () => {
    server.close();
    await prisma.sacComplaint.deleteMany({ where: { createdById: creator.id } });
    await prisma.sacAccess.deleteMany({ where: { userId: { in: [creator.id, viewer.id, auditor.id] } } });
    await prisma.sacOption.deleteMany({ where: { id: { in: optionRows.map((item) => item.id) } } });
    await prisma.sacSettings.update({ where: { id: 1 }, data: { auditorUserId: previousSettings?.auditorUserId || null } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, creator.id, viewer.id, auditor.id] } } });
    await prisma.$disconnect();
  });

  const base = `http://127.0.0.1:${server.address().port}/api`;
  const [adminCookie, creatorCookie, viewerCookie, auditorCookie] = await Promise.all([
    login(base, admin.email, password), login(base, creator.email, password), login(base, viewer.email, password), login(base, auditor.email, password)
  ]);
  const deniedSettings = await request(base, '/admin/sac-settings', creatorCookie);
  assert.equal(deniedSettings.status, 403);
  const savedSettings = await request(base, '/admin/sac-settings', adminCookie, { method: 'PUT', body: JSON.stringify({ creatorUserIds: [creator.id], viewerUserIds: [viewer.id], auditorUserId: auditor.id }) });
  assert.equal(savedSettings.status, 200, await savedSettings.clone().text());
  assert.equal((await (await request(base, '/sac/access', viewerCookie)).json()).hasAccess, true);
  assert.equal((await (await request(base, '/sac/capabilities', auditorCookie)).json()).canAudit, true);

  const payload = {
    customerName: 'Cliente Teste', occurrenceDate: '2026-11-17', problemTypeId: problemType.id, locationId: location.id,
    purchaseStoreId: purchaseStore.id, suggestedOriginStoreId: purchaseStore.id, occurrenceStatusId: occurrenceStatus.id,
    complaintText: 'Produto entregue fora do padrão.', complaintTypeId: complaintType.id, actionTaken: 'Cliente atendido e orientado.',
    treatmentOwner: 'SAC', observation: '', resolution: 'Troca solicitada.'
  };
  const deniedCreate = await request(base, '/sac/complaints', viewerCookie, { method: 'POST', body: JSON.stringify(payload) });
  assert.equal(deniedCreate.status, 403);

  const created = await request(base, '/sac/complaints', creatorCookie, { method: 'POST', body: JSON.stringify(payload) });
  assert.equal(created.status, 201, await created.clone().text());
  const complaint = await created.json();
  assert.equal(complaint.workflowStatus, 'RASCUNHO');

  const submitted = await request(base, `/sac/complaints/${complaint.id}/submit`, creatorCookie, { method: 'POST' });
  assert.equal(submitted.status, 200, await submitted.clone().text());
  const pendingEdit = await request(base, `/sac/complaints/${complaint.id}`, creatorCookie, { method: 'PUT', body: JSON.stringify({ ...payload, customerName: 'Cliente Alterada' }) });
  assert.equal(pendingEdit.status, 200, await pendingEdit.clone().text());
  const pendingEditPayload = await pendingEdit.json();
  assert.equal(pendingEditPayload.workflowStatus, 'PENDENTE_AUDITORIA');
  assert.equal(pendingEditPayload.customerName, 'Cliente Alterada');
  const viewerEdit = await request(base, `/sac/complaints/${complaint.id}`, viewerCookie, { method: 'PUT', body: JSON.stringify({ ...payload, customerName: 'Alteração indevida' }) });
  assert.equal(viewerEdit.status, 403);
  const viewerDelete = await request(base, `/sac/complaints/${complaint.id}`, viewerCookie, { method: 'DELETE' });
  assert.equal(viewerDelete.status, 403);
  const nonAuditorReturn = await request(base, `/sac/complaints/${complaint.id}/return`, adminCookie, { method: 'POST', body: JSON.stringify({ reason: 'Teste' }) });
  assert.equal(nonAuditorReturn.status, 403);
  const missingReason = await request(base, `/sac/complaints/${complaint.id}/return`, auditorCookie, { method: 'POST', body: JSON.stringify({ reason: '' }) });
  assert.equal(missingReason.status, 400);
  const returned = await request(base, `/sac/complaints/${complaint.id}/return`, auditorCookie, { method: 'POST', body: JSON.stringify({ reason: 'Detalhar a ação realizada.' }) });
  assert.equal(returned.status, 200, await returned.clone().text());

  const corrected = await request(base, `/sac/complaints/${complaint.id}`, creatorCookie, { method: 'PUT', body: JSON.stringify({ ...payload, actionTaken: 'Cliente atendido, orientado e troca autorizada.' }) });
  assert.equal(corrected.status, 200, await corrected.clone().text());
  assert.equal((await request(base, `/sac/complaints/${complaint.id}/submit`, creatorCookie, { method: 'POST' })).status, 200);
  const secondCreated = await request(base, '/sac/complaints', creatorCookie, { method: 'POST', body: JSON.stringify({ ...payload, customerName: 'Segunda Cliente' }) });
  const secondComplaint = await secondCreated.json();
  assert.equal((await request(base, `/sac/complaints/${secondComplaint.id}/submit`, creatorCookie, { method: 'POST' })).status, 200);
  const queueDenied = await request(base, `/sac/complaints/${complaint.id}/audit-navigation`, creatorCookie);
  assert.equal(queueDenied.status, 403);
  const queue = await request(base, `/sac/complaints/${complaint.id}/audit-navigation`, auditorCookie);
  assert.equal(queue.status, 200, await queue.clone().text());
  const queuePayload = await queue.json();
  assert.equal(queuePayload.total >= 2, true);
  assert.equal(queuePayload.position > 0, true);
  assert.equal(Number.isInteger(queuePayload.next?.id), true);
  assert.equal(Number.isInteger(queuePayload.previous?.id), true);
  if (queuePayload.total === 2) {
    assert.equal(queuePayload.next.id, secondComplaint.id);
    assert.equal(queuePayload.previous.id, secondComplaint.id);
  }
  const deletedPending = await request(base, `/sac/complaints/${secondComplaint.id}`, creatorCookie, { method: 'DELETE' });
  assert.equal(deletedPending.status, 204, await deletedPending.clone().text());
  assert.equal((await request(base, `/sac/complaints/${secondComplaint.id}`, creatorCookie)).status, 404);
  const missingStore = await request(base, `/sac/complaints/${complaint.id}/audit`, auditorCookie, { method: 'POST', body: JSON.stringify({}) });
  assert.equal(missingStore.status, 400);
  const audited = await request(base, `/sac/complaints/${complaint.id}/audit`, auditorCookie, { method: 'POST', body: JSON.stringify({ offenderStoreId: offenderStore.id, reason: 'Origem confirmada.' }) });
  assert.equal(audited.status, 200, await audited.clone().text());
  assert.equal((await audited.json()).workflowStatus, 'AUDITADA');
  const auditedDelete = await request(base, `/sac/complaints/${complaint.id}`, creatorCookie, { method: 'DELETE' });
  assert.equal(auditedDelete.status, 409);

  const filtered = await request(base, '/sac/complaints?workflowStatus=AUDITADA&pageSize=50', viewerCookie);
  assert.equal(filtered.status, 200, await filtered.clone().text());
  assert.equal((await filtered.json()).items.some((item) => item.id === complaint.id), true);
  const detail = await request(base, `/sac/complaints/${complaint.id}`, viewerCookie);
  const detailPayload = await detail.json();
  assert.deepEqual(detailPayload.history.map((entry) => entry.action).reverse(), ['CRIADA', 'ENVIADA', 'EDITADA', 'DEVOLVIDA', 'EDITADA', 'REENVIADA', 'AUDITADA']);
  assert.equal(detailPayload.offenderStore.id, offenderStore.id);
  const deactivated = await request(base, `/admin/sac-options/${complaintType.id}`, adminCookie, { method: 'PUT', body: JSON.stringify({ active: false }) });
  assert.equal(deactivated.status, 200, await deactivated.clone().text());
  const preserved = await request(base, `/sac/complaints/${complaint.id}`, viewerCookie);
  assert.equal((await preserved.json()).complaintType.label, complaintType.label);
});

function normalize(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
