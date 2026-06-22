const knex = require('knex');
require('dotenv').config();

// Парсим DATABASE_URL для извлечения параметров
const url = new URL(process.env.DATABASE_URL);

console.log('🔍 Подключение к Supabase PostgreSQL...');
console.log('Host:', url.hostname);
console.log('Database:', url.pathname.slice(1));

const db = knex({
  client: 'pg',
  connection: {
    host: url.hostname,
    port: url.port || 5432,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1), // Убираем первый слеш
    ssl: {
      rejectUnauthorized: false
    }
  },
  pool: {
    min: 2,
    max: 10,
    afterCreate: (conn, done) => {
      console.log('✅ Соединение с БД установлено');
      done(null, conn);
    }
  }
});

// Проверка подключения
db.raw('SELECT 1')
  .then(() => {
    console.log('✅ Подключение к базе данных успешно установлено!');
  })
  .catch((err) => {
    console.error('❌ Не получилось подключиться к базе данных:', err.message);
  });

module.exports = db;