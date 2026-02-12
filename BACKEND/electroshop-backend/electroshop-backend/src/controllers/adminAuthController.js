// src/controllers/adminAuthController.js
// Handles: admin register (with invitation code), login + 2FA, refresh, stats

const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const pool     = require('../config/db');

// ── Helper: generate tokens ───────────────────────────────────────────────────
function generateTokens(adminId) {
  const payload = { id: adminId, type: 'admin' };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });

  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });

  return { accessToken, refreshToken };
}

// ── Helper: store refresh token ───────────────────────────────────────────────
async function storeRefreshToken(token, adminId) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await pool.execute(
    `INSERT INTO refresh_tokens (token, admin_id, user_type, expires_at)
     VALUES (?, ?, 'admin', ?)`,
    [token, adminId, expiresAt]
  );
}

// ── POST /api/admin/register ──────────────────────────────────────────────────
const register = async (req, res, next) => {
  try {
    const {
      first_name, last_name, email, password,
      department, access_level, invitation_code,
      perm_products, perm_orders, perm_users, perm_reports
    } = req.body;

    // Verify invitation code
    if (invitation_code !== process.env.ADMIN_INVITATION_CODE) {
      return res.status(403).json({
        success: false,
        message: 'Invalid invitation code'
      });
    }

    // Check duplicate email
    const [existing] = await pool.execute(
      'SELECT id FROM admins WHERE email = ?', [email]
    );
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'Admin email already registered' });
    }

    // Super admin can only be set if none exists (prevent privilege escalation)
    if (access_level === 'super') {
      const [supers] = await pool.execute(
        "SELECT id FROM admins WHERE access_level = 'super'"
      );
      if (supers.length > 0) {
        return res.status(403).json({
          success: false,
          message: 'Super admin already exists. Cannot create another.'
        });
      }
    }

    const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);

    // Permissions default: moderators get basic permissions only
    const finalLevel = access_level || 'moderator';
    const perms = {
      products: perm_products  !== undefined ? (perm_products  ? 1 : 0) : 1,
      orders:   perm_orders    !== undefined ? (perm_orders    ? 1 : 0) : 1,
      users:    perm_users     !== undefined ? (perm_users     ? 1 : 0) : 0,
      reports:  perm_reports   !== undefined ? (perm_reports   ? 1 : 0) : 0,
    };

    // Super admins always get all permissions
    if (finalLevel === 'super') {
      Object.keys(perms).forEach(k => perms[k] = 1);
    }

    const [result] = await pool.execute(
      `INSERT INTO admins
         (first_name, last_name, email, password_hash, department, access_level,
          perm_products, perm_orders, perm_users, perm_reports)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [first_name, last_name, email, passwordHash,
       department || null, finalLevel,
       perms.products, perms.orders, perms.users, perms.reports]
    );

    res.status(201).json({
      success: true,
      message: 'Admin account created successfully',
      data: {
        id: result.insertId,
        first_name, last_name, email,
        access_level: finalLevel, department,
      }
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/admin/login ─────────────────────────────────────────────────────
// Step 1: verify email + password  →  returns { requires2FA, tempToken }
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const [rows] = await pool.execute(
      `SELECT id, first_name, last_name, email, password_hash,
              access_level, department, is_active, two_fa_enabled, two_fa_secret
       FROM admins WHERE email = ?`,
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const admin = rows[0];

    if (!admin.is_active) {
      return res.status(403).json({ success: false, message: 'Admin account is deactivated' });
    }

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Log access attempt
    await pool.execute(
      `INSERT INTO audit_log (admin_id, action, entity, details, ip_address)
       VALUES (?, 'LOGIN_ATTEMPT', 'admin', ?, ?)`,
      [admin.id, JSON.stringify({ email, access_level: admin.access_level }),
       req.ip || req.connection.remoteAddress]
    );

    // If 2FA is enabled, return a short-lived temp token
    if (admin.two_fa_enabled) {
      const tempToken = jwt.sign(
        { id: admin.id, type: 'admin_2fa_pending' },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({
        success: true,
        requires2FA: true,
        tempToken,
        message: 'Please enter your 2FA code'
      });
    }

    // No 2FA — issue full tokens
    const { accessToken, refreshToken } = generateTokens(admin.id);
    await storeRefreshToken(refreshToken, admin.id);

    await pool.execute('UPDATE admins SET last_login = NOW() WHERE id = ?', [admin.id]);

    const { password_hash: _, two_fa_secret: __, ...safeAdmin } = admin;

    res.json({
      success: true,
      message: 'Admin login successful',
      data: { admin: safeAdmin, accessToken, refreshToken }
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/admin/verify-2fa ────────────────────────────────────────────────
// Step 2: verify TOTP code using the tempToken from step 1
const verify2FA = async (req, res, next) => {
  try {
    const { temp_token, code } = req.body;

    if (!temp_token || !code) {
      return res.status(400).json({ success: false, message: 'temp_token and code are required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(temp_token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Temp token expired or invalid' });
    }

    if (decoded.type !== 'admin_2fa_pending') {
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    }

    const [rows] = await pool.execute(
      'SELECT id, two_fa_secret, is_active FROM admins WHERE id = ?',
      [decoded.id]
    );

    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ success: false, message: 'Admin not found' });
    }

    const admin = rows[0];

    // Verify TOTP code
    const verified = speakeasy.totp.verify({
      secret:   admin.two_fa_secret,
      encoding: 'base32',
      token:    code,
      window:   1, // allow 30s drift
    });

    if (!verified) {
      return res.status(401).json({ success: false, message: 'Invalid 2FA code' });
    }

    const { accessToken, refreshToken } = generateTokens(admin.id);
    await storeRefreshToken(refreshToken, admin.id);
    await pool.execute('UPDATE admins SET last_login = NOW() WHERE id = ?', [admin.id]);

    res.json({
      success: true,
      message: '2FA verified. Login successful.',
      data: { accessToken, refreshToken }
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/admin/refresh ───────────────────────────────────────────────────
const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }

    const [rows] = await pool.execute(
      `SELECT id FROM refresh_tokens
       WHERE token = ? AND user_type = 'admin' AND expires_at > NOW()`,
      [refreshToken]
    );
    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Refresh token revoked or expired' });
    }

    await pool.execute('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);

    const { accessToken, refreshToken: newRefresh } = generateTokens(decoded.id);
    await storeRefreshToken(newRefresh, decoded.id);

    res.json({ success: true, data: { accessToken, refreshToken: newRefresh } });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/admin/logout ────────────────────────────────────────────────────
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await pool.execute('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);
    }
    res.json({ success: true, message: 'Admin logged out successfully' });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/admin/dashboard ──────────────────────────────────────────────────
const getDashboard = async (req, res, next) => {
  try {
    const [[{ total_users }]]    = await pool.execute('SELECT COUNT(*) AS total_users FROM users WHERE is_active=1');
    const [[{ total_products }]] = await pool.execute('SELECT COUNT(*) AS total_products FROM products WHERE is_active=1');
    const [[{ total_orders }]]   = await pool.execute('SELECT COUNT(*) AS total_orders FROM orders');
    const [[{ total_revenue }]]  = await pool.execute(
      "SELECT COALESCE(SUM(total), 0) AS total_revenue FROM orders WHERE status NOT IN ('cancelled','refunded')"
    );
    const [[{ pending_orders }]] = await pool.execute(
      "SELECT COUNT(*) AS pending_orders FROM orders WHERE status = 'pending'"
    );
    const [[{ low_stock }]]      = await pool.execute(
      'SELECT COUNT(*) AS low_stock FROM products WHERE stock < 10 AND is_active = 1'
    );

    // Recent orders
    const [recentOrders] = await pool.execute(
      `SELECT o.id, o.order_number, o.status, o.total, o.created_at,
              u.first_name, u.last_name, u.email
       FROM orders o
       JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC LIMIT 5`
    );

    // Monthly revenue (last 6 months)
    const [monthlyRevenue] = await pool.execute(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
              SUM(total) AS revenue, COUNT(*) AS orders
       FROM orders
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
         AND status NOT IN ('cancelled','refunded')
       GROUP BY month ORDER BY month ASC`
    );

    res.json({
      success: true,
      data: {
        stats: {
          total_users, total_products, total_orders,
          total_revenue: parseFloat(total_revenue),
          pending_orders, low_stock
        },
        recent_orders: recentOrders,
        monthly_revenue: monthlyRevenue,
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, verify2FA, refresh, logout, getDashboard };
