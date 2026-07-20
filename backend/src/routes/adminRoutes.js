const { Router } = require('express');
const multer = require('multer');
const { authenticate, requireRole } = require('../middleware/authAdmin');
const upload = require('../middleware/upload');
const wordUpload = require('../middleware/wordUpload');
const {
  importWordArticle,
  createArticle,
  updateArticle,
  deleteArticle,
  listArticleRevisions
} = require('../controllers/articleController');
const {
  createUser,
  updateUserMe,
  listUsers,
  updateUserAdmin
} = require('../controllers/authController');
const {
  updatePoolSettings,
  createPoolParticipant,
  updatePoolParticipant,
  deletePoolParticipant
} = require('../controllers/poolController');
const {
  getPowerBiSettingsAdmin,
  updatePowerBiSettings
} = require('../controllers/settingsController');
const {
  listProductionProducts,
  saveProductionProducts,
  upsertProductionProduct
} = require('../controllers/productionProductController');
const {
  listProductionConversions,
  saveProductionConversions
} = require('../controllers/productionConversionController');
const {
  listProductionStores,
  saveProductionStoreRoutes,
  saveProductionStores,
  syncProductionStores
} = require('../controllers/productionStoreController');
const {
  applyProductionConversions,
  getProductionStocks,
  suggestProduction
} = require('../controllers/productionPlanningController');
const {
  createPlanning,
  finalizePlanning,
  getPlanning,
  listPlanning,
  updateDispatchItem,
  updateDispatchItemsBulk,
  updatePlanning,
  updatePlanningStatus
} = require('../controllers/productionPlanningPersistenceController');
const {
  downloadEverestDiagnostic,
  getDatabaseConnections,
  saveConnection,
  testConnection
} = require('../controllers/databaseConnectionController');

const router = Router();
const canCreateContent = requireRole(['creator', 'admin']);
const adminOnly = requireRole(['admin']);
const canPlanProduction = requireRole(['admin', 'production_manager']);

router.use(authenticate);

router.put('/users/me', updateUserMe);
router.post('/uploads', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'A imagem deve ter no máximo 5 MB.' });
      }
      return res.status(400).json({ error: 'Falha no upload da imagem.' });
    }

    if (err) {
      return res.status(400).json({ error: err.message || 'Falha no upload da imagem.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    return res.json({ url });
  });
});

router.post('/articles/import-word', canCreateContent, (req, res) => {
  wordUpload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'O arquivo Word deve ter no maximo 10 MB.' });
      }
      return res.status(400).json({ error: 'Falha no envio do arquivo Word.' });
    }

    if (err) {
      return res.status(400).json({ error: err.message || 'Falha no envio do arquivo Word.' });
    }

    return importWordArticle(req, res);
  });
});

router.post('/articles', canCreateContent, createArticle);
router.put('/articles/:id', canCreateContent, updateArticle);
router.delete('/articles/:id', canCreateContent, deleteArticle);
router.get('/articles/:id/revisions', canCreateContent, listArticleRevisions);

router.post('/users', adminOnly, createUser);
router.get('/users', adminOnly, listUsers);
router.put('/users/:id', adminOnly, updateUserAdmin);
router.post('/pool-participants', adminOnly, createPoolParticipant);
router.put('/pool-participants/:id', adminOnly, updatePoolParticipant);
router.delete('/pool-participants/:id', adminOnly, deletePoolParticipant);
router.put('/pool-settings', adminOnly, updatePoolSettings);
router.get('/power-bi-settings', adminOnly, getPowerBiSettingsAdmin);
router.put('/power-bi-settings', adminOnly, updatePowerBiSettings);
router.get('/database-connections', adminOnly, getDatabaseConnections);
router.get('/database-connections/everest/diagnostic', adminOnly, downloadEverestDiagnostic);
router.post('/database-connections/:system/test', adminOnly, testConnection);
router.put('/database-connections/:system', adminOnly, saveConnection);
router.get('/production-products/planning', canPlanProduction, listProductionProducts);
router.post('/production-products', canPlanProduction, upsertProductionProduct);
router.get('/production-products', adminOnly, listProductionProducts);
router.put('/production-products', adminOnly, saveProductionProducts);
router.get('/production-conversions', adminOnly, listProductionConversions);
router.put('/production-conversions', adminOnly, saveProductionConversions);
router.get('/production-stores/planning', canPlanProduction, listProductionStores);
router.post('/production-stores/sync', adminOnly, syncProductionStores);
router.get('/production-stores', adminOnly, listProductionStores);
router.put('/production-stores', adminOnly, saveProductionStores);
router.put('/production-store-routes', adminOnly, saveProductionStoreRoutes);
router.post('/production-planning/suggestions', canPlanProduction, suggestProduction);
router.post('/production-planning/stocks', canPlanProduction, getProductionStocks);
router.post('/production-planning/conversions/apply', canPlanProduction, applyProductionConversions);
router.get('/production-planning', canPlanProduction, listPlanning);
router.post('/production-planning', canPlanProduction, createPlanning);
router.get('/production-planning/:day', canPlanProduction, getPlanning);
router.put('/production-planning/:day', canPlanProduction, updatePlanning);
router.patch('/production-planning/:day/status', canPlanProduction, updatePlanningStatus);
router.put('/production-planning/:day/dispatch', canPlanProduction, updateDispatchItem);
router.put('/production-planning/:day/dispatch/bulk', canPlanProduction, updateDispatchItemsBulk);
router.post('/production-planning/:day/finalize', canPlanProduction, finalizePlanning);

module.exports = router;
