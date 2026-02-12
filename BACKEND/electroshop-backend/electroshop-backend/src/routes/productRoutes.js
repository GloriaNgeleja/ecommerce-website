// src/routes/productRoutes.js
const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/productController');
const { authenticateAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');

// Public routes
router.get('/',           ctrl.getAll);
router.get('/categories', ctrl.getCategories);
router.get('/:id',        ctrl.getOne);

// Admin routes
router.post('/', authenticateAdmin, [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('category_id').isInt({ min: 1 }).withMessage('Valid category is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('stock').optional().isInt({ min: 0 }),
  validate,
], ctrl.create);

router.put('/:id', authenticateAdmin, [
  body('price').optional().isFloat({ min: 0 }),
  body('stock').optional().isInt({ min: 0 }),
  validate,
], ctrl.update);

router.delete('/:id', authenticateAdmin, ctrl.remove);

module.exports = router;
