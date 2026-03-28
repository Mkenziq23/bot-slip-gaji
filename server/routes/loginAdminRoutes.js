import express from "express";
import bcrypt from "bcrypt";
import path from "path";
import db from "../db.js";

const router = express.Router();

/**
 * Middleware cek login admin
 */
function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.redirect("/admin-login");
  }
  next();
}

/**
 * Middleware cek superadmin
 */
function requireSuperAdmin(req, res, next) {
  if (!req.session.admin || req.session.admin.role !== "superadmin") {
    return res.redirect("/admin-login");
  }
  next();
}

/**
 * ==========================
 * Halaman Login Admin
 * ==========================
 */
router.get("/admin-login", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public/admin-login.html"));
});

/**
 * ==========================
 * Proses Login
 * ==========================
 */
router.post("/admin-login", async (req, res) => {
  const { username, password } = req.body;

  const [rows] = await db.query("SELECT * FROM admins WHERE username=?", [username]);

  if (!rows.length) {
    return res.json({ success: false });
  }

  const admin = rows[0];

  const match = await bcrypt.compare(password, admin.password);

  if (!match) {
    return res.json({ success: false });
  }

  req.session.admin = {
    id: admin.id,
    username: admin.username,
    role: admin.role,
  };

  req.session.save(() =>
    res.json({
      success: true,
      role: admin.role,
    }),
  );
});

/**
 * ==========================
 * Manage Users Page
 * ==========================
 */
router.get("/manage-users", requireAdmin, async (req, res) => {
  res.sendFile(path.join(process.cwd(), "public/manage-users.html"));
});
router.get("/manage-users", requireSuperAdmin, async (req, res) => {
  res.sendFile(path.join(process.cwd(), "public/manage-users.html"));
});

/**
 * ==========================
 * API Get Users
 * ==========================
 */
router.get("/api/users", requireAdmin, async (req, res) => {
  const [rows] = await db.query("SELECT * FROM users");
  res.json(rows);
});

router.get("/api/admin/me", (req, res) => {
  if (!req.session.admin) {
    return res.json({
      loggedIn: false,
    });
  }

  res.json({
    loggedIn: true,
    role: req.session.admin.role,
  });
});
/**
 * ==========================
 * Logout Admin
 * ==========================
 */
router.get("/admin-logout", (req, res) => {
  req.session.admin = null;
  res.redirect("/admin-login");
});

export default router;
