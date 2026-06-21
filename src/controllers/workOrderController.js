const db = require('../config/database');

const saveWorkOrder = async(req, res) => {
  this.errors = {}
  
  if (!this.form.name || !this.form.name.trim()) {
    this.errors.name = 'Введите название заявки'
  }
  if (!this.form.categoryId) {
    this.errors.categoryId = 'Выберите категорию'
  }
  if (!this.form.assetId) {
    this.errors.assetId = 'Выберите оборудование'
  }
  
  if (Object.keys(this.errors).length > 0) return
  
  this.saving = true
  try {
    const data = {
      name: this.form.name ? this.form.name.trim() : '',
      categoryId: this.form.categoryId ? parseInt(this.form.categoryId) : null,
      assetId: this.form.assetId ? parseInt(this.form.assetId) : null,
      foremanId: this.form.foremanId ? parseInt(this.form.foremanId) : null,
      priority: this.form.priority || 'Средний',
      status: this.form.status || 'Новая',
      deadline: this.form.deadline || null,
      description: this.form.description ? this.form.description.trim() : null,
      comment: this.form.comment ? this.form.comment.trim() : null
    }
    
    let response
    if (this.isEditing) {
      // При редактировании отправляем только измененные поля
      const updateData = {}
      if (data.name !== undefined) updateData.name = data.name
      if (data.categoryId !== undefined) updateData.categoryId = data.categoryId
      if (data.assetId !== undefined) updateData.assetId = data.assetId
      if (data.foremanId !== undefined) updateData.foremanId = data.foremanId
      if (data.priority !== undefined) updateData.priority = data.priority
      if (data.status !== undefined) updateData.status = data.status
      if (data.deadline !== undefined) updateData.deadline = data.deadline
      if (data.description !== undefined) updateData.description = data.description
      if (data.comment !== undefined) updateData.comment = data.comment
      
      response = await api.updateWorkOrder(this.editingId, updateData)
    } else {
      response = await api.createWorkOrder(data)
    }
    
    if (response.status === 'success') {
      window.showToast(
        this.isEditing ? 'Заявка обновлена' : 'Заявка создана',
        'success'
      )
      this.hideModal()
      await this.loadWorkOrders()
    }
  } catch (error) {
    window.showToast('Ошибка сохранения: ' + error.message, 'danger')
  } finally {
    this.saving = false
  }
};

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

    console.log('📊 Запрос списка заявок:', { page, limit, status, priority, categoryId, search });

    const offset = (page - 1) * limit;
    
    // Получаем ID пользователя и его должность
    const userId = req.user.id;
    const userPosition = req.user.position;

    console.log('👤 Пользователь:', { userId, userPosition });

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

    // ==========================================
    // ФИЛЬТРАЦИЯ ПО РОЛЯМ ПОЛЬЗОВАТЕЛЯ
    // ==========================================
    
    const isAdmin = userPosition === 'Администратор';
    
    if (!isAdmin) {
      let customerId = null;
      let foremanId = null;
      let installerId = null;
      
      const customer = await db('Customer').where('user_id', userId).first();
      if (customer) customerId = customer.customer_id;
      
      const foreman = await db('Foreman').where('user_id', userId).first();
      if (foreman) foremanId = foreman.foreman_id;
      
      const installer = await db('Installer').where('user_id', userId).first();
      if (installer) installerId = installer.installer_id;
      
      baseQuery = baseQuery.where(function() {
        if (customerId) {
          this.orWhere('WorkOrder.customer_id', customerId);
        }
        
        if (foremanId) {
          this.orWhere('Performer.foreman_id', foremanId);
        }
        
        if (installerId) {
          this.orWhereIn('Performer.crew_id', function() {
            this.select('crew_id')
              .from('Crew_Installer')
              .where('installer_id', installerId);
          });
        }
        
        this.orWhereIn('WorkOrder.work_order_id', function() {
          this.select('work_order_id')
            .from('Observer')
            .where('user_id', userId);
        });
      });
    }

    // Применяем дополнительные фильтры
    if (status) {
      baseQuery = baseQuery.where('WorkOrder.status', status);
    }
    if (priority) {
      baseQuery = baseQuery.where('WorkOrder.priority', priority);
    }
    if (categoryId) {
      baseQuery = baseQuery.where('WorkOrder.category_id', categoryId);
    }
    if (search) {
      baseQuery = baseQuery.where(function() {
        this.where('WorkOrder.name', 'like', `%${search}%`)
          .orWhere('WorkOrder.description', 'like', `%${search}%`)
          .orWhere('Asset.number', 'like', `%${search}%`)
          .orWhere('Asset.model', 'like', `%${search}%`)
          .orWhere('Customer_User.last_name', 'like', `%${search}%`)
          .orWhere('Customer_User.first_name', 'like', `%${search}%`)
          .orWhere('Foreman_User.last_name', 'like', `%${search}%`)
          .orWhere('Foreman_User.first_name', 'like', `%${search}%`);
      });
    }

    // ==========================================
    // ИСПРАВЛЕННЫЙ ПОДСЧЕТ ОБЩЕГО КОЛИЧЕСТВА
    // ==========================================
    
    // Клонируем запрос и считаем количество уникальных заявок
    const countQuery = baseQuery.clone()
      .clearSelect()
      .clearOrder()
      .count('* as total')
      .first();
    
    const countResult = await countQuery;
    const total = countResult ? parseInt(countResult.total) : 0;
    
    console.log('📈 Всего найдено заявок:', total);

    // Получаем заявки с пагинацией
    const workOrders = await baseQuery
      .orderBy('WorkOrder.created_date', 'desc')
      .limit(parseInt(limit))
      .offset(offset);

    console.log(`📋 Загружено ${workOrders.length} заявок для страницы ${page}`);

    // ==========================================
    // ЗАГРУЗКА НАБЛЮДАТЕЛЕЙ ДЛЯ ВСЕХ ЗАЯВОК
    // ==========================================
    const orderIds = workOrders.map(o => o.work_order_id);
    let observersMap = {};
    
    if (orderIds.length > 0) {
      console.log('👥 Загрузка наблюдателей для заявок:', orderIds);
      
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
      
      console.log(`👥 Всего загружено наблюдателей: ${observers.length}`);
      
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
      
      // Логируем количество наблюдателей для каждой заявки
      Object.keys(observersMap).forEach(orderId => {
        console.log(`  Заявка #${orderId}: ${observersMap[orderId].length} наблюдателей`);
      });
    }

    // ==========================================
    // ФОРМАТИРОВАНИЕ ДАННЫХ
    // ==========================================
    const formattedOrders = workOrders.map(order => ({
      work_order_id: order.work_order_id,
      name: order.name,
      status: order.status,
      priority: order.priority,
      deadline: order.deadline ? 
        new Date(order.deadline.getTime() - order.deadline.getTimezoneOffset() * 60000)
          .toISOString()
          .split('T')[0] : 
        null,
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
      foreman: order.foreman_last_name ? {
        last_name: order.foreman_last_name,
        first_name: order.foreman_first_name,
        middle_name: order.foreman_middle_name
      } : null,
      crew_id: order.crew_id,
      performer_name: order.foreman_last_name 
        ? `${order.foreman_last_name} ${order.foreman_first_name}${order.foreman_middle_name ? ' ' + order.foreman_middle_name : ''}`
        : 'Не назначен',
      observers: observersMap[order.work_order_id] || []
    }));

    console.log(`✅ Отправка ответа: ${formattedOrders.length} заявок`);

    res.status(200).json({
      status: 'success',
      data: {
        workOrders: formattedOrders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('❌ Ошибка получения списка заявок:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении списка заявок: ' + error.message
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
        'Customer_User.email as customer_email',
        'Customer_User.phone as customer_phone',
        'Foreman_User.last_name as foreman_last_name',
        'Foreman_User.first_name as foreman_first_name',
        'Foreman.foreman_id',
        'Performer.crew_id'
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

    const observers = await db('Observer')
      .select(
        'User.user_id',
        'User.last_name',
        'User.first_name',
        'User.email'
      )
      .join('User', 'Observer.user_id', 'User.user_id')
      .where('Observer.work_order_id', id);

    // Форматируем дату для корректного отображения
    let formattedDeadline = null
    if (workOrder.deadline) {
      const date = new Date(workOrder.deadline)
      // Компенсируем часовой пояс
      formattedDeadline = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .split('T')[0]
    }

    const result = {
      ...workOrder,
      deadline: formattedDeadline,  // Отдаем скорректированную дату
      performer_name: workOrder.foreman_last_name 
        ? `${workOrder.foreman_last_name} ${workOrder.foreman_first_name}`
        : 'Не назначен',
      observers
    };

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Get work order by id error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении заявки: ' + error.message
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
      observerIds  // Массив ID пользователей-наблюдателей
    } = req.body;

    console.log('📝 Создание заявки с данными:', {
      assetId, categoryId, name, foremanId,
      observerIds: observerIds || 'не указаны'
    });

    if (!assetId || !categoryId || !name) {
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
      const [customerId] = await trx('Customer').insert({
        user_id: req.user.id
      });
      customer = { customer_id: customerId };
    }

    // Создаем исполнителя только если указан бригадир
    let performerId = null;
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

      const [newPerformerId] = await trx('Performer').insert({
        foreman_id: foremanId,
        crew_id: null
      });
      performerId = newPerformerId;
    }

    // Создаем заявку
    const [workOrderId] = await trx('WorkOrder').insert({
      asset_id: parseInt(assetId),
      customer_id: customer.customer_id,
      performer_id: performerId,
      category_id: parseInt(categoryId),
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      priority: priority || 'Средний',
      deadline: deadline || null,
      status: 'Новая',
      created_date: new Date()
    });

    console.log('✅ Заявка создана, ID:', workOrderId);

    // ==========================================
    // ДОБАВЛЕНИЕ НАБЛЮДАТЕЛЕЙ
    // ==========================================
    if (observerIds && Array.isArray(observerIds) && observerIds.length > 0) {
      console.log('👥 Добавление наблюдателей:', observerIds);
      
      // Фильтруем и подготавливаем данные
      const observersToAdd = [];
      
      for (const userId of observerIds) {
        if (!userId) continue;
        
        // Проверяем существование пользователя
        const user = await trx('User')
          .where('user_id', parseInt(userId))
          .first();
        
        if (user) {
          // Проверяем, нет ли уже такого наблюдателя
          const existingObserver = await trx('Observer')
            .where({
              work_order_id: workOrderId,
              user_id: parseInt(userId)
            })
            .first();
          
          if (!existingObserver) {
            observersToAdd.push({
              work_order_id: workOrderId,
              user_id: parseInt(userId)
            });
            console.log(`  ✅ Пользователь ${userId} (${user.last_name} ${user.first_name}) будет добавлен`);
          } else {
            console.log(`  ⚠️ Пользователь ${userId} уже наблюдатель`);
          }
        } else {
          console.log(`  ❌ Пользователь ${userId} не найден`);
        }
      }

      // Добавляем наблюдателей
      if (observersToAdd.length > 0) {
        try {
          await trx('Observer').insert(observersToAdd);
          console.log(`✅ Добавлено ${observersToAdd.length} наблюдателей`);
        } catch (error) {
          console.error('❌ Ошибка при добавлении наблюдателей:', error.message);
          // Проверяем на дубликаты
          if (error.code === 'ER_DUP_ENTRY') {
            console.log('⚠️ Некоторые наблюдатели уже существуют, пробуем добавить по одному');
            
            for (const observer of observersToAdd) {
              try {
                await trx('Observer').insert(observer);
                console.log(`  ✅ Добавлен наблюдатель user_id=${observer.user_id}`);
              } catch (insertError) {
                console.log(`  ⚠️ Наблюдатель user_id=${observer.user_id} уже существует`);
              }
            }
          } else {
            throw error;
          }
        }
      } else {
        console.log('ℹ️ Нет наблюдателей для добавления');
      }
    }

    await trx.commit();
    console.log('✅ Транзакция успешно завершена');

    // Получаем созданную заявку с наблюдателями
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

    // Получаем наблюдателей
    const observers = await db('Observer')
      .select(
        'User.user_id',
        'User.last_name',
        'User.first_name',
        'User.middle_name'
      )
      .join('User', 'Observer.user_id', 'User.user_id')
      .where('Observer.work_order_id', workOrderId);

    console.log(`📊 Итого наблюдателей у заявки #${workOrderId}: ${observers.length}`);

    res.status(201).json({
      status: 'success',
      data: {
        ...createdWorkOrder,
        observers
      },
      message: 'Заявка успешно создана'
    });
  } catch (error) {
    await trx.rollback();
    console.error('❌ Ошибка создания заявки:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при создании заявки: ' + error.message
    });
  }
};

const updateWorkOrder = async (req, res) => {
  const trx = await db.transaction();
  
  try {
    const { id } = req.params;
    
    console.log('📝 Обновление заявки #' + id, req.body);
    
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
    
    // Обновление строковых полей
    if (req.body.name !== undefined && req.body.name !== null) {
      updates.name = String(req.body.name).trim();
    }
    if (req.body.description !== undefined) {
      updates.description = req.body.description ? String(req.body.description).trim() : null;
    }
    if (req.body.comment !== undefined) {
      updates.comment = req.body.comment ? String(req.body.comment).trim() : null;
    }
    
    // Обновление статуса и приоритета
    if (req.body.status !== undefined && req.body.status !== null) {
      updates.status = req.body.status;
    }
    if (req.body.priority !== undefined && req.body.priority !== null) {
      updates.priority = req.body.priority;
    }
    
    // Обновление дат и числовых полей
    if (req.body.deadline !== undefined) {
      updates.deadline = req.body.deadline || null;
    }
    if (req.body.assetId !== undefined && req.body.assetId !== null) {
      updates.asset_id = parseInt(req.body.assetId);
    }
    if (req.body.categoryId !== undefined && req.body.categoryId !== null) {
      updates.category_id = parseInt(req.body.categoryId);
    }
    
    // ==========================================
    // ОБРАБОТКА ИСПОЛНИТЕЛЯ (БРИГАДИРА)
    // ==========================================
    if (req.body.foremanId !== undefined) {
      const foremanId = req.body.foremanId ? parseInt(req.body.foremanId) : null;
      
      if (foremanId) {
        // Проверяем существование бригадира
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

        // Создаем нового исполнителя для этой заявки
        const [newPerformerId] = await trx('Performer').insert({
          foreman_id: foremanId,
          crew_id: null
        });
        updates.performer_id = newPerformerId;
        console.log(`✅ Создан новый исполнитель #${newPerformerId} для бригадира #${foremanId}`);
      } else {
        updates.performer_id = null;
        console.log('ℹ️ Исполнитель удален');
      }
    }

    // ==========================================
    // ОБНОВЛЕНИЕ ОСНОВНЫХ ДАННЫХ ЗАЯВКИ
    // ==========================================
    if (Object.keys(updates).length > 0) {
      await trx('WorkOrder')
        .where('work_order_id', id)
        .update(updates);
      console.log('✅ Основные данные заявки обновлены');
    }

    // ==========================================
    // ОБРАБОТКА НАБЛЮДАТЕЛЕЙ
    // ==========================================
    if (req.body.observerIds !== undefined) {
      console.log('👥 Обновление наблюдателей для заявки #' + id);
      console.log('  Новый список наблюдателей:', req.body.observerIds);
      
      // Удаляем всех текущих наблюдателей для этой заявки
      await trx('Observer')
        .where('work_order_id', id)
        .del();
      console.log('  🗑️ Старые наблюдатели удалены');
      
      // Добавляем новых наблюдателей
      if (req.body.observerIds && Array.isArray(req.body.observerIds) && req.body.observerIds.length > 0) {
        const observersToAdd = [];
        const errors = [];
        
        for (const userId of req.body.observerIds) {
          if (!userId) continue;
          
          const parsedUserId = parseInt(userId);
          
          // Проверяем существование пользователя
          const user = await trx('User')
            .where('user_id', parsedUserId)
            .first();
          
          if (user) {
            observersToAdd.push({
              work_order_id: parseInt(id),
              user_id: parsedUserId
            });
            console.log(`  ✅ Пользователь #${parsedUserId} (${user.last_name} ${user.first_name}) добавлен`);
          } else {
            const errorMsg = `Пользователь с ID ${parsedUserId} не найден`;
            errors.push(errorMsg);
            console.log(`  ❌ ${errorMsg}`);
          }
        }

        // Добавляем валидных наблюдателей
        if (observersToAdd.length > 0) {
          try {
            await trx('Observer').insert(observersToAdd);
            console.log(`  ✅ Успешно добавлено ${observersToAdd.length} наблюдателей`);
          } catch (error) {
            // Обрабатываем ошибку дубликатов
            if (error.code === 'ER_DUP_ENTRY') {
              console.log('  ⚠️ Обнаружены дубликаты, добавляем по одному');
              
              for (const observer of observersToAdd) {
                try {
                  await trx('Observer').insert(observer);
                  console.log(`    ✅ Добавлен user_id=${observer.user_id}`);
                } catch (insertError) {
                  if (insertError.code === 'ER_DUP_ENTRY') {
                    console.log(`    ⚠️ Пропущен дубликат user_id=${observer.user_id}`);
                  } else {
                    throw insertError;
                  }
                }
              }
            } else {
              throw error;
            }
          }
        } else {
          console.log('  ℹ️ Нет валидных наблюдателей для добавления');
        }
        
        // Если были ошибки с пользователями, возвращаем предупреждение
        if (errors.length > 0) {
          console.log('  ⚠️ Предупреждения:', errors);
        }
      } else {
        console.log('  ℹ️ Список наблюдателей пуст');
      }
    }

    // Фиксируем транзакцию
    await trx.commit();
    console.log('✅ Транзакция успешно завершена');

    // ==========================================
    // ПОЛУЧЕНИЕ ОБНОВЛЕННЫХ ДАННЫХ
    // ==========================================
    
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

    // Получаем наблюдателей
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

    console.log(`📊 Итого наблюдателей у заявки #${id}: ${observers.length}`);

    // Форматируем дату для корректного отображения
    let formattedDeadline = null;
    if (updatedWorkOrder.deadline) {
      const date = new Date(updatedWorkOrder.deadline);
      formattedDeadline = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .split('T')[0];
    }

    // Формируем ответ
    const result = {
      ...updatedWorkOrder,
      deadline: formattedDeadline,
      performer_name: updatedWorkOrder.foreman_last_name 
        ? `${updatedWorkOrder.foreman_last_name} ${updatedWorkOrder.foreman_first_name}`
        : 'Не назначен',
      observers: observers.map(obs => ({
        user_id: obs.user_id,
        last_name: obs.last_name,
        first_name: obs.first_name,
        middle_name: obs.middle_name,
        email: obs.email,
        position: obs.position
      }))
    };

    res.status(200).json({
      status: 'success',
      data: result,
      message: 'Заявка успешно обновлена'
    });

  } catch (error) {
    await trx.rollback();
    console.error('❌ Ошибка при обновлении заявки:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при обновлении заявки: ' + error.message
    });
  }
};

const deleteWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const workOrder = await db('WorkOrder')
      .where('work_order_id', id)
      .first();

    if (!workOrder) {
      return res.status(404).json({
        status: 'error',
        message: 'Заявка не найдена.'
      });
    }

    await db('Observer')
      .where('work_order_id', id)
      .del();

    await db('WorkOrder')
      .where('work_order_id', id)
      .del();

    res.status(200).json({
      status: 'success',
      message: 'Заявка успешно удалена.'
    });
  } catch (error) {
    console.error('Delete work order error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при удалении заявки: ' + error.message
    });
  }
};

module.exports = {
  saveWorkOrder,
  getAllWorkOrders,
  getWorkOrderById,
  createWorkOrder,
  updateWorkOrder,
  deleteWorkOrder
};