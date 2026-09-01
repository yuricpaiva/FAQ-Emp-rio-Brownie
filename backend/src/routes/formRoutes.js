const { Router } = require('express');
const { authenticate, requireRole } = require('../middleware/authAdmin');
const upload = require('../middleware/formPhotoUpload');
const controller = require('../controllers/formController');
const { getFormsAccessConfiguration, hasFormsAccess } = require('../controllers/settingsController');

const router = Router();
const adminOnly = requireRole(['admin']);
const receivePhoto = (req, res, next) => upload.single('photo')(req, res, (error) => {
  req.formUploadError = error || null;
  next();
});

router.use(authenticate);
router.get('/access', getFormsAccessConfiguration);
router.use(async (req, res, next) => {
  try {
    if (await hasFormsAccess(req.user)) return next();
    return res.status(403).json({ error: 'Você não possui acesso ao módulo Formulários.' });
  } catch (error) {
    return next(error);
  }
});
router.get('/capabilities', controller.capabilities);
router.get('/available-models', controller.availableModels);
router.get('/observer-candidates', controller.observerCandidates);
router.get('/approvals', controller.listApprovals);
router.get('/photos/:photoId', controller.getPhoto);
router.get('/models', adminOnly, controller.listModels);
router.post('/models', adminOnly, controller.createModel);
router.get('/models/:id', adminOnly, controller.getModel);
router.put('/models/:id', adminOnly, controller.updateModel);
router.get('/submissions', controller.listSubmissions);
router.post('/submissions', controller.startSubmission);
router.get('/submissions/:id', controller.getSubmission);
router.patch('/submissions/:id/observer', controller.updateObserver);
router.patch('/submissions/:id/answers/:answerId', controller.updateAnswer);
router.post('/submissions/:id/answers/:answerId/photo', receivePhoto, controller.uploadPhoto);
router.post('/submissions/:id/finalize', controller.finalizeSubmission);
router.post('/submissions/:id/approve', controller.approveSubmission);
router.post('/submissions/:id/reject', controller.rejectSubmission);

module.exports = router;
