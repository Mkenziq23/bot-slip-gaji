import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from "@whiskeysockets/baileys";

import fs from "fs";

let sockets = {};
let isStarting = {};

/*
========================================
SAFE DELETE SESSION FOLDER (ANTI CRASH)
========================================
*/
async function safeDeleteSession(sessionDir) {
  try {
    if (fs.existsSync(sessionDir)) {
      await fs.promises.rm(sessionDir, {
        recursive: true,
        force: true,
      });

      console.log("[BOT] Session dihapus:", sessionDir);
    }
  } catch (err) {
    console.warn("[BOT] Gagal hapus session:", sessionDir);
  }
}

/*
========================================
START BOT
========================================
*/
export async function startBot({ number, onQR, onConnected, onLogout } = {}) {
  const isTemp = !number;

  const targetNumber = number || `temp_${Date.now()}`;

  if (isStarting[targetNumber]) return;

  isStarting[targetNumber] = true;

  const sessionDir = `./session/${targetNumber}`;

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,

    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10000,
  });

  sockets[targetNumber] = sock;

  sock.ev.on("creds.update", saveCreds);

  /*
========================================
CONNECTION UPDATE HANDLER
========================================
*/
  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;

    /*
============================
QR GENERATED
============================
*/
    if (qr && onQR) {
      onQR(targetNumber, qr);
    }

    /*
============================
CONNECTED SUCCESS
============================
*/
    if (connection === "open") {
      try {
        const waNumber = sock.user?.id?.split(":")[0]?.split("@")[0];

        console.log(`[BOT] Terhubung: ${waNumber}`);

        sockets[waNumber] = sock;

        isStarting[waNumber] = false;

        /*
CLEAN TEMP SESSION REF
*/
        if (isTemp || targetNumber.startsWith("temp_")) {
          delete sockets[targetNumber];
          delete isStarting[targetNumber];
        }

        /*
CALLBACK CONNECTED
*/
        if (onConnected) {
          await onConnected(waNumber);
        }
      } catch (err) {
        console.error("[BOT] ERROR onConnected:", err.message);
      }
    }

    /*
============================
DISCONNECTED
============================
*/
    if (connection === "close") {
      try {
        const statusCode = lastDisconnect?.error?.output?.statusCode;

        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        console.log(`[BOT] Terputus: ${targetNumber} | reason: ${statusCode}`);

        isStarting[targetNumber] = false;

        /*
============================
LOGGED OUT FROM PHONE
============================
*/
        if (isLoggedOut) {
          console.log("[BOT] Logout terdeteksi dari HP");

          if (onLogout) {
            try {
              onLogout(targetNumber);
            } catch (err) {
              console.warn("[BOT] onLogout error:", err.message);
            }
          }

          delete sockets[targetNumber];

          await safeDeleteSession(sessionDir);

          return;
        }

        /*
============================
AUTO RECONNECT
============================
*/
        console.log("[BOT] Reconnect dalam 5 detik...");

        setTimeout(() => {
          startBot({
            number: targetNumber,
            onQR,
            onConnected,
            onLogout,
          });
        }, 5000);
      } catch (err) {
        console.error("[BOT] ERROR connection.close:", err.message);
      }
    }
  });

  return sock;
}

/*
========================================
GET SOCKET BY NUMBER
========================================
*/
export function getSocketByNumber(number) {
  return sockets[number] || null;
}

/*
========================================
FORCE LOGOUT BOT
========================================
*/
export async function logoutBot(number) {
  const sock = sockets[number];

  const sessionDir = `./session/${number}`;

  try {
    if (sock) {
      await sock.logout();
    }
  } catch (err) {
    console.warn("[BOT] Logout WA gagal:", err.message);
  }

  delete sockets[number];

  isStarting[number] = false;

  await safeDeleteSession(sessionDir);
}
