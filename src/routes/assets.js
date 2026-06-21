const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const assetController = require('../controllers/assetController');
const { protect } = require('../middleware/auth');
const { validateRequest, sanitizeInput } = require('../middleware/security');

router.use(protect);
router.use(sanitizeInput);

router.get('/', assetController.getAllAssets);
router.get('/:id', assetController.getAssetById);
router.post('/', [
  body('model').trim().notEmpty(),
  body('number').trim().notEmpty(),
  validateRequest
], assetController.createAsset);
router.put('/:id', assetController.updateAsset);
router.delete('/:id', assetController.deleteAsset);

module.exports = router;