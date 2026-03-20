import mysql from "mysql2/promise";

const db = await mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "bot_slip_gaji",
});

export default db;
