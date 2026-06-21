const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const workOrderController = require('../controllers/workOrderController');
const { protect, authorize } = require('../middleware/auth');
const { validateRequest, sanitizeInput } = require('../middleware/security');

// Apply middleware
router.use(protect);
router.use(sanitizeInput);

// Get all work orders with filtering and pagination
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isString(),
  query('priority').optional().isString(),
  query('categoryId').optional().isInt(),
  query('search').optional().isString(),
  validateRequest
], workOrderController.getAllWorkOrders);

// Get single work order
router.get('/:id', workOrderController.getWorkOrderById);

// Create work order
router.post('/', [
  body('assetId').isInt().withMessage('Не указано оборудование'),
  body('categoryId').isInt().withMessage('Не указана категория'),
  body('name').trim().notEmpty().withMessage('Не указано название'),
  body('description').optional().trim(),
  body('priority').optional().isIn(['Низкий', 'Средний', 'Высокий', 'Критичный']),
  body('deadline').optional().isISO8601(),
  body('foremanId').optional().isInt(),
  validateRequest
], workOrderController.createWorkOrder);

// Update work order
router.put('/:id', [
  body('name').optional().trim(),
  body('status').optional().isString(),
  body('priority').optional().isIn(['Низкий', 'Средний', 'Высокий', 'Критичный']),
  body('comment').optional().trim(),
  body('foremanId').optional(),
  validateRequest
], workOrderController.updateWorkOrder);

// Delete work order
router.delete('/:id', workOrderController.deleteWorkOrder);

// Assign crew to work order (новый маршрут для назначения бригады)
router.post('/:id/assign-crew', authorize('foreman'), [
  body('crewId').isInt().withMessage('Не указана бригада'),
  validateRequest
], async (req, res) => {
  try {
    const { id } = req.params;
    const { crewId } = req.body;
    
    const workOrder = await db('WorkOrder').where('work_order_id', id).first();
    if (!workOrder) {
      return res.status(404).json({
        status: 'error',
        message: 'Заявка не найдена.'
      });
    }
    
    // Получаем performer для этой бригады
    const performer = await db('Performer').where('crew_id', crewId).first();
    if (!performer) {
      return res.status(404).json({
        status: 'error',
        message: 'Исполнитель для этой бригады не найден.'
      });
    }
    
    await db('WorkOrder').where('work_order_id', id).update({
      performer_id: performer.performer_id
    });
    
    res.status(200).json({
      status: 'success',
      message: 'Бригада назначена на заявку.'
    });
  } catch (error) {
    console.error('Assign crew error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при назначении бригады.'
    });
  }
});

module.exports = router;