// src/config/dbSetup.js
// Run once: node src/config/dbSetup.js
// Creates all tables and seeds initial data

const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_NAME = process.env.DB_NAME || 'electroshop';

async function setup() {
  // Connect WITHOUT specifying the database first
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     process.env.DB_PORT     || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    charset:  'utf8mb4',
  });

  console.log('🔧  Setting up ElectroShop database...\n');

  try {
    // ── Create & select database ──────────────────────────────────────────
    await conn.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
                        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.execute(`USE \`${DB_NAME}\``);
    console.log(`✅  Database "${DB_NAME}" ready`);

    // ── USERS ─────────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        first_name    VARCHAR(60)  NOT NULL,
        last_name     VARCHAR(60)  NOT NULL,
        email         VARCHAR(120) NOT NULL UNIQUE,
        phone         VARCHAR(20)  DEFAULT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_verified   TINYINT(1)   NOT NULL DEFAULT 0,
        is_active     TINYINT(1)   NOT NULL DEFAULT 1,
        avatar_url    VARCHAR(500) DEFAULT NULL,
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email)
      ) ENGINE=InnoDB
    `);
    console.log('✅  Table: users');

    // ── ADMINS ────────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS admins (
        id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        first_name        VARCHAR(60)  NOT NULL,
        last_name         VARCHAR(60)  NOT NULL,
        email             VARCHAR(120) NOT NULL UNIQUE,
        password_hash     VARCHAR(255) NOT NULL,
        department        VARCHAR(80)  DEFAULT NULL,
        access_level      ENUM('super','admin','moderator') NOT NULL DEFAULT 'moderator',
        perm_products     TINYINT(1)  NOT NULL DEFAULT 1,
        perm_orders       TINYINT(1)  NOT NULL DEFAULT 1,
        perm_users        TINYINT(1)  NOT NULL DEFAULT 0,
        perm_reports      TINYINT(1)  NOT NULL DEFAULT 0,
        is_active         TINYINT(1)  NOT NULL DEFAULT 1,
        two_fa_secret     VARCHAR(100) DEFAULT NULL,
        two_fa_enabled    TINYINT(1)  NOT NULL DEFAULT 0,
        last_login        DATETIME    DEFAULT NULL,
        created_at        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email)
      ) ENGINE=InnoDB
    `);
    console.log('✅  Table: admins');

    // ── REFRESH TOKENS ────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        token       VARCHAR(512) NOT NULL UNIQUE,
        user_id     INT UNSIGNED DEFAULT NULL,
        admin_id    INT UNSIGNED DEFAULT NULL,
        user_type   ENUM('user','admin') NOT NULL,
        expires_at  DATETIME NOT NULL,
        created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_token (token)
      ) ENGINE=InnoDB
    `);
    console.log('✅  Table: refresh_tokens');

    // ── PASSWORD RESET TOKENS ─────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        email      VARCHAR(120) NOT NULL,
        token      VARCHAR(255) NOT NULL UNIQUE,
        user_type  ENUM('user','admin') NOT NULL DEFAULT 'user',
        expires_at DATETIME NOT NULL,
        used       TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_token (token),
        INDEX idx_email (email)
      ) ENGINE=InnoDB
    `);
    console.log('✅  Table: password_reset_tokens');

    // ── CATEGORIES ────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS categories (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name        VARCHAR(100) NOT NULL UNIQUE,
        slug        VARCHAR(110) NOT NULL UNIQUE,
        icon        VARCHAR(10)  DEFAULT '📦',
        is_active   TINYINT(1)  NOT NULL DEFAULT 1,
        created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);
    console.log('✅  Table: categories');

    // ── PRODUCTS ──────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name         VARCHAR(200) NOT NULL,
        slug         VARCHAR(220) NOT NULL UNIQUE,
        description  TEXT         DEFAULT NULL,
        category_id  INT UNSIGNED NOT NULL,
        price        DECIMAL(10,2) NOT NULL,
        stock        INT UNSIGNED  NOT NULL DEFAULT 0,
        icon         VARCHAR(10)   DEFAULT '📦',
        image_url    VARCHAR(500)  DEFAULT NULL,
        rating       DECIMAL(3,2)  NOT NULL DEFAULT 0.00,
        review_count INT UNSIGNED  NOT NULL DEFAULT 0,
        is_active    TINYINT(1)   NOT NULL DEFAULT 1,
        created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
        FULLTEXT INDEX ft_name_desc (name, description),
        INDEX idx_category (category_id),
        INDEX idx_price (price),
        INDEX idx_active (is_active)
      ) ENGINE=InnoDB
    `);
    console.log('✅  Table: products');

    // ── ORDERS ────────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS orders (
        id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        order_number    VARCHAR(30)   NOT NULL UNIQUE,
        user_id         INT UNSIGNED  NOT NULL,
        status          ENUM('pending','confirmed','processing','shipped','delivered','cancelled','refunded')
                        NOT NULL DEFAULT 'pending',
        subtotal        DECIMAL(10,2) NOT NULL,
        tax             DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        shipping_fee    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        total           DECIMAL(10,2) NOT NULL,
        shipping_name   VARCHAR(120)  DEFAULT NULL,
        shipping_addr   VARCHAR(300)  DEFAULT NULL,
        shipping_city   VARCHAR(80)   DEFAULT NULL,
        shipping_zip    VARCHAR(20)   DEFAULT NULL,
        shipping_country VARCHAR(80)  DEFAULT NULL,
        notes           TEXT          DEFAULT NULL,
        created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
        INDEX idx_user    (user_id),
        INDEX idx_status  (status),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB
    `);
    console.log('✅  Table: orders');

    // ── ORDER ITEMS ───────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS order_items (
        id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        order_id     INT UNSIGNED  NOT NULL,
        product_id   INT UNSIGNED  NOT NULL,
        product_name VARCHAR(200)  NOT NULL,
        price        DECIMAL(10,2) NOT NULL,
        quantity     INT UNSIGNED  NOT NULL,
        subtotal     DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (order_id)   REFERENCES orders(id)   ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
        INDEX idx_order   (order_id),
        INDEX idx_product (product_id)
      ) ENGINE=InnoDB
    `);
    console.log('✅  Table: order_items');

    // ── AUDIT LOG ─────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        admin_id    INT UNSIGNED DEFAULT NULL,
        action      VARCHAR(80)  NOT NULL,
        entity      VARCHAR(80)  DEFAULT NULL,
        entity_id   INT UNSIGNED DEFAULT NULL,
        details     JSON         DEFAULT NULL,
        ip_address  VARCHAR(45)  DEFAULT NULL,
        created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_admin  (admin_id),
        INDEX idx_action (action),
        INDEX idx_date   (created_at)
      ) ENGINE=InnoDB
    `);
    console.log('✅  Table: audit_log');

    // ── SEED CATEGORIES ───────────────────────────────────────────────────
    const categories = [
      ['Smartphones',      'smartphones',      '📱'],
      ['Laptops',          'laptops',          '💻'],
      ['Tablets',          'tablets',          '📱'],
      ['TVs',              'tvs',              '📺'],
      ['Audio',            'audio',            '🎧'],
      ['Wearables',        'wearables',        '⌚'],
      ['Home Appliances',  'home-appliances',  '🏠'],
      ['Gaming',           'gaming',           '🎮'],
      ['Cameras',          'cameras',          '📷'],
      ['Networking',       'networking',       '🌐'],
    ];
    for (const [name, slug, icon] of categories) {
      await conn.execute(
        `INSERT IGNORE INTO categories (name, slug, icon) VALUES (?, ?, ?)`,
        [name, slug, icon]
      );
    }
    console.log('✅  Seeded: categories');

    // ── SEED PRODUCTS ─────────────────────────────────────────────────────
    const products = [
      ['iPhone 15 Pro',           'iphone-15-pro',           1,  999.00, 50,  '📱', 4.80, 1234],
      ['Samsung Galaxy S24',      'samsung-galaxy-s24',      1,  899.00, 45,  '📱', 4.70, 987],
      ['MacBook Pro 16"',         'macbook-pro-16',          2, 2499.00, 20,  '💻', 4.90, 2341],
      ['Dell XPS 15',             'dell-xps-15',             2, 1799.00, 18,  '💻', 4.60, 876],
      ['iPad Air',                'ipad-air',                3,  599.00, 35,  '📱', 4.70, 1543],
      ['Samsung Smart TV 65"',    'samsung-smart-tv-65',     4, 1299.00, 12,  '📺', 4.50, 654],
      ['Sony WH-1000XM5',         'sony-wh-1000xm5',        5,  399.00, 60,  '🎧', 4.80, 2109],
      ['AirPods Pro 2',           'airpods-pro-2',           5,  249.00, 80,  '🎧', 4.60, 3421],
      ['Apple Watch Series 9',    'apple-watch-series-9',   6,  429.00, 40,  '⌚', 4.70, 1876],
      ['Dyson V15 Vacuum',        'dyson-v15-vacuum',        7,  649.00, 15,  '🏠', 4.50, 543],
      ['Ninja Air Fryer',         'ninja-air-fryer',         7,  129.00, 90,  '🍳', 4.60, 2345],
      ['Sony PlayStation 5',      'sony-ps5',                8,  499.00, 25,  '🎮', 4.80, 5678],
      ['Canon EOS R50',           'canon-eos-r50',           9,  879.00, 22,  '📷', 4.70, 432],
      ['TP-Link WiFi 6 Router',   'tp-link-wifi6',          10,  199.00, 55,  '🌐', 4.50, 1123],
    ];
    for (const [name, slug, cat_id, price, stock, icon, rating, reviews] of products) {
      await conn.execute(
        `INSERT IGNORE INTO products
          (name, slug, category_id, price, stock, icon, rating, review_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, slug, cat_id, price, stock, icon, rating, reviews]
      );
    }
    console.log('✅  Seeded: products');

    // ── SEED SUPER ADMIN ──────────────────────────────────────────────────
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('Admin@123456', 12);
    await conn.execute(
      `INSERT IGNORE INTO admins
         (first_name, last_name, email, password_hash, department, access_level,
          perm_products, perm_orders, perm_users, perm_reports, two_fa_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['Super', 'Admin', 'admin@electroshop.com', hash,
       'Management', 'super', 1, 1, 1, 1, 0]
    );
    console.log('✅  Seeded: super admin  →  admin@electroshop.com / Admin@123456');

    console.log('\n🎉  Database setup complete!\n');
  } catch (err) {
    console.error('❌  Setup error:', err.message);
    throw err;
  } finally {
    await conn.end();
  }
}

setup().catch(() => process.exit(1));
