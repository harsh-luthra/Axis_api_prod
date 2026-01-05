const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'AxisVPS2026!Root123',  // From earlier setup
  database: 'axis_payouts',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

// Test on startup
pool.getConnection().then(conn => {
  console.log('✅ MySQL Connected');
  conn.release();
}).catch(err => console.error('❌ MySQL Error:', err));

module.exports = pool;
