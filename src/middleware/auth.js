const jwt = require('jsonwebtoken');
const db = require('../config/database');

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'Не авторизован. Токен не предоставлен.'
      });
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Не авторизован. Токен не предоставлен.'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          status: 'error',
          message: 'Срок действия токена истёк.'
        });
      }
      return res.status(401).json({
        status: 'error',
        message: 'Недействительный токен.'
      });
    }

    if (!decoded.id) {
      return res.status(401).json({
        status: 'error',
        message: 'Недействительный токен.'
      });
    }

    // Получаем пользователя
    const user = await db('User')
      .where('user_id', decoded.id)
      .first();

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Пользователь не найден.'
      });
    }

    // Получаем все роли параллельно
    const [customer, foreman, installer] = await Promise.all([
      db('Customer').where('user_id', user.user_id).first(),
      db('Foreman').where('user_id', user.user_id).first(),
      db('Installer').where('user_id', user.user_id).first()
    ]);

    // Формируем роли
    const userRoles = [];
    if (user.position === 'Администратор') {
      userRoles.push('admin');
    }
    if (customer) {
      userRoles.push('customer');
    }
    if (foreman) {
      userRoles.push('foreman');
    }
    if (installer) {
      userRoles.push('installer');
    }

    // Если нет ни одной роли, добавляем базовую
    if (userRoles.length === 0) {
      userRoles.push('user');
    }

    // Сохраняем всё в req для использования в контроллерах и authorize
    req.user = {
      id: user.user_id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      position: user.position,
      phone: user.phone,
      departmentId: user.department_id
    };

    req.userRoles = userRoles;
    req.customerId = customer ? customer.customer_id : null;
    req.foremanId = foreman ? foreman.foreman_id : null;
    req.installerId = installer ? installer.installer_id : null;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Ошибка авторизации.'
    });
  }
};

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      // Если пользователь не авторизован
      if (!req.user || !req.userRoles) {
        return res.status(401).json({
          status: 'error',
          message: 'Не авторизован.'
        });
      }

      // Администратор имеет доступ ко всему
      if (req.userRoles.includes('admin')) {
        return next();
      }

      // Проверяем, есть ли у пользователя хотя бы одна из требуемых ролей
      const hasRole = allowedRoles.some(role => req.userRoles.includes(role));

      if (!hasRole) {
        return res.status(403).json({
          status: 'error',
          message: 'У вас нет прав для выполнения этого действия.'
        });
      }

      next();
    } catch (error) {
      console.error('Authorize middleware error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Ошибка при проверке прав доступа.'
      });
    }
  };
};

module.exports = { protect, authorize };