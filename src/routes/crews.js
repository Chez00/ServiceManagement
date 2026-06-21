const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const crewController = require('../controllers/crewController');
const { protect, authorize } = require('../middleware/auth');
const { validateRequest, sanitizeInput } = require('../middleware/security');

// Защита всех маршрутов
router.use(protect);
router.use(sanitizeInput);

// Получить все бригады (доступно всем авторизованным)
router.get('/', crewController.getAllCrews);

// Получить бригаду по ID (доступно всем авторизованным)
router.get('/:id', crewController.getCrewById);

// Создать бригаду (только admin и foreman)
router.post('/', authorize('admin', 'foreman'), [
  body('foremanId').isInt().withMessage('ID бригадира должен быть числом'),
  body('installerIds').isArray().withMessage('installerIds должен быть массивом'),
  body('installerIds.*').isInt().withMessage('ID монтажника должен быть числом'),
  validateRequest
], crewController.createCrew);

// Обновить бригаду (только admin и foreman)
router.put('/:id', authorize('admin', 'foreman'), [
  body('foremanId').optional().isInt().withMessage('ID бригадира должен быть числом'),
  body('installerIds').optional().isArray().withMessage('installerIds должен быть массивом'),
  body('installerIds.*').optional().isInt().withMessage('ID монтажника должен быть числом'),
  validateRequest
], crewController.updateCrew);

// Добавить монтажника в бригаду (только admin и foreman)
router.post('/:id/installers', authorize('admin', 'foreman'), [
  body('installerId').isInt().withMessage('ID монтажника должен быть числом'),
  validateRequest
], crewController.addInstaller);

// Удалить монтажника из бригады (только admin и foreman)
router.delete('/:crewId/installers/:installerId', authorize('admin', 'foreman'), crewController.removeInstaller);

// Удалить бригаду (только admin и foreman)
router.delete('/:id', authorize('admin', 'foreman'), crewController.deleteCrew);

module.exports = router;