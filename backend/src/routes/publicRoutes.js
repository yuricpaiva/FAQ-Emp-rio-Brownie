const { Router } = require('express');
const {
  listArticles,
  getArticleBySlug,
  listCategories
} = require('../controllers/articleController');
const { login } = require('../controllers/authController');

const router = Router();

router.post('/login', login);
router.get('/articles', listArticles);
router.get('/articles/:slug', getArticleBySlug);
router.get('/categories', listCategories);

module.exports = router;
