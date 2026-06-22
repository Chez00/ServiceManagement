const knex = require('knex');

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'aws-1-us-east-1.pooler.supabase.com',
    port: parseInt(process.env.DB_PORT) || 6543,
    user: process.env.DB_USER || 'postgres.ybnlzxhnakdzkcqibebn',
    password: process.env.DB_PASSWORD || 'T0hN5SQ&f6V9',
    database: process.env.DB_NAME || 'postgres',
    ssl: { rejectUnauthorized: false }
  },
  pool: {
    min: 1,
    max: 5
  }
});

module.exports = db;