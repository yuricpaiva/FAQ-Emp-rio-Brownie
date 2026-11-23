const { Router } = require('express');
const { authenticate } = require('../middleware/authAdmin');
const controller = require('../controllers/tableReservationController');

const router = Router();
router.use(authenticate);
router.get('/access', controller.access);
router.use(controller.requireAccess);
router.get('/capabilities', controller.capabilities);
router.get('/units', controller.units);
router.get('/tables', controller.tables);
router.get('/', controller.list);
router.post('/', controller.create);
router.post('/:id/check-in', controller.checkIn);
router.get('/:id', controller.detail);

module.exports = router;
