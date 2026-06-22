require('dotenv').config();

module.exports = {
  development: {
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
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations'
    },
    seeds: {
      directory: './seeds'
    }
  },
  production: {
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
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations'
    },
    seeds: {
      directory: './seeds'
    }
  }
};