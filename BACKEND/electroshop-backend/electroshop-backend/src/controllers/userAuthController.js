// src/controllers/userAuthController.js
// Handles: register, login, token refresh, logout, get/update profile

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool    = require('../config/db');

// ── Helper: generate tokens ───────────────────────────────────────────────────
function generateTokens(userId) {
  const payload = { id: userId, type: 'user' };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });

  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });

  return { accessToken, refreshToken };
}

// ── POST /api/users/register ──────────────────────────────────────────────────
const register = async (req, res, next) => {
  try {
    const { first_name, last_name, email, phone, password } = req.body;

    // Check duplicate email
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ?', [email]
    );
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);

    const [result] = await pool.execute(
      `INSERT INTO users (first_name, last_name, email, phone, password_hash)
       VALUES (?, ?, ?, ?, ?)`,
      [first_name, last_name, email, phone || null, passwordHash]
    );

    const userId = result.insertId;
    const { accessToken, refreshToken } = generateTokens(userId);

    // Store refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.execute(
      `INSERT INTO refresh_tokens (token, user_id, user_type, expires_at)
       VALUES (?, ?, 'user', ?)`,
      [refreshToken, userId, expiresAt]
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: { id: userId, first_name, last_name, email },
        accessToken,
        refreshToken,
      }
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/users/login ─────────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const [rows] = await pool.execute(
      `SELECT id, first_name, last_name, email, phone, password_hash, is_active, avatar_url
       FROM users WHERE email = ?`,
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.execute(
      `INSERT INTO refresh_tokens (token, user_id, user_type, expires_at)
       VALUES (?, ?, 'user', ?)`,
      [refreshToken, user.id, expiresAt]
    );

    const { password_hash: _, ...safeUser } = user;

    res.json({
      success: true,
      message: 'Login successful',
      data: { user: safeUser, accessToken, refreshToken }
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/users/refresh ───────────────────────────────────────────────────
const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token required' });
    }

    // Verify JWT signature
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }

    // Check token is in DB and not expired
    const [rows] = await pool.execute(
      `SELECT id FROM refresh_tokens
       WHERE token = ? AND user_type = 'user' AND expires_at > NOW()`,
      [refreshToken]
    );
    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Refresh token revoked or expired' });
    }

    // Rotate refresh token
    await pool.execute('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);

    const { accessToken, refreshToken: newRefresh } = generateTokens(decoded.id);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.execute(
      `INSERT INTO refresh_tokens (token, user_id, user_type, expires_at)
       VALUES (?, ?, 'user', ?)`,
      [newRefresh, decoded.id, expiresAt]
    );

    res.json({ success: true, data: { accessToken, refreshToken: newRefresh } });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/users/logout ────────────────────────────────────────────────────
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await pool.execute('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/users/profile ────────────────────────────────────────────────────
const getProfile = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, first_name, last_name, email, phone, avatar_url, is_verified, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/users/profile ──────────────────────────────────────────────────
const updateProfile = async (req, res, next) => {
  try {
    const { first_name, last_name, phone } = req.body;
    await pool.execute(
      `UPDATE users SET first_name = ?, last_name = ?, phone = ? WHERE id = ?`,
      [first_name, last_name, phone || null, req.user.id]
    );
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/users/change-password ──────────────────────────────────────────
const changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;

    const [rows] = await pool.execute(
      'SELECT password_hash FROM users WHERE id = ?', [req.user.id]
    );

    const match = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(new_password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
    await pool.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]
    );

    // Revoke all refresh tokens for security
    await pool.execute(
      "DELETE FROM refresh_tokens WHERE user_id = ? AND user_type = 'user'",
      [req.user.id]
    );

    res.json({ success: true, message: 'Password changed successfully. Please log in again.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, refresh, logout, getProfile, updateProfile, changePassword };
