const { Router } = require('express');
const { authenticate, requireRole } = require('../middleware/authAdmin');
const {
  createStockCount,
  finalizeStockCount,
  getStockCount,
  listStockCounts,
  listStockCountStores,
  updateStockCountItem,
} = require('../controllers/stockCountController');

const router = Router();
const canAccessStockCounts = requireRole(['store', 'admin', 'production_manager']);

router.use(authenticate, canAccessStockCounts);
router.get('/stores', listStockCountStores);
router.get('/', listStockCounts);
router.post('/', createStockCount);
router.get('/:id', getStockCount);
router.patch('/:id/items/:itemId', updateStockCountItem);
router.post('/:id/finalize', finalizeStockCount);

module.exports = router;
