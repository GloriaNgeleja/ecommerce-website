// src/routes/adminUsersRoutes.js
const router = require('express').Router();
const ctrl   = require('../controllers/adminUsersController');
const { authenticateAdmin, requirePermission } = require('../middleware/auth');

// All routes require admin auth + users permission
router.use(authenticateAdmin, requirePermission('users'));

router.get('/',              ctrl.getAll);
router.get('/:id',           ctrl.getOne);
router.patch('/:id/toggle',  ctrl.toggleStatus);
router.delete('/:id',        ctrl.deleteUser);

module.exports = router;
