import express from "express";
import path from "path";
import session from "express-session";
import http from "http";
import { WebSocketServer } from "ws";
// HAPUS session-file-store, ganti dengan memory store untuk sementara
// import sessionFileStore from "session-file-store";

import dashboardDataRoutes from "./routes/dashboardDataRoutes.js";
import slipRoutes from "./routes/slipGajiRoutes.js";
import loginRoutes from "./routes/loginRoutes.js";
import userManagementRoutes from "./routes/userManagementRoutes.js";
import bonusRoutes from "./routes/slipBonusRoutes.js";
import thrRoutes from "./routes/slipThrRoutes.js";
import dataKaryawanRoutes from "./routes/dataKaryawanRoutes.js";
import karyawanProfileRoutes from "./routes/karyawanProfileRoutes.js";
import lokasiStoreRoutes from "./routes/LokasiStoreRoutes.js";
import absensiRoutes from "./routes/absensiRoutes.js";

import { startBot, getSocketByNumber, logoutBot, logoutAllSessions } from "../bot/index.js";

import db from "./db.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ============================
// SESSION CONFIG - TANPA FILE STORE
// ============================

const sessionMiddleware = session({
  secret: "slipgajiwa",
  resave: false,
  saveUninitialized: false,
  // Hapus store: new FileStore(...)
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 hari
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
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
app.use("/api/lokasi-store", lokasiStoreRoutes);
app.use("/", absensiRoutes);

// ============================
// QR SCAN PAGE
// ============================

app.get("/scan", async (req, res) => {
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
// ROOT PAGE
// ============================
app.get("/", async (req, res) => {
  // Cek admin
  if (req.session.admin) {
    return res.redirect(req.session.admin.role === "superadmin" ? "/manage-users" : "/manage-users");
  }

  // Cek karyawan
  if (req.session.karyawan) {
    return res.redirect("/karyawan-profile");
  }

  // Cek QR login
  if (req.session.number) {
    const user = await getUserIfExists(req.session.number);
    if (user) {
      return res.redirect("/dashboard");
    }
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      return res.redirect("/login");
    });
    return;
  }

  // Redirect ke login
  res.redirect("/login");
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
    return res.redirect("/login");
  }

  const user = await getUserIfExists(req.session.number);
  if (!user) {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      return res.redirect("/login");
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
  if (req.session.number) {
    return res.status(403).sendFile(path.join(process.cwd(), "public/404.html"));
  }

  if (!req.session.admin) {
    return res.redirect("/login");
  }

  if (req.session.admin.role !== "admin" && req.session.admin.role !== "superadmin") {
    return res.status(403).sendFile(path.join(process.cwd(), "public/404.html"));
  }

  res.sendFile(path.join(process.cwd(), "public/manage-users.html"));
});

// ============================
// LOGIN PAGE (dari loginRoutes sudah handle, tapi tambahkan fallback)
// ============================
app.get("/login", (req, res) => {
  if (req.session.admin || req.session.karyawan || req.session.number) {
    return res.redirect("/");
  }
  res.sendFile(path.join(process.cwd(), "public/login.html"));
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

  console.log(`[SET-NUMBER] Request received for number: ${number}`);

  if (!number) {
    return res.status(400).json({ success: false, message: "No number provided" });
  }

  try {
    const user = await getUserIfExists(number);
    if (!user) {
      console.log(`[SET-NUMBER] Number not registered: ${number}`);
      return res.status(403).json({
        success: false,
        message: "Nomor belum terdaftar. Hubungi admin.",
      });
    }

    console.log(`[SET-NUMBER] User found: ${user.id} - ${user.nama}`);

    req.session.number = number;
    req.session.user_id = user.id;
    req.session.user_name = user.nama;

    req.session.save((err) => {
      if (err) {
        console.error("[SET-NUMBER] Session save error:", err);
        return res.status(500).json({ success: false, message: "Session save failed" });
      }

      console.log(`[SET-NUMBER] Session saved successfully for ${number}`);
      res.json({
        success: true,
        user_id: user.id,
        user_name: user.nama,
      });
    });
  } catch (err) {
    console.error("[SET-NUMBER] ERROR:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ============================
// LOGOUT
// ============================

app.get("/logout", async (req, res) => {
  const number = req.session.number;
  console.log(`[LOGOUT] User logout: ${number}`);

  if (number) {
    await logoutBot(number);
  }

  req.session.destroy((err) => {
    if (err) console.error("[LOGOUT] Session destroy error:", err);
    res.clearCookie("connect.sid");
    res.redirect("/login");
  });
});

// ============================
// CHECK SESSION STATUS
// ============================

app.get("/check-session", async (req, res) => {
  if (!req.session.number) {
    return res.json({ loggedIn: false });
  }

  const number = req.session.number;
  const socket = getSocketByNumber(number);

  const isConnected = socket && socket.user;

  if (!isConnected) {
    req.session.destroy((err) => {
      if (err) console.error("[CHECK-SESSION] Destroy error:", err);
    });
    return res.json({ loggedIn: false, reason: "Device disconnected from WhatsApp" });
  }

  res.json({ loggedIn: true });
});

// ============================
// WEBSOCKET BOT LOGIN SYSTEM
// ============================

let userSessions = {};

function notifyForceLogout(number) {
  console.log(`[WS] Notifying force logout for ${number}`);
  if (userSessions[number]) {
    userSessions[number].wsClients.forEach((client) => {
      if (client && client.readyState === 1) {
        client.send(
          JSON.stringify({
            status: "force_logout",
            message: "Perangkat WhatsApp telah dihapus dari perangkat tertaut. Silakan login ulang.",
          }),
        );
      }
    });
    delete userSessions[number];
  }
}

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

    console.log(`[WS] Starting bot for QR generation (${tempId})`);

    try {
      await startBot({
        number: tempId,
        onQR: (number, qr) => {
          console.log(`[WS] QR generated for ${number}`);
          if (userSessions[tempId] && userSessions[tempId].wsClients) {
            userSessions[tempId].wsClients.forEach((client) => {
              if (client && client.readyState === 1) {
                client.send(JSON.stringify({ qr }));
              }
            });
          }
        },
        onConnected: async (waNumber) => {
          console.log(`[WS] WhatsApp connected: ${waNumber}`);

          const user = await getUserIfExists(waNumber);

          if (!user) {
            console.log(`[WS] Number not registered: ${waNumber}`);
            if (userSessions[tempId]) {
              userSessions[tempId].wsClients.forEach((client) => {
                if (client && client.readyState === 1) {
                  client.send(
                    JSON.stringify({
                      status: "not_registered",
                      number: waNumber,
                      message: "Nomor WhatsApp belum terdaftar. Hubungi admin untuk pendaftaran.",
                    }),
                  );
                }
              });
            }
            await logoutBot(waNumber);
            return;
          }

          console.log(`[WS] User registered: ${user.id} - ${user.nama}`);

          if (userSessions[tempId]) {
            if (!userSessions[waNumber]) {
              userSessions[waNumber] = {
                wsClients: [],
                sessionIds: [],
              };
            }

            userSessions[waNumber].wsClients.push(...userSessions[tempId].wsClients);
            userSessions[waNumber].sessionIds.push(userSessions[tempId].sessionId);
            delete userSessions[tempId];
          }

          if (userSessions[waNumber]) {
            userSessions[waNumber].wsClients.forEach((client) => {
              if (client && client.readyState === 1) {
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
          }
        },
        onLogout: (number) => {
          console.log(`[WS] Force logout detected for: ${number}`);
          notifyForceLogout(number);
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
  console.log(`========================================`);
});
