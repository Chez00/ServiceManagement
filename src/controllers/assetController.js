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

    // Get related work orders
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
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении данных оборудования.'
    });
  }
};

const createAsset = async (req, res) => {
  try {
    const { model, number } = req.body;

    const [assetId] = await db('Asset').insert({
      model,
      number
    });

    const asset = await db('Asset')
      .where('asset_id', assetId)
      .first();

    res.status(201).json({
      status: 'success',
      data: asset
    });
  } catch (error) {
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

    await db('Asset')
      .where('asset_id', id)
      .update({ model, number });

    const asset = await db('Asset')
      .where('asset_id', id)
      .first();

    res.status(200).json({
      status: 'success',
      data: asset
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при обновлении оборудования.'
    });
  }
};

const deleteAsset = async (req, res) => {
  try {
    // Check if asset has work orders
    const workOrders = await db('WorkOrder')
      .where('asset_id', req.params.id)
      .first();

    if (workOrders) {
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