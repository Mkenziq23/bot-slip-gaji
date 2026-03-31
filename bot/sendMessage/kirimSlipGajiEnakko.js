import fs from "fs";
import generateSlip from "../generator/slipGeneratorGaji.js";
import { getSocketByNumber } from "../index.js";

export default async function kirimSlipEnakko(karyawan, senderNumber) {
  const socket = getSocketByNumber(senderNumber);

  if (!socket) {
    throw new Error("WhatsApp tidak terhubung");
  }

  let fileSlip;

  try {
    // 1. Generate PDF
    fileSlip = await generateSlip(karyawan, "enakko");

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
    const namaFile = `Slip_Gaji_${(karyawan.nama_karyawan || karyawan.nama || "karyawan").replace(/[^a-z0-9]/gi, "_")}.pdf`;

    // 4. Kirim PDF
    const sapaan = `Yth. Bapak/Ibu *${karyawan.nama}*,`;
    const isiPesan = `Bersama pesan ini, kami lampirkan Slip Gaji Anda untuk periode ini.`;
    const penutup = `Silakan unduh dokumen terlampir untuk melihat rincian selengkapnya. Jika terdapat pertanyaan atau kekeliruan data, mohon segera hubungi bagian Administrasi/HRD.\n\nTerima kasih.`;
    const captionFinal = `${sapaan}\n\n${isiPesan}\n\n${penutup}`;

    await sock.sendMessage(jid, {
      document: fs.readFileSync(fileSlip),
      mimetype: "application/pdf",
      fileName: namaFile,
      caption: captionFinal,
    });

    console.log(`✅ Slip Enakko terkirim ke ${karyawan.nama_karyawan || karyawan.nama} (${karyawan.nohp})`);

    // 5. Hapus file
    fs.unlinkSync(fileSlip);

    return true;
  } catch (err) {
    console.error(`❌ Gagal kirim Enakko ke ${karyawan.nama_karyawan || karyawan.nama} (${karyawan.nohp}):`, err.message);

    // Cleanup file jika ada
    if (fileSlip && fs.existsSync(fileSlip)) {
      fs.unlinkSync(fileSlip);
    }

    throw err;
  }
}
