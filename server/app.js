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

// Gunakan middleware session agar bisa diakses di route
const sessionMiddleware = session({
  store: new SessionFileStore({ path: "./sessions-browser" }),
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

// =============================
// DATABASE HELPER
// =============================
async function getOrCreateUser(number) {
  const [rows] = await db.query("SELECT * FROM users WHERE nomor_wa=?", [number]);
  if (rows.length === 0) {
    const [result] = await db.query("INSERT INTO users (nomor_wa) VALUES (?)", [number]);
    return { id: result.insertId, nomor_wa: number };
  }
  return rows[0];
}

// =============================
// ROUTES
// =============================
app.use("/", slipRoutes);

app.get("/", (req, res) => {
  if (req.session.number) return res.redirect("/dashboard");
  res.sendFile(path.join(process.cwd(), "public/scan.html"));
});

app.get("/dashboard", (req, res) => {
  const number = req.session.number;
  if (!number) return res.redirect("/");

  if (!getSocketByNumber(number)) {
    console.log(`[SERVER] Auto-reconnecting session for: ${number}`);
    startBot({ number });
  }
  res.sendFile(path.join(process.cwd(), "public/index.html"));
});

app.use(express.static(path.join(process.cwd(), "public")));

app.post("/set-number", (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ success: false });
  req.session.number = number;
  res.json({ success: true });
});

app.get("/logout", async (req, res) => {
  const number = req.session.number;
  if (number) await logoutBot(number);

  req.session.destroy((err) => {
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});

// =============================
// WEBSOCKET & SESSION MAPPING
// =============================
// Struktur userSessions: { [number]: { wsClients: [], sessionIds: [] } }
let userSessions = {};

wss.on("connection", async (ws, req) => {
  // Ambil session ID dari cookie untuk pemetaan force logout
  const cookieHeader = req.headers.cookie || "";
  const sessionId = cookieHeader.split("connect.sid=s%3A")[1]?.split(".")[0];

  const tempId = `temp_${Date.now()}`;
  userSessions[tempId] = { wsClients: [ws] };

  ws.on("close", () => {
    delete userSessions[tempId];
  });

  await startBot({
    onQR: (number, qr) => {
      userSessions[tempId]?.wsClients?.forEach((client) => {
        if (client.readyState === 1) client.send(JSON.stringify({ qr }));
      });
    },

    onConnected: async (number) => {
      const user = await getOrCreateUser(number);

      if (!userSessions[number]) {
        userSessions[number] = { wsClients: [], sessionIds: [] };
      }

      // Migrasi dari temp ke real number session
      if (userSessions[tempId]) {
        userSessions[number].wsClients.push(...userSessions[tempId].wsClients);
        delete userSessions[tempId];
      }

      // Simpan sessionId agar bisa di-destroy saat logout dari HP
      if (sessionId && !userSessions[number].sessionIds.includes(sessionId)) {
        userSessions[number].sessionIds.push(sessionId);
      }

      userSessions[number].wsClients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ status: "connected", number, user_id: user.id }));
        }
      });
    },

    onLogout: (number) => {
      console.log(`[WS] Force Logout detected for: ${number}`);

      if (userSessions[number]) {
        // 1. Beritahu browser via WebSocket untuk redirect ke login
        userSessions[number].wsClients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({ status: "force_logout" }));
          }
        });

        // 2. Hapus file session di server agar cookie di browser tidak valid lagi
        userSessions[number].sessionIds.forEach((id) => {
          sessionMiddleware.store.destroy(id, (err) => {
            if (err) console.error("Gagal hapus session file:", err);
          });
        });

        delete userSessions[number];
      }
    },
  });
});

server.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});
