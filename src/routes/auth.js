const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { validateRequest } = require('../middleware/security');
const { protect } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Stricter rate limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 5 attempts
  message: {
    status: 'error',
    message: 'Слишком много попыток входа. Пожалуйста, попробуйте позже.'
  }
});

// Register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('firstName').trim().notEmpty(),
  body('lastName').trim().notEmpty(),
  validateRequest
], authController.register);

// Login
router.post('/login', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  validateRequest
], authController.login);

// Refresh token
router.post('/refresh-token', authController.refreshToken);

// Logout
router.post('/logout', protect, authController.logout);

// Get current user
router.get('/me', protect, authController.getCurrentUser);

module.exports = router;