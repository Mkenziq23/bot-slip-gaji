import express from "express";
import bcrypt from "bcrypt";
import path from "path";
import db from "../db.js";

const router = express.Router();

/*
=========================================
MIDDLEWARE AUTH CHECK
=========================================
*/

function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.redirect("/login");
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.session.admin || req.session.admin.role !== "superadmin") {
    return res.status(403).json({
      error: "Superadmin only",
    });
  }
  next();
}

function requireKaryawan(req, res, next) {
  if (!req.session.karyawan) {
    return res.redirect("/login");
  }
  next();
}

/*
=========================================
HELPER TABLE LOKASI STORE
=========================================
*/

function getLokasiStoreTableName(company) {
  return company === "hisana" ? "lokasi_store_hisana" : "lokasi_store_enakko";
}

/*
=========================================
LOGIN PAGE ROUTE
=========================================
*/

router.get("/login", (req, res) => {
  if (req.session.admin) {
    return res.redirect("/manage-users");
  }

  if (req.session.karyawan) {
    return res.redirect("/karyawan-profile");
  }

  if (req.session.number) {
    return res.redirect("/dashboard");
  }

  res.sendFile(path.join(process.cwd(), "public/login.html"));
});

/*
=========================================
POST LOGIN HANDLER
=========================================
*/

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({
      success: false,
      message: "Username/Email dan password harus diisi",
    });
  }

  /*
  =========================================
  LOGIN ADMIN
  =========================================
  */

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

      return req.session.save(() =>
        res.json({
          success: true,
          type: "admin",
          role: admin.role,
          redirect: "/manage-users",
        }),
      );
    }
  }

  /*
  =========================================
  LOGIN KARYAWAN HISANA
  =========================================
  */

  let [karyawanRows] = await db.query(
    `
SELECT
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
WHERE no_induk = ? OR email = ?
`,
    [username, username],
  );

  /*
  =========================================
  LOGIN KARYAWAN ENAKKO
  =========================================
  */

  if (karyawanRows.length === 0) {
    [karyawanRows] = await db.query(
      `
SELECT
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
WHERE no_induk = ? OR email = ?
`,
      [username, username],
    );
  }

  /*
  =========================================
  VALIDASI PASSWORD KARYAWAN
  =========================================
  */

  if (karyawanRows.length > 0) {
    const karyawan = karyawanRows[0];

    if (!karyawan.password) {
      return res.json({
        success: false,
        message: "Akun belum memiliki password. Hubungi admin.",
      });
    }

    const match = await bcrypt.compare(password, karyawan.password);

    if (!match) {
      return res.json({
        success: false,
        message: "No Induk/Email atau password salah",
      });
    }

    /*
    =========================================
    AMBIL DATA LOKASI STORE
    =========================================
    */

    let namaStore = null;
    let alamatStore = null;

    if (karyawan.lokasi_store_id) {
      try {
        const lokasiTable = getLokasiStoreTableName(karyawan.company);

        const [lokasiRows] = await db.query(
          `
SELECT nama_store, alamat
FROM ${lokasiTable}
WHERE id = ?
`,
          [karyawan.lokasi_store_id],
        );

        if (lokasiRows.length > 0) {
          namaStore = lokasiRows[0].nama_store;
          alamatStore = lokasiRows[0].alamat;
        }
      } catch (err) {
        console.error("Error fetching lokasi store:", err);
      }
    }

    /*
    =========================================
    SAVE SESSION
    =========================================
    */

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

    return req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);

        return res.json({
          success: false,
          message: "Gagal menyimpan session",
        });
      }

      res.json({
        success: true,
        type: "karyawan",
        nama: karyawan.nama_lengkap,
        redirect: "/karyawan-profile",
      });
    });
  }

  /*
  =========================================
  LOGIN GAGAL
  =========================================
  */

  res.json({
    success: false,
    message: "No Induk/Email atau password salah",
  });
});

/*
=========================================
HALAMAN PROFILE KARYAWAN
=========================================
*/

router.get("/karyawan-profile", requireKaryawan, (req, res) => {
  res.sendFile(path.join(process.cwd(), "public/karyawan-profile.html"));
});

/*
=========================================
UNIFIED LOGOUT
=========================================
*/

router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/login");
  });
});

/*
=========================================
LEGACY SUPPORT ROUTES
=========================================
*/

router.get("/admin-logout", (req, res) => {
  res.redirect("/logout");
});

router.get("/karyawan-logout", (req, res) => {
  res.redirect("/logout");
});

export default router;
