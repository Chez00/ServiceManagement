const db = require('../config/database');

const getAllWorkOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      priority,
      categoryId,
      search
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const userId = req.user.id;
    const userPosition = req.user.position;
    const userRoles = req.userRoles || [];

    const isAdmin = userPosition === 'Администратор' || userRoles.includes('admin');

    let baseQuery = db('WorkOrder')
      .select(
        'WorkOrder.work_order_id',
        'WorkOrder.name',
        'WorkOrder.status',
        'WorkOrder.priority',
        'WorkOrder.deadline',
        'WorkOrder.description',
        'WorkOrder.created_date',
        'WorkOrder.comment',
        'WorkOrder.performer_id',
        'WorkOrder.customer_id',
        'WorkOrder.asset_id',
        'WorkOrder.category_id',
        'Asset.model as asset_model',
        'Asset.number as asset_number',
        'Category.name as category_name',
        'Customer_User.last_name as customer_last_name',
        'Customer_User.first_name as customer_first_name',
        'Customer_User.middle_name as customer_middle_name',
        'Foreman_User.last_name as foreman_last_name',
        'Foreman_User.first_name as foreman_first_name',
        'Foreman_User.middle_name as foreman_middle_name',
        'Foreman.foreman_id',
        'Crew.crew_id'
      )
      .leftJoin('Asset', 'WorkOrder.asset_id', 'Asset.asset_id')
      .leftJoin('Category', 'WorkOrder.category_id', 'Category.category_id')
      .leftJoin('Customer', 'WorkOrder.customer_id', 'Customer.customer_id')
      .leftJoin('User as Customer_User', 'Customer.user_id', 'Customer_User.user_id')
      .leftJoin('Performer', 'WorkOrder.performer_id', 'Performer.performer_id')
      .leftJoin('Foreman', 'Performer.foreman_id', 'Foreman.foreman_id')
      .leftJoin('User as Foreman_User', 'Foreman.user_id', 'Foreman_User.user_id')
      .leftJoin('Crew', 'Performer.crew_id', 'Crew.crew_id');

    // Фильтрация по ролям пользователя
    if (!isAdmin) {
      const [customer, foreman, installer] = await Promise.all([
        db('Customer').where('user_id', userId).first(),
        db('Foreman').where('user_id', userId).first(),
        db('Installer').where('user_id', userId).first()
      ]);

      baseQuery = baseQuery.where(function () {
        if (customer) {
          this.orWhere('WorkOrder.customer_id', customer.customer_id);
        }
        if (foreman) {
          this.orWhere('Performer.foreman_id', foreman.foreman_id);
        }
        if (installer) {
          this.orWhereIn('Performer.crew_id', function () {
            this.select('crew_id')
              .from('Crew_Installer')
              .where('installer_id', installer.installer_id);
          });
        }
        // Наблюдатель видит заявки, где он назначен
        this.orWhereIn('WorkOrder.work_order_id', function () {
          this.select('work_order_id')
            .from('Observer')
            .where('user_id', userId);
        });
      });
    }

    // Применяем фильтры
    if (status) {
      baseQuery = baseQuery.where('WorkOrder.status', status);
    }
    if (priority) {
      baseQuery = baseQuery.where('WorkOrder.priority', priority);
    }
    if (categoryId) {
      baseQuery = baseQuery.where('WorkOrder.category_id', parseInt(categoryId));
    }
    if (search) {
      baseQuery = baseQuery.where(function () {
        this.where('WorkOrder.name', 'ilike', `%${search}%`)
          .orWhere('WorkOrder.description', 'ilike', `%${search}%`)
          .orWhere('Asset.number', 'ilike', `%${search}%`)
          .orWhere('Asset.model', 'ilike', `%${search}%`)
          .orWhere('Customer_User.last_name', 'ilike', `%${search}%`)
          .orWhere('Foreman_User.last_name', 'ilike', `%${search}%`);
      });
    }

    // Подсчёт общего количества (используем подзапрос для корректного COUNT с JOIN)
    const countQuery = db('WorkOrder')
      .count('* as total')
      .whereIn('WorkOrder.work_order_id', baseQuery.clone().clearSelect().select('WorkOrder.work_order_id'));

    // Получаем total и данные параллельно
    const [countResult, workOrders] = await Promise.all([
      countQuery.first(),
      baseQuery
        .orderBy('WorkOrder.created_date', 'desc')
        .limit(parseInt(limit))
        .offset(offset)
    ]);

    const total = countResult ? parseInt(countResult.total) : 0;

    // Загрузка наблюдателей для всех заявок
    const orderIds = workOrders.map(o => o.work_order_id);
    let observersMap = {};

    if (orderIds.length > 0) {
      const observers = await db('Observer')
        .select(
          'Observer.observer_id',
          'Observer.work_order_id',
          'User.user_id',
          'User.last_name',
          'User.first_name',
          'User.middle_name',
          'User.position',
          'User.email',
          'User.phone'
        )
        .join('User', 'Observer.user_id', 'User.user_id')
        .whereIn('Observer.work_order_id', orderIds);

      observers.forEach(obs => {
        if (!observersMap[obs.work_order_id]) {
          observersMap[obs.work_order_id] = [];
        }
        observersMap[obs.work_order_id].push({
          observer_id: obs.observer_id,
          user_id: obs.user_id,
          last_name: obs.last_name,
          first_name: obs.first_name,
          middle_name: obs.middle_name,
          position: obs.position,
          email: obs.email,
          phone: obs.phone
        });
      });
    }

    // Форматирование данных
    const formattedOrders = workOrders.map(order => {
      const foremanName = order.foreman_last_name
        ? [order.foreman_last_name, order.foreman_first_name, order.foreman_middle_name]
            .filter(Boolean)
            .join(' ')
        : null;

      return {
        work_order_id: order.work_order_id,
        name: order.name,
        status: order.status,
        priority: order.priority,
        deadline: order.deadline
          ? new Date(order.deadline).toISOString().split('T')[0]
          : null,
        description: order.description,
        created_date: order.created_date,
        comment: order.comment,
        asset_id: order.asset_id,
        asset_model: order.asset_model,
        asset_number: order.asset_number,
        category_id: order.category_id,
        category_name: order.category_name,
        customer_id: order.customer_id,
        customer: {
          last_name: order.customer_last_name,
          first_name: order.customer_first_name,
          middle_name: order.customer_middle_name
        },
        performer_id: order.performer_id,
        foreman_id: order.foreman_id,
        foreman: order.foreman_last_name
          ? {
              last_name: order.foreman_last_name,
              first_name: order.foreman_first_name,
              middle_name: order.foreman_middle_name
            }
          : null,
        crew_id: order.crew_id,
        performer_name: foremanName || 'Не назначен',
        observers: observersMap[order.work_order_id] || []
      };
    });

    res.status(200).json({
      status: 'success',
      data: {
        workOrders: formattedOrders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get all work orders error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении списка заявок.'
    });
  }
};

const getWorkOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const workOrder = await db('WorkOrder')
      .select(
        'WorkOrder.*',
        'Asset.model as asset_model',
        'Asset.number as asset_number',
        'Category.name as category_name',
        'Customer_User.last_name as customer_last_name',
        'Customer_User.first_name as customer_first_name',
        'Customer_User.middle_name as customer_middle_name',
        'Customer_User.email as customer_email',
        'Customer_User.phone as customer_phone',
        'Foreman_User.last_name as foreman_last_name',
        'Foreman_User.first_name as foreman_first_name',
        'Foreman_User.middle_name as foreman_middle_name',
        'Foreman.foreman_id',
        'Performer.crew_id',
        'Performer.performer_id'
      )
      .leftJoin('Asset', 'WorkOrder.asset_id', 'Asset.asset_id')
      .leftJoin('Category', 'WorkOrder.category_id', 'Category.category_id')
      .leftJoin('Customer', 'WorkOrder.customer_id', 'Customer.customer_id')
      .leftJoin('User as Customer_User', 'Customer.user_id', 'Customer_User.user_id')
      .leftJoin('Performer', 'WorkOrder.performer_id', 'Performer.performer_id')
      .leftJoin('Foreman', 'Performer.foreman_id', 'Foreman.foreman_id')
      .leftJoin('User as Foreman_User', 'Foreman.user_id', 'Foreman_User.user_id')
      .where('WorkOrder.work_order_id', id)
      .first();

    if (!workOrder) {
      return res.status(404).json({
        status: 'error',
        message: 'Заявка не найдена.'
      });
    }

    // Загружаем наблюдателей с полной информацией
    const observers = await db('Observer')
      .select(
        'Observer.observer_id',
        'User.user_id',
        'User.last_name',
        'User.first_name',
        'User.middle_name',
        'User.email',
        'User.phone',
        'User.position'
      )
      .join('User', 'Observer.user_id', 'User.user_id')
      .where('Observer.work_order_id', id);

    // Загружаем монтажников бригады, если есть crew_id
    let crewInstallers = [];
    if (workOrder.crew_id) {
      crewInstallers = await db('Crew_Installer')
        .select(
          'Installer.installer_id',
          'Installer_User.user_id',
          'Installer_User.last_name',
          'Installer_User.first_name',
          'Installer_User.middle_name'
        )
        .join('Installer', 'Crew_Installer.installer_id', 'Installer.installer_id')
        .join('User as Installer_User', 'Installer.user_id', 'Installer_User.user_id')
        .where('Crew_Installer.crew_id', workOrder.crew_id);
    }

    const foremanName = workOrder.foreman_last_name
      ? [workOrder.foreman_last_name, workOrder.foreman_first_name, workOrder.foreman_middle_name]
          .filter(Boolean)
          .join(' ')
      : null;

    const result = {
      ...workOrder,
      deadline: workOrder.deadline
        ? new Date(workOrder.deadline).toISOString().split('T')[0]
        : null,
      performer_name: foremanName || 'Не назначен',
      customer: {
        last_name: workOrder.customer_last_name,
        first_name: workOrder.customer_first_name,
        middle_name: workOrder.customer_middle_name,
        email: workOrder.customer_email,
        phone: workOrder.customer_phone
      },
      foreman: workOrder.foreman_last_name
        ? {
            foreman_id: workOrder.foreman_id,
            last_name: workOrder.foreman_last_name,
            first_name: workOrder.foreman_first_name,
            middle_name: workOrder.foreman_middle_name
          }
        : null,
      crew_installers: crewInstallers.map(i => ({
        installer_id: i.installer_id,
        user_id: i.user_id,
        full_name: [i.last_name, i.first_name, i.middle_name].filter(Boolean).join(' ')
      })),
      observers
    };

    // Удаляем лишние поля из ответа
    delete result.customer_last_name;
    delete result.customer_first_name;
    delete result.customer_middle_name;
    delete result.customer_email;
    delete result.customer_phone;
    delete result.foreman_last_name;
    delete result.foreman_first_name;
    delete result.foreman_middle_name;

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Get work order by id error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении заявки.'
    });
  }
};

const createWorkOrder = async (req, res) => {
  const trx = await db.transaction();

  try {
    const {
      assetId,
      categoryId,
      name,
      description,
      priority,
      deadline,
      foremanId,
      crewId,
      observerIds
    } = req.body;

    // Валидация
    if (!assetId || !categoryId || !name || !name.trim()) {
      await trx.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'Не все обязательные поля заполнены.'
      });
    }

    // Получаем или создаем заказчика
    let customer = await trx('Customer')
      .where('user_id', req.user.id)
      .first();

    if (!customer) {
      const [customerId] = await trx('Customer')
        .insert({ user_id: req.user.id })
        .returning('customer_id');
      customer = { customer_id: customerId };
    }

    // Создаем исполнителя, если указан бригадир
    let performerId = null;
    if (foremanId) {
      const foreman = await trx('Foreman')
        .where('foreman_id', parseInt(foremanId))
        .first();

      if (!foreman) {
        await trx.rollback();
        return res.status(400).json({
          status: 'error',
          message: 'Указанный бригадир не найден.'
        });
      }

      const [newPerformerId] = await trx('Performer')
        .insert({
          foreman_id: parseInt(foremanId),
          crew_id: crewId ? parseInt(crewId) : null
        })
        .returning('performer_id');

      performerId = newPerformerId;
    }

    // Создаем заявку
    const [workOrderId] = await trx('WorkOrder')
      .insert({
        asset_id: parseInt(assetId),
        customer_id: customer.customer_id,
        performer_id: performerId,
        category_id: parseInt(categoryId),
        name: name.trim(),
        description: description ? description.trim() : null,
        priority: priority || 'Средний',
        deadline: deadline || null,
        status: 'Новая',
        created_date: trx.fn.now()
      })
      .returning('work_order_id');

    // Добавляем наблюдателей
    if (observerIds && Array.isArray(observerIds) && observerIds.length > 0) {
      const validObserverIds = observerIds
        .filter(Boolean)
        .map(id => parseInt(id));

      if (validObserverIds.length > 0) {
        // Проверяем существование пользователей
        const users = await trx('User')
          .whereIn('user_id', validObserverIds)
          .select('user_id');

        const existingUserIds = users.map(u => u.user_id);
        const observersToAdd = existingUserIds.map(userId => ({
          work_order_id: workOrderId,
          user_id: userId
        }));

        if (observersToAdd.length > 0) {
          await trx('Observer').insert(observersToAdd);
        }
      }
    }

    await trx.commit();

    // Получаем созданную заявку
    const createdWorkOrder = await db('WorkOrder')
      .select(
        'WorkOrder.*',
        'Asset.model as asset_model',
        'Asset.number as asset_number',
        'Category.name as category_name',
        'Foreman_User.last_name as foreman_last_name',
        'Foreman_User.first_name as foreman_first_name'
      )
      .leftJoin('Asset', 'WorkOrder.asset_id', 'Asset.asset_id')
      .leftJoin('Category', 'WorkOrder.category_id', 'Category.category_id')
      .leftJoin('Performer', 'WorkOrder.performer_id', 'Performer.performer_id')
      .leftJoin('Foreman', 'Performer.foreman_id', 'Foreman.foreman_id')
      .leftJoin('User as Foreman_User', 'Foreman.user_id', 'Foreman_User.user_id')
      .where('WorkOrder.work_order_id', workOrderId)
      .first();

    const observers = await db('Observer')
      .select(
        'User.user_id',
        'User.last_name',
        'User.first_name',
        'User.middle_name'
      )
      .join('User', 'Observer.user_id', 'User.user_id')
      .where('Observer.work_order_id', workOrderId);

    res.status(201).json({
      status: 'success',
      data: {
        ...createdWorkOrder,
        deadline: createdWorkOrder.deadline
          ? new Date(createdWorkOrder.deadline).toISOString().split('T')[0]
          : null,
        observers
      },
      message: 'Заявка успешно создана'
    });
  } catch (error) {
    await trx.rollback();
    console.error('Create work order error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при создании заявки.'
    });
  }
};

const updateWorkOrder = async (req, res) => {
  const trx = await db.transaction();

  try {
    const { id } = req.params;

    // Проверяем существование заявки
    const workOrder = await trx('WorkOrder')
      .where('work_order_id', id)
      .first();

    if (!workOrder) {
      await trx.rollback();
      return res.status(404).json({
        status: 'error',
        message: 'Заявка не найдена.'
      });
    }

    const updates = {};

    // Обновление полей
    if (req.body.name !== undefined) {
      updates.name = req.body.name ? req.body.name.trim() : null;
    }
    if (req.body.description !== undefined) {
      updates.description = req.body.description ? req.body.description.trim() : null;
    }
    if (req.body.comment !== undefined) {
      updates.comment = req.body.comment ? req.body.comment.trim() : null;
    }
    if (req.body.status !== undefined) {
      updates.status = req.body.status;
    }
    if (req.body.priority !== undefined) {
      updates.priority = req.body.priority;
    }
    if (req.body.deadline !== undefined) {
      updates.deadline = req.body.deadline || null;
    }
    if (req.body.assetId !== undefined) {
      updates.asset_id = req.body.assetId ? parseInt(req.body.assetId) : null;
    }
    if (req.body.categoryId !== undefined) {
      updates.category_id = req.body.categoryId ? parseInt(req.body.categoryId) : null;
    }

    // Обработка исполнителя
    if (req.body.foremanId !== undefined) {
      const foremanId = req.body.foremanId ? parseInt(req.body.foremanId) : null;
      const crewId = req.body.crewId ? parseInt(req.body.crewId) : null;

      if (foremanId) {
        const foreman = await trx('Foreman')
          .where('foreman_id', foremanId)
          .first();

        if (!foreman) {
          await trx.rollback();
          return res.status(400).json({
            status: 'error',
            message: 'Указанный бригадир не найден.'
          });
        }

        // Удаляем старого исполнителя, если был
        if (workOrder.performer_id) {
          await trx('Performer')
            .where('performer_id', workOrder.performer_id)
            .del();
        }

        // Создаем нового исполнителя
        const [newPerformerId] = await trx('Performer')
          .insert({
            foreman_id: foremanId,
            crew_id: crewId
          })
          .returning('performer_id');

        updates.performer_id = newPerformerId;
      } else {
        // Удаляем исполнителя
        if (workOrder.performer_id) {
          await trx('Performer')
            .where('performer_id', workOrder.performer_id)
            .del();
        }
        updates.performer_id = null;
      }
    }

    // Обновляем основные данные заявки
    if (Object.keys(updates).length > 0) {
      await trx('WorkOrder')
        .where('work_order_id', id)
        .update(updates);
    }

    // Обработка наблюдателей
    if (req.body.observerIds !== undefined) {
      // Удаляем старых наблюдателей
      await trx('Observer').where('work_order_id', id).del();

      // Добавляем новых
      if (req.body.observerIds && Array.isArray(req.body.observerIds) && req.body.observerIds.length > 0) {
        const validIds = req.body.observerIds
          .filter(Boolean)
          .map(oid => parseInt(oid));

        if (validIds.length > 0) {
          const users = await trx('User')
            .whereIn('user_id', validIds)
            .select('user_id');

          const observersToAdd = users.map(u => ({
            work_order_id: parseInt(id),
            user_id: u.user_id
          }));

          if (observersToAdd.length > 0) {
            await trx('Observer').insert(observersToAdd);
          }
        }
      }
    }

    await trx.commit();

    // Получаем обновленную заявку
    const updatedWorkOrder = await db('WorkOrder')
      .select(
        'WorkOrder.*',
        'Asset.model as asset_model',
        'Asset.number as asset_number',
        'Category.name as category_name',
        'Foreman_User.last_name as foreman_last_name',
        'Foreman_User.first_name as foreman_first_name',
        'Customer_User.last_name as customer_last_name',
        'Customer_User.first_name as customer_first_name'
      )
      .leftJoin('Asset', 'WorkOrder.asset_id', 'Asset.asset_id')
      .leftJoin('Category', 'WorkOrder.category_id', 'Category.category_id')
      .leftJoin('Customer', 'WorkOrder.customer_id', 'Customer.customer_id')
      .leftJoin('User as Customer_User', 'Customer.user_id', 'Customer_User.user_id')
      .leftJoin('Performer', 'WorkOrder.performer_id', 'Performer.performer_id')
      .leftJoin('Foreman', 'Performer.foreman_id', 'Foreman.foreman_id')
      .leftJoin('User as Foreman_User', 'Foreman.user_id', 'Foreman_User.user_id')
      .where('WorkOrder.work_order_id', id)
      .first();

    const observers = await db('Observer')
      .select(
        'Observer.observer_id',
        'User.user_id',
        'User.last_name',
        'User.first_name',
        'User.middle_name',
        'User.email',
        'User.position'
      )
      .join('User', 'Observer.user_id', 'User.user_id')
      .where('Observer.work_order_id', id);

    const result = {
      ...updatedWorkOrder,
      deadline: updatedWorkOrder.deadline
        ? new Date(updatedWorkOrder.deadline).toISOString().split('T')[0]
        : null,
      performer_name: updatedWorkOrder.foreman_last_name
        ? [updatedWorkOrder.foreman_last_name, updatedWorkOrder.foreman_first_name]
            .filter(Boolean)
            .join(' ')
        : 'Не назначен',
      observers
    };

    res.status(200).json({
      status: 'success',
      data: result,
      message: 'Заявка успешно обновлена'
    });
  } catch (error) {
    await trx.rollback();
    console.error('Update work order error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при обновлении заявки.'
    });
  }
};

const deleteWorkOrder = async (req, res) => {
  const trx = await db.transaction();

  try {
    const { id } = req.params;

    const workOrder = await trx('WorkOrder')
      .where('work_order_id', id)
      .first();

    if (!workOrder) {
      await trx.rollback();
      return res.status(404).json({
        status: 'error',
        message: 'Заявка не найдена.'
      });
    }

    // Удаляем наблюдателей
    await trx('Observer').where('work_order_id', id).del();

    // Удаляем исполнителя
    if (workOrder.performer_id) {
      await trx('Performer').where('performer_id', workOrder.performer_id).del();
    }

    // Удаляем заявку
    await trx('WorkOrder').where('work_order_id', id).del();

    await trx.commit();

    res.status(200).json({
      status: 'success',
      message: 'Заявка успешно удалена.'
    });
  } catch (error) {
    await trx.rollback();
    console.error('Delete work order error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при удалении заявки.'
    });
  }
};

module.exports = {
  getAllWorkOrders,
  getWorkOrderById,
  createWorkOrder,
  updateWorkOrder,
  deleteWorkOrder
};