// src/middleware/errorHandler.js

const { validationResult } = require('express-validator');

// ── Validation middleware (runs after express-validator rules) ─────────────────
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
};

// ── 404 handler ────────────────────────────────────────────────────────────────
const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
};

// ── Global error handler ───────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  console.error('❌ Error:', err.stack || err.message);

  // MySQL duplicate entry
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      success: false,
      message: 'A record with this value already exists'
    });
  }

  // MySQL foreign key violation
  if (err.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(409).json({
      success: false,
      message: 'Cannot delete: record is referenced by other data'
    });
  }

  const status  = err.statusCode || err.status || 500;
  const message = err.message    || 'Internal server error';

  res.status(status).json({ success: false, message });
};

module.exports = { validate, notFound, errorHandler };
