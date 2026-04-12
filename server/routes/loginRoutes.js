import express from "express";
import bcrypt from "bcrypt";
import path from "path";
import db from "../db.js";

const router = express.Router();

function getLokasiStoreTableName(company) {
  return company === "hisana" ? "lokasi_store_hisana" : "lokasi_store_enakko";
}

// ============================================================
// ROUTE ROOT (/) - SELALU REDIRECT KE LOGIN
// ============================================================
router.get("/", (req, res) => {
  console.log("[ROUTE /] Redirecting to /login");
  res.redirect("/login");
});

// ============================================================
// ROUTE LOGIN (GET /login)
// ============================================================
router.get("/login", (req, res) => {
  console.log("[ROUTE /login] Session check - admin:", !!req.session.admin, "karyawan:", !!req.session.karyawan, "qr:", !!req.session.number);

  if (req.session.admin) {
    return res.redirect(req.session.admin.role === "superadmin" ? "/manage-users" : "/manage-users");
  }
  if (req.session.karyawan) {
    return res.redirect("/karyawan-profile");
  }
  if (req.session.number) {
    return res.redirect("/dashboard");
  }
  res.sendFile(path.join(process.cwd(), "public/login.html"));
});

// ============================================================
// PROSES LOGIN (POST /login)
// ============================================================
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.json({ success: false, message: "Username/Email dan password harus diisi" });
  }

  // Cek Admin
  const [adminRows] = await db.query("SELECT * FROM admins WHERE username = ? OR email = ?", [username, username]);
  if (adminRows.length > 0) {
    const admin = adminRows[0];
    const match = await bcrypt.compare(password, admin.password);
    if (match) {
      req.session.admin = { id: admin.id, username: admin.username, email: admin.email, role: admin.role };
      req.session.save(() => res.json({ success: true, type: "admin", role: admin.role, redirect: "/manage-users" }));
      return;
    }
  }

  // Cek Karyawan Hisana
  let [karyawanRows] = await db.query(
    `SELECT id, user_id, no_induk, nama_lengkap, email, password, jabatan, lokasi_store_id, 'hisana' as company 
     FROM data_karyawan_hisana WHERE no_induk = ? OR email = ?`,
    [username, username],
  );

  // Cek Karyawan Enakko jika tidak ditemukan
  if (karyawanRows.length === 0) {
    [karyawanRows] = await db.query(
      `SELECT id, user_id, no_induk, nama_lengkap, email, password, jabatan, lokasi_store_id, 'enakko' as company 
       FROM data_karyawan_enakko WHERE no_induk = ? OR email = ?`,
      [username, username],
    );
  }

  if (karyawanRows.length > 0) {
    const karyawan = karyawanRows[0];
    if (!karyawan.password) {
      return res.json({ success: false, message: "Akun belum memiliki password. Silakan hubungi admin." });
    }
    const match = await bcrypt.compare(password, karyawan.password);
    if (match) {
      let namaStore = null,
        alamatStore = null;
      if (karyawan.lokasi_store_id) {
        const lokasiTable = getLokasiStoreTableName(karyawan.company);
        const [lokasiRows] = await db.query(`SELECT nama_store, alamat FROM ${lokasiTable} WHERE id = ?`, [karyawan.lokasi_store_id]);
        if (lokasiRows.length > 0) {
          namaStore = lokasiRows[0].nama_store;
          alamatStore = lokasiRows[0].alamat;
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
        if (err) return res.json({ success: false, message: "Gagal menyimpan session" });
        res.json({ success: true, type: "karyawan", nama: karyawan.nama_lengkap, redirect: "/karyawan-profile" });
      });
      return;
    }
  }

  res.json({ success: false, message: "No Induk/Email atau password salah" });
});

// ============================================================
// HALAMAN KARYAWAN PROFILE
// ============================================================
router.get("/karyawan-profile", (req, res) => {
  if (!req.session.karyawan) return res.redirect("/login");
  res.sendFile(path.join(process.cwd(), "public/karyawan-profile.html"));
});

// ============================================================
// LOGOUT
// ============================================================
router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("Logout error:", err);
    res.clearCookie("connect.sid", { path: "/" });
    res.redirect("/login");
  });
});

router.get("/admin-logout", (req, res) => res.redirect("/logout"));
router.get("/karyawan-logout", (req, res) => res.redirect("/logout"));

export default router;
