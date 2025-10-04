const express = require('express');
const { body, validationResult } = require('express-validator');
const authService = require('../utils/auth');

const router = express.Router();

// Alias: POST /api/login -> returns { success, authToken, user }
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isString().isLength({ min: 6 }).withMessage('Password is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const { email, password } = req.body;
    try {
      const result = await authService.authenticate(email, password);
      if (!result.success) {
        return res.status(401).json({ success: false, message: result.message || 'Invalid credentials' });
      }

      return res.json({ success: true, authToken: result.token, user: result.user });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Authentication failed' });
    }
  }
);

module.exports = router;