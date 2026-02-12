// src/routes/orderRoutes.js
const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/orderController');
const { authenticateUser, authenticateAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');

// User routes
router.post('/', authenticateUser, [
  body('items').isArray({ min: 1 }).withMessage('Items array is required'),
  body('items.*.product_id').isInt({ min: 1 }),
  body('items.*.quantity').isInt({ min: 1 }),
  validate,
], ctrl.placeOrder);

router.get('/', authenticateUser, ctrl.getUserOrders);
router.get('/:id', authenticateUser, ctrl.getOrderDetail);

// Admin routes
router.get('/admin/all', authenticateAdmin, ctrl.adminGetAllOrders);
router.patch('/admin/:id/status', authenticateAdmin, [
  body('status').isIn(['pending','confirmed','processing','shipped','delivered','cancelled','refunded'])
    .withMessage('Invalid status'),
  validate,
], ctrl.adminUpdateStatus);

module.exports = router;
