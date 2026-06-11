const { Router } = require('express');
const {
  listArticles,
  getArticleById,
  getArticleBySlug,
  listCategories
} = require('../controllers/articleController');
const { authenticate } = require('../middleware/authAdmin');
const { getPoolSettings, listPoolParticipants } = require('../controllers/poolController');
const { getPowerBiConfiguration } = require('../controllers/settingsController');

const router = Router();

router.use(authenticate);

router.get('/articles', listArticles);
router.get('/articles/id/:id', getArticleById);
router.get('/articles/:slug', getArticleBySlug);
router.get('/categories', listCategories);
router.get('/pool-ranking', listPoolParticipants);
router.get('/pool-settings', getPoolSettings);
router.get('/power-bi-config', getPowerBiConfiguration);

module.exports = router;
