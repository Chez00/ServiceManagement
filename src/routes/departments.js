const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const db = require('../config/database');
const { protect, authorize } = require('../middleware/auth');
const { validateRequest } = require('../middleware/security');

router.use(protect);

// Get all departments
router.get('/', async (req, res) => {
  try {
    const departments = await db('Department').select('*');
    res.status(200).json({ status: 'success', data: departments });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Ошибка при получении отделов.' });
  }
});

// Create department
router.post('/', authorize('foreman'), [
  body('name').trim().notEmpty(),
  validateRequest
], async (req, res) => {
  try {
    const [id] = await db('Department').insert({ name: req.body.name });
    const department = await db('Department').where('department_id', id).first();
    res.status(201).json({ status: 'success', data: department });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Ошибка при создании отдела.' });
  }
});

module.exports = router;