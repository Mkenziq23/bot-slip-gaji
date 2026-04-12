import express from "express";
import bcrypt from "bcrypt";
import path from "path";
import db from "../db.js";

const router = express.Router();

function getLokasiStoreTableName(company) {
  return company === "hisana" ? "lokasi_store_hisana" : "lokasi_store_enakko";
}

/**
 * PROSES LOGIN (POST)
 */
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  console.log(`[LOGIN] Attempt for username: ${username}`);

  if (!username || !password) {
    return res.json({ success: false, message: "Username/Email dan password harus diisi" });
  }

  // Coba login sebagai Admin
  const [adminRows] = await db.query("SELECT * FROM admins WHERE username = ? OR email = ?", [username, username]);

  if (adminRows.length > 0) {
    const admin = adminRows[0];
    const match = await bcrypt.compare(password, admin.password);

    if (match) {
      req.session.admin = {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
      };

      req.session.save((err) => {
        if (err) {
          console.error("[LOGIN] Session save error:", err);
          return res.json({ success: false, message: "Gagal menyimpan session" });
        }
        console.log(`[LOGIN] Admin login success: ${admin.username}`);
        res.json({
          success: true,
          type: "admin",
          role: admin.role,
          redirect: "/manage-users",
        });
      });
      return;
    }
  }

  // Coba login sebagai Karyawan Hisana
  let [karyawanRows] = await db.query(
    `SELECT 
      id, 
      user_id, 
      no_induk, 
      nama_lengkap, 
      email, 
      password, 
      jabatan, 
      lokasi_store_id,
      'hisana' as company 
    FROM data_karyawan_hisana 
    WHERE no_induk = ? OR email = ?`,
    [username, username],
  );

  // Jika tidak ditemukan, coba Enakko
  if (karyawanRows.length === 0) {
    [karyawanRows] = await db.query(
      `SELECT 
        id, 
        user_id, 
        no_induk, 
        nama_lengkap, 
        email, 
        password, 
        jabatan, 
        lokasi_store_id,
        'enakko' as company 
      FROM data_karyawan_enakko 
      WHERE no_induk = ? OR email = ?`,
      [username, username],
    );
  }

  if (karyawanRows.length > 0) {
    const karyawan = karyawanRows[0];

    if (!karyawan.password) {
      return res.json({
        success: false,
        message: "Akun belum memiliki password. Silakan hubungi admin.",
      });
    }

    const match = await bcrypt.compare(password, karyawan.password);

    if (match) {
      let namaStore = null;
      let alamatStore = null;

      if (karyawan.lokasi_store_id) {
        const lokasiTable = getLokasiStoreTableName(karyawan.company);
        try {
          const [lokasiRows] = await db.query(`SELECT nama_store, alamat FROM ${lokasiTable} WHERE id = ?`, [karyawan.lokasi_store_id]);
          if (lokasiRows.length > 0) {
            namaStore = lokasiRows[0].nama_store;
            alamatStore = lokasiRows[0].alamat;
          }
        } catch (err) {
          console.error("Error fetching lokasi store:", err);
        }
      }

      req.session.karyawan = {
        id: karyawan.id,
        user_id: karyawan.user_id,
        no_induk: karyawan.no_induk,
        nama_lengkap: karyawan.nama_lengkap,
        email: karyawan.email,
        jabatan: karyawan.jabatan,
        lokasi_store_id: karyawan.lokasi_store_id,
        nama_store: namaStore,
        alamat_store: alamatStore,
        company: karyawan.company,
      };

      req.session.save((err) => {
        if (err) {
          console.error("[LOGIN] Session save error:", err);
          return res.json({ success: false, message: "Gagal menyimpan session" });
        }
        console.log(`[LOGIN] Karyawan login success: ${karyawan.nama_lengkap}`);
        res.json({
          success: true,
          type: "karyawan",
          nama: karyawan.nama_lengkap,
          redirect: "/karyawan-profile",
        });
      });
      return;
    }
  }

  console.log(`[LOGIN] Failed login attempt for: ${username}`);
  res.json({
    success: false,
    message: "No Induk/Email atau password salah",
  });
});

/**
 * HALAMAN LOGIN (GET) - Redirect ke halaman login
 */
router.get("/login", (req, res) => {
  res.redirect("/login");
});

/**
 * LOGOUT
 */
router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("Logout error:", err);
    res.clearCookie("connect.sid");
    res.redirect("/login");
  });
});

export default router;
