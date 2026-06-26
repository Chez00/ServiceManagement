const { validationResult } = require('express-validator');

// Форматирование ошибок валидации в читаемый вид
const formatValidationErrors = (errors) => {
  return errors.array().map(error => ({
    field: error.path,
    message: error.msg,
    value: error.value
  }));
};

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = formatValidationErrors(errors);
    
    return res.status(400).json({
      status: 'error',
      message: 'Ошибка валидации данных.',
      errors: formattedErrors
    });
  }
  
  next();
};

// Рекурсивная санитизация входных данных
const sanitizeValue = (value) => {
  if (typeof value === 'string') {
    return value
      .trim()
      // Удаляем HTML-теги
      .replace(/<[^>]*>/g, '')
      // Удаляем опасные атрибуты и протоколы
      .replace(/javascript:/gi, '')
      .replace(/data:text\/html/gi, '')
      .replace(/vbscript:/gi, '')
      // Удаляем обработчики событий
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/on\w+\s*=\s*[^\s>]*/gi, '')
      // Удаляем CSS-выражения (для старых IE)
      .replace(/expression\s*\(/gi, '')
      // Заменяем множественные пробелы на один
      .replace(/\s+/g, ' ')
      // Удаляем нулевые байты
      .replace(/\0/g, '');
  }
  
  if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
    if (Array.isArray(value)) {
      return value.map(item => sanitizeValue(item));
    }
    
    const sanitized = {};
    for (const [key, val] of Object.entries(value)) {
      // Пропускаем системные поля и пароли
      if (key === 'password' || key === 'passwordConfirm') {
        sanitized[key] = val;
      } else {
        sanitized[key] = sanitizeValue(val);
      }
    }
    return sanitized;
  }
  
  return value;
};

const sanitizeInput = (req, res, next) => {
  if (req.body) {
    req.body = sanitizeValue(req.body);
  }
  
  if (req.query) {
    req.query = sanitizeValue(req.query);
  }
  
  if (req.params) {
    req.params = sanitizeValue(req.params);
  }
  
  next();
};

// Обработчик ошибок PostgreSQL
const handlePostgresError = (err) => {
  // Коды ошибок PostgreSQL: https://www.postgresql.org/docs/current/errcodes-appendix.html
  
  switch (err.code) {
    case '23505': // unique_violation
      return {
        status: 409,
        message: 'Запись с такими данными уже существует.'
      };
    
    case '23503': // foreign_key_violation
      return {
        status: 400,
        message: 'Невозможно выполнить операцию: связанные данные не найдены или используются.'
      };
    
    case '23502': // not_null_violation
      return {
        status: 400,
        message: 'Не все обязательные поля заполнены.'
      };
    
    case '23514': // check_violation
      return {
        status: 400,
        message: 'Данные не соответствуют ограничениям.'
      };
    
    case '42P01': // undefined_table
      return {
        status: 500,
        message: 'Внутренняя ошибка базы данных.'
      };
    
    case '42703': // undefined_column
      return {
        status: 500,
        message: 'Внутренняя ошибка базы данных.'
      };
    
    case '22P02': // invalid_text_representation
      return {
        status: 400,
        message: 'Неверный формат данных.'
      };
    
    case '22001': // string_data_right_truncation
      return {
        status: 400,
        message: 'Превышена максимальная длина поля.'
      };
    
    case '57014': // query_canceled (timeout)
      return {
        status: 504,
        message: 'Превышено время выполнения запроса.'
      };
    
    default:
      return null;
  }
};

const errorHandler = (err, req, res, next) => {
  // Логирование в зависимости от окружения
  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      detail: err.detail
    });
  } else {
    console.error('Error:', err.message);
  }

  // Обработка ошибок PostgreSQL
  const pgError = handlePostgresError(err);
  if (pgError) {
    return res.status(pgError.status).json({
      status: 'error',
      message: pgError.message
    });
  }

  // Обработка ошибок JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      status: 'error',
      message: 'Недействительный токен авторизации.'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      status: 'error',
      message: 'Срок действия токена истёк. Пожалуйста, войдите заново.'
    });
  }

  if (err.name === 'NotBeforeError') {
    return res.status(401).json({
      status: 'error',
      message: 'Токен ещё не действителен.'
    });
  }

  // Ошибки загрузки файлов (Multer)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      status: 'error',
      message: 'Размер файла превышает допустимый лимит.'
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      status: 'error',
      message: 'Неожиданное поле с файлом.'
    });
  }

  // Ошибки валидации входных данных
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      status: 'error',
      message: err.message || 'Ошибка валидации данных.'
    });
  }

  // Ошибка "слишком много запросов" (rate limiting)
  if (err.statusCode === 429) {
    return res.status(429).json({
      status: 'error',
      message: 'Слишком много запросов. Пожалуйста, попробуйте позже.'
    });
  }

  // Кастомный статус-код
  const statusCode = err.statusCode || err.status || 500;
  
  res.status(statusCode).json({
    status: 'error',
    message: err.message || 'Внутренняя ошибка сервера.',
    // В development-режиме можно вернуть доп. информацию
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      detail: err.detail
    })
  });
};

// Middleware для обработки несуществующих маршрутов (404)
const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    status: 'error',
    message: `Маршрут ${req.method} ${req.originalUrl} не найден.`
  });
};

// Асинхронная обёртка для контроллеров (избавляет от try-catch)
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  validateRequest,
  sanitizeInput,
  errorHandler,
  notFoundHandler,
  asyncHandler
};