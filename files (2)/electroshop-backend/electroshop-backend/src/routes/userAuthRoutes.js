// src/routes/userAuthRoutes.js
const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/userAuthController');
const { authenticateUser } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');

// Register
router.post('/register', [
  body('first_name').trim().notEmpty().withMessage('First name is required'),
  body('last_name').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
  validate,
], ctrl.register);

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  validate,
], ctrl.login);

// Refresh token
router.post('/refresh', ctrl.refresh);

// Logout
router.post('/logout', ctrl.logout);

// Profile (protected)
router.get('/profile', authenticateUser, ctrl.getProfile);
router.patch('/profile', authenticateUser, [
  body('first_name').trim().notEmpty(),
  body('last_name').trim().notEmpty(),
  validate,
], ctrl.updateProfile);

// Change password (protected)
router.post('/change-password', authenticateUser, [
  body('current_password').notEmpty().withMessage('Current password is required'),
  body('new_password')
    .isLength({ min: 8 })
    .matches(/[A-Z]/)
    .matches(/[0-9]/)
    .withMessage('New password must be at least 8 chars with uppercase and number'),
  validate,
], ctrl.changePassword);

module.exports = router;
