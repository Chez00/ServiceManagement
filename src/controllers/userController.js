const db = require('../config/database');
const bcrypt = require('bcryptjs');

// Вспомогательная функция для проверки прав администратора
const isAdmin = (req) => {
  return req.userRoles?.includes('admin') || req.user?.position === 'Администратор';
};

// Вспомогательная функция для получения ролей пользователя
const getUserRoles = async (userId, position = null) => {
  const customer = await db('Customer').where('user_id', userId).first();
  const foreman = await db('Foreman').where('user_id', userId).first();
  const installer = await db('Installer').where('user_id', userId).first();
  
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

    // Получаем роли для каждого пользователя
    const usersWithRoles = await Promise.all(users.map(async (user) => {
      const rolesData = await getUserRoles(user.user_id, user.position);
      
      return {
        ...user,
        ...rolesData
      };
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
      .where('User.user_id', req.params.id)
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
    
    // Проверяем права: только админ может редактировать пользователей
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
      // Удаляем старые роли
      await trx('Customer').where('user_id', id).del();
      await trx('Foreman').where('user_id', id).del();
      await trx('Installer').where('user_id', id).del();

      // Добавляем новые роли
      if (req.body.roles.includes('customer')) {
        await trx('Customer').insert({ user_id: parseInt(id) });
      }
      if (req.body.roles.includes('foreman')) {
        await trx('Foreman').insert({ user_id: parseInt(id) });
      }
      if (req.body.roles.includes('installer')) {
        await trx('Installer').insert({ user_id: parseInt(id) });
      }
      // Роль admin определяется по должности, не нужно добавлять в таблицы
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

    // Получаем обновленные роли
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

    // Проверяем права: только админ может удалять пользователей
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

    // Удаляем связанные роли
    await trx('Customer').where('user_id', id).del();
    await trx('Foreman').where('user_id', id).del();
    await trx('Installer').where('user_id', id).del();
    
    // Удаляем связи с наблюдателями
    await trx('Observer').where('user_id', id).del();
    
    // Удаляем связи с бригадами (если пользователь был бригадиром)
    const foremanRecord = await trx('Foreman').where('user_id', id).first();
    if (foremanRecord) {
      // Находим все бригады этого бригадира
      const crews = await trx('Crew').where('foreman_id', foremanRecord.foreman_id);
      for (const crew of crews) {
        // Удаляем монтажников из бригады
        await trx('Crew_Installer').where('crew_id', crew.crew_id).del();
      }
      // Удаляем бригады
      await trx('Crew').where('foreman_id', foremanRecord.foreman_id).del();
    }
    
    // Удаляем связи с бригадами (если пользователь был монтажником)
    const installerRecord = await trx('Installer').where('user_id', id).first();
    if (installerRecord) {
      await trx('Crew_Installer').where('installer_id', installerRecord.installer_id).del();
    }

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

// Назначить пользователя бригадиром
const makeForeman = async (req, res) => {
  try {
    const { userId } = req.params;

    // Проверяем права: только админ может назначать роли
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

    const [foremanId] = await db('Foreman').insert({ user_id: parseInt(userId) });

    res.status(201).json({
      status: 'success',
      data: { foreman_id: foremanId },
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

// Назначить пользователя монтажником
const makeInstaller = async (req, res) => {
  try {
    const { userId } = req.params;

    // Проверяем права: только админ может назначать роли
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

    const [installerId] = await db('Installer').insert({ user_id: parseInt(userId) });

    res.status(201).json({
      status: 'success',
      data: { installer_id: installerId },
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

// Удалить роль бригадира
const removeForeman = async (req, res) => {
  const trx = await db.transaction();
  
  try {
    const { userId } = req.params;

    // Проверяем права: только админ может удалять роли
    if (!isAdmin(req)) {
      await trx.rollback();
      return res.status(403).json({
        status: 'error',
        message: 'Только администратор может удалять роли.'
      });
    }

    // Находим бригадира
    const foreman = await trx('Foreman').where('user_id', userId).first();
    if (!foreman) {
      await trx.rollback();
      return res.status(404).json({
        status: 'error',
        message: 'Пользователь не является бригадиром.'
      });
    }

    // Удаляем связанные бригады и их монтажников
    const crews = await trx('Crew').where('foreman_id', foreman.foreman_id);
    for (const crew of crews) {
      await trx('Crew_Installer').where('crew_id', crew.crew_id).del();
      await trx('Crew').where('crew_id', crew.crew_id).del();
    }

    // Удаляем исполнителей (performers)
    await trx('Performer').where('foreman_id', foreman.foreman_id).del();

    // Удаляем роль бригадира
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

// Удалить роль монтажника
const removeInstaller = async (req, res) => {
  const trx = await db.transaction();
  
  try {
    const { userId } = req.params;

    // Проверяем права: только админ может удалять роли
    if (!isAdmin(req)) {
      await trx.rollback();
      return res.status(403).json({
        status: 'error',
        message: 'Только администратор может удалять роли.'
      });
    }

    // Находим монтажника
    const installer = await trx('Installer').where('user_id', userId).first();
    if (!installer) {
      await trx.rollback();
      return res.status(404).json({
        status: 'error',
        message: 'Пользователь не является монтажником.'
      });
    }

    // Удаляем связи с бригадами
    await trx('Crew_Installer').where('installer_id', installer.installer_id).del();

    // Удаляем роль монтажника
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

// Получить всех бригадиров
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

// Получить всех монтажников
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

// Получить всех исполнителей (performers)
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
      name: [p.foreman_last_name, p.foreman_first_name].filter(Boolean).join(' ') + 
            (p.crew_id ? ` (Бригада #${p.crew_id})` : '')
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