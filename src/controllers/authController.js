const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '24h' }
  );
};

const generateRefreshToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
  );
};

// Вынес определение ролей в отдельную функцию
const getUserRoles = async (userId, position) => {
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

  return roles;
};

const register = async (req, res) => {
  const trx = await db.transaction();

  try {
    const { email, password, firstName, lastName, middleName, phone, departmentId, position } = req.body;

    // Валидация обязательных полей
    if (!email || !password) {
      await trx.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'Email и пароль обязательны.'
      });
    }

    // Проверка существующего пользователя
    const existingUser = await trx('User').where('email', email).first();
    if (existingUser) {
      await trx.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'Пользователь с таким email уже существует.'
      });
    }

    // Хеширование пароля
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Создание пользователя
    const [userId] = await trx('User').insert({
      email,
      password: hashedPassword,
      first_name: firstName,
      last_name: lastName,
      middle_name: middleName,
      phone,
      department_id: departmentId || null,
      position: position || null
    }).returning('user_id');

    await trx.commit();

    // Получаем роли после commit
    const user = await db('User').where('user_id', userId).first();
    const roles = await getUserRoles(userId, user.position);

    const token = generateToken(userId);
    const refreshToken = generateRefreshToken(userId);

    res.status(201).json({
      status: 'success',
      data: {
        user: {
          id: userId,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          position: user.position,
          roles
        },
        token,
        refreshToken
      }
    });
  } catch (error) {
    await trx.rollback();
    console.error('Registration error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при регистрации.'
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Email и пароль обязательны.'
      });
    }

    // Поиск пользователя
    const user = await db('User').where('email', email).first();

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Неверный email или пароль.'
      });
    }

    // Проверка пароля
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Неверный email или пароль.'
      });
    }

    const token = generateToken(user.user_id);
    const refreshToken = generateRefreshToken(user.user_id);

    const roles = await getUserRoles(user.user_id, user.position);

    res.status(200).json({
      status: 'success',
      data: {
        user: {
          id: user.user_id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          position: user.position,
          roles
        },
        token,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при входе в систему.'
    });
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        status: 'error',
        message: 'Refresh token не предоставлен.'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (jwtError) {
      return res.status(401).json({
        status: 'error',
        message: 'Недействительный refresh token.'
      });
    }

    const user = await db('User').where('user_id', decoded.id).first();
    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Пользователь не найден.'
      });
    }

    const newToken = generateToken(user.user_id);
    const newRefreshToken = generateRefreshToken(user.user_id);

    const roles = await getUserRoles(user.user_id, user.position);

    res.status(200).json({
      status: 'success',
      data: {
        user: {
          id: user.user_id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          position: user.position,
          roles
        },
        token: newToken,
        refreshToken: newRefreshToken
      }
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({
      status: 'error',
      message: 'Недействительный refresh token.'
    });
  }
};

const logout = async (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Успешный выход из системы.'
  });
};

const getCurrentUser = async (req, res) => {
  try {
    const user = await db('User')
      .select(
        'User.user_id',
        'User.email',
        'User.first_name',
        'User.last_name',
        'User.middle_name',
        'User.position',
        'User.phone',
        'Department.name as department_name'
      )
      .leftJoin('Department', 'User.department_id', 'Department.department_id')
      .where('User.user_id', req.user.id)
      .first();

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Пользователь не найден.'
      });
    }

    const roles = await getUserRoles(req.user.id, user.position);

    res.status(200).json({
      status: 'success',
      data: {
        ...user,
        roles
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении данных пользователя.'
    });
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getCurrentUser
};