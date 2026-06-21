const jwt = require('jsonwebtoken');
const db = require('../config/database');

const protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Не авторизован' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Получаем пользователя
    const user = await db('User')
      .where('user_id', decoded.id)
      .first();
    
    if (!user) {
      return res.status(401).json({ message: 'Пользователь не найден' });
    }

    // Получаем роли пользователя на основе должности и связей
    const roles = [];
    let customerId = null;
    let foremanId = null;
    let installerId = null;
    
    // Проверяем должность
    if (user.position === 'Администратор') {
      roles.push('admin');
    }
    
    // Проверяем, является ли заказчиком
    const customer = await db('Customer').where('user_id', user.user_id).first();
    if (customer) {
      roles.push('customer');
      customerId = customer.customer_id;
    }
    
    // Проверяем, является ли бригадиром
    const foreman = await db('Foreman').where('user_id', user.user_id).first();
    if (foreman) {
      roles.push('foreman');
      foremanId = foreman.foreman_id;
    }
    
    // Проверяем, является ли монтажником
    const installer = await db('Installer').where('user_id', user.user_id).first();
    if (installer) {
      roles.push('installer');
      installerId = installer.installer_id;
    }

    req.user = {
      id: user.user_id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      position: user.position,
      roles: roles,
      customerId: customerId,
      foremanId: foremanId,
      installerId: installerId
    };

    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ message: 'Не авторизован' });
  }
};

const authorize = (...roles) => {
  return async (req, res, next) => {
    try {
      // Проверяем, является ли пользователь администратором по должности
      const isAdmin = req.user.position === 'Администратор';
      
      // Если требуется роль admin и пользователь администратор - пропускаем
      if (roles.includes('admin') && isAdmin) {
        req.userRoles = ['admin'];
        next();
        return;
      }

      // Проверяем роли в базе данных
      const customer = await db('Customer').where('user_id', req.user.id).first();
      const foreman = await db('Foreman').where('user_id', req.user.id).first();
      const installer = await db('Installer').where('user_id', req.user.id).first();

      const userRoles = [];
      
      // Добавляем роль admin для администраторов
      if (isAdmin) userRoles.push('admin');
      if (customer) userRoles.push('customer');
      if (foreman) userRoles.push('foreman');
      if (installer) userRoles.push('installer');
      
      // If user doesn't have specific role, they are a regular user
      if (userRoles.length === 0) userRoles.push('user');

      const hasRole = roles.some(role => userRoles.includes(role));

      if (!hasRole) {
        return res.status(403).json({
          status: 'error',
          message: 'У вас нет прав для выполнения этого действия.'
        });
      }

      // Add roles to request
      req.userRoles = userRoles;
      if (customer) req.customerId = customer.customer_id;
      if (foreman) req.foremanId = foreman.foreman_id;
      if (installer) req.installerId = installer.installer_id;

      next();
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Ошибка при проверке прав доступа.'
      });
    }
  };
};

module.exports = { protect, authorize };