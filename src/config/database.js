const knex = require('knex');

// Загружаем .env только в development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

function getDatabaseConfig() {
  // Проверяем переменные Vercel/Supabase в порядке приоритета:
  
  // 1. POSTGRES_PRISMA_URL (рекомендуется для serverless)
  if (process.env.POSTGRES_PRISMA_URL) {
    console.log('📦 Используем POSTGRES_PRISMA_URL (Pooler)');
    return {
      connectionString: process.env.POSTGRES_PRISMA_URL,
      ssl: { rejectUnauthorized: false }
    };
  }

  // 2. POSTGRES_URL_NON_POOLING (для прямых подключений)
  if (process.env.POSTGRES_URL_NON_POOLING) {
    console.log('📦 Используем POSTGRES_URL_NON_POOLING');
    return {
      connectionString: process.env.POSTGRES_URL_NON_POOLING,
      ssl: { rejectUnauthorized: false }
    };
  }

  // 3. POSTGRES_URL
  if (process.env.POSTGRES_URL) {
    console.log('📦 Используем POSTGRES_URL');
    return {
      connectionString: process.env.POSTGRES_URL,
      ssl: { rejectUnauthorized: false }
    };
  }

  // 4. DATABASE_URL (если задан вручную)
  if (process.env.DATABASE_URL) {
    console.log('📦 Используем DATABASE_URL');
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    };
  }

  // 5. Отдельные параметры
  if (process.env.POSTGRES_HOST && process.env.POSTGRES_USER && process.env.POSTGRES_PASSWORD) {
    console.log('📦 Используем отдельные параметры подключения');
    return {
      host: process.env.POSTGRES_HOST,
      port: process.env.POSTGRES_PORT || 5432,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DATABASE || 'postgres',
      ssl: { rejectUnauthorized: false }
    };
  }

  // 6. Локальные переменные из .env
  if (process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD) {
    console.log('📦 Используем локальные параметры из .env');
    return {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'postgres',
      ssl: { rejectUnauthorized: false }
    };
  }

  console.error('❌ Не найдены параметры подключения к базе данных');
  console.error('Доступные переменные окружения:', Object.keys(process.env).filter(k => k.includes('POSTGRES') || k.includes('DATABASE')).join(', '));
  return null;
}

const connectionConfig = getDatabaseConfig();

if (!connectionConfig) {
  console.error('❌ Критическая ошибка: нет конфигурации базы данных');
  // Не завершаем процесс, позволяя приложению запуститься для обработки других маршрутов
}

const db = knex({
  client: 'pg',
  connection: connectionConfig || {},
  pool: {
    min: 2,
    max: 10,
    afterCreate: (conn, done) => {
      console.log('✅ Новое соединение с БД создано');
      done(null, conn);
    }
  }
});

// Проверка подключения
if (process.env.NODE_ENV !== 'production') {
  db.raw('SELECT 1')
    .then(() => {
      console.log('✅ Подключение к базе данных успешно установлено!');
    })
    .catch((err) => {
      console.error('❌ Не получилось подключиться к базе данных:', err.message);
    });
}

module.exports = db;