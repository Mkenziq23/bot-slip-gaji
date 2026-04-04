import express from "express";
import path from "path";
import session from "express-session";
import http from "http";
import { WebSocketServer } from "ws";

import slipRoutes from "./routes/slipGajiRoutes.js";
import loginRoutes from "./routes/loginRoutes.js";
import userManagementRoutes from "./routes/userManagementRoutes.js";
import bonusRoutes from "./routes/slipBonusRoutes.js";
import thrRoutes from "./routes/slipThrRoutes.js";
import dataKaryawanRoutes from "./routes/dataKaryawanRoutes.js";

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
app.use("/", loginRoutes);
app.use("/", userManagementRoutes);
app.use("/", bonusRoutes);
app.use("/", thrRoutes);
app.use("/", dataKaryawanRoutes);

// ============================
// DASHBOARD DATA ROUTE
// ============================
app.get("/dashboard-data", async (req, res) => {
  const company = req.query.company || "hisana";

  // Tentukan nama tabel berdasarkan company
  const tableKaryawan = company === "hisana" ? "data_karyawan_hisana" : "data_karyawan_enakko";
  const tableSlipGaji = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";
  const tableBonus = company === "hisana" ? "bonus_hisana" : "bonus_enakko";
  const tableThr = company === "hisana" ? "thr_hisana" : "thr_enakko";

  console.log(`Dashboard request for company: ${company}`);
  console.log(`Using tables: ${tableKaryawan}, ${tableSlipGaji}, ${tableBonus}, ${tableThr}`);

  try {
    // Get total karyawan
    const [karyawanCount] = await db.query(`SELECT COUNT(*) as total FROM ${tableKaryawan}`);
    console.log(`Total karyawan: ${karyawanCount[0]?.total || 0}`);

    // Get total slip gaji
    const [slipCount] = await db.query(`SELECT COUNT(*) as total FROM ${tableSlipGaji}`);
    console.log(`Total slip: ${slipCount[0]?.total || 0}`);

    // Get total bonus
    const [bonusCount] = await db.query(`SELECT COUNT(*) as total FROM ${tableBonus}`);
    console.log(`Total bonus: ${bonusCount[0]?.total || 0}`);

    // Get total THR
    const [thrCount] = await db.query(`SELECT COUNT(*) as total FROM ${tableThr}`);
    console.log(`Total THR: ${thrCount[0]?.total || 0}`);

    // Get ringkasan per karyawan
    let karyawanRingkasan = [];

    if (company === "hisana") {
      const [rows] = await db.query(`
        SELECT 
          k.no_induk,
          k.nama_lengkap as nama,
          k.jabatan,
          COALESCE(SUM(s.gaji_total), 0) as total_gaji,
          COALESCE(SUM(b.jumlah_bonus), 0) as total_bonus,
          COALESCE(SUM(t.jumlah_thr), 0) as total_thr
        FROM ${tableKaryawan} k
        LEFT JOIN ${tableSlipGaji} s ON k.no_induk = s.no_induk
        LEFT JOIN ${tableBonus} b ON k.no_induk = b.no_induk
        LEFT JOIN ${tableThr} t ON k.no_induk = t.no_induk
        GROUP BY k.id, k.no_induk, k.nama_lengkap, k.jabatan
        ORDER BY k.no_induk ASC
      `);
      karyawanRingkasan = rows;
    } else {
      const [rows] = await db.query(`
        SELECT 
          k.no_induk,
          k.nama_lengkap as nama,
          k.jabatan,
          COALESCE(SUM(s.total_gaji), 0) as total_gaji,
          COALESCE(SUM(b.jumlah_bonus), 0) as total_bonus,
          COALESCE(SUM(t.jumlah_thr), 0) as total_thr
        FROM ${tableKaryawan} k
        LEFT JOIN ${tableSlipGaji} s ON k.no_induk = s.no_induk
        LEFT JOIN ${tableBonus} b ON k.no_induk = b.no_induk
        LEFT JOIN ${tableThr} t ON k.no_induk = t.no_induk
        GROUP BY k.id, k.no_induk, k.nama_lengkap, k.jabatan
        ORDER BY k.no_induk ASC
      `);
      karyawanRingkasan = rows;
    }

    console.log(`Returning ${karyawanRingkasan.length} karyawan records`);

    res.json({
      success: true,
      totalKaryawan: karyawanCount[0]?.total || 0,
      totalSlip: slipCount[0]?.total || 0,
      totalBonus: bonusCount[0]?.total || 0,
      totalThr: thrCount[0]?.total || 0,
      karyawanRingkasan: karyawanRingkasan,
    });
  } catch (err) {
    console.error("Dashboard data error:", err);
    res.status(500).json({
      success: false,
      error: err.message,
      totalKaryawan: 0,
      totalSlip: 0,
      totalBonus: 0,
      totalThr: 0,
      karyawanRingkasan: [],
    });
  }
});

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
