// src/server.js
// ElectroShop API — Express + MySQL
// ─────────────────────────────────

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

// Routes
const userAuthRoutes   = require('./routes/userAuthRoutes');
const adminAuthRoutes  = require('./routes/adminAuthRoutes');
const productRoutes    = require('./routes/productRoutes');
const orderRoutes      = require('./routes/orderRoutes');
const adminUsersRoutes = require('./routes/adminUsersRoutes');

// Middleware
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Security & Utility Middleware ─────────────────────────────────────────────
app.set('trust proxy', 1);

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Rate Limiting ─────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' }
});

app.use(globalLimiter);

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'ElectroShop API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV,
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────

// Auth — rate-limited
app.use('/api/users',   authLimiter, userAuthRoutes);
app.use('/api/admin',   authLimiter, adminAuthRoutes);

// Resources
app.use('/api/products',      productRoutes);
app.use('/api/orders',        orderRoutes);
app.use('/api/admin/users',   adminUsersRoutes);

// ── API Route Summary (shown on root) ─────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: '🛍️  ElectroShop REST API',
    version: '1.0.0',
    endpoints: {
      health:          'GET  /health',
      user_register:   'POST /api/users/register',
      user_login:      'POST /api/users/login',
      user_profile:    'GET  /api/users/profile  [auth]',
      user_orders:     'GET  /api/orders          [auth]',
      place_order:     'POST /api/orders          [auth]',
      products:        'GET  /api/products',
      product_detail:  'GET  /api/products/:id',
      categories:      'GET  /api/products/categories',
      admin_register:  'POST /api/admin/register',
      admin_login:     'POST /api/admin/login',
      admin_2fa:       'POST /api/admin/verify-2fa',
      admin_dashboard: 'GET  /api/admin/dashboard  [admin auth]',
      admin_products:  'POST /api/products         [admin auth]',
      admin_orders:    'GET  /api/orders/admin/all [admin auth]',
      admin_users:     'GET  /api/admin/users      [admin auth + users permission]',
    }
  });
});

// ── Error Handlers ────────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  ElectroShop API running on http://localhost:${PORT}`);
  console.log(`📋  Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`📖  API docs    : http://localhost:${PORT}/\n`);
});

module.exports = app;
