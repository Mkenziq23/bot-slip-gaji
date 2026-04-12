import express from "express";
import bcrypt from "bcrypt";
import path from "path";
import db from "../db.js";

const router = express.Router();

/*
=========================================
AUTH MIDDLEWARE
=========================================
*/

function requireAdmin(req, res, next) {
  if (!req.session.admin) return res.redirect("/login");
  next();
}

function requireKaryawan(req, res, next) {
  if (!req.session.karyawan) return res.redirect("/login");
  next();
}

/*
=========================================
LOGIN PAGE
=========================================
*/

router.get("/login", (req, res) => {
  if (req.session.admin) return res.redirect("/manage-users");
  if (req.session.karyawan) return res.redirect("/karyawan-profile");
  if (req.session.number) return res.redirect("/dashboard");
  res.sendFile(path.join(process.cwd(), "public/login.html"));
});

/*
=========================================
POST LOGIN HANDLER
=========================================
*/

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.json({
      success: false,
      message: "Username dan password wajib diisi",
    });

  /*
  =====================
  LOGIN ADMIN
  =====================
  */

  const [admins] = await db.query("SELECT * FROM admins WHERE username=? OR email=?", [username, username]);

  if (admins.length) {
    const admin = admins[0];
    const match = await bcrypt.compare(password, admin.password);

    if (match) {
      req.session.admin = {
        id: admin.id,
        username: admin.username,
        role: admin.role,
      };
      return req.session.save(() =>
        res.json({
          success: true,
          redirect: "/manage-users",
        }),
      );
    }
  }

  /*
  =====================
  LOGIN KARYAWAN HISANA
  =====================
  */

  let [rows] = await db.query(
    `SELECT 
      k.*,
      'hisana' as company,
      l.nama_store,
      l.alamat as store_alamat
    FROM data_karyawan_hisana k
    LEFT JOIN lokasi_store_hisana l ON k.lokasi_store_id = l.id
    WHERE k.no_induk=? OR k.email=?`,
    [username, username],
  );

  // Jika tidak ditemukan di Hisana, coba di Enakko
  if (!rows.length) {
    [rows] = await db.query(
      `SELECT 
        k.*,
        'enakko' as company,
        l.nama_store,
        l.alamat as store_alamat
      FROM data_karyawan_enakko k
      LEFT JOIN lokasi_store_enakko l ON k.lokasi_store_id = l.id
      WHERE k.no_induk=? OR k.email=?`,
      [username, username],
    );
  }

  if (rows.length) {
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match)
      return res.json({
        success: false,
        message: "Login gagal",
      });

    // SIMPAN SEMUA DATA KARYAWAN DI SESSION
    req.session.karyawan = {
      id: user.id,
      user_id: user.user_id, // Penting untuk filter data
      no_induk: user.no_induk,
      nama_lengkap: user.nama_lengkap,
      jabatan: user.jabatan,
      company: user.company,
      nama_gerai: user.nama_store,
      awal_masuk: user.awal_masuk,
      no_hp: user.no_hp,
      email: user.email,
      lokasi_store_id: user.lokasi_store_id,
    };

    console.log("[LOGIN] Karyawan login:", {
      id: user.id,
      user_id: user.user_id,
      no_induk: user.no_induk,
      nama: user.nama_lengkap,
      company: user.company,
    });

    return req.session.save(() =>
      res.json({
        success: true,
        redirect: "/karyawan-profile",
      }),
    );
  }

  /*
  =====================
  LOGIN GAGAL
  =====================
  */

  res.json({
    success: false,
    message: "Login gagal",
  });
});

/*
=========================================
PROFILE PAGE
=========================================
*/

router.get("/karyawan-profile", requireKaryawan, (req, res) => {
  console.log("[PROFILE PAGE] Session karyawan:", req.session.karyawan);
  res.sendFile(path.join(process.cwd(), "public/karyawan-profile.html"));
});

/*
=========================================
LOGOUT
=========================================
*/

router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/login");
  });
});

export default router;
