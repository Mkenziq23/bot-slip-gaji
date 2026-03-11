import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from "@whiskeysockets/baileys";
import fs from "fs";
import path from "path";

let sockets = {};
let isStarting = {};

/**
 * Memulai bot WhatsApp
 */
export async function startBot({ number, onQR, onConnected, onLogout } = {}) {
  // Jika tidak ada nomor, gunakan ID sementara untuk sesi scan baru
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
    // Tambahkan logger agar tidak terlalu berisik di console jika tidak perlu
    // logger: P({ level: 'silent' }),
  });

  // Simpan instance ke objek global
  sockets[targetNumber] = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;

    // 1. Handle QR Code
    if (qr && onQR) {
      onQR(targetNumber, qr);
    }

    // 2. Koneksi Berhasil (Open)
    if (connection === "open") {
      let waNumber = sock.user?.id.split(":")[0].split("@")[0];
      console.log(`[BOT] Terhubung: ${waNumber}`);
    
      isStarting[waNumber] = false;
      sockets[waNumber] = sock;
    
      // Jika ini hasil scan dari tempId, bersihkan referensi temp-nya
      if (isTemp || targetNumber.startsWith("temp_")) {
        delete isStarting[targetNumber];
        delete sockets[targetNumber];
      }
    
      // pastikan nomor masuk DB
      if (onConnected) {
        try {
          await onConnected(waNumber); // di app.js callback -> getOrCreateUser
        } catch (err) {
          console.error("Gagal simpan user:", err);
        }
      }
    }

    // 3. Koneksi Terputus (Close)
    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      isStarting[targetNumber] = false;
      console.log(`[BOT] Terputus: ${targetNumber}. Reason: ${statusCode}`);

      if (isLoggedOut) {
        console.log(`[BOT] Logout terdeteksi (User keluar dari HP).`);

        // Jalankan callback logout untuk membersihkan session browser di app.js
        if (onLogout) onLogout(targetNumber);

        // Hapus data socket dan folder sesi
        delete sockets[targetNumber];
        if (fs.existsSync(sessionDir)) {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        }
      } else {
        // Reconnect otomatis jika bukan karena logout (misal: gangguan internet)
        console.log(`[BOT] Mencoba menyambung ulang dalam 5 detik...`);
        setTimeout(() => {
          startBot({ number: targetNumber, onQR, onConnected, onLogout });
        }, 5000);
      }
    }
  });

  return sock;
}

/**
 * Mendapatkan instance socket berdasarkan nomor WA
 */
export function getSocketByNumber(number) {
  return sockets[number] || null;
}

/**
 * Logout Bot secara paksa (Sistem & HP)
 */
export async function logoutBot(number) {
  const sock = sockets[number];
  const sessionDir = `./session/${number}`;

  if (sock) {
    try {
      // Perintah logout ke server WhatsApp (memutuskan tautan perangkat di HP)
      await sock.logout();
    } catch (err) {
      console.error(`[BOT] Error saat logout: ${err.message}`);
      sock.end(); // Tutup paksa jika gagal logout bersih
    }
  }

  delete sockets[number];
  isStarting[number] = false;

  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
}
