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

/*
=====================================
RAILWAY SESSION FIX
=====================================
*/

app.set("trust proxy", 1);

const sessionMiddleware = session({
  secret: "slipgajiwa",
  resave: false,
  saveUninitialized: false,
  proxy: true,

  store: new FileStore({
    path: "./sessions",
    ttl: 30 * 24 * 60 * 60,
    reapInterval: 60 * 60,
  }),

  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,

    secure: true,
    sameSite: "none",
  },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

/*
=====================================
HELPER CHECK USER QR LOGIN
=====================================
*/

async function getUserIfExists(number) {
  const [rows] = await db.query("SELECT id, nomor_wa, nama FROM users WHERE nomor_wa = ?", [number]);

  return rows.length ? rows[0] : null;
}

/*
=====================================
GLOBAL SESSION VALIDATION
=====================================
*/

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

/*
=====================================
ROOT ROUTE SMART REDIRECT
=====================================
*/

app.get("/", async (req, res) => {
  if (req.session.admin) return res.redirect("/manage-users");

  if (req.session.karyawan) return res.redirect("/karyawan-profile");

  if (req.session.number) return res.redirect("/dashboard");

  return res.redirect("/login");
});

/*
=====================================
ROUTES
=====================================
*/

app.use(loginRoutes);

app.use(dashboardDataRoutes);
app.use(slipRoutes);
app.use(userManagementRoutes);
app.use(bonusRoutes);
app.use(thrRoutes);
app.use(dataKaryawanRoutes);
app.use(karyawanProfileRoutes);
app.use("/api/lokasi-store", lokasiStoreRoutes);
app.use(absensiRoutes);

/*
=====================================
SCAN PAGE
=====================================
*/

app.get("/scan", async (req, res) => {
  if (req.session.number) {
    const user = await getUserIfExists(req.session.number);

    if (user) return res.redirect("/dashboard");

    req.session.destroy(() => {
      res.clearCookie("connect.sid");
    });
  }

  res.sendFile(path.join(process.cwd(), "public/scan.html"));
});

/*
=====================================
DASHBOARD QR LOGIN
=====================================
*/

app.get("/dashboard", async (req, res) => {
  if (!req.session.number) return res.redirect("/login");

  const user = await getUserIfExists(req.session.number);

  if (!user) {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
    });

    return res.redirect("/login");
  }

  if (!getSocketByNumber(req.session.number)) {
    startBot({
      number: req.session.number,
    });
  }

  res.sendFile(path.join(process.cwd(), "public/index.html"));
});

/*
=====================================
MANAGE USERS ADMIN PAGE
=====================================
*/

app.get("/manage-users", (req, res) => {
  if (!req.session.admin) return res.redirect("/login");

  res.sendFile(path.join(process.cwd(), "public/manage-users.html"));
});

/*
=====================================
STATIC FILES
=====================================
*/

app.use(express.static(path.join(process.cwd(), "public")));

/*
=====================================
SAVE NUMBER AFTER QR LOGIN
=====================================
*/

app.post("/set-number", async (req, res) => {
  const { number } = req.body;

  if (!number) return res.json({ success: false });

  const user = await getUserIfExists(number);

  if (!user) return res.json({ success: false });

  req.session.number = number;

  req.session.save(() => res.json({ success: true }));
});

/*
=====================================
LOGOUT
=====================================
*/

app.get("/logout", async (req, res) => {
  if (req.session.number) await logoutBot(req.session.number);

  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/login");
  });
});

/*
=====================================
WEBSOCKET QR LOGIN
=====================================
*/

wss.on("connection", async (ws) => {
  const tempId = "temp_" + Date.now();

  startBot({
    number: tempId,

    onQR: (number, qr) => {
      ws.send(JSON.stringify({ qr }));
    },

    onConnected: async (waNumber) => {
      const user = await getUserIfExists(waNumber);

      if (!user) {
        ws.send(
          JSON.stringify({
            status: "not_registered",
          }),
        );

        await logoutBot(waNumber);

        return;
      }

      ws.send(
        JSON.stringify({
          status: "connected",
          number: waNumber,
        }),
      );
    },
  });
});

/*
=====================================
START SERVER
=====================================
*/

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
