const { Router } = require('express');
const { authenticate } = require('../middleware/authAdmin');
const {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead
} = require('../controllers/notificationController');

const router = Router();

router.use(authenticate);
router.get('/', listNotifications);
router.patch('/read-all', markAllNotificationsRead);
router.patch('/:id/read', markNotificationRead);

module.exports = router;
