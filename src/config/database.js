const knex = require('knex');

// Загружаем .env только в development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

function getDatabaseConfig() {
  // Проверяем переменные Vercel/Supabase
  if (process.env.POSTGRES_PRISMA_URL) {
    console.log('📦 Using POSTGRES_PRISMA_URL');
    return {
      connectionString: process.env.POSTGRES_PRISMA_URL,
      ssl: { rejectUnauthorized: false }
    };
  }

  if (process.env.POSTGRES_URL_NON_POOLING) {
    console.log('📦 Using POSTGRES_URL_NON_POOLING');
    return {
      connectionString: process.env.POSTGRES_URL_NON_POOLING,
      ssl: { rejectUnauthorized: false }
    };
  }

  if (process.env.POSTGRES_URL) {
    console.log('📦 Using POSTGRES_URL');
    return {
      connectionString: process.env.POSTGRES_URL,
      ssl: { rejectUnauthorized: false }
    };
  }

  if (process.env.DATABASE_URL) {
    console.log('📦 Using DATABASE_URL');
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    };
  }

  // Локальные переменные
  if (process.env.DB_HOST && process.env.DB_USER) {
    console.log('📦 Using local DB config');
    return {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'postgres',
      ssl: process.env.DB_HOST?.includes('supabase') ? { rejectUnauthorized: false } : false
    };
  }

  console.error('❌ No database configuration found');
  return null;
}

const dbConfig = getDatabaseConfig();

const db = knex({
  client: 'pg',
  connection: dbConfig || {},
  pool: {
    min: 2,
    max: 10,
    afterCreate: (conn, done) => {
      console.log('✅ New DB connection created');
      done(null, conn);
    }
  }
});

module.exports = db;