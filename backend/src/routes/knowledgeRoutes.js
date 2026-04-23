const { Router } = require('express');
const {
  listArticles,
  getArticleById,
  getArticleBySlug,
  listCategories
} = require('../controllers/articleController');
const { authenticate } = require('../middleware/authAdmin');

const router = Router();

router.use(authenticate);

router.get('/articles', listArticles);
router.get('/articles/id/:id', getArticleById);
router.get('/articles/:slug', getArticleBySlug);
router.get('/categories', listCategories);

module.exports = router;
