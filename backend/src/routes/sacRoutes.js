const { Router } = require('express');
const { authenticate } = require('../middleware/authAdmin');
const controller = require('../controllers/sacController');

const router = Router();
router.use(authenticate);
router.get('/access', controller.getAccess);
router.use(controller.requireSacAccess);
router.get('/capabilities', controller.getCapabilities);
router.get('/options', controller.listOptions);
router.get('/complaints', controller.listComplaints);
router.post('/complaints', controller.createComplaint);
router.get('/complaints/:id', controller.getComplaint);
router.get('/complaints/:id/audit-navigation', controller.getAuditNavigation);
router.put('/complaints/:id', controller.updateComplaint);
router.delete('/complaints/:id', controller.deleteComplaint);
router.post('/complaints/:id/submit', controller.submitComplaint);
router.post('/complaints/:id/return', controller.returnComplaint);
router.post('/complaints/:id/audit', controller.auditComplaint);

module.exports = router;
