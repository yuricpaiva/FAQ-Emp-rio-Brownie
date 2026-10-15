const { Router } = require('express');
const { authenticate, requireRole } = require('../middleware/authAdmin');
const controller = require('../controllers/calendarEventController');

const router = Router();
const canCreateContent = requireRole(['creator', 'admin']);

router.use(authenticate);
router.get('/users', canCreateContent, controller.users);
router.get('/', controller.list);
router.post('/', canCreateContent, controller.create);
router.put('/:id', canCreateContent, controller.update);
router.delete('/:id', canCreateContent, controller.remove);

module.exports = router;
