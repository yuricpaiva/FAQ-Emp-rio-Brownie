const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'forms-test-secret';
const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'faq-forms-'));
process.env.FORMS_UPLOAD_DIR = uploadRoot;

const app = require('../app');
const service = require('../services/formService');
const photoStorage = require('../services/formPhotoStorage');
const prisma = new PrismaClient();

async function request(base, endpoint, { method = 'GET', cookie, body, form } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${base}${endpoint}`, { method, headers, body: form || (body === undefined ? undefined : JSON.stringify(body)) });
}
async function json(response, status) { assert.equal(response.status, status, await response.clone().text()); return response.json(); }
async function login(base, email, password) {
  const response = await request(base, '/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0];
}

test('Forms validates model configuration and score calculations', () => {
  assert.equal(service.RESULT_TYPES.includes('INVALID'), false);
  assert.deepEqual(service.QUESTION_TYPES, ['TEXT', 'NUMBER', 'BOOLEAN', 'SCORE', 'PHOTO']);
});

test('Forms API preserves snapshots, permissions, photos, scores and approval states', async (t) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'forms123';
  const passwordHash = await bcrypt.hash(password, 4);
  const stores = await Promise.all([
    prisma.productionStore.create({ data: { sourceCode: `forms-a-${suffix}`, sourceName: `Loja A ${suffix}`, displayName: `Loja A ${suffix}`, active: true } }),
    prisma.productionStore.create({ data: { sourceCode: `forms-b-${suffix}`, sourceName: `Loja B ${suffix}`, displayName: `Loja B ${suffix}`, active: true } }),
    prisma.productionStore.create({ data: { sourceCode: `forms-inactive-${suffix}`, sourceName: `Loja inativa ${suffix}`, displayName: `Loja inativa ${suffix}`, active: false } }),
    prisma.productionStore.create({ data: { sourceCode: `forms-unlinked-${suffix}`, sourceName: `Loja sem vínculo ${suffix}`, displayName: `Loja sem vínculo ${suffix}`, active: true } }),
    prisma.productionStore.create({ data: { sourceCode: `forms-inactive-user-${suffix}`, sourceName: `Loja usuário inativo ${suffix}`, displayName: `Loja usuário inativo ${suffix}`, active: true } }),
  ]);
  const [storeA, storeB, inactiveStore, unlinkedStore, inactiveUserStore] = stores;
  const users = await Promise.all([
    prisma.user.create({ data: { name: 'Admin Forms', email: `forms-admin-${suffix}@test.local`, passwordHash, role: 'admin' } }),
    prisma.user.create({ data: { name: 'Preenchedor Forms', email: `forms-reader-${suffix}@test.local`, passwordHash, role: 'reader' } }),
    prisma.user.create({ data: { name: 'Aprovador Forms', email: `forms-approver-${suffix}@test.local`, passwordHash, role: 'production_manager' } }),
    prisma.user.create({ data: { name: 'Sem acesso Forms', email: `forms-outsider-${suffix}@test.local`, passwordHash, role: 'creator' } }),
    prisma.user.create({ data: { name: 'Observador padrão Forms', email: `forms-default-observer-${suffix}@test.local`, passwordHash, role: 'creator' } }),
    prisma.user.create({ data: { name: 'Observador flexível Forms', email: `forms-flex-observer-${suffix}@test.local`, passwordHash, role: 'store' } }),
    prisma.user.create({ data: { name: 'Observador inativo Forms', email: `forms-inactive-observer-${suffix}@test.local`, passwordHash, role: 'reader', active: false } }),
    prisma.user.create({ data: { name: 'Usuário Loja A Forms', email: `forms-store-a-${suffix}@test.local`, passwordHash, role: 'store', productionStoreId: storeA.id } }),
    prisma.user.create({ data: { name: 'Usuário Loja B Forms', email: `forms-store-b-${suffix}@test.local`, passwordHash, role: 'store', productionStoreId: storeB.id } }),
    prisma.user.create({ data: { name: 'Usuário inativo de loja Forms', email: `forms-store-inactive-${suffix}@test.local`, passwordHash, role: 'store', active: false, productionStoreId: inactiveUserStore.id } }),
  ]);
  const [admin, filler, approver, outsider, defaultObserver, flexibleObserver, inactiveObserver] = users;
  await prisma.formAccess.createMany({ data: users.filter((user) => user.active && user.role !== 'admin').map((user) => ({ userId: user.id })) });
  const server = app.listen(0);
  t.after(async () => {
    server.close();
    const models = await prisma.formModel.findMany({ where: { name: { contains: suffix } }, select: { id: true } });
    const modelIds = models.map((item) => item.id);
    await prisma.formAnswerPhoto.deleteMany({ where: { answer: { submission: { modelId: { in: modelIds } } } } });
    await prisma.formAnswer.deleteMany({ where: { submission: { modelId: { in: modelIds } } } });
    await prisma.formSubmission.deleteMany({ where: { modelId: { in: modelIds } } });
    await prisma.formModelRolePermission.deleteMany({ where: { modelId: { in: modelIds } } });
    await prisma.formModelUserPermission.deleteMany({ where: { modelId: { in: modelIds } } });
    await prisma.formQuestion.deleteMany({ where: { modelId: { in: modelIds } } });
    await prisma.formModel.deleteMany({ where: { id: { in: modelIds } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await prisma.productionStore.deleteMany({ where: { id: { in: stores.map((store) => store.id) } } });
    await prisma.$disconnect();
    await fs.promises.rm(uploadRoot, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${server.address().port}/api`;
  const adminCookie = await login(base, admin.email, password);
  const fillerCookie = await login(base, filler.email, password);
  const approverCookie = await login(base, approver.email, password);
  const outsiderCookie = await login(base, outsider.email, password);
  const defaultObserverCookie = await login(base, defaultObserver.email, password);
  const flexibleObserverCookie = await login(base, flexibleObserver.email, password);
  assert.equal((await request(base, '/forms/capabilities')).status, 401);

  const invalid = await request(base, '/forms/models', { method: 'POST', cookie: adminCookie, body: { name: 'Inválido', resultType: 'SCORE', scoreMin: 10, scoreMax: 0, questions: [{ text: 'Nota', type: 'SCORE', weight: 1 }] } });
  assert.equal(invalid.status, 400);
  const invalidWeight = await request(base, '/forms/models', { method: 'POST', cookie: adminCookie, body: { name: 'Peso', questions: [{ text: 'Texto', type: 'TEXT', weight: 0 }] } });
  assert.equal(invalidWeight.status, 400);
  const invalidObservationOption = await request(base, '/forms/models', { method: 'POST', cookie: adminCookie, body: { name: 'Observação inválida', questions: [{ text: 'Texto', type: 'TEXT', weight: 1, allowObservation: 'sim' }] } });
  assert.equal(invalidObservationOption.status, 400);
  const invalidStoreOption = await request(base, '/forms/models', { method: 'POST', cookie: adminCookie, body: { name: 'Loja inválida', requiresStore: 'sim', questions: [{ text: 'Texto', type: 'TEXT', weight: 1 }] } });
  assert.equal(invalidStoreOption.status, 400);

  const payload = {
    name: `Checklist ${suffix}`, description: 'Visita gerencial', active: true, resultType: 'SCORE', scoreMin: 0, scoreMax: 10,
    scoreCalculationType: 'WEIGHTED_AVERAGE', requiresApproval: true,
    questions: [
      { text: 'Organização original', type: 'SCORE', required: true, photoRequired: true, allowObservation: true, weight: 1 },
      { text: 'Atendimento', type: 'SCORE', required: true, photoRequired: false, weight: 2 },
      { text: 'Observação', type: 'TEXT', required: false, photoRequired: false, weight: 1 },
    ],
    permissions: { fillRoles: ['reader'], fillUserIds: [], approveRoles: ['production_manager'], approveUserIds: [] },
  };
  const model = await json(await request(base, '/forms/models', { method: 'POST', cookie: adminCookie, body: payload }), 201);
  assert.equal(model.questions.length, 3);
  assert.equal((await request(base, '/forms/models', { cookie: fillerCookie })).status, 403);
  assert.equal((await json(await request(base, '/forms/available-models', { cookie: fillerCookie }), 200)).length, 1);
  assert.equal((await json(await request(base, '/forms/available-models', { cookie: outsiderCookie }), 200)).length, 0);
  assert.equal((await request(base, '/forms/submissions', { method: 'POST', cookie: outsiderCookie, body: { modelId: model.id } })).status, 403);

  const submission = await json(await request(base, '/forms/submissions', { method: 'POST', cookie: fillerCookie, body: { modelId: model.id } }), 201);
  assert.equal(submission.status, 'DRAFT');
  assert.equal(submission.answers[0].text, 'Organização original');
  assert.equal(submission.answers[0].observationAllowed, true);
  assert.equal(submission.answers[1].observationAllowed, false);
  assert.equal((await request(base, `/forms/submissions/${submission.id}/answers/${submission.answers[0].id}/observation`, { method: 'PATCH', cookie: fillerCookie, body: { observation: 123 } })).status, 400);
  assert.equal((await request(base, `/forms/submissions/${submission.id}/answers/${submission.answers[0].id}/observation`, { method: 'PATCH', cookie: fillerCookie, body: { observation: 'x'.repeat(1001) } })).status, 400);
  assert.equal((await request(base, `/forms/submissions/${submission.id}/answers/${submission.answers[1].id}/observation`, { method: 'PATCH', cookie: fillerCookie, body: { observation: 'Não permitida' } })).status, 409);
  assert.equal((await request(base, `/forms/submissions/${submission.id}/answers/${submission.answers[0].id}/observation`, { method: 'PATCH', cookie: outsiderCookie, body: { observation: 'Sem acesso' } })).status, 403);
  const savedObservation = await json(await request(base, `/forms/submissions/${submission.id}/answers/${submission.answers[0].id}/observation`, { method: 'PATCH', cookie: fillerCookie, body: { observation: '  Equipamento precisa de ajuste.  ' } }), 200);
  assert.equal(savedObservation.observation, 'Equipamento precisa de ajuste.');
  assert.equal((await json(await request(base, `/forms/submissions/${submission.id}`, { cookie: fillerCookie }), 200)).answers[0].observation, 'Equipamento precisa de ajuste.');
  assert.equal((await json(await request(base, `/forms/submissions/${submission.id}/answers/${submission.answers[0].id}/observation`, { method: 'PATCH', cookie: fillerCookie, body: { observation: null } }), 200)).observation, null);
  await json(await request(base, `/forms/submissions/${submission.id}/answers/${submission.answers[0].id}/observation`, { method: 'PATCH', cookie: fillerCookie, body: { observation: 'Observação final' } }), 200);
  await json(await request(base, `/forms/submissions/${submission.id}/answers/${submission.answers[0].id}`, { method: 'PATCH', cookie: fillerCookie, body: { value: 8 } }), 200);
  await json(await request(base, `/forms/submissions/${submission.id}/answers/${submission.answers[1].id}`, { method: 'PATCH', cookie: fillerCookie, body: { value: 10 } }), 200);

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const photoForm = new FormData();
  photoForm.append('photo', new Blob([png], { type: 'image/png' }), 'evidence.png');
  const photo = await json(await request(base, `/forms/submissions/${submission.id}/answers/${submission.answers[0].id}/photo`, { method: 'POST', cookie: fillerCookie, form: photoForm }), 201);
  assert.equal(photo.mimeType, 'image/webp');
  assert.ok(photo.size > 0);
  const stored = await prisma.formAnswerPhoto.findUnique({ where: { id: photo.id } });
  assert.equal(path.isAbsolute(stored.storageKey), false);
  assert.ok(fs.existsSync(path.join(uploadRoot, ...stored.storageKey.split('/'))));
  assert.throws(() => photoStorage.resolveKey(uploadRoot, '../../../outside.webp'), /Referência de foto inválida/);
  assert.equal((await request(base, `/forms/photos/${photo.id}`, { cookie: outsiderCookie })).status, 403);
  const protectedPhoto = await request(base, `/forms/photos/${photo.id}`, { cookie: fillerCookie });
  assert.equal(protectedPhoto.status, 200);
  assert.equal(protectedPhoto.headers.get('content-type'), 'image/webp');

  const oldPath = path.join(uploadRoot, ...stored.storageKey.split('/'));
  const replacementForm = new FormData(); replacementForm.append('photo', new Blob([png], { type: 'image/png' }), 'replacement.png');
  await json(await request(base, `/forms/submissions/${submission.id}/answers/${submission.answers[0].id}/photo`, { method: 'POST', cookie: fillerCookie, form: replacementForm }), 201);
  assert.equal(fs.existsSync(oldPath), false);

  const configuredRoot = process.env.FORMS_UPLOAD_DIR;
  delete process.env.FORMS_UPLOAD_DIR;
  await assert.rejects(() => photoStorage.getRoot(), /Configure FORMS_UPLOAD_DIR/);
  process.env.FORMS_UPLOAD_DIR = configuredRoot;

  const oversizedForm = new FormData(); oversizedForm.append('photo', new Blob([Buffer.alloc(10 * 1024 * 1024 + 1)], { type: 'image/jpeg' }), 'large.jpg');
  const oversized = await request(base, `/forms/submissions/${submission.id}/answers/${submission.answers[0].id}/photo`, { method: 'POST', cookie: fillerCookie, form: oversizedForm });
  assert.equal(oversized.status, 400);
  assert.match((await oversized.json()).error, /10 MB/);

  const changedPayload = { ...payload, questions: [
    { text: 'Organização alterada', type: 'SCORE', required: true, photoRequired: false, allowObservation: false, weight: 10 },
    payload.questions[1], payload.questions[2],
  ] };
  await json(await request(base, `/forms/models/${model.id}`, { method: 'PUT', cookie: adminCookie, body: changedPayload }), 200);
  const draftAfterEdit = await json(await request(base, `/forms/submissions/${submission.id}`, { cookie: fillerCookie }), 200);
  assert.equal(draftAfterEdit.answers[0].text, 'Organização original');
  assert.equal(draftAfterEdit.answers[0].weight, 1);
  assert.equal(draftAfterEdit.answers[0].observationAllowed, true);
  assert.equal(draftAfterEdit.answers[0].observation, 'Observação final');

  const finalized = await json(await request(base, `/forms/submissions/${submission.id}/finalize`, { method: 'POST', cookie: fillerCookie }), 200);
  assert.equal(finalized.status, 'PENDING_APPROVAL');
  assert.equal(finalized.finalScore, 9.3333);
  assert.equal(finalized.answers[0].observation, 'Observação final');
  assert.equal((await request(base, `/forms/submissions/${submission.id}/answers/${submission.answers[0].id}`, { method: 'PATCH', cookie: fillerCookie, body: { value: 9 } })).status, 409);
  assert.equal((await request(base, `/forms/submissions/${submission.id}/answers/${submission.answers[0].id}/observation`, { method: 'PATCH', cookie: fillerCookie, body: { observation: 'Alterada depois' } })).status, 409);
  assert.equal((await json(await request(base, `/forms/submissions/${submission.id}`, { cookie: approverCookie }), 200)).answers[0].observation, 'Observação final');
  assert.equal((await json(await request(base, `/forms/submissions/${submission.id}`, { cookie: adminCookie }), 200)).answers[0].observation, 'Observação final');
  const approvals = await json(await request(base, '/forms/approvals', { cookie: approverCookie }), 200);
  assert.equal(approvals.total, 1);
  const approved = await json(await request(base, `/forms/submissions/${submission.id}/approve`, { method: 'POST', cookie: approverCookie, body: {} }), 200);
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.answers[0].observation, 'Observação final');
  assert.equal((await request(base, `/forms/submissions/${submission.id}/approve`, { method: 'POST', cookie: approverCookie, body: {} })).status, 409);

  const rejectedDraft = await json(await request(base, '/forms/submissions', { method: 'POST', cookie: fillerCookie, body: { modelId: model.id } }), 201);
  assert.equal((await request(base, `/forms/submissions/${rejectedDraft.id}/answers/${submission.answers[0].id}/observation`, { method: 'PATCH', cookie: fillerCookie, body: { observation: 'Resposta de outro preenchimento' } })).status, 404);
  await json(await request(base, `/forms/submissions/${rejectedDraft.id}/answers/${rejectedDraft.answers[0].id}`, { method: 'PATCH', cookie: fillerCookie, body: { value: 7 } }), 200);
  await json(await request(base, `/forms/submissions/${rejectedDraft.id}/answers/${rejectedDraft.answers[1].id}`, { method: 'PATCH', cookie: fillerCookie, body: { value: 8 } }), 200);
  await json(await request(base, `/forms/submissions/${rejectedDraft.id}/finalize`, { method: 'POST', cookie: fillerCookie }), 200);
  assert.equal((await request(base, `/forms/submissions/${rejectedDraft.id}/reject`, { method: 'POST', cookie: approverCookie, body: { reason: '' } })).status, 400);
  assert.equal((await request(base, `/forms/submissions/${rejectedDraft.id}/reject`, { method: 'POST', cookie: outsiderCookie, body: { reason: 'Sem permissão' } })).status, 403);
  const rejected = await json(await request(base, `/forms/submissions/${rejectedDraft.id}/reject`, { method: 'POST', cookie: approverCookie, body: { reason: 'É necessário corrigir o atendimento.' } }), 200);
  assert.equal(rejected.status, 'REJECTED');

  await json(await request(base, `/forms/models/${model.id}`, { method: 'PUT', cookie: adminCookie, body: { ...changedPayload, active: false } }), 200);
  assert.equal((await request(base, '/forms/submissions', { method: 'POST', cookie: fillerCookie, body: { modelId: model.id } })).status, 409);

  const adminOnlyModel = await json(await request(base, '/forms/models', { method: 'POST', cookie: adminCookie, body: { name: `Admin only ${suffix}`, active: true, resultType: 'SIMPLE', requiresApproval: false, questions: [{ text: 'Texto obrigatório', type: 'TEXT', required: true, allowObservation: true, weight: 1 }], permissions: {} } }), 201);
  assert.equal((await request(base, '/forms/submissions', { method: 'POST', cookie: fillerCookie, body: { modelId: adminOnlyModel.id } })).status, 403);
  const adminDraft = await json(await request(base, '/forms/submissions', { method: 'POST', cookie: adminCookie, body: { modelId: adminOnlyModel.id } }), 201);
  await json(await request(base, `/forms/submissions/${adminDraft.id}/answers/${adminDraft.answers[0].id}/observation`, { method: 'PATCH', cookie: adminCookie, body: { observation: 'Observação sem resposta' } }), 200);
  assert.equal((await request(base, `/forms/submissions/${adminDraft.id}/finalize`, { method: 'POST', cookie: adminCookie })).status, 400);
  await json(await request(base, `/forms/submissions/${adminDraft.id}/answers/${adminDraft.answers[0].id}`, { method: 'PATCH', cookie: adminCookie, body: { value: 'Concluído' } }), 200);
  assert.equal((await json(await request(base, `/forms/submissions/${adminDraft.id}/finalize`, { method: 'POST', cookie: adminCookie }), 200)).status, 'COMPLETED');

  const observerPayload = {
    name: `Modelo observado ${suffix}`, description: 'Teste de observadores', active: true, resultType: 'SIMPLE', requiresApproval: true,
    defaultObserverId: defaultObserver.id,
    questions: [{ text: 'Confirmação', type: 'TEXT', required: true, photoRequired: true, allowObservation: true, weight: 1 }],
    permissions: { fillRoles: ['reader'], fillUserIds: [], approveRoles: ['production_manager'], approveUserIds: [] },
  };
  const observerModel = await json(await request(base, '/forms/models', { method: 'POST', cookie: adminCookie, body: observerPayload }), 201);
  assert.equal(observerModel.defaultObserver.id, defaultObserver.id);
  const defaultObservedDraft = await json(await request(base, '/forms/submissions', { method: 'POST', cookie: fillerCookie, body: { modelId: observerModel.id } }), 201);
  assert.equal(defaultObservedDraft.observer.id, defaultObserver.id);
  assert.equal(defaultObservedDraft.observerLocked, true);
  assert.equal((await request(base, `/forms/submissions/${defaultObservedDraft.id}`, { cookie: defaultObserverCookie })).status, 403);
  assert.equal((await request(base, `/forms/submissions/${defaultObservedDraft.id}/observer`, { method: 'PATCH', cookie: fillerCookie, body: { observerId: flexibleObserver.id } })).status, 409);
  const candidates = await json(await request(base, '/forms/observer-candidates?search=Observador', { cookie: fillerCookie }), 200);
  assert.ok(candidates.some((candidate) => candidate.id === defaultObserver.id));
  assert.ok(candidates.some((candidate) => candidate.id === flexibleObserver.id));
  assert.equal(candidates.some((candidate) => candidate.id === inactiveObserver.id), false);
  assert.equal(candidates.some((candidate) => candidate.id === filler.id), false);

  await json(await request(base, `/forms/models/${observerModel.id}`, { method: 'PUT', cookie: adminCookie, body: { ...observerPayload, defaultObserverId: flexibleObserver.id } }), 200);
  const unchangedDraft = await json(await request(base, `/forms/submissions/${defaultObservedDraft.id}`, { cookie: fillerCookie }), 200);
  assert.equal(unchangedDraft.observer.id, defaultObserver.id);
  assert.equal(unchangedDraft.observerLocked, true);
  await json(await request(base, `/forms/submissions/${defaultObservedDraft.id}/answers/${defaultObservedDraft.answers[0].id}`, { method: 'PATCH', cookie: fillerCookie, body: { value: 'Conferido' } }), 200);
  await json(await request(base, `/forms/submissions/${defaultObservedDraft.id}/answers/${defaultObservedDraft.answers[0].id}/observation`, { method: 'PATCH', cookie: fillerCookie, body: { observation: 'Visível ao observador' } }), 200);
  const observerPhotoForm = new FormData(); observerPhotoForm.append('photo', new Blob([png], { type: 'image/png' }), 'observer-evidence.png');
  const observerPhoto = await json(await request(base, `/forms/submissions/${defaultObservedDraft.id}/answers/${defaultObservedDraft.answers[0].id}/photo`, { method: 'POST', cookie: fillerCookie, form: observerPhotoForm }), 201);
  assert.equal((await request(base, `/forms/photos/${observerPhoto.id}`, { cookie: defaultObserverCookie })).status, 403);
  assert.equal((await json(await request(base, `/forms/submissions/${defaultObservedDraft.id}/finalize`, { method: 'POST', cookie: fillerCookie }), 200)).status, 'PENDING_APPROVAL');
  assert.equal((await request(base, `/forms/submissions/${defaultObservedDraft.id}/observer`, { method: 'PATCH', cookie: fillerCookie, body: { observerId: flexibleObserver.id } })).status, 409);
  const observedDetail = await json(await request(base, `/forms/submissions/${defaultObservedDraft.id}`, { cookie: defaultObserverCookie }), 200);
  assert.equal(observedDetail.answers[0].observation, 'Visível ao observador');
  assert.equal((await request(base, `/forms/photos/${observerPhoto.id}`, { cookie: defaultObserverCookie })).status, 200);
  assert.equal((await request(base, `/forms/submissions/${defaultObservedDraft.id}/approve`, { method: 'POST', cookie: defaultObserverCookie, body: {} })).status, 403);
  const defaultObservedList = await json(await request(base, `/forms/submissions?scope=observing&modelId=${observerModel.id}`, { cookie: defaultObserverCookie }), 200);
  assert.equal(defaultObservedList.total, 1);
  assert.equal(defaultObservedList.items[0].user.id, filler.id);

  const manualModel = await json(await request(base, '/forms/models', { method: 'POST', cookie: adminCookie, body: { ...observerPayload, name: `Modelo observador livre ${suffix}`, requiresApproval: false, defaultObserverId: null, questions: [{ text: 'Confirmação', type: 'TEXT', required: true, photoRequired: false, weight: 1 }] } }), 201);
  const manualDraft = await json(await request(base, '/forms/submissions', { method: 'POST', cookie: fillerCookie, body: { modelId: manualModel.id } }), 201);
  assert.equal(manualDraft.observer, null);
  assert.equal(manualDraft.observerLocked, false);
  assert.equal((await request(base, `/forms/submissions/${manualDraft.id}/observer`, { method: 'PATCH', cookie: fillerCookie, body: { observerId: filler.id } })).status, 400);
  assert.equal((await request(base, `/forms/submissions/${manualDraft.id}/observer`, { method: 'PATCH', cookie: fillerCookie, body: { observerId: inactiveObserver.id } })).status, 400);
  assert.equal((await request(base, `/forms/submissions/${manualDraft.id}/observer`, { method: 'PATCH', cookie: fillerCookie, body: { observerId: 999999999 } })).status, 400);
  assert.equal((await json(await request(base, `/forms/submissions/${manualDraft.id}/observer`, { method: 'PATCH', cookie: fillerCookie, body: { observerId: defaultObserver.id } }), 200)).observer.id, defaultObserver.id);
  assert.equal((await json(await request(base, `/forms/submissions/${manualDraft.id}/observer`, { method: 'PATCH', cookie: fillerCookie, body: { observerId: null } }), 200)).observer, null);
  assert.equal((await json(await request(base, `/forms/submissions/${manualDraft.id}/observer`, { method: 'PATCH', cookie: fillerCookie, body: { observerId: flexibleObserver.id } }), 200)).observer.id, flexibleObserver.id);
  assert.equal((await request(base, `/forms/submissions/${manualDraft.id}`, { cookie: flexibleObserverCookie })).status, 403);
  const hiddenDrafts = await json(await request(base, '/forms/submissions?scope=observing', { cookie: flexibleObserverCookie }), 200);
  assert.equal(hiddenDrafts.items.some((item) => item.id === manualDraft.id), false);
  await json(await request(base, `/forms/submissions/${manualDraft.id}/answers/${manualDraft.answers[0].id}`, { method: 'PATCH', cookie: fillerCookie, body: { value: 'Finalizado' } }), 200);
  assert.equal((await json(await request(base, `/forms/submissions/${manualDraft.id}/finalize`, { method: 'POST', cookie: fillerCookie }), 200)).status, 'COMPLETED');
  assert.equal((await request(base, `/forms/submissions/${manualDraft.id}`, { cookie: flexibleObserverCookie })).status, 200);
  assert.equal((await request(base, `/forms/submissions/${manualDraft.id}/observer`, { method: 'PATCH', cookie: flexibleObserverCookie, body: { observerId: null } })).status, 403);
  assert.equal((await json(await request(base, `/forms/submissions/${manualDraft.id}/observer`, { method: 'PATCH', cookie: fillerCookie, body: { observerId: null } }), 200)).observer, null);
  assert.equal((await json(await request(base, `/forms/submissions/${manualDraft.id}/observer`, { method: 'PATCH', cookie: fillerCookie, body: { observerId: flexibleObserver.id } }), 200)).observer.id, flexibleObserver.id);
  const observedPage = await json(await request(base, `/forms/submissions?scope=observing&status=COMPLETED&modelId=${manualModel.id}&pageSize=1`, { cookie: flexibleObserverCookie }), 200);
  assert.equal(observedPage.total, 1);
  assert.equal(observedPage.items[0].id, manualDraft.id);
  const ownPage = await json(await request(base, `/forms/submissions?scope=mine&modelId=${manualModel.id}`, { cookie: fillerCookie }), 200);
  assert.equal(ownPage.total, 1);

  const availableStores = await json(await request(base, '/forms/stores', { cookie: fillerCookie }), 200);
  assert.ok(availableStores.some((store) => store.id === storeA.id && store.displayName === storeA.displayName));
  assert.ok(availableStores.some((store) => store.id === storeB.id));
  assert.equal(availableStores.some((store) => store.id === inactiveStore.id), false);
  assert.equal(availableStores.some((store) => store.id === unlinkedStore.id), false);
  assert.equal(availableStores.some((store) => store.id === inactiveUserStore.id), false);

  const requiredStorePayload = {
    name: `Modelo com loja ${suffix}`, description: 'Checklist identificado por loja', active: true,
    resultType: 'SIMPLE', requiresApproval: true, requiresStore: true, defaultObserverId: defaultObserver.id,
    questions: [{ text: 'Conferência da loja', type: 'TEXT', required: true, photoRequired: false, weight: 1 }],
    permissions: { fillRoles: ['reader'], fillUserIds: [], approveRoles: ['production_manager'], approveUserIds: [] },
  };
  const requiredStoreModel = await json(await request(base, '/forms/models', { method: 'POST', cookie: adminCookie, body: requiredStorePayload }), 201);
  assert.equal(requiredStoreModel.requiresStore, true);
  const storeDraft = await json(await request(base, '/forms/submissions', { method: 'POST', cookie: fillerCookie, body: { modelId: requiredStoreModel.id } }), 201);
  assert.equal(storeDraft.model.requiresStore, true);
  assert.equal(storeDraft.store, null);
  await json(await request(base, `/forms/submissions/${storeDraft.id}/answers/${storeDraft.answers[0].id}`, { method: 'PATCH', cookie: fillerCookie, body: { value: 'Tudo certo' } }), 200);
  assert.equal((await request(base, `/forms/submissions/${storeDraft.id}/finalize`, { method: 'POST', cookie: fillerCookie })).status, 400);
  assert.equal((await request(base, `/forms/submissions/${storeDraft.id}/store`, { method: 'PATCH', cookie: outsiderCookie, body: { storeId: storeA.id } })).status, 403);
  assert.equal((await request(base, `/forms/submissions/${storeDraft.id}/store`, { method: 'PATCH', cookie: fillerCookie, body: { storeId: 999999999 } })).status, 400);
  assert.equal((await request(base, `/forms/submissions/${storeDraft.id}/store`, { method: 'PATCH', cookie: fillerCookie, body: { storeId: inactiveStore.id } })).status, 400);
  assert.equal((await request(base, `/forms/submissions/${storeDraft.id}/store`, { method: 'PATCH', cookie: fillerCookie, body: { storeId: unlinkedStore.id } })).status, 400);
  assert.equal((await request(base, `/forms/submissions/${storeDraft.id}/store`, { method: 'PATCH', cookie: fillerCookie, body: { storeId: inactiveUserStore.id } })).status, 400);
  assert.equal((await json(await request(base, `/forms/submissions/${storeDraft.id}/store`, { method: 'PATCH', cookie: fillerCookie, body: { storeId: storeA.id } }), 200)).store.name, storeA.displayName);
  assert.equal((await json(await request(base, `/forms/submissions/${storeDraft.id}/store`, { method: 'PATCH', cookie: fillerCookie, body: { storeId: storeB.id } }), 200)).store.id, storeB.id);
  assert.equal((await json(await request(base, `/forms/submissions/${storeDraft.id}/store`, { method: 'PATCH', cookie: fillerCookie, body: { storeId: null } }), 200)).store, null);
  await json(await request(base, `/forms/submissions/${storeDraft.id}/store`, { method: 'PATCH', cookie: fillerCookie, body: { storeId: storeA.id } }), 200);

  await json(await request(base, `/forms/models/${requiredStoreModel.id}`, { method: 'PUT', cookie: adminCookie, body: { ...requiredStorePayload, requiresStore: false } }), 200);
  const storeDraftAfterModelEdit = await json(await request(base, `/forms/submissions/${storeDraft.id}`, { cookie: fillerCookie }), 200);
  assert.equal(storeDraftAfterModelEdit.model.requiresStore, true);
  assert.equal(storeDraftAfterModelEdit.store.name, storeA.displayName);

  await prisma.productionStore.update({ where: { id: storeA.id }, data: { active: false } });
  assert.equal((await request(base, `/forms/submissions/${storeDraft.id}/finalize`, { method: 'POST', cookie: fillerCookie })).status, 409);
  await prisma.productionStore.update({ where: { id: storeA.id }, data: { active: true, displayName: `Loja A renomeada ${suffix}` } });
  const finalizedStoreSubmission = await json(await request(base, `/forms/submissions/${storeDraft.id}/finalize`, { method: 'POST', cookie: fillerCookie }), 200);
  assert.equal(finalizedStoreSubmission.status, 'PENDING_APPROVAL');
  assert.equal(finalizedStoreSubmission.store.name, storeA.displayName);
  assert.equal((await request(base, `/forms/submissions/${storeDraft.id}/store`, { method: 'PATCH', cookie: fillerCookie, body: { storeId: storeB.id } })).status, 409);
  assert.equal((await json(await request(base, `/forms/submissions/${storeDraft.id}`, { cookie: adminCookie }), 200)).store.name, storeA.displayName);
  assert.equal((await json(await request(base, `/forms/submissions/${storeDraft.id}`, { cookie: defaultObserverCookie }), 200)).store.name, storeA.displayName);
  assert.equal((await json(await request(base, `/forms/submissions/${storeDraft.id}`, { cookie: approverCookie }), 200)).store.name, storeA.displayName);
  const mineWithStore = await json(await request(base, `/forms/submissions?scope=mine&modelId=${requiredStoreModel.id}`, { cookie: fillerCookie }), 200);
  assert.equal(mineWithStore.items[0].store.name, storeA.displayName);
  const observedWithStore = await json(await request(base, `/forms/submissions?scope=observing&modelId=${requiredStoreModel.id}`, { cookie: defaultObserverCookie }), 200);
  assert.equal(observedWithStore.items[0].store.name, storeA.displayName);
  const approvalsWithStore = await json(await request(base, '/forms/approvals?pageSize=100', { cookie: approverCookie }), 200);
  assert.equal(approvalsWithStore.items.find((item) => item.id === storeDraft.id).store.name, storeA.displayName);

  await prisma.user.update({ where: { id: flexibleObserver.id }, data: { active: false } });
  assert.equal((await request(base, '/forms/submissions', { method: 'POST', cookie: fillerCookie, body: { modelId: observerModel.id } })).status, 409);
  await prisma.user.update({ where: { id: flexibleObserver.id }, data: { active: true } });

  assert.equal((await request(base, '/admin/forms-settings', { cookie: fillerCookie })).status, 403);
  const formsSettings = await json(await request(base, '/admin/forms-settings', { cookie: adminCookie }), 200);
  assert.ok(formsSettings.userIds.includes(filler.id));
  const savedFormsSettings = await json(await request(base, '/admin/forms-settings', { method: 'PUT', cookie: adminCookie, body: { userIds: [filler.id, flexibleObserver.id] } }), 200);
  assert.deepEqual(savedFormsSettings.userIds.sort((a, b) => a - b), [filler.id, flexibleObserver.id].sort((a, b) => a - b));
  assert.equal((await json(await request(base, '/forms/access', { cookie: fillerCookie }), 200)).hasAccess, true);
  assert.equal((await json(await request(base, '/forms/access', { cookie: outsiderCookie }), 200)).hasAccess, false);
  assert.equal((await json(await request(base, '/forms/access', { cookie: adminCookie }), 200)).hasAccess, true);
  assert.equal((await request(base, '/forms/capabilities', { cookie: outsiderCookie })).status, 403);
  assert.equal((await request(base, `/forms/submissions/${manualDraft.id}/observer`, { method: 'PATCH', cookie: fillerCookie, body: { observerId: outsider.id } })).status, 400);

  const badForm = new FormData(); badForm.append('photo', new Blob([Buffer.from('not-an-image')], { type: 'image/png' }), 'fake.png');
  assert.equal((await request(base, `/forms/submissions/${adminDraft.id}/answers/${adminDraft.answers[0].id}/photo`, { method: 'POST', cookie: adminCookie, form: badForm })).status, 400);
});
