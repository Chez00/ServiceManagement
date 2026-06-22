require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

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

// Basic security (ослабляем для Vercel)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false
}));

// CORS
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://service-management-pink.vercel.app',
    'https://service-management-eqdf.vercel.app'
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
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
      environment: process.env.NODE_ENV || 'development'
    });
  }
});

// В продакшене отдаем статические файлы фронтенда
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, 'public', 'dist');
  
  console.log('📦 Static files path:', frontendPath);
  console.log('📂 Directory exists:', fs.existsSync(frontendPath));
  
  if (fs.existsSync(frontendPath)) {
    console.log('📋 Files in dist:', fs.readdirSync(frontendPath));
    
    // Отдаем статические файлы
    app.use(express.static(frontendPath, {
      maxAge: '1y',
      etag: true,
      lastModified: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      }
    }));
    
    // Все не-API запросы направляем на index.html (SPA)
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        const indexPath = path.join(frontendPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          console.error('❌ index.html not found at:', indexPath);
          res.status(404).send('Frontend not built. index.html not found.');
        }
      }
    });
  } else {
    console.error('❌ Frontend dist folder not found at:', frontendPath);
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.status(404).json({
          error: 'Frontend not built',
          message: 'Run npm run build:frontend first'
        });
      }
    });
  }
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
  res.status(err.status || 500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
  });
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📦 Frontend path: ${path.join(__dirname, 'public', 'dist')}`);
});