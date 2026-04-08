import express from "express";
import path from "path";
import session from "express-session";
import http from "http";
import { WebSocketServer } from "ws";
import sessionFileStore from "session-file-store";
import fs from "fs";

import dashboardDataRoutes from "./routes/dashboardDataRoutes.js";
import slipRoutes from "./routes/slipGajiRoutes.js";
import loginRoutes from "./routes/loginRoutes.js";
import userManagementRoutes from "./routes/userManagementRoutes.js";
import bonusRoutes from "./routes/slipBonusRoutes.js";
import thrRoutes from "./routes/slipThrRoutes.js";
import dataKaryawanRoutes from "./routes/dataKaryawanRoutes.js";
import karyawanProfileRoutes from "./routes/karyawanProfileRoutes.js";
import absensiKaryawanRoutes from "./routes/absensiKaryawanRoutes.js";
import lokasiStoreRoutes from "./routes/LokasiStoreRoutes.js";

import { startBot, getSocketByNumber, logoutBot, getActiveSessions } from "../bot/index.js";

import db from "./db.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Session store setup
const FileStore = sessionFileStore(session);

// ============================
// SESSION CONFIG
// ============================

const sessionMiddleware = session({
  secret: "slipgajiwa",
  resave: false,
  saveUninitialized: false,
  store: new FileStore({
    path: "./sessions",
    ttl: 30 * 24 * 60 * 60,
    reapInterval: 60 * 60,
  }),
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

// ============================
// CHECK USER EXISTS IN DATABASE
// ============================

async function getUserIfExists(number) {
  try {
    const [rows] = await db.query("SELECT id, nomor_wa, nama FROM users WHERE nomor_wa = ?", [number]);
    console.log(`[DB] Query for ${number}: ${rows.length > 0 ? "Found - " + rows[0].nama : "Not found"}`);
    return rows.length ? rows[0] : null;
  } catch (err) {
    console.error("[DB ERROR] getUserIfExists:", err);
    return null;
  }
}

// ============================
// GLOBAL SESSION VALIDATION
// ============================

app.use(async (req, res, next) => {
  if (req.session.number) {
    const user = await getUserIfExists(req.session.number);
    if (!user) {
      req.session.destroy((err) => {
        if (err) console.error("Session destroy error:", err);
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
app.use("/", absensiKaryawanRoutes);
app.use("/api/lokasi-store", lokasiStoreRoutes);

// ============================
// QR SCAN PAGE
// ============================

app.get("/", async (req, res) => {
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
// DASHBOARD
// ============================
app.get("/dashboard", async (req, res) => {
  if (req.session.admin?.role === "admin") {
    return res.status(404).sendFile(path.join(process.cwd(), "public/404.html"));
  }

  if (req.session.admin?.role === "superadmin") {
    return res.redirect("/manage-users");
  }

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
    console.log(`[DASHBOARD] Starting bot for ${number}`);
    startBot({ number });
  }

  res.sendFile(path.join(process.cwd(), "public/index.html"));
});

// ============================
// MANAGE USERS PAGE
// ============================

app.get("/manage-users", (req, res) => {
  if (req.session.number) {
    return res.status(403).sendFile(path.join(process.cwd(), "public/404.html"));
  }

  if (!req.session.admin) {
    return res.redirect("/admin-login");
  }

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

  if (!number) {
    return res.status(400).json({ success: false });
  }

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
    req.session.user_name = user.nama;

    req.session.save(() => {
      res.json({
        success: true,
        user_id: user.id,
        user_name: user.nama,
      });
    });
  } catch (err) {
    console.error("SET NUMBER ERROR:", err);
    res.status(500).json({ success: false });
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

  const phoneRegex = /^62[0-9]{10,13}$/;
  if (!phoneRegex.test(phoneNumber)) {
    return res.status(400).json({
      success: false,
      message: "Format nomor tidak valid. Gunakan format 62xxxxxxxxxxx",
    });
  }

  const user = await getUserIfExists(phoneNumber);
  if (!user) {
    return res.status(403).json({
      success: false,
      message: "Nomor WhatsApp tidak terdaftar. Hubungi admin untuk pendaftaran.",
    });
  }

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

  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  try {
    await db.query(`UPDATE otp_codes SET is_used = TRUE WHERE nomor_wa = ? AND is_used = FALSE`, [phoneNumber]);

    await db.query(
      `INSERT INTO otp_codes (nomor_wa, otp_code, attempts, expires_at, is_used) 
       VALUES (?, ?, 0, ?, FALSE)`,
      [phoneNumber, otp, expiresAt],
    );

    console.log(`[OTP] OTP ${otp} stored for ${phoneNumber}`);
    res.json({
      success: true,
      message: `Kode OTP: ${otp}`,
      otp: otp,
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

    if (otpRecord.attempts >= 5) {
      await db.query(`UPDATE otp_codes SET is_used = TRUE WHERE id = ?`, [otpRecord.id]);
      return res.status(400).json({
        success: false,
        message: "Terlalu banyak percobaan gagal. Silakan minta kode baru.",
      });
    }

    if (otpRecord.otp_code !== otpCode) {
      await db.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?`, [otpRecord.id]);
      const remaining = 5 - (otpRecord.attempts + 1);
      return res.status(400).json({
        success: false,
        message: `Kode OTP salah. Sisa percobaan: ${remaining}`,
      });
    }

    await db.query(`UPDATE otp_codes SET is_used = TRUE WHERE id = ?`, [otpRecord.id]);

    const user = await getUserIfExists(phoneNumber);
    if (!user) {
      return res.status(403).json({
        success: false,
        message: "Nomor WhatsApp tidak terdaftar",
      });
    }

    console.log(`[OTP] User ${phoneNumber} verified successfully`);

    // Set session for OTP login
    req.session.number = phoneNumber;
    req.session.user_id = user.id;
    req.session.user_name = user.nama;

    // Start bot untuk connect WhatsApp
    console.log(`[OTP] Starting WhatsApp bot for ${phoneNumber}`);

    if (!getSocketByNumber(phoneNumber)) {
      startBot({
        number: phoneNumber,
        onConnected: async (waNumber) => {
          console.log(`[OTP] ✅ Bot connected successfully for ${waNumber}`);
        },
        onLogout: (number) => {
          console.log(`[OTP] Bot logout for ${number}`);
        },
      }).catch((err) => {
        console.error("[OTP] Failed to start bot:", err);
      });
    } else {
      console.log(`[OTP] Bot already running for ${phoneNumber}`);
    }

    req.session.save(() => {
      res.json({
        success: true,
        message: "Verifikasi berhasil",
      });
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
// CEK BOT STATUS UNTUK MULTI USER
// ============================

app.get("/api/bot-status", async (req, res) => {
  if (!req.session.number) {
    return res.json({
      status: "not_logged_in",
      message: "Belum login",
    });
  }

  const number = req.session.number;
  const isConnected = getSocketByNumber(number) !== null;
  const sessionExists = fs.existsSync(`./session/${number}`);

  res.json({
    success: true,
    number: number,
    isConnected: isConnected,
    sessionExists: sessionExists,
    message: isConnected ? "Bot terhubung" : "Bot tidak terhubung",
  });
});

// ============================
// GET ALL ACTIVE SESSIONS (DEBUG)
// ============================

app.get("/api/active-sessions", async (req, res) => {
  // Hanya yang sudah login yang bisa lihat
  if (!req.session.admin && !req.session.number) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const sessions = getActiveSessions ? getActiveSessions() : [];

  res.json({
    activeSessions: sessions,
    total: sessions.length,
  });
});

// ============================
// LOGOUT
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
  const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  console.log(`[WS] New connection: ${tempId}`);

  userSessions[tempId] = {
    wsClients: [ws],
    sessionId: req.sessionID,
  };

  let botStarted = false;

  const startBotForQR = async () => {
    if (botStarted) return;
    botStarted = true;

    console.log(`[WS] Starting bot for QR generation`);

    try {
      await startBot({
        onQR: (number, qr) => {
          console.log(`[WS] QR generated, sending to client`);
          if (userSessions[tempId]) {
            userSessions[tempId].wsClients.forEach((client) => {
              if (client.readyState === 1) {
                client.send(JSON.stringify({ qr }));
              }
            });
          }
        },
        onConnected: async (waNumber) => {
          console.log(`[WS] Bot connected with number: ${waNumber}`);

          const user = await getUserIfExists(waNumber);

          if (!user) {
            console.log(`[LOGIN DITOLAK] ${waNumber} belum terdaftar di tabel users`);
            if (userSessions[tempId]) {
              userSessions[tempId].wsClients.forEach((client) => {
                if (client.readyState === 1) {
                  client.send(
                    JSON.stringify({
                      status: "not_registered",
                      message: "Nomor WhatsApp belum terdaftar. Hubungi admin untuk pendaftaran.",
                    }),
                  );
                }
              });
            }
            await logoutBot(waNumber);
            return;
          }

          console.log(`[LOGIN BERHASIL] ${waNumber} (${user.nama}) terdaftar`);

          if (!userSessions[waNumber]) {
            userSessions[waNumber] = {
              wsClients: [],
              sessionIds: [],
            };
          }

          if (userSessions[tempId]) {
            userSessions[waNumber].wsClients.push(...userSessions[tempId].wsClients);
            userSessions[waNumber].sessionIds.push(userSessions[tempId].sessionId);
            delete userSessions[tempId];
          }

          userSessions[waNumber].wsClients.forEach((client) => {
            if (client.readyState === 1) {
              client.send(
                JSON.stringify({
                  status: "connected",
                  number: waNumber,
                  user_id: user.id,
                  user_name: user.nama,
                }),
              );
            }
          });
        },
        onLogout: (number) => {
          console.log(`[WS] Force logout: ${number}`);
          if (userSessions[number]) {
            userSessions[number].wsClients.forEach((client) => {
              if (client.readyState === 1) {
                client.send(
                  JSON.stringify({
                    status: "force_logout",
                    message: "Sesi WhatsApp berakhir, silakan scan ulang QR",
                  }),
                );
              }
            });
            delete userSessions[number];
          }
        },
      });
    } catch (err) {
      console.error("[WS] Failed to start bot:", err);
    }
  };

  setTimeout(startBotForQR, 100);

  ws.on("close", () => {
    console.log(`[WS] Connection closed: ${tempId}`);
    setTimeout(() => {
      if (userSessions[tempId]) {
        delete userSessions[tempId];
      }
    }, 5000);
  });
});

// ============================
// START SERVER
// ============================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`🚀 Server berjalan di port ${PORT}`);
  console.log(`📱 Akses: http://localhost:${PORT}`);
  console.log(`✅ QR Login: Scan QR Code untuk connect WhatsApp`);
  console.log(`✅ OTP Login: Verifikasi OTP dan otomatis connect WhatsApp`);
  console.log(`========================================`);
});
