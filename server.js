require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Import routes
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const workOrderRoutes = require('./src/routes/workOrders');
const assetRoutes = require('./src/routes/assets');
const crewRoutes = require('./src/routes/crews');
const reportRoutes = require('./src/routes/reports');
const departmentRoutes = require('./src/routes/departments');
const categoryRoutes = require('./src/routes/categories');
const performerRoutes = require('./src/routes/performers');

const app = express();

// ✅ ВКЛЮЧАЕМ TRUST PROXY (обязательно для Vercel)
app.set('trust proxy', 1);

// Basic security
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://service-management-eqdf.vercel.app',
    'https://service-management-pink.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ Добавляем валидатор для Vercel
  validate: { xForwardedForHeader: false }
});

app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(compression());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/work-orders', workOrderRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/crews', crewRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/performers', performerRoutes);

// Статус
app.get('/api/status', async (req, res) => {
  const status = {
    server: 'running',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    env_vars: {
      POSTGRES_PRISMA_URL: !!process.env.POSTGRES_PRISMA_URL,
      POSTGRES_URL: !!process.env.POSTGRES_URL,
      JWT_SECRET: !!process.env.JWT_SECRET
    }
  };

  try {
    const db = require('./src/config/database');
    await db.raw('SELECT 1');
    status.database = 'connected';
  } catch (error) {
    status.database = 'disconnected';
    status.database_error = error.message;
  }

  res.json(status);
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const db = require('./src/config/database');
    await db.raw('SELECT 1');
    res.json({
      status: 'success',
      message: 'API is running',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'API is running but database connection failed'
    });
  }
});

// Статика в продакшене
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, 'public', 'dist');
  app.use(express.static(frontendPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    }
  });
}

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});