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

// Deteksi environment Railway atau production
const isProduction = process.env.RAILWAY_ENVIRONMENT === "production" || process.env.NODE_ENV === "production" || process.env.MYSQLHOST;

console.log(`🔧 Running in ${isProduction ? "PRODUCTION" : "DEVELOPMENT"} mode`);

// Pilih konfigurasi
const activeConfig = isProduction ? productionConfig : localConfig;

// Validasi untuk production
if (isProduction && (!activeConfig.host || !activeConfig.user || !activeConfig.password || !activeConfig.database)) {
  console.error("❌ Missing database environment variables!");
  console.log("Required: MYSQLHOST, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE");
}

let db = null;

try {
  db = await mysql.createPool(activeConfig);
  const connection = await db.getConnection();
  console.log(`✅ Database connected successfully to ${isProduction ? "Railway" : "Local"}`);
  connection.release();
} catch (err) {
  console.error("❌ Database connection failed:", err.message);
  console.log("⚠️ Continuing without database - some features may not work");
  // Buat pool dummy agar app tidak crash
  db = await mysql.createPool({
    host: "localhost",
    user: "root",
    password: "",
    database: "dummy",
    connectionLimit: 1,
  });
}

export default db;
