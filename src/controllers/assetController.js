const db = require('../config/database');

const getAllAssets = async (req, res) => {
  try {
    const assets = await db('Asset')
      .select('*')
      .orderBy('model', 'asc');

    res.status(200).json({
      status: 'success',
      data: assets
    });
  } catch (error) {
    console.error('Error fetching assets:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении списка оборудования.'
    });
  }
};

const getAssetById = async (req, res) => {
  try {
    const asset = await db('Asset')
      .where('asset_id', req.params.id)
      .first();

    if (!asset) {
      return res.status(404).json({
        status: 'error',
        message: 'Оборудование не найдено.'
      });
    }

    const workOrders = await db('WorkOrder')
      .where('asset_id', req.params.id)
      .select('work_order_id', 'name', 'status', 'created_date')
      .orderBy('created_date', 'desc')
      .limit(10);

    res.status(200).json({
      status: 'success',
      data: {
        ...asset,
        recentWorkOrders: workOrders
      }
    });
  } catch (error) {
    console.error('Error fetching asset:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении данных оборудования.'
    });
  }
};

const createAsset = async (req, res) => {
  try {
    const { model, number } = req.body;

    if (!model && !number) {
      return res.status(400).json({
        status: 'error',
        message: 'Необходимо указать model или number.'
      });
    }

    const insertData = {};
    if (model !== undefined) insertData.model = model;
    if (number !== undefined) insertData.number = number;

    const [asset] = await db('Asset')
      .insert(insertData)
      .returning('*');

    res.status(201).json({
      status: 'success',
      data: asset
    });
  } catch (error) {
    console.error('Error creating asset:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при создании оборудования.'
    });
  }
};

const updateAsset = async (req, res) => {
  try {
    const { id } = req.params;
    const { model, number } = req.body;

    const asset = await db('Asset')
      .where('asset_id', id)
      .first();

    if (!asset) {
      return res.status(404).json({
        status: 'error',
        message: 'Оборудование не найдено.'
      });
    }

    const updateData = {};
    if (model !== undefined) updateData.model = model;
    if (number !== undefined) updateData.number = number;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Нет данных для обновления.'
      });
    }

    const [updatedAsset] = await db('Asset')
      .where('asset_id', id)
      .update(updateData)
      .returning('*');

    res.status(200).json({
      status: 'success',
      data: updatedAsset
    });
  } catch (error) {
    console.error('Error updating asset:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при обновлении оборудования.'
    });
  }
};

const deleteAsset = async (req, res) => {
  try {
    const asset = await db('Asset')
      .where('asset_id', req.params.id)
      .first();

    if (!asset) {
      return res.status(404).json({
        status: 'error',
        message: 'Оборудование не найдено.'
      });
    }

    const workOrder = await db('WorkOrder')
      .where('asset_id', req.params.id)
      .first();

    if (workOrder) {
      return res.status(400).json({
        status: 'error',
        message: 'Невозможно удалить оборудование, которое используется в заявках.'
      });
    }

    await db('Asset')
      .where('asset_id', req.params.id)
      .del();

    res.status(200).json({
      status: 'success',
      message: 'Оборудование успешно удалено.'
    });
  } catch (error) {
    console.error('Error deleting asset:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при удалении оборудования.'
    });
  }
};

module.exports = {
  getAllAssets,
  getAssetById,
  createAsset,
  updateAsset,
  deleteAsset
};