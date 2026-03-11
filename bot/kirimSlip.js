import fs from "fs";
import generateSlip from "./slipGenerator.js";
import { getSocketByNumber } from "./index.js"; // Pastikan fungsi ini diekspor di bot/index.js

async function kirimSlip(karyawan, senderNumber) {
  // 1. Ambil socket yang aktif berdasarkan nomor pengirim (admin)
  const sock = getSocketByNumber(senderNumber);

  if (!sock) {
    throw new Error(`Bot tidak aktif untuk nomor ${senderNumber}`);
  }

  // 2. Generate PDF
  const fileSlip = await generateSlip(karyawan);

  // 3. Format nomor tujuan (Hapus karakter seperti '-', ' ', dll)
  let nomorTujuan = karyawan.nohp.replace(/[^0-9]/g, "");

  // Ubah 08... menjadi 628...
  if (nomorTujuan.startsWith("0")) {
    nomorTujuan = "62" + nomorTujuan.substring(1);
  }

  const jid = nomorTujuan + "@s.whatsapp.net";

  // 4. Format nama file agar bersih
  const namaFile = "Slip_Gaji_" + karyawan.nama.replace(/\s+/g, "_") + ".pdf";

  // 5. Kirim
  await sock.sendMessage(jid, {
    document: fs.readFileSync(fileSlip),
    mimetype: "application/pdf",
    fileName: namaFile,
    caption: `Halo *${karyawan.nama}*, berikut slip gaji Anda.`,
  });

  console.log("Slip terkirim ke:", karyawan.nama);
}

export default kirimSlip;
