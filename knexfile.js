cat > knexfile.js << 'EOF'
require('dotenv').config();

module.exports = {
  development: {
    client: 'pg',
    connection: {
      host: 'aws-1-us-east-1.pooler.supabase.com',
      port: 6543,
      user: 'postgres.ybnlzxhnakdzkcqibebn',
      password: 'T0hN5SQ&f6V9',
      database: 'postgres',
      ssl: { rejectUnauthorized: false }
    }
  },
  production: {
    client: 'pg',
    connection: {
      host: 'aws-1-us-east-1.pooler.supabase.com',
      port: 6543,
      user: 'postgres.ybnlzxhnakdzkcqibebn',
      password: 'T0hN5SQ&f6V9',
      database: 'postgres',
      ssl: { rejectUnauthorized: false }
    }
  }
};