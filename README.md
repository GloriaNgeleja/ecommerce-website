# TechStore

A full-stack e-commerce platform for electronics with separate frontend and backend components.

ElectroShop is a modern electronics store offering a wide range of products including laptops, smartphones, tablets, and accessories. The platform provides customers with a seamless shopping experience featuring intuitive product browsing, secure authentication, and efficient order management. For administrators, it offers comprehensive tools for inventory management, order processing, and customer relationship management with advanced security features including two-factor authentication.

## Overview

- **Frontend**: HTML/CSS/JavaScript with admin dashboard and customer store
- **Backend**: Node.js + Express + MySQL REST API with JWT authentication

## Quick Start

### Backend
```bash
cd BACKEND/electroshop-backend
npm install
cp .env.example .env
node src/config/dbSetup.js
npm run dev
```

### Frontend
Open `FRONTEND/electric-store.html` in your browser for the customer store or `FRONTEND/admin-dashboard.html` for the admin panel.

## Features

- User authentication with JWT
- Admin dashboard with 2FA support
- Product catalog with categories
- Order management system
- Role-based permissions
- MySQL database with sample data

## Default Admin

- Email: `admin@electroshop.com`
- Password: `Admin@123456`

## Tech Stack

- **Backend**: Node.js, Express, MySQL, JWT, bcrypt
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Database**: MySQL 8+
