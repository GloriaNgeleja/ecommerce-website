// src/middleware/auth.js
// JWT verification middleware for users & admins

const jwt  = require('jsonwebtoken');
const pool = require('../config/db');

// ── Helper ────────────────────────────────────────────────────────────────────
function extractToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

// ── Protect User Routes ───────────────────────────────────────────────────────
const authenticateUser = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== 'user') {
      return res.status(403).json({ success: false, message: 'User token required' });
    }

    // Confirm user still exists and is active
    const [rows] = await pool.execute(
      'SELECT id, first_name, last_name, email, is_active FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ success: false, message: 'Account not found or deactivated' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// ── Protect Admin Routes ──────────────────────────────────────────────────────
const authenticateAdmin = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: 'Admin access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin token required' });
    }

    const [rows] = await pool.execute(
      `SELECT id, first_name, last_name, email, access_level,
              perm_products, perm_orders, perm_users, perm_reports, is_active
       FROM admins WHERE id = ?`,
      [decoded.id]
    );

    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ success: false, message: 'Admin account not found or deactivated' });
    }

    req.admin = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// ── Role-based Access ─────────────────────────────────────────────────────────
const requireRole = (...roles) => (req, res, next) => {
  if (!req.admin) {
    return res.status(403).json({ success: false, message: 'Admin authentication required' });
  }
  if (!roles.includes(req.admin.access_level)) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Required roles: ${roles.join(', ')}`
    });
  }
  next();
};

// ── Permission Check ──────────────────────────────────────────────────────────
const requirePermission = (permission) => (req, res, next) => {
  if (!req.admin) {
    return res.status(403).json({ success: false, message: 'Admin authentication required' });
  }
  const permKey = `perm_${permission}`;
  if (!req.admin[permKey]) {
    return res.status(403).json({ success: false, message: `Permission denied: ${permission}` });
  }
  next();
};

module.exports = { authenticateUser, authenticateAdmin, requireRole, requirePermission };
