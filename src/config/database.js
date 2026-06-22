const knex = require('knex');

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

function getDatabaseConfig() {
  // Проверяем все возможные переменные окружения
  const connectionString = 
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL;

  if (connectionString) {
    console.log('Using connection string');
    
    // ✅ Исправляем SSL для Supabase
    // Меняем sslmode=require на sslmode=no-verify для обхода проблемы с сертификатом
    let fixedConnectionString = connectionString;
    
    // Заменяем sslmode=require на sslmode=no-verify
    if (fixedConnectionString.includes('sslmode=require')) {
      fixedConnectionString = fixedConnectionString.replace('sslmode=require', 'sslmode=no-verify');
    }
    
    // Добавляем sslmode если его нет
    if (!fixedConnectionString.includes('sslmode=')) {
      fixedConnectionString += fixedConnectionString.includes('?') 
        ? '&sslmode=no-verify' 
        : '?sslmode=no-verify';
    }
    
    return {
      connectionString: fixedConnectionString,
      ssl: { 
        rejectUnauthorized: false  // ✅ Отключаем строгую проверку сертификата
      }
    };
  }

  // Отдельные параметры
  if (process.env.DB_HOST) {
    console.log('Using separate params');
    return {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'postgres',
      ssl: { 
        rejectUnauthorized: false  // ✅ Отключаем строгую проверку
      }
    };
  }

  console.error('No database configuration found');
  return null;
}

const dbConfig = getDatabaseConfig();

const db = knex({
  client: 'pg',
  connection: dbConfig || {},
  pool: {
    min: 2,
    max: 10
  }
});

module.exports = db;