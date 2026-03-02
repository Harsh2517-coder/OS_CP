// server.js - Main Express Server
// ═══════════════════════════════════════════════════════════════
//  ACADEMIA ERP SYSTEM - Backend Server
//  
//  SETUP INSTRUCTIONS:
//  1. Copy .env.example to .env
//  2. Fill in your MongoDB Atlas URI in .env (MONGODB_URI)
//  3. Set a strong JWT_SECRET in .env
//  4. Run: npm install
//  5. Run: npm start (or npm run dev for development)
// ═══════════════════════════════════════════════════════════════

require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();

// ──────────────────────────────────────────
// SECURITY MIDDLEWARE
// ──────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, message: 'Too many requests. Please try again later.' }
});
app.use('/api/', limiter);

// ──────────────────────────────────────────
// CORS CONFIGURATION
// Change FRONTEND_URL in .env to your Netlify URL after deployment
// ──────────────────────────────────────────
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'http://localhost:3000',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      'http://127.0.0.1:3000'
    ].filter(Boolean);

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin || allowedOrigins.some(o => origin.startsWith(o.replace('*', '')))) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// ──────────────────────────────────────────
// REQUEST PARSING
// ──────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// ──────────────────────────────────────────
// ROUTES
// ──────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/classrooms', require('./routes/classrooms'));
app.use('/api/assignments', require('./routes/assignments'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Academia ERP API is running.', timestamp: new Date() });
});

// ──────────────────────────────────────────
// ERROR HANDLING
// ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ success: false, message: 'CORS error: Origin not allowed.' });
  }
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal Server Error' });
});

// ──────────────────────────────────────────
// DATABASE CONNECTION & ADMIN SEED
// ──────────────────────────────────────────
const connectDB = async () => {
  try {
    // ⚠️  PUT YOUR MONGODB ATLAS URI IN THE .env FILE AS MONGODB_URI
    const uri = process.env.MONGODB_URI;
    if (!uri || uri.includes('<username>')) {
      throw new Error('Please configure MONGODB_URI in your .env file with your actual MongoDB Atlas connection string.');
    }
    await mongoose.connect(uri);
    console.log('✅ MongoDB Atlas connected successfully');
    await seedAdmin();
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

const seedAdmin = async () => {
  try {
    const { User } = require('./models');
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@academia.edu';
    const existing = await User.findOne({ email: adminEmail });
    if (!existing) {
      await User.create({
        name: process.env.ADMIN_NAME || 'System Administrator',
        email: adminEmail,
        password: process.env.ADMIN_PASSWORD || 'Admin@123456',
        role: 'admin'
      });
      console.log(`✅ Admin account created: ${adminEmail}`);
      console.log(`   Password: ${process.env.ADMIN_PASSWORD || 'Admin@123456'}`);
      console.log(`   ⚠️  Change the admin password after first login!`);
    }
  } catch (err) {
    console.error('Admin seed error:', err.message);
  }
};

// ──────────────────────────────────────────
// START SERVER
// ──────────────────────────────────────────
const PORT = process.env.PORT || 5000;
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 Academia ERP Server running on port ${PORT}`);
    console.log(`📡 API: http://localhost:${PORT}/api`);
    console.log(`🌐 Frontend URL allowed: ${process.env.FRONTEND_URL || 'http://localhost:3000'}\n`);
  });
});

module.exports = app;
