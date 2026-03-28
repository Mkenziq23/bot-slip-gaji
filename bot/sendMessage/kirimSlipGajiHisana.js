import fs from "fs";
import generateSlip from "../generator/slipGeneratorGaji.js";
import { getSocketByNumber } from "../index.js";

export default async function kirimSlip(karyawan, senderNumber) {
  const sock = getSocketByNumber(senderNumber);

  if (!sock) {
    throw new Error(`Bot tidak aktif untuk nomor ${senderNumber}`);
  }

  try {
    // 1. Generate PDF
    const fileSlip = await generateSlip(karyawan, "hisana");

    // 2. Format nomor tujuan
    let nomorTujuan = karyawan.nohp.replace(/[^0-9]/g, "");

    if (nomorTujuan.startsWith("0")) {
      nomorTujuan = "62" + nomorTujuan.substring(1);
    }

    if (nomorTujuan.length < 10) {
      throw new Error(`Nomor HP tidak valid: ${karyawan.nohp}`);
    }

    const jid = `${nomorTujuan}@s.whatsapp.net`;

    // 3. Format nama file
    const namaFile = `Slip_Gaji_${(karyawan.nama || "karyawan").replace(/[^a-z0-9]/gi, "_")}.pdf`;

    // 4. Kirim PDF
    await sock.sendMessage(jid, {
      document: fs.readFileSync(fileSlip),
      mimetype: "application/pdf",
      fileName: namaFile,
      caption: `Halo *${karyawan.nama}*, berikut slip gaji Anda.`,
    });

    console.log(`✅ Slip Hisana terkirim ke ${karyawan.nama} (${karyawan.nohp})`);

    // 5. Hapus file setelah kirim
    fs.unlinkSync(fileSlip);

    return true;
  } catch (err) {
    console.error(`❌ Gagal kirim ke ${karyawan.nama} (${karyawan.nohp}):`, err.message);
    // Pastikan file dihapus jika gagal
    if (fs.existsSync(fileSlip)) {
      fs.unlinkSync(fileSlip);
    }
    throw err;
  }
}
