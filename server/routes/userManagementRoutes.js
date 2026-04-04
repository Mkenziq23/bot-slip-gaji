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
 * Helper function untuk validasi email
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
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
 * GET HR (Data HR)
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
 * CREATE HR (Data HR)
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
 * UPDATE HR (Data HR)
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
 * DELETE HR (Data HR)
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
 * =========================
 */
router.get("/api/admins", requireSuperAdmin, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id, username, email, role, created_at FROM admins ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load admins" });
  }
});

/**
 * =========================
 * CREATE NEW ADMIN (Superadmin only)
 * =========================
 */
router.post("/api/admins", requireSuperAdmin, async (req, res) => {
  try {
    const { username, email, password, role = "admin" } = req.body;

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
    const [existingUsername] = await db.query("SELECT id FROM admins WHERE username = ?", [username]);
    if (existingUsername.length > 0) {
      return res.status(400).json({ error: "Username sudah digunakan" });
    }

    // Cek email sudah ada (jika diisi)
    if (email) {
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: "Format email tidak valid" });
      }
      const [existingEmail] = await db.query("SELECT id FROM admins WHERE email = ?", [email]);
      if (existingEmail.length > 0) {
        return res.status(400).json({ error: "Email sudah digunakan" });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    await db.query("INSERT INTO admins (username, email, password, role) VALUES (?, ?, ?, ?)", [username, email || null, hashedPassword, role]);

    res.json({ success: true, message: "Admin berhasil ditambahkan" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menambahkan admin" });
  }
});

/**
 * =========================
 * UPDATE USERNAME
 * - Superadmin edit akun sendiri: butuh verifikasi password
 * - Superadmin edit akun lain: TIDAK butuh verifikasi password
 * - Admin biasa edit sendiri: butuh verifikasi password
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

    // Verifikasi password hanya jika mengubah username sendiri
    if (currentAdminId === targetAdminId) {
      if (!currentPassword) {
        return res.status(400).json({ error: "Password saat ini wajib diisi untuk verifikasi" });
      }

      const [admins] = await db.query("SELECT password FROM admins WHERE id = ?", [targetAdminId]);
      if (admins.length === 0) {
        return res.status(404).json({ error: "Admin tidak ditemukan" });
      }

      const isValid = await bcrypt.compare(currentPassword, admins[0].password);
      if (!isValid) {
        return res.status(401).json({ error: "Password saat ini salah" });
      }
    }

    await db.query("UPDATE admins SET username = ? WHERE id = ?", [username, targetAdminId]);

    // Update session jika yang diubah adalah akun sendiri
    if (currentAdminId === targetAdminId) {
      req.session.admin.username = username;
      await req.session.save();
    }

    res.json({ success: true, message: "Username berhasil diupdate" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengupdate username" });
  }
});

/**
 * =========================
 * UPDATE EMAIL
 * - Superadmin edit akun sendiri: butuh verifikasi password
 * - Superadmin edit akun lain: TIDAK butuh verifikasi password
 * - Admin biasa edit sendiri: butuh verifikasi password
 * =========================
 */
router.put("/api/admins/:id/email", requireAdmin, async (req, res) => {
  try {
    const { email, currentPassword } = req.body;
    const targetAdminId = parseInt(req.params.id);
    const currentAdminId = req.session.admin.id;
    const currentAdminRole = req.session.admin.role;

    // Validasi akses
    if (currentAdminRole !== "superadmin" && currentAdminId !== targetAdminId) {
      return res.status(403).json({ error: "Anda hanya bisa mengubah email sendiri" });
    }

    // Validasi format email jika diisi
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: "Format email tidak valid" });
    }

    // Cek email sudah digunakan oleh admin lain (jika email tidak null)
    if (email) {
      const [existing] = await db.query("SELECT id FROM admins WHERE email = ? AND id != ?", [email, targetAdminId]);
      if (existing.length > 0) {
        return res.status(400).json({ error: "Email sudah digunakan oleh admin lain" });
      }
    }

    // Verifikasi password hanya jika mengubah email sendiri
    if (currentAdminId === targetAdminId) {
      if (!currentPassword) {
        return res.status(400).json({ error: "Password saat ini wajib diisi untuk verifikasi" });
      }

      const [admins] = await db.query("SELECT password FROM admins WHERE id = ?", [targetAdminId]);
      if (admins.length === 0) {
        return res.status(404).json({ error: "Admin tidak ditemukan" });
      }

      const isValid = await bcrypt.compare(currentPassword, admins[0].password);
      if (!isValid) {
        return res.status(401).json({ error: "Password saat ini salah" });
      }
    }

    await db.query("UPDATE admins SET email = ? WHERE id = ?", [email || null, targetAdminId]);

    // Update session jika yang diubah adalah akun sendiri
    if (currentAdminId === targetAdminId) {
      req.session.admin.email = email;
      await req.session.save();
    }

    res.json({ success: true, message: "Email berhasil diupdate" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengupdate email" });
  }
});

/**
 * =========================
 * UPDATE ROLE (Superadmin only)
 * TIDAK PERLU verifikasi password
 * =========================
 */
router.put("/api/admins/:id/role", requireSuperAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const adminId = parseInt(req.params.id);
    const currentAdminId = req.session.admin.id;

    if (!role || !["admin", "superadmin"].includes(role)) {
      return res.status(400).json({ error: "Role tidak valid" });
    }

    // Cegah mengubah role sendiri
    if (adminId === currentAdminId) {
      return res.status(400).json({ error: "Anda tidak dapat mengubah role sendiri" });
    }

    // Cek apakah admin dengan id tersebut ada
    const [admins] = await db.query("SELECT id FROM admins WHERE id = ?", [adminId]);
    if (admins.length === 0) {
      return res.status(404).json({ error: "Admin tidak ditemukan" });
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
 * - Superadmin edit akun sendiri: butuh verifikasi password lama
 * - Superadmin edit akun lain: TIDAK butuh verifikasi password lama
 * - Admin biasa edit sendiri: butuh verifikasi password lama
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

    // Verifikasi password lama hanya jika mengubah password sendiri
    if (currentAdminId === targetAdminId) {
      if (!currentPassword) {
        return res.status(400).json({ error: "Password saat ini wajib diisi untuk verifikasi" });
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
 * =========================
 */
router.delete("/api/admins/:id", requireSuperAdmin, async (req, res) => {
  try {
    const adminId = parseInt(req.params.id);
    const currentAdminId = req.session.admin.id;

    // Cegah menghapus diri sendiri
    if (adminId === currentAdminId) {
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
