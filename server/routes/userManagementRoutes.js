import express from "express";
import db from "../db.js";

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
 * GET USERS
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
 * CREATE USER
 * =========================
 */
router.post("/api/users", requireAdmin, async (req, res) => {
  try {
    const { nama, nomor_wa } = req.body;

    if (!nama || !nomor_wa) return res.status(400).json({ error: "Data tidak lengkap" });

    await db.query("INSERT INTO users (nama, nomor_wa) VALUES (?, ?)", [nama, nomor_wa]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Create user gagal" });
  }
});

/**
 * =========================
 * UPDATE USER
 * =========================
 */
router.put("/api/users/:id", requireAdmin, async (req, res) => {
  try {
    const { nama, nomor_wa } = req.body;

    await db.query("UPDATE users SET nama=?, nomor_wa=? WHERE id=?", [nama, nomor_wa, req.params.id]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Update user gagal" });
  }
});

/**
 * =========================
 * DELETE USER
 * SUPERADMIN ONLY
 * =========================
 */
router.delete("/api/users/:id", requireSuperAdmin, async (req, res) => {
  try {
    await db.query("DELETE FROM users WHERE id=?", [req.params.id]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Delete user gagal" });
  }
});

export default router;
