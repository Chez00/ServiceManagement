const express = require('express');
const router = express.Router();
const { query } = require('express-validator');
const reportController = require('../controllers/reportController');
const { protect } = require('../middleware/auth');
const { validateRequest } = require('../middleware/security');

router.use(protect);

// Отчет по заявкам
router.get('/work-orders', [
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  validateRequest
], reportController.getWorkOrdersReport);

// Отчет по производительности
router.get('/performance', [
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  validateRequest
], reportController.getPerformanceReport);

// Отчет по оборудованию
router.get('/assets', [
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  validateRequest
], reportController.getAssetReport);

// Отчет по категориям
router.get('/categories', [
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  validateRequest
], reportController.getCategoryReport);

module.exports = router;