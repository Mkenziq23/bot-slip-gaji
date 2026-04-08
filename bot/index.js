// bot/index.js - ENHANCED SECURITY VERSION (No real phone numbers in session folders)

import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from "@whiskeysockets/baileys";
import fs from "fs";
import crypto from "crypto";

// Gunakan Map untuk menyimpan socket per user
let sockets = new Map();
let isStarting = new Map();

// Mapping antara nomor asli dan session ID (hash)
let numberToSessionId = new Map(); // nomor asli -> session ID (hash)
let sessionIdToNumber = new Map(); // session ID (hash) -> nomor asli

/*
========================================
GENERATE SECURE SESSION ID
========================================
*/
function generateSessionId(number) {
  const salt = process.env.SESSION_SALT || "default_fallback_salt";
  const hash = crypto
    .createHash("sha256")
    .update(salt + number)
    .digest("hex");
  // Ambil 32 karakter pertama sebagai session ID
  return hash.substring(0, 32);
}

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

  // Generate session ID yang aman (tidak mengandung nomor asli)
  const sessionId = isTemp ? targetNumber : generateSessionId(targetNumber);
  const sessionDir = `./session/${sessionId}`;

  if (isStarting.get(targetNumber)) {
    console.log(`[BOT] Already starting for ${targetNumber}`);
    return sockets.get(targetNumber);
  }

  isStarting.set(targetNumber, true);

  // Simpan mapping antara nomor asli dan session ID
  if (!isTemp) {
    numberToSessionId.set(targetNumber, sessionId);
    sessionIdToNumber.set(sessionId, targetNumber);
  }

  // Ensure session directory exists
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 0,
      keepAliveIntervalMs: 10000,
      browser: ["Payroll System", "Chrome", "120.0.0.0"],
    });

    sockets.set(targetNumber, sock);

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
        console.log(`[BOT] QR generated for session: ${sessionId.substring(0, 8)}...`);
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

          if (waNumber) {
            console.log(`[BOT] ✅ Terhubung: ${waNumber.substring(0, 4)}****${waNumber.slice(-3)} (session: ${sessionId.substring(0, 8)}...)`);

            // Jika temporary, pindahkan ke permanent key
            if (isTemp || targetNumber.startsWith("temp_")) {
              if (sockets.has(waNumber)) {
                console.log(`[BOT] Session already exists for ${waNumber}`);
              } else {
                sockets.set(waNumber, sock);
                // Update mapping untuk nomor baru
                if (!numberToSessionId.has(waNumber)) {
                  const newSessionId = generateSessionId(waNumber);
                  numberToSessionId.set(waNumber, newSessionId);
                  sessionIdToNumber.set(newSessionId, waNumber);
                }
              }
              sockets.delete(targetNumber);
              isStarting.delete(targetNumber);
            } else if (targetNumber !== waNumber) {
              sockets.set(waNumber, sock);
              sockets.delete(targetNumber);
              isStarting.delete(targetNumber);
            }

            isStarting.set(waNumber, false);
          }

          // CALLBACK CONNECTED
          if (onConnected) {
            const finalNumber = sock.user?.id?.split(":")[0]?.split("@")[0] || targetNumber;
            await onConnected(finalNumber);
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

          console.log(`[BOT] Terputus: ${targetNumber.substring(0, 4)}****${targetNumber.slice(-3)} | reason: ${statusCode}`);

          isStarting.set(targetNumber, false);

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

            sockets.delete(targetNumber);

            // Hapus mapping juga
            const sessId = numberToSessionId.get(targetNumber);
            if (sessId) {
              sessionIdToNumber.delete(sessId);
              numberToSessionId.delete(targetNumber);
            }

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
  } catch (err) {
    console.error("[BOT] Failed to start bot:", err);
    isStarting.set(targetNumber, false);
    throw err;
  }
}

/*
========================================
GET SOCKET BY NUMBER (FIXED - menggunakan Map)
========================================
*/
export function getSocketByNumber(number) {
  // Pastikan number adalah string
  const numStr = String(number);

  // Coba langsung ambil dari Map
  if (sockets.has(numStr)) {
    const sock = sockets.get(numStr);
    // Cek apakah socket masih valid
    if (sock && sock.user) {
      return sock;
    }
  }

  // Jika tidak ditemukan, coba cari dengan format lain (misal tanpa 62 di awal)
  for (const [key, sock] of sockets.entries()) {
    if (key.includes(numStr) || numStr.includes(key)) {
      if (sock && sock.user) {
        console.log(`[BOT] Found socket for ${numStr.substring(0, 4)}**** using key ${key.substring(0, 4)}****`);
        return sock;
      }
    }
  }

  console.log(`[BOT] Socket not found for number: ${numStr.substring(0, 4)}****${numStr.slice(-3)}`);
  console.log(
    `[BOT] Available sockets:`,
    Array.from(sockets.keys()).map((k) => k.substring(0, 4) + "****" + (k.length > 7 ? k.slice(-3) : "")),
  );

  return null;
}

/*
========================================
GET SESSION ID BY NUMBER (untuk debugging)
========================================
*/
export function getSessionIdByNumber(number) {
  return numberToSessionId.get(String(number)) || null;
}

/*
========================================
GET NUMBER BY SESSION ID (untuk debugging)
========================================
*/
export function getNumberBySessionId(sessionId) {
  return sessionIdToNumber.get(sessionId) || null;
}

/*
========================================
GET ALL ACTIVE SESSIONS (untuk debugging multi user)
========================================
*/
export function getActiveSessions() {
  const sessions = [];
  for (const [num, socket] of sockets.entries()) {
    if (socket && socket.user) {
      sessions.push({
        number: num.substring(0, 4) + "****" + (num.length > 7 ? num.substring(num.length - 3) : ""),
        sessionId: (numberToSessionId.get(num) || "unknown").substring(0, 8) + "...",
        isConnected: true,
        user: socket.user.id?.split(":")[0]?.substring(0, 4) + "****",
      });
    } else if (socket) {
      sessions.push({
        number: num.substring(0, 4) + "****",
        sessionId: "unknown",
        isConnected: false,
      });
    }
  }
  return sessions;
}

/*
========================================
FORCE LOGOUT BOT
========================================
*/
export async function logoutBot(number) {
  const sock = sockets.get(number);
  const sessionId = numberToSessionId.get(number);
  const sessionDir = `./session/${sessionId || number}`;

  try {
    if (sock) {
      await sock.logout();
      console.log(`[BOT] Logout success for: ${number.substring(0, 4)}****${number.slice(-3)}`);
    }
  } catch (err) {
    console.warn("[BOT] Logout WA gagal:", err.message);
  }

  sockets.delete(number);
  isStarting.delete(number);

  if (sessionId) {
    sessionIdToNumber.delete(sessionId);
    numberToSessionId.delete(number);
  }

  await safeDeleteSession(sessionDir);
}
