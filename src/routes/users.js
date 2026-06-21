const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const userController = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');
const { validateRequest, sanitizeInput } = require('../middleware/security');

router.use(protect);
router.use(sanitizeInput);

// Получить всех пользователей
router.get('/', userController.getAllUsers);

// Получить бригадиров
router.get('/foremen', userController.getForemen);

// Получить монтажников
router.get('/installers', userController.getInstallers);

// Получить исполнителей
router.get('/performers', userController.getPerformers);

// Получить пользователя по ID
router.get('/:id', userController.getUserById);

// Обновить пользователя
router.put('/:id', [
  body('lastName').optional().trim(),
  body('firstName').optional().trim(),
  body('middleName').optional().trim(),
  body('position').optional().trim(),
  body('phone').optional().trim(),
  body('departmentId').optional().isInt(),
  validateRequest
], userController.updateUser);

// Удалить пользователя
router.delete('/:id', authorize('admin'), userController.deleteUser);

// Назначить бригадиром
router.post('/:userId/make-foreman', authorize('admin'), userController.makeForeman);

// Назначить монтажником
router.post('/:userId/make-installer', authorize('admin'), userController.makeInstaller);

// Удалить роль бригадира
router.delete('/:userId/remove-foreman', authorize('admin'), userController.removeForeman);

// Удалить роль монтажника
router.delete('/:userId/remove-installer', authorize('admin'), userController.removeInstaller);

module.exports = router;