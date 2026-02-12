// src/controllers/adminUsersController.js
// Admin: list users, get user details, activate/deactivate, delete

const pool = require('../config/db');

// ── GET /api/admin/users ──────────────────────────────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, is_active } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where  = [];
    let params = [];

    if (search) {
      where.push('(first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (is_active !== undefined) {
      where.push('is_active = ?');
      params.push(is_active === 'true' ? 1 : 0);
    }

    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM users ${whereSQL}`, params
    );

    const [users] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone,
              u.is_active, u.is_verified, u.created_at,
              COUNT(o.id) AS total_orders,
              COALESCE(SUM(o.total), 0) AS total_spent
       FROM users u
       LEFT JOIN orders o ON o.user_id = u.id
       ${whereSQL}
       GROUP BY u.id ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: { users, pagination: { total, page: parseInt(page), limit: parseInt(limit) } }
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/admin/users/:id ──────────────────────────────────────────────────
const getOne = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[user]] = await pool.execute(
      `SELECT id, first_name, last_name, email, phone,
              is_active, is_verified, avatar_url, created_at
       FROM users WHERE id = ?`,
      [id]
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const [orders] = await pool.execute(
      'SELECT id, order_number, status, total, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
      [id]
    );

    res.json({ success: true, data: { ...user, recent_orders: orders } });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/admin/users/:id/toggle ─────────────────────────────────────────
const toggleStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[user]] = await pool.execute('SELECT id, is_active FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const newStatus = user.is_active ? 0 : 1;
    await pool.execute('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, id]);

    await pool.execute(
      `INSERT INTO audit_log (admin_id, action, entity, entity_id, ip_address)
       VALUES (?, ?, 'user', ?, ?)`,
      [req.admin.id, newStatus ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', id, req.ip]
    );

    res.json({
      success: true,
      message: `User ${newStatus ? 'activated' : 'deactivated'} successfully`,
      data: { is_active: !!newStatus }
    });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[user]] = await pool.execute('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Soft delete
    await pool.execute('UPDATE users SET is_active = 0 WHERE id = ?', [id]);

    await pool.execute(
      `INSERT INTO audit_log (admin_id, action, entity, entity_id, ip_address)
       VALUES (?, 'DELETE_USER', 'user', ?, ?)`,
      [req.admin.id, id, req.ip]
    );

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getOne, toggleStatus, deleteUser };
