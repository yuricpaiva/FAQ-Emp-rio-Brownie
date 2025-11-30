const { Router } = require('express');
const authAdmin = require('../middleware/authAdmin');
const upload = require('../middleware/upload');
const {
  createArticle,
  updateArticle,
  deleteArticle
} = require('../controllers/articleController');
const {
  createUser,
  updateUserMe,
  listUsers,
  updateUserAdmin
} = require('../controllers/authController');

const router = Router();

router.use(authAdmin);

router.post('/articles', createArticle);
router.put('/articles/:id', updateArticle);
router.delete('/articles/:id', deleteArticle);
router.post('/users', createUser);
router.put('/users/me', updateUserMe);
router.get('/users', listUsers);
router.put('/users/:id', updateUserAdmin);
router.post('/uploads', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }
  const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  return res.json({ url });
});

module.exports = router;
