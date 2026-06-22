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

// Initialize express
const app = express();

// Basic security
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS для разработки
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
}

// Rate limiting для API
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000,
  message: {
    status: 'error',
    message: 'Too many requests'
  }
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(compression());

// Логирование в разработке
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// API Routes
app.use('/api/auth', apiLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/work-orders', workOrderRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/crews', crewRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/performers', performerRoutes);

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const db = require('./src/config/database');
    await db.raw('SELECT 1');
    
    res.json({
      status: 'success',
      message: 'API is running',
      database: 'connected',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'API is running but database connection failed',
      error: process.env.NODE_ENV === 'production' ? 'Database error' : error.message
    });
  }
});

// В продакшене отдаем статические файлы фронтенда
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, 'public', 'dist');
  
  console.log('📦 Serving static files from:', frontendPath);
  
  app.use(express.static(frontendPath, {
    maxAge: '1y',
    etag: true,
    lastModified: true
  }));
  
  // Все не-API запросы направляем на index.html (SPA)
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    }
  });
}

// 404 для API
app.use('/api/*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'API endpoint not found'
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid JSON'
    });
  }
  
  res.status(err.status || 500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal Server Error' 
      : err.message
  });
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API available at http://localhost:${PORT}/api`);
  
  if (process.env.NODE_ENV === 'production') {
    console.log(`🌐 Frontend served from http://localhost:${PORT}`);
  } else {
    console.log(`💡 Frontend dev server: http://localhost:5173`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});