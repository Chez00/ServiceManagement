require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

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

app.set('trust proxy', 1);

app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/work-orders', workOrderRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/crews', crewRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/performers', performerRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/test-db', async (req, res) => {
  try {
    const db = require('./src/config/database');
    const result = await db.raw('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (e) {
    res.json({ status: 'error', message: e.message });
  }
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public', 'dist')));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, 'public', 'dist', 'index.html'));
    }
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server started'));