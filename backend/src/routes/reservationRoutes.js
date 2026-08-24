const { Router } = require('express');
const { authenticate } = require('../middleware/authAdmin');
const controller = require('../controllers/reservationController');

const router = Router();
router.use(authenticate);
router.get('/resource-types', controller.listResourceTypes);
router.get('/resources', controller.listResources);
router.get('/availability', controller.availability);
router.get('/mine', controller.mine);
router.get('/', controller.calendar);
router.post('/', controller.createReservation);
router.patch('/:id/cancel', controller.cancelReservation);

module.exports = router;
