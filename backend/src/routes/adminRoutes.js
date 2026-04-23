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

const router = Router();
const canCreateContent = requireRole(['creator', 'admin']);
const adminOnly = requireRole(['admin']);

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

module.exports = router;
