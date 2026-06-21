const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const db = require('../config/database');
const { protect, authorize } = require('../middleware/auth');
const { validateRequest } = require('../middleware/security');

router.use(protect);

// Get all categories
router.get('/', async (req, res) => {
  try {
    const categories = await db('Category').select('*');
    res.status(200).json({ status: 'success', data: categories });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Ошибка при получении категорий.' });
  }
});

// Create category
router.post('/', authorize('foreman'), [
  body('name').trim().notEmpty(),
  validateRequest
], async (req, res) => {
  try {
    const [id] = await db('Category').insert({ name: req.body.name });
    const category = await db('Category').where('category_id', id).first();
    res.status(201).json({ status: 'success', data: category });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Ошибка при создании категории.' });
  }
});

module.exports = router;