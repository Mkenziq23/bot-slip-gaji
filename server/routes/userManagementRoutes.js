import express from "express";
import db from "../db.js";
import bcrypt from "bcrypt";

const router = express.Router();

/**
 * Middleware cek login admin
 */
function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  next();
}

/**
 * Middleware khusus superadmin
 */
function requireSuperAdmin(req, res, next) {
  if (!req.session.admin || req.session.admin.role !== "superadmin") {
    return res.status(403).json({ error: "Superadmin only" });
  }
  next();
}

/**
 * =========================
 * GET CURRENT ADMIN INFO
 * =========================
 */
router.get("/api/admin/me", requireAdmin, async (req, res) => {
  try {
    res.json({
      loggedIn: true,
      id: req.session.admin.id,
      username: req.session.admin.username,
      role: req.session.admin.role,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get admin info" });
  }
});

/**
 * =========================
 * GET USERS (Data karyawan)
 * =========================
 */
router.get("/api/users", requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id, nama, nomor_wa, created_at FROM users ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed load users" });
  }
});

/**
 * =========================
 * CREATE USER (Data karyawan)
 * =========================
 */
router.post("/api/users", requireAdmin, async (req, res) => {
  try {
    const { nama, nomor_wa } = req.body;

    if (!nama || !nomor_wa) {
      return res.status(400).json({ error: "Data tidak lengkap" });
    }

    await db.query("INSERT INTO users (nama, nomor_wa) VALUES (?, ?)", [nama, nomor_wa]);

    res.json({ success: true, message: "User berhasil ditambahkan" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Create user gagal" });
  }
});

/**
 * =========================
 * UPDATE USER (Data karyawan)
 * =========================
 */
router.put("/api/users/:id", requireAdmin, async (req, res) => {
  try {
    const { nama, nomor_wa } = req.body;
    const userId = req.params.id;

    if (!nama || !nomor_wa) {
      return res.status(400).json({ error: "Data tidak lengkap" });
    }

    await db.query("UPDATE users SET nama=?, nomor_wa=? WHERE id=?", [nama, nomor_wa, userId]);

    res.json({ success: true, message: "User berhasil diupdate" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Update user gagal" });
  }
});

/**
 * =========================
 * DELETE USER (Data karyawan)
 * SUPERADMIN ONLY
 * =========================
 */
router.delete("/api/users/:id", requireSuperAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    await db.query("DELETE FROM users WHERE id=?", [userId]);

    res.json({ success: true, message: "User berhasil dihapus" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Delete user gagal" });
  }
});

/**
 * =========================
 * GET ALL ADMINS (Superadmin only)
 * Menggunakan tabel 'admins'
 * =========================
 */
router.get("/api/admins", requireSuperAdmin, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id, username, password, role, created_at FROM admins ORDER BY id DESC");
    // Hapus password dari response untuk keamanan
    const safeRows = rows.map((row) => {
      const { password, ...safeRow } = row;
      return safeRow;
    });
    res.json(safeRows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load admins" });
  }
});

/**
 * =========================
 * CREATE NEW ADMIN (Superadmin only)
 * Menggunakan tabel 'admins'
 * =========================
 */
router.post("/api/admins", requireSuperAdmin, async (req, res) => {
  try {
    const { username, password, role = "admin" } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username dan password wajib diisi" });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: "Username minimal 3 karakter" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password minimal 6 karakter" });
    }

    if (!["admin", "superadmin"].includes(role)) {
      return res.status(400).json({ error: "Role tidak valid" });
    }

    // Cek username sudah ada
    const [existing] = await db.query("SELECT id FROM admins WHERE username = ?", [username]);
    if (existing.length > 0) {
      return res.status(400).json({ error: "Username sudah digunakan" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    await db.query("INSERT INTO admins (username, password, role) VALUES (?, ?, ?)", [username, hashedPassword, role]);

    res.json({ success: true, message: "Admin berhasil ditambahkan" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menambahkan admin" });
  }
});

/**
 * =========================
 * UPDATE USERNAME (Untuk semua admin - bisa ubah username sendiri)
 * - Admin biasa: hanya bisa ubah username sendiri (dengan verifikasi password)
 * - Superadmin: bisa ubah username sendiri dan username admin lain (tanpa verifikasi untuk admin lain)
 * =========================
 */
router.put("/api/admins/:id/username", requireAdmin, async (req, res) => {
  try {
    const { username, currentPassword } = req.body;
    const targetAdminId = parseInt(req.params.id);
    const currentAdminId = req.session.admin.id;
    const currentAdminRole = req.session.admin.role;

    if (!username) {
      return res.status(400).json({ error: "Username wajib diisi" });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: "Username minimal 3 karakter" });
    }

    // Validasi akses
    if (currentAdminRole !== "superadmin" && currentAdminId !== targetAdminId) {
      return res.status(403).json({ error: "Anda hanya bisa mengubah username sendiri" });
    }

    // Cek username sudah digunakan oleh admin lain
    const [existing] = await db.query("SELECT id FROM admins WHERE username = ? AND id != ?", [username, targetAdminId]);

    if (existing.length > 0) {
      return res.status(400).json({ error: "Username sudah digunakan oleh admin lain" });
    }

    // Jika mengubah username sendiri, verifikasi password
    if (currentAdminId === targetAdminId) {
      if (!currentPassword) {
        return res.status(400).json({ error: "Password saat ini wajib diisi untuk verifikasi" });
      }

      const [admins] = await db.query("SELECT password FROM admins WHERE id = ?", [targetAdminId]);
      const isValid = await bcrypt.compare(currentPassword, admins[0].password);

      if (!isValid) {
        return res.status(401).json({ error: "Password saat ini salah" });
      }
    }

    await db.query("UPDATE admins SET username = ? WHERE id = ?", [username, targetAdminId]);

    // Update session jika yang diubah adalah akun sendiri
    if (currentAdminId === targetAdminId) {
      req.session.admin.username = username;
      req.session.save();
    }

    res.json({ success: true, message: "Username berhasil diupdate" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengupdate username" });
  }
});

/**
 * =========================
 * UPDATE ROLE (Superadmin only)
 * Menggunakan tabel 'admins'
 * =========================
 */
router.put("/api/admins/:id/role", requireSuperAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const adminId = req.params.id;

    if (!role || !["admin", "superadmin"].includes(role)) {
      return res.status(400).json({ error: "Role tidak valid" });
    }

    // Cegah mengubah role sendiri menjadi admin (bisa menyebabkan kehilangan akses)
    if (parseInt(adminId) === req.session.admin.id) {
      return res.status(400).json({ error: "Anda tidak dapat mengubah role sendiri" });
    }

    await db.query("UPDATE admins SET role = ? WHERE id = ?", [role, adminId]);

    res.json({ success: true, message: "Role berhasil diupdate" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengupdate role" });
  }
});

/**
 * =========================
 * UPDATE PASSWORD
 * - Semua admin bisa update password sendiri (dengan verifikasi password lama)
 * - Superadmin bisa update password admin lain (tanpa verifikasi password lama)
 * =========================
 */
router.put("/api/admins/:id/password", requireAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const targetAdminId = parseInt(req.params.id);
    const currentAdminId = req.session.admin.id;
    const currentAdminRole = req.session.admin.role;

    if (!newPassword) {
      return res.status(400).json({ error: "Password baru wajib diisi" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password minimal 6 karakter" });
    }

    // Validasi akses
    if (currentAdminRole !== "superadmin" && currentAdminId !== targetAdminId) {
      return res.status(403).json({ error: "Anda hanya bisa mengubah password sendiri" });
    }

    // Ambil data admin yang akan diupdate
    const [admins] = await db.query("SELECT password FROM admins WHERE id = ?", [targetAdminId]);

    if (admins.length === 0) {
      return res.status(404).json({ error: "Admin tidak ditemukan" });
    }

    // Jika mengubah password sendiri, verifikasi password lama
    if (currentAdminId === targetAdminId) {
      if (!currentPassword) {
        return res.status(400).json({ error: "Password saat ini wajib diisi" });
      }

      const isValid = await bcrypt.compare(currentPassword, admins[0].password);
      if (!isValid) {
        return res.status(401).json({ error: "Password saat ini salah" });
      }
    }

    // Hash password baru
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query("UPDATE admins SET password = ? WHERE id = ?", [hashedPassword, targetAdminId]);

    res.json({ success: true, message: "Password berhasil diubah" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengupdate password" });
  }
});

/**
 * =========================
 * DELETE ADMIN (Superadmin only)
 * Menggunakan tabel 'admins'
 * =========================
 */
router.delete("/api/admins/:id", requireSuperAdmin, async (req, res) => {
  try {
    const adminId = req.params.id;

    // Cegah menghapus diri sendiri
    if (parseInt(adminId) === req.session.admin.id) {
      return res.status(400).json({ error: "Anda tidak dapat menghapus akun sendiri" });
    }

    // Cek apakah admin dengan id tersebut ada
    const [admins] = await db.query("SELECT id FROM admins WHERE id = ?", [adminId]);
    if (admins.length === 0) {
      return res.status(404).json({ error: "Admin tidak ditemukan" });
    }

    await db.query("DELETE FROM admins WHERE id = ?", [adminId]);

    res.json({ success: true, message: "Admin berhasil dihapus" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menghapus admin" });
  }
});

export default router;
