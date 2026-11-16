const { Router } = require('express');
const { authenticate, requireRole } = require('../middleware/authAdmin');
const controller = require('../controllers/purchaseOrderController');
const { hasPurchaseAccess } = require('../controllers/settingsController');

const router = Router();
const adminOnly = requireRole(['admin']);

router.use(authenticate);
router.get('/access', async (req, res, next) => {
  try {
    if (await hasPurchaseAccess(req.user)) return controller.access(req, res, next);
    return res.json({ hasAccess: false, canManage: false });
  } catch (error) {
    return next(error);
  }
});
router.use(async (req, res, next) => {
  try {
    if (await hasPurchaseAccess(req.user)) return next();
    return res.status(403).json({ error: 'Você não possui acesso ao módulo Compras.' });
  } catch (error) {
    return next(error);
  }
});
router.get('/suppliers', controller.suppliers);
router.get('/products', controller.products);
router.get('/orders', controller.list);
router.post('/orders', controller.create);
router.get('/orders/:id', controller.get);
router.put('/orders/:id', adminOnly, controller.update);
router.patch('/orders/:id/cancel', adminOnly, controller.cancel);
router.get('/history/products', controller.history);

module.exports = router;
