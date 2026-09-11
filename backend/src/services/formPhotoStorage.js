const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PrismaClient } = require('@prisma/client');
const formService = require('./formService');

const prisma = new PrismaClient();
const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..', '..');

function storageError(message = 'O armazenamento de fotos do Forms não está configurado.') {
  return new formService.FormError(503, message, 'FORMS_STORAGE_UNAVAILABLE');
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function getRoot() {
  const configured = String(process.env.FORMS_UPLOAD_DIR || '').trim();
  if (!configured || !path.isAbsolute(configured)) throw storageError('Configure FORMS_UPLOAD_DIR com um caminho absoluto externo ao projeto.');
  const root = path.resolve(configured);
  if (root === REPOSITORY_ROOT || isInside(REPOSITORY_ROOT, root)) throw storageError('FORMS_UPLOAD_DIR deve ficar fora do repositório da aplicação.');
  try {
    await fs.promises.mkdir(root, { recursive: true });
    await fs.promises.access(root, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    throw storageError('O diretório configurado em FORMS_UPLOAD_DIR não está acessível para leitura e escrita.');
  }
  return root;
}

function detectMime(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return '';
}

function resolveKey(root, storageKey) {
  if (typeof storageKey !== 'string' || !storageKey || path.isAbsolute(storageKey) || storageKey.includes('..')) {
    throw new formService.FormError(400, 'Referência de foto inválida.', 'FORMS_INVALID_STORAGE_KEY');
  }
  const resolved = path.resolve(root, ...storageKey.split('/'));
  if (!isInside(root, resolved)) throw new formService.FormError(400, 'Referência de foto inválida.', 'FORMS_INVALID_STORAGE_KEY');
  return resolved;
}

async function savePhoto(rawSubmissionId, rawAnswerId, file, user) {
  if (!file?.buffer?.length) throw new formService.FormError(400, 'Capture uma foto antes de enviar.');
  const detectedMime = detectMime(file.buffer);
  if (!detectedMime || detectedMime !== file.mimetype) throw new formService.FormError(400, 'A imagem enviada não é um JPEG, PNG ou WebP válido.');
  const submission = await formService.findSubmission(rawSubmissionId);
  if (submission.userId !== user.id) throw new formService.FormError(403, 'Somente o autor pode enviar evidências.');
  if (submission.status !== 'DRAFT') throw new formService.FormError(409, 'Fotos não podem ser alteradas após a finalização.', 'FORM_SUBMISSION_READ_ONLY');
  const answerId = Number(rawAnswerId);
  const answer = submission.answers.find((item) => item.id === answerId);
  if (!answer) throw new formService.FormError(404, 'Resposta não encontrada neste preenchimento.');
  const photoAllowed = answer.photoAllowedSnapshot || answer.photoRequiredSnapshot || answer.questionTypeSnapshot === 'PHOTO';
  if (!photoAllowed) throw new formService.FormError(409, 'Esta pergunta não aceita registro fotográfico.', 'FORM_PHOTO_NOT_ALLOWED');

  const root = await getRoot();
  let optimized;
  try {
    optimized = await sharp(file.buffer, { limitInputPixels: 40000000, animated: false })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new formService.FormError(400, 'Não foi possível processar a imagem enviada.');
  }

  const now = new Date();
  const storageKey = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/submission-${submission.id}/question-${answer.sourceQuestionId}/${crypto.randomUUID()}.webp`;
  const finalPath = resolveKey(root, storageKey);
  const directory = path.dirname(finalPath);
  const temporaryPath = path.join(directory, `.tmp-${crypto.randomUUID()}`);
  await fs.promises.mkdir(directory, { recursive: true });
  try {
    await fs.promises.writeFile(temporaryPath, optimized, { flag: 'wx' });
    await fs.promises.rename(temporaryPath, finalPath);
  } catch {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
    throw storageError('Não foi possível gravar a foto no diretório configurado.');
  }

  const previous = answer.photo;
  let photo;
  try {
    photo = await prisma.$transaction(async (tx) => {
      const current = await tx.formSubmission.findUnique({ where: { id: submission.id }, select: { status: true, userId: true } });
      if (!current || current.status !== 'DRAFT' || current.userId !== user.id) {
        throw new formService.FormError(409, 'Fotos não podem ser alteradas após a finalização.', 'FORM_SUBMISSION_READ_ONLY');
      }
      return tx.formAnswerPhoto.upsert({
        where: { answerId },
        create: { answerId, storageKey, mimeType: 'image/webp', size: optimized.length },
        update: { storageKey, mimeType: 'image/webp', size: optimized.length },
      });
    });
  } catch (error) {
    await fs.promises.rm(finalPath, { force: true }).catch(() => {});
    throw error;
  }
  if (previous?.storageKey && previous.storageKey !== storageKey) {
    try { await fs.promises.rm(resolveKey(root, previous.storageKey), { force: true }); } catch { /* registro novo já é válido; limpeza pode ser refeita operacionalmente */ }
  }
  return { id: photo.id, mimeType: photo.mimeType, size: photo.size, createdAt: photo.createdAt };
}

async function locatePhoto(rawPhotoId, user) {
  const photo = await formService.getPhotoRecord(rawPhotoId, user);
  const root = await getRoot();
  const filePath = resolveKey(root, photo.storageKey);
  try { await fs.promises.access(filePath, fs.constants.R_OK); } catch { throw new formService.FormError(404, 'A evidência fotográfica não está disponível.'); }
  return { filePath, mimeType: photo.mimeType, size: photo.size };
}

async function stagePhotoFiles(root, photos, submissionId) {
  const stagingDirectory = path.join(root, '.trash', `submission-${submissionId}-${crypto.randomUUID()}`);
  if (!isInside(root, stagingDirectory)) throw storageError('Não foi possível preparar a exclusão das fotos.');
  await fs.promises.mkdir(stagingDirectory, { recursive: true });
  const staged = [];
  try {
    for (const photo of photos) {
      const originalPath = resolveKey(root, photo.storageKey);
      const stagedPath = path.join(stagingDirectory, `photo-${photo.id}.webp`);
      try {
        await fs.promises.rename(originalPath, stagedPath);
        staged.push({ originalPath, stagedPath });
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    return { stagingDirectory, staged };
  } catch {
    await restoreStagedPhotoFiles({ stagingDirectory, staged }).catch(() => {});
    throw storageError('Não foi possível preparar as fotos para exclusão. O rascunho foi preservado.');
  }
}

async function restoreStagedPhotoFiles({ stagingDirectory, staged }) {
  const failures = [];
  for (const file of [...staged].reverse()) {
    try {
      await fs.promises.mkdir(path.dirname(file.originalPath), { recursive: true });
      await fs.promises.rename(file.stagedPath, file.originalPath);
    } catch (error) { failures.push(error); }
  }
  await fs.promises.rmdir(stagingDirectory).catch((error) => { if (error?.code !== 'ENOENT') failures.push(error); });
  if (failures.length) throw storageError('Não foi possível restaurar uma ou mais fotos do rascunho.');
}

async function purgeStagedPhotoFiles({ stagingDirectory, staged }) {
  await Promise.all(staged.map((file) => fs.promises.rm(file.stagedPath, { force: true })));
  await fs.promises.rmdir(stagingDirectory).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
}

async function deleteDraft(rawSubmissionId, user) {
  const submissionId = Number(rawSubmissionId);
  if (!Number.isInteger(submissionId) || submissionId <= 0) throw new formService.FormError(400, 'Preenchimento inválido.');
  let stagedState = null;
  try {
    await prisma.$transaction(async (tx) => {
      const submission = await tx.formSubmission.findUnique({
        where: { id: submissionId },
        include: { answers: { include: { photo: true } } },
      });
      if (!submission) throw new formService.FormError(404, 'Preenchimento não encontrado.');
      if (submission.userId !== user.id) throw new formService.FormError(403, 'Somente o autor pode excluir este rascunho.');
      if (submission.status !== 'DRAFT') throw new formService.FormError(409, 'Somente rascunhos podem ser excluídos.', 'FORM_SUBMISSION_READ_ONLY');
      const photos = submission.answers.flatMap((answer) => answer.photo ? [answer.photo] : []);
      if (photos.length) stagedState = await stagePhotoFiles(await getRoot(), photos, submissionId);
      const deleted = await tx.formSubmission.deleteMany({ where: { id: submissionId, userId: user.id, status: 'DRAFT' } });
      if (deleted.count !== 1) throw new formService.FormError(409, 'O rascunho não está mais disponível para exclusão.', 'FORM_SUBMISSION_CHANGED');
    }, { maxWait: 5000, timeout: 10000 });
  } catch (error) {
    if (stagedState) {
      try { await restoreStagedPhotoFiles(stagedState); }
      catch (restoreError) { console.error('Não foi possível restaurar fotos após falha na exclusão do rascunho.', restoreError); throw restoreError; }
    }
    throw error;
  }
  if (stagedState) {
    try { await purgeStagedPhotoFiles(stagedState); }
    catch (error) { console.error('Rascunho excluído, mas a limpeza da área temporária de fotos falhou.', error); }
  }
  return { id: submissionId, deleted: true };
}

module.exports = { savePhoto, locatePhoto, deleteDraft, getRoot, resolveKey, detectMime, stagePhotoFiles, restoreStagedPhotoFiles, purgeStagedPhotoFiles };
