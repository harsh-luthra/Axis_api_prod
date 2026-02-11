const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'AxisVPS2026!Root123',
  database: process.env.DB_NAME || 'axis_payouts',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONN_LIMIT || '10', 10),
  queueLimit: 0,
  charset: 'utf8mb4'
});

// Test on startup (minimal info only)
pool.getConnection().then(conn => {
  console.log('✅ MySQL Connected');
  conn.release();
}).catch(err => console.error('❌ MySQL Connection Error:', err.message));

module.exports = pool;
