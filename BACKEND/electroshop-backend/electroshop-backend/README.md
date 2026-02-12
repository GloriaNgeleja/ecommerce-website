# ElectroShop Backend API

> Node.js + Express + MySQL REST API for the ElectroShop e-commerce frontend.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| Database | MySQL 8 (via `mysql2/promise`) |
| Auth | JWT (access + refresh tokens) |
| 2FA | TOTP via `speakeasy` |
| Passwords | `bcryptjs` (12 salt rounds) |
| Validation | `express-validator` |
| Rate Limiting | `express-rate-limit` |

---

## Project Structure

```
electroshop-backend/
├── src/
│   ├── server.js                    # Entry point
│   ├── config/
│   │   ├── db.js                    # MySQL connection pool
│   │   └── dbSetup.js               # Run once: creates tables + seeds data
│   ├── middleware/
│   │   ├── auth.js                  # JWT verification, role/permission guards
│   │   └── errorHandler.js          # Validation + global error handler
│   ├── controllers/
│   │   ├── userAuthController.js    # User register/login/profile
│   │   ├── adminAuthController.js   # Admin register/login/2FA/dashboard
│   │   ├── productController.js     # Products CRUD
│   │   ├── orderController.js       # Orders
│   │   └── adminUsersController.js  # Admin: manage users
│   └── routes/
│       ├── userAuthRoutes.js
│       ├── adminAuthRoutes.js
│       ├── productRoutes.js
│       ├── orderRoutes.js
│       └── adminUsersRoutes.js
├── .env.example
├── package.json
└── README.md
```

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your MySQL credentials
```

### 3. Set up the database (run once)
```bash
node src/config/dbSetup.js
```
This creates all tables and seeds:
- 10 product categories
- 14 sample products
- 1 super admin account: `admin@electroshop.com` / `Admin@123456`

### 4. Start the server
```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Server runs at: `http://localhost:5000`

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `5000` |
| `NODE_ENV` | Environment | `development` |
| `DB_HOST` | MySQL host | `localhost` |
| `DB_PORT` | MySQL port | `3306` |
| `DB_USER` | MySQL username | `root` |
| `DB_PASSWORD` | MySQL password | _(required)_ |
| `DB_NAME` | Database name | `electroshop` |
| `JWT_SECRET` | JWT signing secret | _(required)_ |
| `JWT_REFRESH_SECRET` | Refresh token secret | _(required)_ |
| `JWT_EXPIRES_IN` | Access token TTL | `24h` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL | `7d` |
| `ADMIN_INVITATION_CODE` | Required to register as admin | _(required)_ |
| `BCRYPT_ROUNDS` | Password hash rounds | `12` |

---

## API Reference

### Health
```
GET /health
```

---

### User Authentication

#### Register
```
POST /api/users/register
Content-Type: application/json

{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "phone": "+1555123456",       // optional
  "password": "Password123"
}
```
**Response 201:**
```json
{
  "success": true,
  "data": {
    "user": { "id": 1, "first_name": "John", ... },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

#### Login
```
POST /api/users/login
{ "email": "john@example.com", "password": "Password123" }
```

#### Refresh Token
```
POST /api/users/refresh
{ "refreshToken": "eyJ..." }
```

#### Logout
```
POST /api/users/logout
{ "refreshToken": "eyJ..." }
```

#### Get Profile `🔒 User Auth`
```
GET /api/users/profile
Authorization: Bearer <accessToken>
```

#### Update Profile `🔒 User Auth`
```
PATCH /api/users/profile
Authorization: Bearer <accessToken>
{ "first_name": "Jane", "last_name": "Doe", "phone": "+1999" }
```

#### Change Password `🔒 User Auth`
```
POST /api/users/change-password
Authorization: Bearer <accessToken>
{ "current_password": "OldPass1", "new_password": "NewPass2" }
```

---

### Admin Authentication

#### Register Admin
```
POST /api/admin/register
{
  "invitation_code": "ELECTROSHOP-ADMIN-2024",
  "first_name": "Sarah",
  "last_name": "Admin",
  "email": "sarah@electroshop.com",
  "password": "Admin@Pass1",
  "department": "Operations",
  "access_level": "admin",         // super | admin | moderator
  "perm_products": true,
  "perm_orders": true,
  "perm_users": false,
  "perm_reports": true
}
```

#### Login Admin (Step 1)
```
POST /api/admin/login
{ "email": "admin@electroshop.com", "password": "Admin@123456" }
```
If 2FA disabled → returns `accessToken` + `refreshToken` directly.
If 2FA enabled → returns `{ requires2FA: true, tempToken: "..." }`.

#### Verify 2FA (Step 2)
```
POST /api/admin/verify-2fa
{ "temp_token": "eyJ...", "code": "123456" }
```

#### Admin Dashboard `🔒 Admin Auth`
```
GET /api/admin/dashboard
Authorization: Bearer <adminAccessToken>
```
Returns: stats (users, products, orders, revenue), recent orders, monthly revenue chart data.

---

### Products

#### List Products (with filters)
```
GET /api/products?page=1&limit=12&category=laptops&search=mac&min_price=500&max_price=3000&sort=price&order=asc
```

#### Get Single Product
```
GET /api/products/:id
```

#### Get Categories
```
GET /api/products/categories
```

#### Create Product `🔒 Admin Auth`
```
POST /api/products
Authorization: Bearer <adminToken>
{
  "name": "iPhone 16",
  "description": "Latest iPhone",
  "category_id": 1,
  "price": 1099.00,
  "stock": 50,
  "icon": "📱"
}
```

#### Update Product `🔒 Admin Auth`
```
PUT /api/products/:id
Authorization: Bearer <adminToken>
{ "price": 999.00, "stock": 40 }
```

#### Delete Product `🔒 Admin Auth` (soft delete)
```
DELETE /api/products/:id
Authorization: Bearer <adminToken>
```

---

### Orders

#### Place Order `🔒 User Auth`
```
POST /api/orders
Authorization: Bearer <userToken>
{
  "items": [
    { "product_id": 1, "quantity": 2 },
    { "product_id": 7, "quantity": 1 }
  ],
  "shipping_name": "John Doe",
  "shipping_addr": "123 Main St",
  "shipping_city": "New York",
  "shipping_zip": "10001",
  "shipping_country": "US"
}
```
Tax (8%) and shipping ($9.99, free over $500) calculated server-side.

#### My Orders `🔒 User Auth`
```
GET /api/orders?page=1&limit=10
Authorization: Bearer <userToken>
```

#### Order Detail `🔒 User Auth`
```
GET /api/orders/:id
Authorization: Bearer <userToken>
```

#### All Orders (Admin) `🔒 Admin Auth`
```
GET /api/orders/admin/all?page=1&status=pending&search=ORD-
Authorization: Bearer <adminToken>
```

#### Update Order Status `🔒 Admin Auth`
```
PATCH /api/orders/admin/:id/status
Authorization: Bearer <adminToken>
{ "status": "shipped" }
```
Valid statuses: `pending` → `confirmed` → `processing` → `shipped` → `delivered` | `cancelled` | `refunded`

---

### Admin: Manage Users `🔒 Admin Auth + users permission`

```
GET    /api/admin/users              # list all users
GET    /api/admin/users/:id          # user detail + recent orders
PATCH  /api/admin/users/:id/toggle   # activate / deactivate
DELETE /api/admin/users/:id          # soft delete
```

---

## Connecting the Frontend

In each HTML file, replace `console.log(...)` calls with `fetch()` calls:

### Example: user-login.html
```javascript
async function handleLogin() {
  const email    = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  try {
    const res  = await fetch('http://localhost:5000/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!data.success) {
      showError(data.message);
      return;
    }

    // Store tokens
    localStorage.setItem('accessToken', data.data.accessToken);
    localStorage.setItem('refreshToken', data.data.refreshToken);

    showSuccess('Login successful! Redirecting...');
    setTimeout(() => window.location.href = 'electric-store.html', 1500);
  } catch (err) {
    showError('Server error. Please try again.');
  }
}
```

### Authenticated Requests
```javascript
const res = await fetch('http://localhost:5000/api/orders', {
  headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
});
```

---

## Database Schema

| Table | Purpose |
|---|---|
| `users` | Customer accounts |
| `admins` | Admin accounts with role & permissions |
| `refresh_tokens` | Stored refresh tokens (user & admin) |
| `password_reset_tokens` | Password reset flow |
| `categories` | Product categories |
| `products` | Products with stock |
| `orders` | Customer orders |
| `order_items` | Line items per order |
| `audit_log` | Admin action history |

---

## Security Features

- ✅ Passwords hashed with bcrypt (12 rounds)
- ✅ JWT access tokens (short-lived) + refresh token rotation
- ✅ TOTP-based 2FA for admin logins
- ✅ Admin invitation code required for registration
- ✅ Role-based access control (super / admin / moderator)
- ✅ Granular permissions per admin (products, orders, users, reports)
- ✅ Rate limiting: 10 auth attempts / 15 min
- ✅ All admin actions logged to `audit_log`
- ✅ Input validation on all endpoints
- ✅ SQL injection prevention via parameterized queries
- ✅ Soft deletes (data preserved)
