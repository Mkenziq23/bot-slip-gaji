import express from "express";
import path from "path";
import session from "express-session";
import FileStore from "session-file-store";
import http from "http";
import { WebSocketServer } from "ws";
import slipRoutes from "./routes/slipRoutes.js";
import { startBot, getSocketByNumber, logoutBot } from "../bot/index.js";
import db from "./db.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const SessionFileStore = FileStore(session);

// ============================
// Middleware session
// ============================
const sessionMiddleware = session({
  store: new SessionFileStore({ path: "./sessions-browser" }),
  secret: "slipgajiwa",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);
app.use(express.static(path.join(process.cwd(), "public")));

// ============================
// DATABASE HELPER
// ============================
async function getOrCreateUser(number) {
  const [rows] = await db.query("SELECT * FROM users WHERE nomor_wa=?", [number]);
  if (rows.length === 0) {
    const [result] = await db.query("INSERT INTO users (nomor_wa) VALUES (?)", [number]);
    return { id: result.insertId, nomor_wa: number };
  }
  return rows[0];
}

// ============================
// ROUTES
// ============================
app.use("/", slipRoutes);

// Halaman scan QR
app.get("/", async (req, res) => {
  const number = req.session.number;

  if (number) {
    // Cek apakah nomor valid di DB
    try {
      const [rows] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
      if (rows.length) return res.redirect("/dashboard");
      req.session.number = null; // jika nomor tidak valid, reset session
    } catch (err) {
      console.error(err);
      req.session.number = null;
    }
  }

  res.sendFile(path.join(process.cwd(), "public/scan.html"));
});

// Dashboard
app.get("/dashboard", async (req, res) => {
  if (!req.session.number) return res.redirect("/");
  const number = req.session.number;

  // Auto reconnect bot jika belum terhubung
  if (!getSocketByNumber(number)) {
    console.log(`[SERVER] Auto-reconnecting session for: ${number}`);
    startBot({ number });
  }

  res.sendFile(path.join(process.cwd(), "public/index.html"));
});

// Simpan nomor WA ke session setelah scan QR
app.post("/set-number", async (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ success: false });

  try {
    // Pastikan user ada di DB (buat jika belum ada)
    const user = await getOrCreateUser(number);

    req.session.number = number;
    req.session.user_id = user.id;
    req.session.save(() => res.json({ success: true, user_id: user.id }));
  } catch (err) {
    console.error("SET NUMBER ERROR:", err);
    res.status(500).json({ success: false });
  }
});

// Logout
app.get("/logout", async (req, res) => {
  const number = req.session.number;
  if (number) await logoutBot(number);

  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});

// ============================
// WEBSOCKET BOT
// ============================
let userSessions = {};

wss.on("connection", async (ws, req) => {
  const tempId = `temp_${Date.now()}`;
  userSessions[tempId] = { wsClients: [ws], sessionIds: [] };

  ws.on("close", () => delete userSessions[tempId]);

  await startBot({
    onQR: (number, qr) => {
      userSessions[tempId]?.wsClients.forEach(client => {
        if (client.readyState === 1) client.send(JSON.stringify({ qr }));
      });
    },

    onConnected: async (number) => {
      const user = await getOrCreateUser(number);

      if (!userSessions[number]) userSessions[number] = { wsClients: [], sessionIds: [] };

      // Migrasi ws dari temp ke number
      if (userSessions[tempId]) {
        userSessions[number].wsClients.push(...userSessions[tempId].wsClients);
        delete userSessions[tempId];
      }

      // Simpan sessionId untuk force logout
      const sessionId = req.headers.cookie?.split("connect.sid=s%3A")[1]?.split(".")[0];
      if (sessionId && !userSessions[number].sessionIds.includes(sessionId)) {
        userSessions[number].sessionIds.push(sessionId);
      }

      // Kirim status connected ke browser
      userSessions[number].wsClients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ status: "connected", number, user_id: user.id }));
        }
      });
    },

    onLogout: (number) => {
      console.log(`[WS] Force Logout detected for: ${number}`);

      if (userSessions[number]) {
        userSessions[number].wsClients.forEach(client => {
          if (client.readyState === 1) client.send(JSON.stringify({ status: "force_logout" }));
        });

        userSessions[number].sessionIds.forEach(id => {
          sessionMiddleware.store.destroy(id, err => { if (err) console.error(err); });
        });

        delete userSessions[number];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server jalan di port " + PORT));
