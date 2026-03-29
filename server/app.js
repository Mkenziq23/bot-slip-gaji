import express from "express";
import path from "path";
import session from "express-session";
import http from "http";
import { WebSocketServer } from "ws";

import slipRoutes from "./routes/slipGajiRoutes.js";
import loginAdminRoutes from "./routes/loginAdminRoutes.js";
import userManagementRoutes from "./routes/userManagementRoutes.js";
import bonusRoutes from "./routes/slipBonusRoutes.js";
import thrRoutes from "./routes/slipThrRoutes.js";

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

app.use("/", slipRoutes);
app.use("/", loginAdminRoutes);
app.use("/", userManagementRoutes);
app.use("/", bonusRoutes);
app.use("/", thrRoutes);

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
  // admin biasa tidak boleh dashboard (mereka hanya bisa manage-users)
  if (req.session.admin?.role === "admin") {
    return res.status(404).sendFile(path.join(process.cwd(), "public/404.html"));
  }

  // superadmin redirect ke manage-users
  if (req.session.admin?.role === "superadmin") {
    return res.redirect("/manage-users");
  }

  // login via QR
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
    return res.redirect("/admin-login");
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
// START SERVER
// ============================

const PORT = process.env.PORT || 3000;

server.listen(
  PORT,

  () => console.log("Server jalan di port " + PORT),
);
