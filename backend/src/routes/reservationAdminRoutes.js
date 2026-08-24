const { Router } = require('express');
const { authenticate, requireRole } = require('../middleware/authAdmin');
const controller = require('../controllers/reservationController');

const router = Router();
router.use(authenticate, requireRole(['admin']));
router.get('/resource-types', controller.adminListTypes);
router.post('/resource-types', controller.adminCreateType);
router.put('/resource-types/:id', controller.adminUpdateType);
router.get('/resources', controller.adminListResources);
router.post('/resources', controller.adminCreateResource);
router.put('/resources/:id', controller.adminUpdateResource);
router.get('/blocks', controller.adminListBlocks);
router.post('/blocks', controller.adminCreateBlock);
router.patch('/blocks/:id/cancel', controller.adminCancelBlock);
router.get('/', controller.adminListReservations);
router.patch('/:id/cancel', controller.adminCancelReservation);

module.exports = router;
