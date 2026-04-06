import express from "express";
import path from "path";
import session from "express-session";
import http from "http";
import { WebSocketServer } from "ws";

import dashboardDataRoutes from "./routes/dashboardDataRoutes.js";
import slipRoutes from "./routes/slipGajiRoutes.js";
import loginRoutes from "./routes/loginRoutes.js";
import userManagementRoutes from "./routes/userManagementRoutes.js";
import bonusRoutes from "./routes/slipBonusRoutes.js";
import thrRoutes from "./routes/slipThrRoutes.js";
import dataKaryawanRoutes from "./routes/dataKaryawanRoutes.js";
import karyawanProfileRoutes from "./routes/karyawanProfileRoutes.js";
import lokasiStoreRoutes from "./routes/LokasiStoreRoutes.js";

import { startBot, getSocketByNumber, logoutBot } from "../bot/index.js";

import db from "./db.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ============================
// SESSION CONFIG
// ============================

const sessionMiddleware = session({
  secret: "slipgajiwa",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
  },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

// ============================
// CHECK USER EXISTS ONLY
// ============================

async function getUserIfExists(number) {
  const [rows] = await db.query("SELECT * FROM users WHERE nomor_wa=?", [number]);

  return rows.length ? rows[0] : null;
}

// ============================
// GLOBAL SESSION VALIDATION
// ============================

app.use(async (req, res, next) => {
  if (req.session.number) {
    const user = await getUserIfExists(req.session.number);

    if (!user) {
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
      });
    }
  }

  next();
});

// ============================
// ROUTES
// ============================

app.use("/", dashboardDataRoutes);
app.use("/", slipRoutes);
app.use("/", loginRoutes);
app.use("/", userManagementRoutes);
app.use("/", bonusRoutes);
app.use("/", thrRoutes);
app.use("/", dataKaryawanRoutes);
app.use("/", karyawanProfileRoutes);
app.use("/api/lokasi-store", lokasiStoreRoutes);

// ============================
// QR SCAN PAGE
// ============================

app.get("/", async (req, res) => {
  // Jika sudah login sebagai admin, redirect ke manage-users
  if (req.session.admin) {
    return res.redirect("/manage-users");
  }

  // Jika sudah login sebagai karyawan, redirect ke profile
  if (req.session.karyawan) {
    return res.redirect("/karyawan-profile");
  }

  // Jika sudah login via QR
  if (req.session.number) {
    const user = await getUserIfExists(req.session.number);

    if (!user) {
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        return res.sendFile(path.join(process.cwd(), "public/scan.html"));
      });
      return;
    }

    return res.redirect("/dashboard");
  }

  res.sendFile(path.join(process.cwd(), "public/scan.html"));
});

// ============================
// DASHBOARD (HR via QR)
// ============================
app.get("/dashboard", async (req, res) => {
  // Cek dulu apakah ini admin (harusnya tidak bisa akses dashboard)
  if (req.session.admin) {
    // Admin redirect ke manage-users
    return res.redirect("/manage-users");
  }

  // Cek apakah ini karyawan (harusnya tidak bisa akses dashboard)
  if (req.session.karyawan) {
    return res.redirect("/karyawan-profile");
  }

  // Login via QR - harus ada session number
  if (!req.session.number) {
    return res.redirect("/");
  }

  const user = await getUserIfExists(req.session.number);

  if (!user) {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      return res.redirect("/");
    });
    return;
  }

  const number = req.session.number;

  if (!getSocketByNumber(number)) {
    startBot({ number });
  }

  res.sendFile(path.join(process.cwd(), "public/index.html"));
});

// ============================
// MANAGE USERS PAGE
// ============================
app.get("/manage-users", (req, res) => {
  // blok login via QR
  if (req.session.number) {
    return res.status(403).sendFile(path.join(process.cwd(), "public/404.html"));
  }

  // harus login admin
  if (!req.session.admin) {
    return res.redirect("/login");
  }

  // hanya admin & superadmin boleh
  if (req.session.admin.role !== "admin" && req.session.admin.role !== "superadmin") {
    return res.status(403).sendFile(path.join(process.cwd(), "public/404.html"));
  }

  res.sendFile(path.join(process.cwd(), "public/manage-users.html"));
});

// ============================
// STATIC PUBLIC FILES
// ============================

app.use(express.static(path.join(process.cwd(), "public")));

// ============================
// SAVE NUMBER AFTER QR LOGIN
// ============================

app.post("/set-number", async (req, res) => {
  const { number } = req.body;

  if (!number)
    return res.status(400).json({
      success: false,
    });

  try {
    const user = await getUserIfExists(number);

    if (!user) {
      return res.status(403).json({
        success: false,
        message: "Nomor belum terdaftar. Hubungi admin.",
      });
    }

    req.session.number = number;

    req.session.user_id = user.id;

    req.session.save(() =>
      res.json({
        success: true,
        user_id: user.id,
      }),
    );
  } catch (err) {
    console.error("SET NUMBER ERROR:", err);

    res.status(500).json({
      success: false,
    });
  }
});

// ============================
// OTP STORAGE (DATABASE VERSION)
// ============================

// Cleanup expired OTPs every minute
setInterval(async () => {
  try {
    await db.query("DELETE FROM otp_codes WHERE expires_at < NOW()");
    console.log("[OTP] Cleaned up expired OTPs");
  } catch (err) {
    console.error("[OTP] Cleanup error:", err);
  }
}, 60000);

// Generate random 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Request OTP endpoint
app.post("/request-otp", async (req, res) => {
  const { phoneNumber } = req.body;

  console.log(`[OTP] Request received for ${phoneNumber}`);

  if (!phoneNumber) {
    return res.status(400).json({
      success: false,
      message: "Nomor WhatsApp diperlukan",
    });
  }

  // Validate phone number format
  const phoneRegex = /^62[0-9]{10,13}$/;
  if (!phoneRegex.test(phoneNumber)) {
    return res.status(400).json({
      success: false,
      message: "Format nomor tidak valid. Gunakan format 62xxxxxxxxxxx",
    });
  }

  // Check if user exists in database
  const user = await getUserIfExists(phoneNumber);
  if (!user) {
    return res.status(403).json({
      success: false,
      message: "Nomor WhatsApp tidak terdaftar. Hubungi admin untuk pendaftaran.",
    });
  }

  // Check for existing valid OTP (not expired and not used)
  const [existingOTP] = await db.query(
    `SELECT * FROM otp_codes 
     WHERE nomor_wa = ? 
     AND expires_at > NOW() 
     AND is_used = FALSE 
     ORDER BY created_at DESC 
     LIMIT 1`,
    [phoneNumber],
  );

  if (existingOTP.length > 0) {
    const expiresAt = new Date(existingOTP[0].expires_at);
    const now = new Date();
    const timeLeft = Math.ceil((expiresAt - now) / 1000);

    if (timeLeft > 0 && timeLeft < 300) {
      return res.status(429).json({
        success: false,
        message: `Tunggu ${timeLeft} detik sebelum meminta kode baru`,
      });
    }
  }

  // Generate and store OTP
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  try {
    // Delete old OTPs for this number
    await db.query(`UPDATE otp_codes SET is_used = TRUE WHERE nomor_wa = ? AND is_used = FALSE`, [phoneNumber]);

    // Insert new OTP to database
    await db.query(
      `INSERT INTO otp_codes (nomor_wa, otp_code, attempts, expires_at, is_used) 
       VALUES (?, ?, 0, ?, FALSE)`,
      [phoneNumber, otp, expiresAt],
    );

    console.log(`[OTP] OTP ${otp} stored for ${phoneNumber}`);
    res.json({
      success: true,
      message: `Kode OTP: ${otp} (cek console server untuk kode)`,
      otp: otp, // Kirim OTP ke frontend untuk testing (opsional)
    });
  } catch (error) {
    console.error("[OTP] Database error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan sistem, silakan coba lagi",
    });
  }
});

// Verify OTP endpoint
app.post("/verify-otp", async (req, res) => {
  const { phoneNumber, otpCode } = req.body;

  console.log(`[OTP] Verify request for ${phoneNumber} with code ${otpCode}`);

  if (!phoneNumber || !otpCode) {
    return res.status(400).json({
      success: false,
      message: "Nomor WhatsApp dan kode OTP diperlukan",
    });
  }

  try {
    // Get OTP from database
    const [otpRecords] = await db.query(
      `SELECT * FROM otp_codes 
       WHERE nomor_wa = ? 
       AND otp_code = ? 
       AND is_used = FALSE 
       AND expires_at > NOW()
       ORDER BY created_at DESC 
       LIMIT 1`,
      [phoneNumber, otpCode],
    );

    if (otpRecords.length === 0) {
      // Check if OTP exists but expired or used
      const [expiredOTP] = await db.query(
        `SELECT * FROM otp_codes 
         WHERE nomor_wa = ? 
         AND otp_code = ? 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [phoneNumber, otpCode],
      );

      if (expiredOTP.length > 0) {
        if (expiredOTP[0].is_used) {
          return res.status(400).json({
            success: false,
            message: "Kode OTP sudah digunakan. Silakan minta kode baru.",
          });
        } else if (new Date(expiredOTP[0].expires_at) < new Date()) {
          return res.status(400).json({
            success: false,
            message: "Kode OTP telah kadaluarsa. Silakan minta kode baru.",
          });
        }
      }

      return res.status(400).json({
        success: false,
        message: "Kode OTP tidak valid",
      });
    }

    const otpRecord = otpRecords[0];

    // Check attempts (max 5 attempts)
    if (otpRecord.attempts >= 5) {
      await db.query(`UPDATE otp_codes SET is_used = TRUE WHERE id = ?`, [otpRecord.id]);

      return res.status(400).json({
        success: false,
        message: "Terlalu banyak percobaan gagal. Silakan minta kode baru.",
      });
    }

    // Verify OTP
    if (otpRecord.otp_code !== otpCode) {
      await db.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?`, [otpRecord.id]);

      const remaining = 5 - (otpRecord.attempts + 1);
      return res.status(400).json({
        success: false,
        message: `Kode OTP salah. Sisa percobaan: ${remaining}`,
      });
    }

    // OTP verified successfully - mark as used
    await db.query(`UPDATE otp_codes SET is_used = TRUE WHERE id = ?`, [otpRecord.id]);

    // Check if user exists again
    const user = await getUserIfExists(phoneNumber);
    if (!user) {
      return res.status(403).json({
        success: false,
        message: "Nomor WhatsApp tidak terdaftar",
      });
    }

    console.log(`[OTP] User ${phoneNumber} verified successfully`);

    res.json({
      success: true,
      message: "Verifikasi berhasil",
    });
  } catch (error) {
    console.error("[OTP] Verify error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan sistem, silakan coba lagi",
    });
  }
});

// ============================
// LOGOUT HR
// ============================

app.get("/logout", async (req, res) => {
  const number = req.session.number;

  if (number) await logoutBot(number);

  req.session.destroy(() => {
    res.clearCookie("connect.sid");

    res.redirect("/");
  });
});

// ============================
// WEBSOCKET BOT LOGIN SYSTEM
// ============================

let userSessions = {};

wss.on("connection", async (ws, req) => {
  const tempId = `temp_${Date.now()}`;

  userSessions[tempId] = {
    wsClients: [ws],
    sessionIds: [],
  };

  ws.on("close", () => delete userSessions[tempId]);

  await startBot({
    onQR: (number, qr) => {
      userSessions[tempId]?.wsClients.forEach((client) => {
        if (client.readyState === 1) client.send(JSON.stringify({ qr }));
      });
    },

    onConnected: async (number) => {
      const user = await getUserIfExists(number);

      // BLOK LOGIN JIKA BELUM TERDAFTAR

      if (!user) {
        console.log(`[LOGIN DITOLAK] ${number} belum terdaftar`);

        userSessions[tempId]?.wsClients.forEach((client) => {
          if (client.readyState === 1)
            client.send(
              JSON.stringify({
                status: "not_registered",
              }),
            );
        });

        await logoutBot(number);

        return;
      }

      if (!userSessions[number])
        userSessions[number] = {
          wsClients: [],
          sessionIds: [],
        };

      if (userSessions[tempId]) {
        userSessions[number].wsClients.push(...userSessions[tempId].wsClients);

        delete userSessions[tempId];
      }

      const sessionId = req.headers.cookie?.split("connect.sid=s%3A")[1]?.split(".")[0];

      if (sessionId && !userSessions[number].sessionIds.includes(sessionId)) {
        userSessions[number].sessionIds.push(sessionId);
      }

      userSessions[number].wsClients.forEach((client) => {
        if (client.readyState === 1)
          client.send(
            JSON.stringify({
              status: "connected",

              number,

              user_id: user.id,
            }),
          );
      });
    },

    onLogout: (number) => {
      console.log(`[WS] Force logout: ${number}`);

      if (userSessions[number]) {
        userSessions[number].wsClients.forEach((client) => {
          if (client.readyState === 1)
            client.send(
              JSON.stringify({
                status: "force_logout",
              }),
            );
        });

        userSessions[number].sessionIds.forEach((id) => {
          sessionMiddleware.store.destroy(
            id,

            (err) => {
              if (err) console.error(err);
            },
          );
        });

        delete userSessions[number];
      }
    },
  });
});

// ============================
// CHECK SESSION ROUTE
// ============================

app.get("/api/check-session", (req, res) => {
  if (req.session.admin) {
    return res.json({
      loggedIn: true,
      type: "admin",
      role: req.session.admin.role,
    });
  }

  if (req.session.karyawan) {
    return res.json({
      loggedIn: true,
      type: "karyawan",
      nama: req.session.karyawan.nama_lengkap,
    });
  }

  if (req.session.number) {
    return res.json({
      loggedIn: true,
      type: "qr",
    });
  }

  res.json({ loggedIn: false });
});

// ============================
// START SERVER
// ============================

const PORT = process.env.PORT || 3000;

server.listen(
  PORT,

  () => console.log("Server jalan di port " + PORT),
);
