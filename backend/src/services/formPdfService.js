const fs = require('fs');
const { PDFDocument } = require('pdfkit');
const sharp = require('sharp');
const formService = require('./formService');
const photoStorage = require('./formPhotoStorage');

const EXPORTABLE_STATUSES = ['COMPLETED', 'APPROVED'];
const STATUS_LABELS = { COMPLETED: 'Concluído', APPROVED: 'Aprovado' };
const COLORS = {
  brown: '#4a2618',
  muted: '#765f55',
  line: '#dfd3cc',
  soft: '#f7f2ee',
  yellow: '#fff3c4',
  yellowLine: '#e3c768',
  white: '#ffffff',
};

function validateAnswerIds(rawAnswerIds, submission) {
  if (!Array.isArray(rawAnswerIds) || !rawAnswerIds.length) {
    throw new formService.FormError(400, 'Selecione pelo menos uma pergunta para exportar.', 'FORM_EXPORT_ANSWERS_REQUIRED');
  }
  const answerIds = rawAnswerIds.map((value) => Number(value));
  if (answerIds.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new formService.FormError(400, 'A seleção de perguntas é inválida.', 'FORM_EXPORT_ANSWERS_INVALID');
  }
  if (new Set(answerIds).size !== answerIds.length) {
    throw new formService.FormError(400, 'A seleção contém perguntas duplicadas.', 'FORM_EXPORT_ANSWERS_DUPLICATED');
  }
  const selected = new Set(answerIds);
  const answers = submission.answers.filter((answer) => selected.has(answer.id));
  if (answers.length !== answerIds.length) {
    throw new formService.FormError(400, 'Uma ou mais perguntas não pertencem a este preenchimento.', 'FORM_EXPORT_ANSWERS_INVALID');
  }
  return answers;
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}

function formatNumber(value, maximumFractionDigits = 4) {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(Number(value));
}

function answerText(answer) {
  if (answer.questionTypeSnapshot === 'TEXT') return answer.textValue?.trim() || 'Sem resposta';
  if (answer.questionTypeSnapshot === 'NUMBER') return answer.numberValue === null ? 'Sem resposta' : formatNumber(answer.numberValue);
  if (answer.questionTypeSnapshot === 'BOOLEAN') return answer.booleanValue === null ? 'Sem resposta' : answer.booleanValue ? 'Sim' : 'Não';
  if (answer.questionTypeSnapshot === 'SCORE') return answer.scoreValue === null ? 'Sem nota' : formatNumber(answer.scoreValue, 2);
  if (answer.questionTypeSnapshot === 'PHOTO') return answer.photo ? 'Registro fotográfico anexado' : 'Sem registro fotográfico';
  return 'Sem resposta';
}

function subanswerText(subanswer) {
  if (subanswer.notApplicable) return 'N/A';
  if (subanswer.questionTypeSnapshot === 'BOOLEAN') {
    return subanswer.booleanValue === null ? 'Sem resposta' : subanswer.booleanValue ? 'Sim' : 'Não';
  }
  return subanswer.scoreValue === null ? 'Sem nota' : formatNumber(subanswer.scoreValue, 2);
}

function safeFilename(name, submissionId) {
  const slug = String(name || 'formulario')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'formulario';
  return `${slug}-preenchimento-${submissionId}.pdf`;
}

async function loadPhoto(photo) {
  if (!photo?.storageKey) return null;
  try {
    const root = await photoStorage.getRoot();
    const filePath = photoStorage.resolveKey(root, photo.storageKey);
    const source = await fs.promises.readFile(filePath);
    const converted = await sharp(source, { limitInputPixels: 40000000, animated: false })
      .rotate()
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { buffer: converted.data, width: converted.info.width, height: converted.info.height };
  } catch (error) {
    console.warn(`Foto ${photo.id} indisponível durante exportação do Forms:`, error?.code || error?.message);
    return null;
  }
}

function ensureSpace(doc, height) {
  const bottom = doc.page.height - doc.page.margins.bottom - 22;
  if (doc.y + height > bottom) doc.addPage();
}

function addMetadata(doc, label, value) {
  ensureSpace(doc, 28);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.muted).text(label.toUpperCase(), { continued: false });
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.brown).text(value || '-', { lineGap: 2 });
  doc.moveDown(0.35);
}

function addObservation(doc, observation) {
  if (!observation) return;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const innerWidth = width - 24;
  doc.font('Helvetica').fontSize(9);
  const bodyHeight = doc.heightOfString(observation, { width: innerWidth, lineGap: 2 });
  const height = bodyHeight + 34;
  ensureSpace(doc, height + 8);
  const x = doc.page.margins.left;
  const y = doc.y;
  doc.save().roundedRect(x, y, width, height, 5).fillAndStroke(COLORS.yellow, COLORS.yellowLine).restore();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.brown).text('OBSERVAÇÃO', x + 12, y + 9, { width: innerWidth });
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.brown).text(observation, x + 12, y + 22, { width: innerWidth, lineGap: 2 });
  doc.y = y + height + 10;
}

function addPhoto(doc, photo) {
  if (!photo) {
    ensureSpace(doc, 45);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.muted).text('REGISTRO FOTOGRÁFICO');
    doc.moveDown(0.4);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLORS.muted).text('Registro fotográfico indisponível');
    doc.moveDown(0.8);
    return;
  }
  const maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const maxHeight = 300;
  const scale = Math.min(maxWidth / photo.width, maxHeight / photo.height, 1);
  const width = photo.width * scale;
  const height = photo.height * scale;
  ensureSpace(doc, height + 38);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.muted).text('REGISTRO FOTOGRÁFICO');
  doc.moveDown(0.4);
  const x = doc.page.margins.left + ((maxWidth - width) / 2);
  const y = doc.y;
  doc.image(photo.buffer, x, y, { width, height });
  doc.y = y + height + 12;
}

function addQuestion(doc, answer, photo) {
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.font('Helvetica-Bold').fontSize(12);
  let introHeight = 42 + doc.heightOfString(`${answer.positionSnapshot}. ${answer.questionTextSnapshot}`, { width, lineGap: 2 });
  if (answer.subAnswers?.length) {
    introHeight += answer.subAnswers.reduce((height, subanswer) => {
      doc.font('Helvetica-Bold').fontSize(9);
      return height + 22 + doc.heightOfString(`${answer.positionSnapshot}.${subanswer.positionSnapshot} ${subanswer.questionTextSnapshot}`, { width });
    }, 28);
  } else {
    doc.font('Helvetica').fontSize(10);
    introHeight += doc.heightOfString(answerText(answer), { width, lineGap: 2 });
  }
  if (answer.observationText) {
    doc.font('Helvetica').fontSize(9);
    introHeight += 44 + doc.heightOfString(answer.observationText, { width: width - 24, lineGap: 2 });
  }
  ensureSpace(doc, introHeight);
  doc.save().moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor(COLORS.line).stroke().restore();
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.brown).text(`${answer.positionSnapshot}. ${answer.questionTextSnapshot}`, { width, lineGap: 2 });
  doc.moveDown(0.45);

  if (answer.subAnswers?.length) {
    for (const subanswer of answer.subAnswers) {
      ensureSpace(doc, 30);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.muted)
        .text(`${answer.positionSnapshot}.${subanswer.positionSnapshot} ${subanswer.questionTextSnapshot}`);
      doc.font('Helvetica').fontSize(10).fillColor(COLORS.brown).text(subanswerText(subanswer));
      doc.moveDown(0.4);
    }
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.muted).text('NOTA CALCULADA DA PERGUNTA');
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.brown).text(answer.scoreValue === null ? 'Não aplicável' : formatNumber(answer.scoreValue, 2));
  } else {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.muted).text('RESPOSTA');
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.brown).text(answerText(answer), { width, lineGap: 2 });
  }
  doc.moveDown(0.7);
  addObservation(doc, answer.observationText);
  if (answer.photo) addPhoto(doc, photo);
  doc.moveDown(0.6);
}

function addFooters(doc) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const y = doc.page.height - doc.page.margins.bottom - 12;
    const label = `FAQ Empório Brownie  |  Página ${index + 1} de ${range.count}`;
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted);
    const x = (doc.page.width - doc.widthOfString(label)) / 2;
    doc.text(label, x, y, { lineBreak: false });
  }
}

async function renderPdf(submission, answers) {
  const photos = new Map(await Promise.all(answers.filter((answer) => answer.photo).map(async (answer) => [answer.id, await loadPhoto(answer.photo)])));
  const doc = new PDFDocument({ size: 'A4', margins: { top: 48, right: 48, bottom: 52, left: 48 }, bufferPages: true, info: { Title: submission.modelSnapshot ? JSON.parse(submission.modelSnapshot).model.name : 'Formulário', Author: 'FAQ Empório Brownie' } });
  const chunks = [];
  const completed = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const snapshot = JSON.parse(submission.modelSnapshot);
  const model = snapshot.model;

  doc.save().rect(0, 0, doc.page.width, 13).fill(COLORS.brown).restore();
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.muted).text('EMPÓRIO BROWNIE / FORMULÁRIOS');
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(22).fillColor(COLORS.brown).text(model.name, { lineGap: 2 });
  if (model.description) {
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted).text(model.description, { lineGap: 2 });
  }
  doc.moveDown(1);
  const summaryY = doc.y;
  const summaryWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.save().roundedRect(doc.page.margins.left, summaryY, summaryWidth, 1, 1).fill(COLORS.line).restore();
  doc.y = summaryY + 12;
  addMetadata(doc, 'Responsável', submission.user?.name || '-');
  if (submission.storeNameSnapshot) addMetadata(doc, 'Loja', submission.storeNameSnapshot);
  if (submission.observer) addMetadata(doc, 'Observador', submission.observer.name);
  addMetadata(doc, 'Iniciado em', formatDateTime(submission.startedAt));
  addMetadata(doc, 'Finalizado em', formatDateTime(submission.finalizedAt));
  addMetadata(doc, 'Status', STATUS_LABELS[submission.status] || submission.status);
  if (submission.finalScore !== null) addMetadata(doc, 'Nota final', formatNumber(submission.finalScore, 2));
  if (submission.approvedBy) addMetadata(doc, 'Aprovado por', `${submission.approvedBy.name} em ${formatDateTime(submission.approvedAt)}`);
  addMetadata(doc, 'PDF gerado em', formatDateTime(new Date()));
  doc.moveDown(0.8);

  answers.forEach((answer) => addQuestion(doc, answer, photos.get(answer.id)));
  addFooters(doc);
  doc.end();
  return completed;
}

async function exportSubmission(rawSubmissionId, body, user) {
  const submission = await formService.findSubmission(rawSubmissionId);
  if (!formService.canViewSubmission(submission, user)) throw new formService.FormError(403, 'Acesso negado.');
  if (!EXPORTABLE_STATUSES.includes(submission.status)) {
    throw new formService.FormError(409, 'Somente preenchimentos concluídos ou aprovados podem ser exportados.', 'FORM_EXPORT_STATUS_INVALID');
  }
  const answers = validateAnswerIds(body?.answerIds, submission);
  const model = JSON.parse(submission.modelSnapshot).model;
  return { buffer: await renderPdf(submission, answers), filename: safeFilename(model.name, submission.id) };
}

module.exports = { EXPORTABLE_STATUSES, validateAnswerIds, answerText, subanswerText, safeFilename, renderPdf, exportSubmission };
