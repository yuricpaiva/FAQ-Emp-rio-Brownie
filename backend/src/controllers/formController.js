const multer = require('multer');
const service = require('../services/formService');
const photoStorage = require('../services/formPhotoStorage');

function handle(res, error, fallback) {
  if (error instanceof service.FormError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'A foto deve ter no máximo 10 MB.' : 'Não foi possível receber a foto.';
    return res.status(400).json({ error: message, code: 'FORMS_UPLOAD_INVALID' });
  }
  if (error?.message?.startsWith('Apenas fotos')) return res.status(400).json({ error: error.message, code: 'FORMS_UPLOAD_INVALID' });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback, code: 'FORMS_INTERNAL_ERROR' });
}

function action(callback, fallback, successStatus = 200) {
  return async (req, res) => {
    try { return res.status(successStatus).json(await callback(req)); }
    catch (error) { return handle(res, error, fallback); }
  };
}

module.exports = {
  capabilities: action((req) => service.capabilities(req.user), 'Não foi possível consultar as permissões.'),
  availableModels: action((req) => service.availableModels(req.user), 'Não foi possível listar os modelos disponíveis.'),
  observerCandidates: action((req) => service.observerCandidates(req.query, req.user), 'Não foi possível listar os observadores.'),
  listModels: action((req) => service.listModels(req.query), 'Não foi possível listar os modelos.'),
  getModel: action((req) => service.getModel(req.params.id), 'Não foi possível carregar o modelo.'),
  createModel: action((req) => service.saveModel(req.body, req.user), 'Não foi possível criar o modelo.', 201),
  updateModel: action((req) => service.saveModel(req.body, req.user, req.params.id), 'Não foi possível atualizar o modelo.'),
  listSubmissions: action((req) => service.listSubmissions(req.query, req.user), 'Não foi possível listar os preenchimentos.'),
  startSubmission: action((req) => service.startSubmission(req.body, req.user), 'Não foi possível iniciar o preenchimento.', 201),
  getSubmission: action((req) => service.getSubmission(req.params.id, req.user), 'Não foi possível carregar o preenchimento.'),
  updateObserver: action((req) => service.updateObserver(req.params.id, req.body, req.user), 'Não foi possível atualizar o observador.'),
  updateAnswer: action((req) => service.updateAnswer(req.params.id, req.params.answerId, req.body, req.user), 'Não foi possível salvar a resposta.'),
  finalizeSubmission: action((req) => service.finalizeSubmission(req.params.id, req.user), 'Não foi possível finalizar o preenchimento.'),
  listApprovals: action((req) => service.listApprovals(req.query, req.user), 'Não foi possível listar as aprovações.'),
  approveSubmission: action((req) => service.approveSubmission(req.params.id, req.body, req.user), 'Não foi possível aprovar o preenchimento.'),
  rejectSubmission: action((req) => service.rejectSubmission(req.params.id, req.body, req.user), 'Não foi possível reprovar o preenchimento.'),
  uploadPhoto: action((req) => {
    if (req.formUploadError) throw req.formUploadError;
    return photoStorage.savePhoto(req.params.id, req.params.answerId, req.file, req.user);
  }, 'Não foi possível salvar a foto.', 201),
  getPhoto: async (req, res) => {
    try {
      const photo = await photoStorage.locatePhoto(req.params.photoId, req.user);
      res.set({ 'Content-Type': photo.mimeType, 'Content-Length': String(photo.size), 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
      return res.sendFile(photo.filePath, (error) => { if (error && !res.headersSent) handle(res, error, 'Não foi possível carregar a foto.'); });
    } catch (error) { return handle(res, error, 'Não foi possível carregar a foto.'); }
  },
};
