// src/controllers/orderController.js
// User: place order, view own orders | Admin: list all, update status

const pool = require('../config/db');

// ── Helper: generate order number ─────────────────────────────────────────────
function genOrderNumber() {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${ts}-${rand}`;
}

// ── POST /api/orders ──────────────────────────────────────────────────────────
const placeOrder = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      items,           // [{ product_id, quantity }, ...]
      shipping_name,
      shipping_addr,
      shipping_city,
      shipping_zip,
      shipping_country,
      notes
    } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ success: false, message: 'Order must contain at least one item' });
    }

    let subtotal = 0;
    const orderItems = [];

    // Validate stock and prices
    for (const item of items) {
      const [[product]] = await conn.execute(
        'SELECT id, name, price, stock FROM products WHERE id = ? AND is_active = 1',
        [item.product_id]
      );

      if (!product) {
        await conn.rollback();
        return res.status(404).json({
          success: false,
          message: `Product ID ${item.product_id} not found`
        });
      }

      if (product.stock < item.quantity) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${product.name}" (available: ${product.stock})`
        });
      }

      const itemSubtotal = parseFloat(product.price) * item.quantity;
      subtotal += itemSubtotal;
      orderItems.push({ ...product, quantity: item.quantity, subtotal: itemSubtotal });
    }

    const tax          = parseFloat((subtotal * 0.08).toFixed(2)); // 8% tax
    const shippingFee  = subtotal >= 500 ? 0 : 9.99;               // free shipping over $500
    const total        = parseFloat((subtotal + tax + shippingFee).toFixed(2));
    const orderNumber  = genOrderNumber();

    // Insert order
    const [orderResult] = await conn.execute(
      `INSERT INTO orders
         (order_number, user_id, subtotal, tax, shipping_fee, total,
          shipping_name, shipping_addr, shipping_city, shipping_zip,
          shipping_country, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderNumber, req.user.id, subtotal, tax, shippingFee, total,
       shipping_name || null, shipping_addr || null, shipping_city || null,
       shipping_zip  || null, shipping_country || null, notes || null]
    );

    const orderId = orderResult.insertId;

    // Insert order items & deduct stock
    for (const item of orderItems) {
      await conn.execute(
        `INSERT INTO order_items (order_id, product_id, product_name, price, quantity, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, item.id, item.name, item.price, item.quantity, item.subtotal]
      );

      await conn.execute(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.id]
      );
    }

    await conn.commit();

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: {
        order_id: orderId,
        order_number: orderNumber,
        subtotal, tax,
        shipping_fee: shippingFee,
        total,
        items: orderItems.map(i => ({
          product_id:   i.id,
          product_name: i.name,
          price:        i.price,
          quantity:     i.quantity,
          subtotal:     i.subtotal,
        }))
      }
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// ── GET /api/orders ───────────────────────────────────────────────────────────
const getUserOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [[{ total }]] = await pool.execute(
      'SELECT COUNT(*) AS total FROM orders WHERE user_id = ?',
      [req.user.id]
    );

    const [orders] = await pool.execute(
      `SELECT id, order_number, status, subtotal, tax, shipping_fee, total, created_at
       FROM orders WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [req.user.id, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: {
        orders,
        pagination: { total, page: parseInt(page), limit: parseInt(limit) }
      }
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/orders/:id ───────────────────────────────────────────────────────
const getOrderDetail = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [orders] = await pool.execute(
      'SELECT * FROM orders WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (!orders.length) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const [items] = await pool.execute(
      `SELECT oi.*, p.icon, p.image_url
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`,
      [id]
    );

    res.json({ success: true, data: { ...orders[0], items } });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/admin/orders ─────────────────────────────────────────────────────
const adminGetAllOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where  = [];
    let params = [];

    if (status) { where.push('o.status = ?'); params.push(status); }
    if (search) {
      where.push('(o.order_number LIKE ? OR u.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM orders o
       JOIN users u ON u.id = o.user_id ${whereSQL}`,
      params
    );

    const [orders] = await pool.execute(
      `SELECT o.id, o.order_number, o.status, o.total, o.created_at,
              u.first_name, u.last_name, u.email
       FROM orders o
       JOIN users u ON u.id = o.user_id
       ${whereSQL}
       ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: { orders, pagination: { total, page: parseInt(page), limit: parseInt(limit) } }
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/admin/orders/:id/status ───────────────────────────────────────
const adminUpdateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending','confirmed','processing','shipped','delivered','cancelled','refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    const [existing] = await pool.execute('SELECT id, status FROM orders WHERE id = ?', [id]);
    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    await pool.execute('UPDATE orders SET status = ? WHERE id = ?', [status, id]);

    await pool.execute(
      `INSERT INTO audit_log (admin_id, action, entity, entity_id, details, ip_address)
       VALUES (?, 'UPDATE_ORDER_STATUS', 'order', ?, ?, ?)`,
      [req.admin.id, id,
       JSON.stringify({ from: existing[0].status, to: status }), req.ip]
    );

    res.json({ success: true, message: `Order status updated to "${status}"` });
  } catch (err) {
    next(err);
  }
};

module.exports = { placeOrder, getUserOrders, getOrderDetail, adminGetAllOrders, adminUpdateStatus };
