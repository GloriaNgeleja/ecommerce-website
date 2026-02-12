// src/controllers/productController.js
// Public: list, search, get single | Admin: create, update, delete

const pool = require('../config/db');

// ── GET /api/products ─────────────────────────────────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const {
      page      = 1,
      limit     = 12,
      category,
      search,
      min_price,
      max_price,
      sort      = 'created_at',
      order     = 'desc',
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Whitelist sort columns
    const allowedSort  = ['name','price','rating','review_count','created_at'];
    const allowedOrder = ['asc', 'desc'];
    const safeSort  = allowedSort.includes(sort)   ? sort  : 'created_at';
    const safeOrder = allowedOrder.includes(order.toLowerCase()) ? order.toUpperCase() : 'DESC';

    let where   = ['p.is_active = 1'];
    let params  = [];

    if (category) {
      where.push('c.slug = ?');
      params.push(category);
    }

    if (search) {
      where.push('(p.name LIKE ? OR p.description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (min_price) { where.push('p.price >= ?'); params.push(parseFloat(min_price)); }
    if (max_price) { where.push('p.price <= ?'); params.push(parseFloat(max_price)); }

    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Total count
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM products p
       JOIN categories c ON c.id = p.category_id ${whereSQL}`,
      params
    );

    // Paginated results
    const [products] = await pool.execute(
      `SELECT p.id, p.name, p.slug, p.price, p.stock, p.icon,
              p.image_url, p.rating, p.review_count, p.created_at,
              c.id AS category_id, c.name AS category_name, c.slug AS category_slug
       FROM products p
       JOIN categories c ON c.id = p.category_id
       ${whereSQL}
       ORDER BY p.${safeSort} ${safeOrder}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          total,
          page:  parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/products/:id ─────────────────────────────────────────────────────
const getOne = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p
       JOIN categories c ON c.id = p.category_id
       WHERE p.id = ? AND p.is_active = 1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/products/categories ──────────────────────────────────────────────
const getCategories = async (req, res, next) => {
  try {
    const [categories] = await pool.execute(
      `SELECT c.*, COUNT(p.id) AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
       WHERE c.is_active = 1
       GROUP BY c.id ORDER BY c.name ASC`
    );
    res.json({ success: true, data: categories });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/admin/products ──────────────────────────────────────────────────
const create = async (req, res, next) => {
  try {
    const { name, description, category_id, price, stock, icon, image_url } = req.body;

    // Generate slug
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const [result] = await pool.execute(
      `INSERT INTO products (name, slug, description, category_id, price, stock, icon, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, slug, description || null, category_id, price, stock || 0, icon || '📦', image_url || null]
    );

    // Audit
    await pool.execute(
      `INSERT INTO audit_log (admin_id, action, entity, entity_id, ip_address)
       VALUES (?, 'CREATE_PRODUCT', 'product', ?, ?)`,
      [req.admin.id, result.insertId, req.ip]
    );

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: { id: result.insertId, name, slug }
    });
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/admin/products/:id ───────────────────────────────────────────────
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, category_id, price, stock, icon, image_url, is_active } = req.body;

    const [existing] = await pool.execute('SELECT id FROM products WHERE id = ?', [id]);
    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const updates = [];
    const params  = [];

    if (name       !== undefined) { updates.push('name = ?');        params.push(name); }
    if (description!== undefined) { updates.push('description = ?'); params.push(description); }
    if (category_id!== undefined) { updates.push('category_id = ?'); params.push(category_id); }
    if (price      !== undefined) { updates.push('price = ?');       params.push(price); }
    if (stock      !== undefined) { updates.push('stock = ?');       params.push(stock); }
    if (icon       !== undefined) { updates.push('icon = ?');        params.push(icon); }
    if (image_url  !== undefined) { updates.push('image_url = ?');   params.push(image_url); }
    if (is_active  !== undefined) { updates.push('is_active = ?');   params.push(is_active ? 1 : 0); }

    if (!updates.length) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    params.push(id);
    await pool.execute(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params);

    await pool.execute(
      `INSERT INTO audit_log (admin_id, action, entity, entity_id, ip_address)
       VALUES (?, 'UPDATE_PRODUCT', 'product', ?, ?)`,
      [req.admin.id, id, req.ip]
    );

    res.json({ success: true, message: 'Product updated successfully' });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/admin/products/:id ────────────────────────────────────────────
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.execute('SELECT id FROM products WHERE id = ?', [id]);
    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Soft delete
    await pool.execute('UPDATE products SET is_active = 0 WHERE id = ?', [id]);

    await pool.execute(
      `INSERT INTO audit_log (admin_id, action, entity, entity_id, ip_address)
       VALUES (?, 'DELETE_PRODUCT', 'product', ?, ?)`,
      [req.admin.id, id, req.ip]
    );

    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getOne, getCategories, create, update, remove };
