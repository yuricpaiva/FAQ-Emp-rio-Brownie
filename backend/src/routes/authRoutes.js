const { Router } = require('express');
const { login, logout, me } = require('../controllers/authController');
const { authenticate } = require('../middleware/authAdmin');

const router = Router();

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authenticate, me);

module.exports = router;
