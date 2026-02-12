// src/routes/adminAuthRoutes.js
const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/adminAuthController');
const { authenticateAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');

// Register (requires invitation code)
router.post('/register', [
  body('invitation_code').notEmpty().withMessage('Invitation code is required'),
  body('first_name').trim().notEmpty(),
  body('last_name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .matches(/[A-Z]/)
    .matches(/[0-9]/)
    .withMessage('Password needs 8+ chars, uppercase, and number'),
  validate,
], ctrl.register);

// Login (step 1)
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  validate,
], ctrl.login);

// 2FA verify (step 2)
router.post('/verify-2fa', [
  body('temp_token').notEmpty().withMessage('temp_token is required'),
  body('code').isLength({ min: 6, max: 6 }).withMessage('6-digit code required'),
  validate,
], ctrl.verify2FA);

// Refresh token
router.post('/refresh', ctrl.refresh);

// Logout
router.post('/logout', ctrl.logout);

// Dashboard (protected)
router.get('/dashboard', authenticateAdmin, ctrl.getDashboard);

module.exports = router;
