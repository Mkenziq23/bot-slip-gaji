import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from "@whiskeysockets/baileys";
import crypto from "crypto";
import fs from "fs";

let sockets = {};
let isStarting = {};
let numberToHashMap = {};

function getSessionId(number) {
  if (!number) return null;
  const hash = crypto.createHash("sha256");
  const secret = process.env.SESSION_SECRET || "payroll-secret-key-2024";
  hash.update(number + secret);
  return hash.digest("hex").substring(0, 32);
}

function verifySessionId(number, sessionId) {
  const expectedId = getSessionId(number);
  return expectedId === sessionId;
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
      console.log("[BOT] Session dihapus:", sessionDir.split("/").pop());
    }
  } catch (err) {
    console.warn("[BOT] Gagal hapus session:", err.message);
  }
}

/*
========================================
START BOT
========================================
*/
export async function startBot({ number, onQR, onConnected, onLogout } = {}) {
  const isTemp = !number;

  // Gunakan hash ID sebagai identifier session
  const sessionHashId = number ? getSessionId(number) : `temp_${Date.now()}`;
  const targetNumber = number || `temp_${Date.now()}`;

  if (isStarting[sessionHashId]) return;

  isStarting[sessionHashId] = true;

  const sessionDir = `./session/${sessionHashId}`;

  // Simpan mapping nomor ke hash
  if (number) {
    numberToHashMap[number] = sessionHashId;
  }

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

  sockets[sessionHashId] = {
    socket: sock,
    number: targetNumber,
    hashId: sessionHashId,
  };

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

        if (waNumber) {
          const newHashId = getSessionId(waNumber);

          // Update mapping
          numberToHashMap[waNumber] = newHashId;
          if (number && number !== waNumber) {
            delete numberToHashMap[number];
          }

          console.log(`[BOT] Terhubung: ${waNumber.substring(0, 4)}**** (Session: ${newHashId.substring(0, 8)}...)`);

          if (sessionHashId !== newHashId && fs.existsSync(sessionDir)) {
            const newSessionDir = `./session/${newHashId}`;
            if (!fs.existsSync(newSessionDir)) {
              await fs.promises.rename(sessionDir, newSessionDir);
              console.log(`[BOT] Session moved to: ${newHashId.substring(0, 8)}...`);
            }
          }

          sockets[newHashId] = {
            socket: sock,
            number: waNumber,
            hashId: newHashId,
          };

          delete sockets[sessionHashId];
          isStarting[newHashId] = false;
          delete isStarting[sessionHashId];

          if (isTemp || targetNumber.startsWith("temp_")) {
            delete sockets[targetNumber];
          }

          if (onConnected) {
            await onConnected(waNumber);
          }
        } else {
          if (onConnected) {
            await onConnected(targetNumber);
          }
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

        console.log(`[BOT] Terputus: Session ${sessionHashId.substring(0, 8)}... | reason: ${statusCode}`);

        isStarting[sessionHashId] = false;

        if (isLoggedOut) {
          console.log("[BOT] Logout terdeteksi dari HP");

          if (onLogout) {
            try {
              onLogout(targetNumber);
            } catch (err) {
              console.warn("[BOT] onLogout error:", err.message);
            }
          }

          // Hapus mapping
          for (const [num, hash] of Object.entries(numberToHashMap)) {
            if (hash === sessionHashId) {
              delete numberToHashMap[num];
            }
          }

          delete sockets[sessionHashId];
          await safeDeleteSession(sessionDir);
          return;
        }

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
  // Coba dari mapping dulu
  let hashId = numberToHashMap[number];

  if (!hashId) {
    hashId = getSessionId(number);
  }

  const session = sockets[hashId];
  return session ? session.socket : null;
}

/*
========================================
GET ALL ACTIVE SESSIONS (untuk debugging)
========================================
*/
export function getActiveSessions() {
  const sessions = [];
  for (const [hashId, session] of Object.entries(sockets)) {
    sessions.push({
      hashId: hashId.substring(0, 8) + "...",
      number: session.number ? session.number.substring(0, 4) + "****" : "unknown",
      hasSocket: !!session.socket,
    });
  }
  return sessions;
}

/*
========================================
FORCE LOGOUT BOT
========================================
*/
export async function logoutBot(number) {
  let hashId = numberToHashMap[number];

  if (!hashId) {
    hashId = getSessionId(number);
  }

  const session = sockets[hashId];
  const sessionDir = `./session/${hashId}`;

  try {
    if (session && session.socket) {
      await session.socket.logout();
      console.log(`[BOT] Logout success for: ${number.substring(0, 4)}****`);
    }
  } catch (err) {
    console.warn("[BOT] Logout WA gagal:", err.message);
  }

  delete numberToHashMap[number];
  delete sockets[hashId];
  delete isStarting[hashId];

  await safeDeleteSession(sessionDir);
}

/*
========================================
CLEANUP ALL SESSIONS (untuk maintenance)
========================================
*/
export async function cleanupAllSessions() {
  const sessionFolders = await fs.promises.readdir("./session").catch(() => []);

  for (const folder of sessionFolders) {
    if (folder.length === 32) {
      const sessionDir = `./session/${folder}`;
      await safeDeleteSession(sessionDir);
    }
  }

  sockets = {};
  isStarting = {};
  numberToHashMap = {};

  console.log("[BOT] All sessions cleaned up");
}

// Export helper functions
export { getSessionId, verifySessionId, numberToHashMap };
