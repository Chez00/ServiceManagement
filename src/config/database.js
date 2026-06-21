const knex = require('knex');

const db = knex({
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ServiceManagement',
    charset: 'utf8mb4'
  },
  pool: {
    min: 2,
    max: 10,
    afterCreate: (conn, done) => {
      conn.query("SET SESSION sql_mode=(SELECT REPLACE(@@sql_mode, 'ONLY_FULL_GROUP_BY', ''))", (err) => {
        if (err) {
          console.error('Failed to set SQL mode:', err);
        }
        conn.query('SET NAMES utf8mb4', (err) => {
          done(err, conn);
        });
      });
    }
  }
});

db.raw('SELECT 1')
  .then(() => {
    console.log('Подключение к базе данных успешно установлено!');
  })
  .catch((err) => {
    console.error('Не получилось подключиться к базе данных:', err.message);
  });

module.exports = db;