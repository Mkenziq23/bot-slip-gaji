import { getSocket } from "../bot/index.js";
import { readExcel } from "./readExcel.js";
import generateSlip from "../bot/slipGenerator.js";

import fs from "fs";

let progress = {
  total: 0,
  sent: 0,
  failed: 0,
  running: false,
};

export function getProgress() {
  return progress;
}

export async function startSend() {
  const sock = getSocket();

  if (!sock) {
    console.log("Bot belum connect");
    return;
  }

  const data = readExcel();

  if (!data || data.length === 0) {
    console.log("Data karyawan kosong");
    return;
  }

  progress.total = data.length;
  progress.sent = 0;
  progress.failed = 0;
  progress.running = true;

  console.log("Mulai kirim slip:", progress.total);

  for (const karyawan of data) {
    try {
      console.log("Proses:", karyawan.nama);

      const fileSlip = await generateSlip(karyawan);

      const nomor = karyawan.nohp + "@s.whatsapp.net";

      await sock.sendMessage(nomor, {
        document: fs.readFileSync(fileSlip),
        mimetype: "application/pdf",
        fileName: "Slip_Gaji.pdf",
        caption: `Halo ${karyawan.nama}, berikut slip gaji Anda`,
      });

      progress.sent++;
    } catch (err) {
      console.log("Gagal kirim:", karyawan.nama);

      progress.failed++;
    }

    console.log("Progress:", progress.sent, "/", progress.total);

    await new Promise((r) => setTimeout(r, 1500));
  }

  progress.running = false;

  console.log("Pengiriman selesai");
}
