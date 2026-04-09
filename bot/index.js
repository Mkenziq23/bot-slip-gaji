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
    console.warn("[BOT] Gagal hapus session:", err.message);
  }
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
FORCE LOGOUT BOT (HAPUS PERANGKAT TERTAUT)
========================================
*/
export async function logoutBot(number) {
  const sock = sockets[number];
  const sessionDir = `./session/${number}`;

  console.log(`[BOT] Logout requested for: ${number}`);

  try {
    if (sock) {
      // Ini akan menghapus perangkat tertaut dari WhatsApp
      await sock.logout();
      console.log(`[BOT] Logout success for: ${number}`);
    }
  } catch (err) {
    console.warn("[BOT] Logout WA gagal:", err.message);
  }

  delete sockets[number];
  delete isStarting[number];

  await safeDeleteSession(sessionDir);
}

/*
========================================
LOGOUT ALL SESSIONS
========================================
*/
export async function logoutAllSessions() {
  const numbers = Object.keys(sockets);
  console.log(`[BOT] Logging out all sessions: ${numbers.length} active sessions`);

  for (const number of numbers) {
    await logoutBot(number);
  }
}

/*
========================================
START BOT (DIPERBAIKI - DETEKSI LOGOUT DARI WA)
========================================
*/
export async function startBot({ number, onQR, onConnected, onLogout } = {}) {
  const targetNumber = number || `temp_${Date.now()}`;

  console.log(`[BOT] Starting bot for: ${targetNumber}`);

  if (isStarting[targetNumber]) {
    console.log(`[BOT] Already starting for ${targetNumber}, waiting...`);
    let waitCount = 0;
    while (isStarting[targetNumber] && waitCount < 30) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      waitCount++;
    }
    if (sockets[targetNumber]) {
      console.log(`[BOT] Returning existing socket for ${targetNumber}`);
      return sockets[targetNumber];
    }
  }

  isStarting[targetNumber] = true;

  const sessionDir = `./session/${targetNumber}`;

  // Ensure session directory exists
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`[BOT] Creating WhatsApp socket for ${targetNumber}`);

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 0,
      keepAliveIntervalMs: 10000,
      browser: ["Payroll System", "Chrome", "120.0.0.0"],
      generateHighQualityLinkPreview: false,
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
        console.log(`[BOT] QR generated for ${targetNumber}`);
        try {
          onQR(targetNumber, qr);
        } catch (err) {
          console.error("[BOT] onQR callback error:", err.message);
        }
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
            console.log(`[BOT] ✅ Connected: ${waNumber}`);

            // If temp session or number mismatch, move to permanent
            if (targetNumber !== waNumber) {
              console.log(`[BOT] Moving session from ${targetNumber} to ${waNumber}`);

              // Copy socket to permanent number
              if (sockets[waNumber]) {
                console.log(`[BOT] Session already exists for ${waNumber}, closing old`);
                const oldSock = sockets[waNumber];
                if (oldSock && oldSock !== sock) {
                  try {
                    await oldSock.logout();
                  } catch (err) {
                    console.warn("[BOT] Error logging out old session:", err.message);
                  }
                }
              }

              sockets[waNumber] = sock;

              // Clean up temp reference
              delete sockets[targetNumber];
              delete isStarting[targetNumber];
            } else {
              delete isStarting[targetNumber];
            }

            // CALLBACK CONNECTED
            if (onConnected) {
              const finalNumber = waNumber || targetNumber;
              console.log(`[BOT] Calling onConnected for ${finalNumber}`);
              await onConnected(finalNumber);
            }
          } else {
            console.log(`[BOT] Connected but couldn't extract number`);
            if (onConnected) {
              await onConnected(targetNumber);
            }
            delete isStarting[targetNumber];
          }
        } catch (err) {
          console.error("[BOT] ERROR onConnected:", err.message);
          delete isStarting[targetNumber];
        }
      }

      /*
      ============================
      DISCONNECTED - DETEKSI LOGOUT DARI WA
      ============================
      */
      if (connection === "close") {
        try {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;

          // Cek juga apakah ini logout yang disengaja dari WhatsApp
          const isIntentionalLogout = lastDisconnect?.error?.message?.includes("logout") || lastDisconnect?.error?.message?.includes("Logged out");

          console.log(`[BOT] Disconnected: ${targetNumber} | reason: ${statusCode} | isLoggedOut: ${isLoggedOut}`);

          // Hapus dari isStarting
          delete isStarting[targetNumber];

          /*
          ============================
          LOGGED OUT FROM PHONE (User menghapus perangkat tertaut)
          ============================
          */
          if (isLoggedOut || isIntentionalLogout) {
            console.log(`[BOT] Logout detected from phone for ${targetNumber}`);

            // Panggil callback onLogout jika ada
            if (onLogout) {
              try {
                // Dapatkan nomor asli jika ini adalah session temporary
                const actualNumber = targetNumber.startsWith("temp_") ? null : targetNumber;
                await onLogout(actualNumber || targetNumber);
              } catch (err) {
                console.warn("[BOT] onLogout error:", err.message);
              }
            }

            // Hapus socket
            delete sockets[targetNumber];

            // Hapus session folder
            await safeDeleteSession(sessionDir);
            return;
          }

          /*
          ============================
          AUTO RECONNECT (Hanya untuk koneksi yang terputus bukan logout)
          ============================
          */
          console.log("[BOT] Reconnecting in 5 seconds...");
          setTimeout(() => {
            // Check if we should reconnect
            const currentSocket = sockets[targetNumber];
            if (!currentSocket || currentSocket === sock) {
              startBot({
                number: targetNumber,
                onQR,
                onConnected,
                onLogout,
              }).catch((err) => {
                console.error("[BOT] Reconnect failed:", err.message);
              });
            }
          }, 5000);
        } catch (err) {
          console.error("[BOT] ERROR connection.close:", err.message);
          delete isStarting[targetNumber];
        }
      }
    });

    // Handle socket errors
    sock.ev.on("error", (err) => {
      console.error(`[BOT] Socket error for ${targetNumber}:`, err.message);
    });

    return sock;
  } catch (err) {
    console.error("[BOT] Failed to start bot:", err);
    delete isStarting[targetNumber];
    throw err;
  }
}
