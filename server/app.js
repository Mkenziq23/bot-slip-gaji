import express from "express";
import path from "path";
import session from "express-session";
import http from "http";
import { WebSocketServer } from "ws";
import sessionFileStore from "session-file-store";

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

import { startBot, getSocketByNumber, logoutBot } from "../bot/index.js";

import db from "./db.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

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
// STATIC PUBLIC FILES (HARUS DULUAN SEBELUM ROUTES)
// ============================

app.use(express.static(path.join(process.cwd(), "public")));

// ============================
// ROUTES
// ============================

// ROUTE LOGIN HARUS PALING ATAS
app.use("/", loginRoutes);

// ROUTE LAINNYA
app.use("/", dashboardDataRoutes);
app.use("/", slipRoutes);
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
// DASHBOARD (UNTUK USER YANG LOGIN VIA QR)
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
// SAVE NUMBER AFTER QR LOGIN
// ============================

app.post("/set-number", async (req, res) => {
  const { number } = req.body;

  if (!number) {
    return res.status(400).json({ success: false, message: "No number provided" });
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

    req.session.save((err) => {
      if (err) {
        console.error("[SET-NUMBER] Session save error:", err);
        return res.status(500).json({ success: false, message: "Session save failed" });
      }

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
// LOGOUT (TIDAK ADA DUPLIKAT)
// ============================

// Route logout sudah ditangani di loginRoutes.js, jangan tambahkan di sini

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
// DEBUG - CLEAR SESSION (UNTUK TESTING)
// ============================

app.get("/clear-session", (req, res) => {
  console.log("[DEBUG] Force clearing session");
  req.session.destroy((err) => {
    if (err) console.error("Destroy error:", err);
    res.clearCookie("connect.sid", { path: "/" });
    res.send(`
      <html>
        <head>
          <style>
            body { font-family: Arial; display: flex; justify-content: center; align-items: center; height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
            .container { text-align: center; background: white; padding: 40px; border-radius: 12px; }
            h2 { color: #10b981; }
            a { display: inline-block; background: #6366f1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 8px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>✅ Session telah dihapus!</h2>
            <a href="/login">Ke Halaman Login</a>
          </div>
          <script>setTimeout(function(){ window.location.href = "/login"; }, 2000);</script>
        </body>
      </html>
    `);
  });
});

// ============================
// WEBSOCKET BOT LOGIN SYSTEM
// ============================

let userSessions = {};

function notifyForceLogout(number) {
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

  userSessions[tempId] = {
    wsClients: [ws],
    sessionId: req.sessionID,
  };

  let botStarted = false;

  const startBotForQR = async () => {
    if (botStarted) return;
    botStarted = true;

    try {
      await startBot({
        number: tempId,
        onQR: (number, qr) => {
          if (userSessions[tempId] && userSessions[tempId].wsClients) {
            userSessions[tempId].wsClients.forEach((client) => {
              if (client && client.readyState === 1) {
                client.send(JSON.stringify({ qr }));
              }
            });
          }
        },
        onConnected: async (waNumber) => {
          const user = await getUserIfExists(waNumber);

          if (!user) {
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
          notifyForceLogout(number);
        },
      });
    } catch (err) {
      console.error("[WS] Failed to start bot:", err);
    }
  };

  setTimeout(startBotForQR, 100);

  ws.on("close", () => {
    setTimeout(() => {
      if (userSessions[tempId]) {
        delete userSessions[tempId];
      }
    }, 5000);
  });
});

// ============================
// 404 FALLBACK ROUTE
// ============================

app.use((req, res) => {
  res.status(404).sendFile(path.join(process.cwd(), "public/404.html"));
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
