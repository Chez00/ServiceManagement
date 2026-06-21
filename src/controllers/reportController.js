const db = require('../config/database');

const getWorkOrdersReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let query = db('WorkOrder');

    if (startDate) {
      query = query.where('created_date', '>=', startDate);
    }
    if (endDate) {
      query = query.where('created_date', '<=', endDate + ' 23:59:59');
    }

    // Общая статистика
    const summary = await query.clone()
      .select(
        db.raw('COUNT(*) as total'),
        db.raw("COUNT(CASE WHEN status = 'Новая' THEN 1 END) as new_count"),
        db.raw("COUNT(CASE WHEN status = 'В работе' THEN 1 END) as in_progress_count"),
        db.raw("COUNT(CASE WHEN status = 'Выполнена' THEN 1 END) as completed_count"),
        db.raw("COUNT(CASE WHEN status = 'Закрыта' THEN 1 END) as closed_count"),
        db.raw("COUNT(CASE WHEN status = 'Отменена' THEN 1 END) as cancelled_count")
      )
      .first();

    // По категориям
    const byCategory = await query.clone()
      .select('Category.name as category_name')
      .count('WorkOrder.work_order_id as count')
      .leftJoin('Category', 'WorkOrder.category_id', 'Category.category_id')
      .groupBy('Category.category_id', 'Category.name');

    // По приоритетам
    const byPriority = await query.clone()
      .select('priority')
      .count('work_order_id as count')
      .groupBy('priority');

    res.status(200).json({
      status: 'success',
      data: {
        summary,
        byCategory,
        byPriority
      }
    });
  } catch (error) {
    console.error('Work orders report error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при формировании отчета по заявкам: ' + error.message
    });
  }
};

const getPerformanceReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Базовый запрос
    let query = db('Performer')
      .select(
        'Performer.performer_id',
        db.raw("CONCAT(COALESCE(Foreman_User.last_name, ''), ' ', COALESCE(Foreman_User.first_name, '')) as performer_name")
      )
      .select(
        db.raw('COUNT(WorkOrder.work_order_id) as total_orders'),
        db.raw("COUNT(CASE WHEN WorkOrder.status = 'Выполнена' THEN 1 END) as completed_orders")
      )
      .leftJoin('WorkOrder', 'Performer.performer_id', 'WorkOrder.performer_id')
      .leftJoin('Foreman', 'Performer.foreman_id', 'Foreman.foreman_id')
      .leftJoin('User as Foreman_User', 'Foreman.user_id', 'Foreman_User.user_id');

    // Добавляем фильтры по датам через where
    if (startDate) {
      query = query.where('WorkOrder.created_date', '>=', startDate)
                   .orWhereNull('WorkOrder.created_date');
    }
    if (endDate) {
      query = query.where(function() {
        this.where('WorkOrder.created_date', '<=', endDate + ' 23:59:59')
            .orWhereNull('WorkOrder.created_date');
      });
    }

    query = query.groupBy('Performer.performer_id', 'Foreman_User.last_name', 'Foreman_User.first_name');

    const performers = await query;

    res.status(200).json({
      status: 'success',
      data: {
        performers: performers.map(p => ({
          ...p,
          performer_name: p.performer_name || 'Не назначен'
        }))
      }
    });
  } catch (error) {
    console.error('Performance report error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при формировании отчета по производительности: ' + error.message
    });
  }
};

const getAssetReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let query = db('Asset')
      .select(
        'Asset.model',
        'Asset.number'
      )
      .select(
        db.raw('COUNT(WorkOrder.work_order_id) as total_orders'),
        db.raw('MAX(WorkOrder.created_date) as last_order_date')
      )
      .leftJoin('WorkOrder', 'Asset.asset_id', 'WorkOrder.asset_id');

    // Фильтры по датам
    if (startDate) {
      query = query.where(function() {
        this.where('WorkOrder.created_date', '>=', startDate)
            .orWhereNull('WorkOrder.created_date');
      });
    }
    if (endDate) {
      query = query.where(function() {
        this.where('WorkOrder.created_date', '<=', endDate + ' 23:59:59')
            .orWhereNull('WorkOrder.created_date');
      });
    }

    query = query.groupBy('Asset.asset_id', 'Asset.model', 'Asset.number')
                 .orderBy('total_orders', 'desc')
                 .limit(20);

    const assets = await query;

    res.status(200).json({
      status: 'success',
      data: { assets }
    });
  } catch (error) {
    console.error('Asset report error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при формировании отчета по оборудованию: ' + error.message
    });
  }
};

const getCategoryReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let query = db('Category')
      .select('Category.name')
      .select(
        db.raw('COUNT(WorkOrder.work_order_id) as total_orders'),
        db.raw("COUNT(CASE WHEN WorkOrder.status = 'Выполнена' THEN 1 END) as completed"),
        db.raw("COUNT(CASE WHEN WorkOrder.status = 'Отменена' THEN 1 END) as cancelled")
      )
      .leftJoin('WorkOrder', 'Category.category_id', 'WorkOrder.category_id');

    // Фильтры по датам
    if (startDate) {
      query = query.where(function() {
        this.where('WorkOrder.created_date', '>=', startDate)
            .orWhereNull('WorkOrder.created_date');
      });
    }
    if (endDate) {
      query = query.where(function() {
        this.where('WorkOrder.created_date', '<=', endDate + ' 23:59:59')
            .orWhereNull('WorkOrder.created_date');
      });
    }

    query = query.groupBy('Category.category_id', 'Category.name')
                 .orderBy('total_orders', 'desc');

    const categories = await query;

    res.status(200).json({
      status: 'success',
      data: { categories }
    });
  } catch (error) {
    console.error('Category report error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при формировании отчета по категориям: ' + error.message
    });
  }
};

module.exports = {
  getWorkOrdersReport,
  getPerformanceReport,
  getAssetReport,
  getCategoryReport
};