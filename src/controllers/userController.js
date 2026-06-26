const db = require('../config/database');
const bcrypt = require('bcryptjs');

// Вспомогательная функция для проверки прав администратора
const isAdmin = (req) => {
  return req.userRoles?.includes('admin') || req.user?.position === 'Администратор';
};

// Вспомогательная функция для получения ролей пользователя (оптимизированная)
const getUserRoles = async (userId, position = null) => {
  const [customer, foreman, installer] = await Promise.all([
    db('Customer').where('user_id', userId).first(),
    db('Foreman').where('user_id', userId).first(),
    db('Installer').where('user_id', userId).first()
  ]);

  const roles = [];
  if (position === 'Администратор') roles.push('admin');
  if (customer) roles.push('customer');
  if (foreman) roles.push('foreman');
  if (installer) roles.push('installer');

  return {
    roles,
    isForeman: !!foreman,
    foreman_id: foreman ? foreman.foreman_id : null,
    isInstaller: !!installer,
    installer_id: installer ? installer.installer_id : null,
    isCustomer: !!customer,
    customer_id: customer ? customer.customer_id : null
  };
};

// Получение ролей для списка пользователей (оптимизировано)
const getUsersRoles = async (userIds) => {
  if (!userIds.length) return {};

  const [customers, foremen, installers] = await Promise.all([
    db('Customer').whereIn('user_id', userIds),
    db('Foreman').whereIn('user_id', userIds),
    db('Installer').whereIn('user_id', userIds)
  ]);

  const rolesMap = {};

  userIds.forEach(userId => {
    rolesMap[userId] = {
      roles: [],
      isForeman: false,
      foreman_id: null,
      isInstaller: false,
      installer_id: null,
      isCustomer: false,
      customer_id: null
    };
  });

  customers.forEach(c => {
    if (rolesMap[c.user_id]) {
      rolesMap[c.user_id].roles.push('customer');
      rolesMap[c.user_id].isCustomer = true;
      rolesMap[c.user_id].customer_id = c.customer_id;
    }
  });

  foremen.forEach(f => {
    if (rolesMap[f.user_id]) {
      rolesMap[f.user_id].roles.push('foreman');
      rolesMap[f.user_id].isForeman = true;
      rolesMap[f.user_id].foreman_id = f.foreman_id;
    }
  });

  installers.forEach(i => {
    if (rolesMap[i.user_id]) {
      rolesMap[i.user_id].roles.push('installer');
      rolesMap[i.user_id].isInstaller = true;
      rolesMap[i.user_id].installer_id = i.installer_id;
    }
  });

  return rolesMap;
};

const getAllUsers = async (req, res) => {
  try {
    const users = await db('User')
      .select(
        'User.user_id',
        'User.email',
        'User.last_name',
        'User.first_name',
        'User.middle_name',
        'User.position',
        'User.phone',
        'Department.name as department_name',
        'User.department_id'
      )
      .leftJoin('Department', 'User.department_id', 'Department.department_id')
      .orderBy('User.last_name', 'asc');

    // Получаем роли для всех пользователей одним запросом
    const userIds = users.map(u => u.user_id);
    const rolesMap = await getUsersRoles(userIds);

    // Добавляем роль admin для администраторов
    users.forEach(user => {
      if (user.position === 'Администратор') {
        rolesMap[user.user_id].roles.push('admin');
      }
    });

    const usersWithRoles = users.map(user => ({
      ...user,
      ...rolesMap[user.user_id]
    }));

    res.status(200).json({
      status: 'success',
      data: usersWithRoles
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении списка пользователей.'
    });
  }
};

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await db('User')
      .select(
        'User.user_id',
        'User.email',
        'User.last_name',
        'User.first_name',
        'User.middle_name',
        'User.position',
        'User.phone',
        'Department.name as department_name',
        'User.department_id'
      )
      .leftJoin('Department', 'User.department_id', 'Department.department_id')
      .where('User.user_id', id)
      .first();

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Пользователь не найден.'
      });
    }

    const rolesData = await getUserRoles(user.user_id, user.position);

    res.status(200).json({
      status: 'success',
      data: {
        ...user,
        ...rolesData
      }
    });
  } catch (error) {
    console.error('Get user by id error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении данных пользователя.'
    });
  }
};

const updateUser = async (req, res) => {
  const trx = await db.transaction();

  try {
    const { id } = req.params;

    // Проверяем права
    if (!isAdmin(req)) {
      await trx.rollback();
      return res.status(403).json({
        status: 'error',
        message: 'Только администратор может редактировать пользователей.'
      });
    }

    // Проверяем существование пользователя
    const existingUser = await trx('User').where('user_id', id).first();
    if (!existingUser) {
      await trx.rollback();
      return res.status(404).json({
        status: 'error',
        message: 'Пользователь не найден.'
      });
    }

    const updates = {};

    // Маппинг полей
    if (req.body.lastName !== undefined) updates.last_name = req.body.lastName;
    if (req.body.firstName !== undefined) updates.first_name = req.body.firstName;
    if (req.body.middleName !== undefined) updates.middle_name = req.body.middleName;
    if (req.body.position !== undefined) updates.position = req.body.position;
    if (req.body.phone !== undefined) updates.phone = req.body.phone;
    if (req.body.departmentId !== undefined) {
      updates.department_id = req.body.departmentId || null;
    }
    if (req.body.email !== undefined) updates.email = req.body.email;

    // Обновляем пароль если указан
    if (req.body.password) {
      const salt = await bcrypt.genSalt(12);
      updates.password = await bcrypt.hash(req.body.password, salt);
    }

    // Обновляем данные пользователя
    if (Object.keys(updates).length > 0) {
      await trx('User')
        .where('user_id', id)
        .update(updates);
    }

    // Обновляем роли если переданы
    if (req.body.roles && Array.isArray(req.body.roles)) {
      // Получаем текущие роли
      const existingRoles = await getUserRoles(id, existingUser.position);

      // Определяем, какие роли нужно добавить/удалить
      const rolesToAdd = req.body.roles.filter(r => r !== 'admin');
      const rolesToRemove = existingRoles.roles.filter(r => r !== 'admin' && !req.body.roles.includes(r));

      // Проверяем, можно ли удалить роли (нет ли связанных данных)
      for (const role of rolesToRemove) {
        if (role === 'foreman' && existingRoles.foreman_id) {
          // Проверяем, есть ли активные заявки у бригадира
          const hasActiveOrders = await trx('WorkOrder')
            .join('Performer', 'WorkOrder.performer_id', 'Performer.performer_id')
            .where('Performer.foreman_id', existingRoles.foreman_id)
            .whereNotIn('WorkOrder.status', ['completed', 'cancelled'])
            .first();

          if (hasActiveOrders) {
            await trx.rollback();
            return res.status(400).json({
              status: 'error',
              message: 'Невозможно удалить роль бригадира. У бригадира есть активные заявки.'
            });
          }
        }

        if (role === 'installer' && existingRoles.installer_id) {
          // Проверяем, состоит ли монтажник в бригаде с активными заявками
          const crewWithActiveOrders = await trx('Crew_Installer')
            .join('Crew', 'Crew_Installer.crew_id', 'Crew.crew_id')
            .join('Performer', 'Crew.crew_id', 'Performer.crew_id')
            .join('WorkOrder', 'Performer.performer_id', 'WorkOrder.performer_id')
            .where('Crew_Installer.installer_id', existingRoles.installer_id)
            .whereNotIn('WorkOrder.status', ['completed', 'cancelled'])
            .first();

          if (crewWithActiveOrders) {
            await trx.rollback();
            return res.status(400).json({
              status: 'error',
              message: 'Невозможно удалить роль монтажника. Монтажник состоит в бригаде с активными заявками.'
            });
          }
        }
      }

      // Удаляем роли, которые нужно убрать
      for (const role of rolesToRemove) {
        if (role === 'customer') {
          await trx('Customer').where('user_id', id).del();
        }
        if (role === 'foreman') {
          // Удаляем связанные бригады
          const crews = await trx('Crew').where('foreman_id', existingRoles.foreman_id);
          for (const crew of crews) {
            await trx('Crew_Installer').where('crew_id', crew.crew_id).del();
            await trx('Performer').where('crew_id', crew.crew_id).del();
          }
          await trx('Crew').where('foreman_id', existingRoles.foreman_id).del();
          await trx('Performer').where('foreman_id', existingRoles.foreman_id).del();
          await trx('Foreman').where('user_id', id).del();
        }
        if (role === 'installer') {
          await trx('Crew_Installer').where('installer_id', existingRoles.installer_id).del();
          await trx('Installer').where('user_id', id).del();
        }
      }

      // Добавляем новые роли
      for (const role of rolesToAdd) {
        if (role === 'customer' && !existingRoles.isCustomer) {
          await trx('Customer').insert({ user_id: parseInt(id) });
        }
        if (role === 'foreman' && !existingRoles.isForeman) {
          await trx('Foreman').insert({ user_id: parseInt(id) });
        }
        if (role === 'installer' && !existingRoles.isInstaller) {
          await trx('Installer').insert({ user_id: parseInt(id) });
        }
      }
    }

    await trx.commit();

    // Получаем обновленного пользователя
    const updatedUser = await db('User')
      .select(
        'User.user_id',
        'User.email',
        'User.last_name',
        'User.first_name',
        'User.middle_name',
        'User.position',
        'User.phone',
        'User.department_id',
        'Department.name as department_name'
      )
      .leftJoin('Department', 'User.department_id', 'Department.department_id')
      .where('User.user_id', id)
      .first();

    const rolesData = await getUserRoles(id, updatedUser.position);

    res.status(200).json({
      status: 'success',
      data: {
        ...updatedUser,
        ...rolesData
      },
      message: 'Данные пользователя успешно обновлены.'
    });
  } catch (error) {
    await trx.rollback();
    console.error('Update user error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при обновлении данных пользователя.'
    });
  }
};

const deleteUser = async (req, res) => {
  const trx = await db.transaction();

  try {
    const { id } = req.params;

    // Проверяем права
    if (!isAdmin(req)) {
      await trx.rollback();
      return res.status(403).json({
        status: 'error',
        message: 'Только администратор может удалять пользователей.'
      });
    }

    // Проверяем существование
    const user = await trx('User').where('user_id', id).first();
    if (!user) {
      await trx.rollback();
      return res.status(404).json({
        status: 'error',
        message: 'Пользователь не найден.'
      });
    }

    // Нельзя удалить самого себя
    if (req.user.id === parseInt(id)) {
      await trx.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'Нельзя удалить самого себя.'
      });
    }

    // Получаем текущие роли ДО удаления
    const rolesData = await getUserRoles(id, user.position);

    // Проверяем, можно ли удалить пользователя
    if (rolesData.isForeman) {
      const hasActiveOrders = await trx('WorkOrder')
        .join('Performer', 'WorkOrder.performer_id', 'Performer.performer_id')
        .where('Performer.foreman_id', rolesData.foreman_id)
        .whereNotIn('WorkOrder.status', ['completed', 'cancelled'])
        .first();

      if (hasActiveOrders) {
        await trx.rollback();
        return res.status(400).json({
          status: 'error',
          message: 'Невозможно удалить пользователя. У бригадира есть активные заявки.'
        });
      }

      // Удаляем связанные бригады и исполнителей
      const crews = await trx('Crew').where('foreman_id', rolesData.foreman_id);
      for (const crew of crews) {
        await trx('Crew_Installer').where('crew_id', crew.crew_id).del();
        await trx('Performer').where('crew_id', crew.crew_id).del();
      }
      await trx('Crew').where('foreman_id', rolesData.foreman_id).del();
      await trx('Performer').where('foreman_id', rolesData.foreman_id).del();
    }

    if (rolesData.isInstaller) {
      const hasActiveOrders = await trx('Crew_Installer')
        .join('Crew', 'Crew_Installer.crew_id', 'Crew.crew_id')
        .join('Performer', 'Crew.crew_id', 'Performer.crew_id')
        .join('WorkOrder', 'Performer.performer_id', 'WorkOrder.performer_id')
        .where('Crew_Installer.installer_id', rolesData.installer_id)
        .whereNotIn('WorkOrder.status', ['completed', 'cancelled'])
        .first();

      if (hasActiveOrders) {
        await trx.rollback();
        return res.status(400).json({
          status: 'error',
          message: 'Невозможно удалить пользователя. Монтажник состоит в бригаде с активными заявками.'
        });
      }

      await trx('Crew_Installer').where('installer_id', rolesData.installer_id).del();
    }

    // Удаляем роли
    await trx('Customer').where('user_id', id).del();
    await trx('Foreman').where('user_id', id).del();
    await trx('Installer').where('user_id', id).del();
    await trx('Observer').where('user_id', id).del();

    // Удаляем пользователя
    await trx('User').where('user_id', id).del();

    await trx.commit();

    res.status(200).json({
      status: 'success',
      message: 'Пользователь успешно удален.'
    });
  } catch (error) {
    await trx.rollback();
    console.error('Delete user error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при удалении пользователя.'
    });
  }
};

const makeForeman = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isAdmin(req)) {
      return res.status(403).json({
        status: 'error',
        message: 'Только администратор может назначать бригадиров.'
      });
    }

    const user = await db('User').where('user_id', userId).first();
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Пользователь не найден.'
      });
    }

    const existing = await db('Foreman').where('user_id', userId).first();
    if (existing) {
      return res.status(400).json({
        status: 'error',
        message: 'Пользователь уже является бригадиром.'
      });
    }

    const [foreman] = await db('Foreman')
      .insert({ user_id: parseInt(userId) })
      .returning('*');

    res.status(201).json({
      status: 'success',
      data: foreman,
      message: 'Пользователь назначен бригадиром.'
    });
  } catch (error) {
    console.error('Make foreman error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при назначении бригадира.'
    });
  }
};

const makeInstaller = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isAdmin(req)) {
      return res.status(403).json({
        status: 'error',
        message: 'Только администратор может назначать монтажников.'
      });
    }

    const user = await db('User').where('user_id', userId).first();
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Пользователь не найден.'
      });
    }

    const existing = await db('Installer').where('user_id', userId).first();
    if (existing) {
      return res.status(400).json({
        status: 'error',
        message: 'Пользователь уже является монтажником.'
      });
    }

    const [installer] = await db('Installer')
      .insert({ user_id: parseInt(userId) })
      .returning('*');

    res.status(201).json({
      status: 'success',
      data: installer,
      message: 'Пользователь назначен монтажником.'
    });
  } catch (error) {
    console.error('Make installer error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при назначении монтажника.'
    });
  }
};

const removeForeman = async (req, res) => {
  const trx = await db.transaction();

  try {
    const { userId } = req.params;

    if (!isAdmin(req)) {
      await trx.rollback();
      return res.status(403).json({
        status: 'error',
        message: 'Только администратор может удалять роли.'
      });
    }

    const foreman = await trx('Foreman').where('user_id', userId).first();
    if (!foreman) {
      await trx.rollback();
      return res.status(404).json({
        status: 'error',
        message: 'Пользователь не является бригадиром.'
      });
    }

    // Проверяем активные заявки
    const hasActiveOrders = await trx('WorkOrder')
      .join('Performer', 'WorkOrder.performer_id', 'Performer.performer_id')
      .where('Performer.foreman_id', foreman.foreman_id)
      .whereNotIn('WorkOrder.status', ['completed', 'cancelled'])
      .first();

    if (hasActiveOrders) {
      await trx.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'Невозможно удалить роль бригадира. Есть активные заявки.'
      });
    }

    // Удаляем связанные бригады
    const crews = await trx('Crew').where('foreman_id', foreman.foreman_id);
    for (const crew of crews) {
      await trx('Crew_Installer').where('crew_id', crew.crew_id).del();
      await trx('Performer').where('crew_id', crew.crew_id).del();
    }
    await trx('Crew').where('foreman_id', foreman.foreman_id).del();

    // Удаляем исполнителей
    await trx('Performer').where('foreman_id', foreman.foreman_id).del();

    // Удаляем роль
    await trx('Foreman').where('user_id', userId).del();

    await trx.commit();

    res.status(200).json({
      status: 'success',
      message: 'Роль бригадира успешно удалена.'
    });
  } catch (error) {
    await trx.rollback();
    console.error('Remove foreman error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при удалении роли бригадира.'
    });
  }
};

const removeInstaller = async (req, res) => {
  const trx = await db.transaction();

  try {
    const { userId } = req.params;

    if (!isAdmin(req)) {
      await trx.rollback();
      return res.status(403).json({
        status: 'error',
        message: 'Только администратор может удалять роли.'
      });
    }

    const installer = await trx('Installer').where('user_id', userId).first();
    if (!installer) {
      await trx.rollback();
      return res.status(404).json({
        status: 'error',
        message: 'Пользователь не является монтажником.'
      });
    }

    // Проверяем активные заявки у бригад с этим монтажником
    const hasActiveOrders = await trx('Crew_Installer')
      .join('Crew', 'Crew_Installer.crew_id', 'Crew.crew_id')
      .join('Performer', 'Crew.crew_id', 'Performer.crew_id')
      .join('WorkOrder', 'Performer.performer_id', 'WorkOrder.performer_id')
      .where('Crew_Installer.installer_id', installer.installer_id)
      .whereNotIn('WorkOrder.status', ['completed', 'cancelled'])
      .first();

    if (hasActiveOrders) {
      await trx.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'Невозможно удалить роль монтажника. Есть активные заявки у бригады.'
      });
    }

    // Удаляем связи с бригадами
    await trx('Crew_Installer').where('installer_id', installer.installer_id).del();

    // Удаляем роль
    await trx('Installer').where('user_id', userId).del();

    await trx.commit();

    res.status(200).json({
      status: 'success',
      message: 'Роль монтажника успешно удалена.'
    });
  } catch (error) {
    await trx.rollback();
    console.error('Remove installer error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при удалении роли монтажника.'
    });
  }
};

const getForemen = async (req, res) => {
  try {
    const foremen = await db('Foreman')
      .select(
        'Foreman.foreman_id',
        'User.user_id',
        'User.last_name',
        'User.first_name',
        'User.middle_name',
        'User.email',
        'User.position'
      )
      .join('User', 'Foreman.user_id', 'User.user_id')
      .orderBy('User.last_name', 'asc');

    res.status(200).json({
      status: 'success',
      data: foremen
    });
  } catch (error) {
    console.error('Get foremen error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении списка бригадиров.'
    });
  }
};

const getInstallers = async (req, res) => {
  try {
    const installers = await db('Installer')
      .select(
        'Installer.installer_id',
        'User.user_id',
        'User.last_name',
        'User.first_name',
        'User.middle_name',
        'User.email',
        'User.position'
      )
      .join('User', 'Installer.user_id', 'User.user_id')
      .orderBy('User.last_name', 'asc');

    res.status(200).json({
      status: 'success',
      data: installers
    });
  } catch (error) {
    console.error('Get installers error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении списка монтажников.'
    });
  }
};

const getPerformers = async (req, res) => {
  try {
    const performers = await db('Performer')
      .select(
        'Performer.performer_id',
        'Foreman.foreman_id',
        'Crew.crew_id',
        'Foreman_User.last_name as foreman_last_name',
        'Foreman_User.first_name as foreman_first_name'
      )
      .join('Foreman', 'Performer.foreman_id', 'Foreman.foreman_id')
      .join('User as Foreman_User', 'Foreman.user_id', 'Foreman_User.user_id')
      .leftJoin('Crew', 'Performer.crew_id', 'Crew.crew_id')
      .orderBy('Foreman_User.last_name', 'asc');

    const formattedPerformers = performers.map(p => ({
      performer_id: p.performer_id,
      foreman_id: p.foreman_id,
      crew_id: p.crew_id,
      name: [p.foreman_last_name, p.foreman_first_name]
        .filter(Boolean)
        .join(' ') + (p.crew_id ? ` (Бригада #${p.crew_id})` : '')
    }));

    res.status(200).json({
      status: 'success',
      data: formattedPerformers
    });
  } catch (error) {
    console.error('Get performers error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении списка исполнителей.'
    });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  makeForeman,
  makeInstaller,
  removeForeman,
  removeInstaller,
  getForemen,
  getInstallers,
  getPerformers
};