import express from "express";
import bcrypt from "bcrypt";
import path from "path";
import db from "../db.js";

const router = express.Router();

/**
 * Middleware cek login admin (semua role admin)
 */
function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.redirect("/login");
  }
  next();
}

/**
 * Middleware cek superadmin
 */
function requireSuperAdmin(req, res, next) {
  if (!req.session.admin || req.session.admin.role !== "superadmin") {
    return res.status(403).json({ error: "Superadmin only" });
  }
  next();
}

/**
 * Middleware cek login karyawan
 */
function requireKaryawan(req, res, next) {
  if (!req.session.karyawan) {
    return res.redirect("/login");
  }
  next();
}

/**
 * ==========================
 * Halaman Login (terpadu)
 * ==========================
 */
router.get("/login", (req, res) => {
  // Redirect jika sudah login
  if (req.session.admin) {
    return res.redirect(req.session.admin.role === "superadmin" ? "/manage-users" : "/manage-users");
  }
  if (req.session.karyawan) {
    return res.redirect("/karyawan-profile");
  }
  // Jika login via QR, redirect ke scan
  if (req.session.number) {
    return res.redirect("/dashboard");
  }
  res.sendFile(path.join(process.cwd(), "public/login.html"));
});

/**
 * ==========================
 * Proses Login Terpadu
 * ==========================
 */
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({ success: false, message: "Username/Email dan password harus diisi" });
  }

  // Coba login sebagai Admin dulu
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

      req.session.save(() =>
        res.json({
          success: true,
          type: "admin",
          role: admin.role,
          redirect: admin.role === "superadmin" ? "/manage-users" : "/manage-users",
        }),
      );
      return;
    }
  }

  // Jika bukan admin, coba login sebagai Karyawan
  let [karyawanRows] = await db.query("SELECT *, 'hisana' as company FROM data_karyawan_hisana WHERE no_induk = ? OR email = ?", [username, username]);

  if (karyawanRows.length === 0) {
    [karyawanRows] = await db.query("SELECT *, 'enakko' as company FROM data_karyawan_enakko WHERE no_induk = ? OR email = ?", [username, username]);
  }

  if (karyawanRows.length > 0) {
    const karyawan = karyawanRows[0];

    if (!karyawan.password) {
      return res.json({
        success: false,
        message: "Akun belum memiliki password. Silakan hubungi admin untuk mengatur password.",
      });
    }

    const match = await bcrypt.compare(password, karyawan.password);

    if (match) {
      req.session.karyawan = {
        id: karyawan.id,
        user_id: karyawan.user_id,
        no_induk: karyawan.no_induk,
        nama_lengkap: karyawan.nama_lengkap,
        email: karyawan.email,
        jabatan: karyawan.jabatan,
        cabang: karyawan.cabang,
        nama_gerai: karyawan.nama_gerai,
        company: karyawan.company,
      };

      req.session.save(() =>
        res.json({
          success: true,
          type: "karyawan",
          nama: karyawan.nama_lengkap,
          redirect: "/karyawan-profile",
        }),
      );
      return;
    }
  }

  res.json({
    success: false,
    message: "Username/Email/No Induk atau password salah",
  });
});

/**
 * ==========================
 * Halaman Karyawan Profile
 * ==========================
 */
router.get("/karyawan-profile", requireKaryawan, async (req, res) => {
  res.sendFile(path.join(process.cwd(), "public/karyawan-profile.html"));
});

/**
 * ==========================
 * Get Data Karyawan untuk Profile
 * ==========================
 */
router.get("/api/karyawan/profile", requireKaryawan, async (req, res) => {
  const karyawan = req.session.karyawan;
  const company = karyawan.company;
  const tableName = company === "hisana" ? "data_karyawan_hisana" : "data_karyawan_enakko";

  try {
    const [rows] = await db.query(`SELECT * FROM ${tableName} WHERE id = ?`, [karyawan.id]);

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    }

    const profileData = { ...rows[0] };
    delete profileData.password;

    const slipTable = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";
    const [slipRows] = await db.query(`SELECT * FROM ${slipTable} WHERE no_induk = ? ORDER BY tanggal DESC LIMIT 12`, [karyawan.no_induk]);

    const bonusTable = company === "hisana" ? "bonus_hisana" : "bonus_enakko";
    const [bonusRows] = await db.query(`SELECT * FROM ${bonusTable} WHERE no_induk = ? ORDER BY tanggal DESC LIMIT 12`, [karyawan.no_induk]);

    const thrTable = company === "hisana" ? "thr_hisana" : "thr_enakko";
    const [thrRows] = await db.query(`SELECT * FROM ${thrTable} WHERE no_induk = ? ORDER BY tanggal DESC LIMIT 12`, [karyawan.no_induk]);

    res.json({
      success: true,
      profile: profileData,
      slip_gaji: slipRows,
      bonus: bonusRows,
      thr: thrRows,
    });
  } catch (err) {
    console.error("Error fetching karyawan profile:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * ==========================
 * Logout (Unified)
 * ==========================
 */
router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
    }
    res.clearCookie("connect.sid");
    res.redirect("/login");
  });
});

/**
 * ==========================
 * Admin Logout (Legacy - redirect to unified logout)
 * ==========================
 */
router.get("/admin-logout", (req, res) => {
  res.redirect("/logout");
});

/**
 * ==========================
 * Karyawan Logout (Legacy - redirect to unified logout)
 * ==========================
 */
router.get("/karyawan-logout", (req, res) => {
  res.redirect("/logout");
});

export default router;
