// server/db.js
import mysql from "mysql2/promise";

const db = mysql.createPool({
  host: "mysql.railway.internal",    // host Railway
  user: "root",                        // user MySQL
  password: "QBsUUcvThzIJMJYBHQQirjfZTslGhOjh", // password MySQL
  database: "railway",                 // nama database
  port: 3306,                          // default port MySQL
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: true           // SSL agar koneksi aman
  }
});

export default db;
