const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { protect, authorize } = require('../middleware/auth');
const { validateRequest } = require('../middleware/security');
const db = require('../config/database');

router.use(protect);
router.use(authorize('foreman'));

// Назначить бригаду исполнителю
router.put('/:id/assign-crew', [
  body('crewId').isInt().withMessage('Не указана бригада'),
  validateRequest
], async (req, res) => {
  try {
    const { id } = req.params;
    const { crewId } = req.body;

    // Проверяем существование исполнителя
    const performer = await db('Performer')
      .where('performer_id', id)
      .first();

    if (!performer) {
      return res.status(404).json({
        status: 'error',
        message: 'Исполнитель не найден.'
      });
    }

    // Проверяем существование бригады
    const crew = await db('Crew')
      .where('crew_id', crewId)
      .first();

    if (!crew) {
      return res.status(404).json({
        status: 'error',
        message: 'Бригада не найдена.'
      });
    }

    // Обновляем бригаду у исполнителя
    await db('Performer')
      .where('performer_id', id)
      .update({ crew_id: crewId });

    res.status(200).json({
      status: 'success',
      message: 'Бригада успешно назначена исполнителю.'
    });
  } catch (error) {
    console.error('Assign crew error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при назначении бригады: ' + error.message
    });
  }
});

module.exports = router;