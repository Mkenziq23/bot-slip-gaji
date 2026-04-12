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

// Helper function untuk mendapatkan nama tabel lokasi store
function getLokasiStoreTableName(company) {
  return company === "hisana" ? "lokasi_store_hisana" : "lokasi_store_enakko";
}

/**
 * ==========================
 * Halaman Root (GET /) - SELALU Redirect ke /login
 * ==========================
 */
router.get("/", (req, res) => {
  // Selalu redirect ke halaman login
  // User harus akses /scan untuk login via QR
  res.redirect("/login");
});

/**
 * ==========================
 * Halaman Login (GET /login)
 * ==========================
 */
router.get("/login", (req, res) => {
  // Jika sudah login sebagai admin
  if (req.session.admin) {
    return res.redirect(req.session.admin.role === "superadmin" ? "/manage-users" : "/manage-users");
  }
  // Jika sudah login sebagai karyawan
  if (req.session.karyawan) {
    return res.redirect("/karyawan-profile");
  }
  // Jika sudah login via QR
  if (req.session.number) {
    return res.redirect("/dashboard");
  }
  // Tampilkan halaman login
  res.sendFile(path.join(process.cwd(), "public/login.html"));
});

/**
 * ==========================
 * Proses Login Terpadu (POST /login)
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
        message: "Akun belum memiliki password. Silakan hubungi admin untuk mengatur password.",
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
          console.error("Session save error:", err);
          return res.json({ success: false, message: "Gagal menyimpan session" });
        }

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

  res.json({
    success: false,
    message: "No Induk/Email atau password salah",
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
