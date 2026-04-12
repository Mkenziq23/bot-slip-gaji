// server/db.js
import mysql from "mysql2/promise";

// Konfigurasi untuk production (Railway)
const productionConfig = {
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: Number(process.env.MYSQLPORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false,
  },
};

// Konfigurasi untuk development (local)
const localConfig = {
  host: "localhost",
  user: "root",
  password: "",
  database: "bot_slip_gaji",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// Pilih konfigurasi berdasarkan environment
const activeConfig = process.env.NODE_ENV === "production" ? productionConfig : localConfig;

const db = await mysql.createPool(activeConfig);

// Test connection
try {
  const connection = await db.getConnection();
  console.log(`✅ Database connected successfully to ${process.env.NODE_ENV === "production" ? "Railway" : "Local"}`);
  connection.release();
} catch (err) {
  console.error("❌ Database connection failed:", err.message);
}

export default db;
