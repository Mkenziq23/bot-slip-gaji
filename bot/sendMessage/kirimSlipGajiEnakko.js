// bot/sendMessage/kirimSlipGajiEnakko.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import generateSlip from "../generator/slipGeneratorGaji.js";
import { getSocketByNumber } from "../index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function kirimSlipEnakko(karyawan, senderNumber) {
  // senderNumber adalah nomor WA admin yang login
  const sock = getSocketByNumber(senderNumber);

  console.log(`🔍 [DEBUG] kirimSlipEnakko dipanggil`);
  console.log(`🔍 senderNumber: ${senderNumber}`);
  console.log(`🔍 Apakah sock ada? ${!!sock}`);

  if (sock) {
    console.log(`🔍 Socket user: ${sock.user?.id || "unknown"}`);
  }

  if (!sock) {
    throw new Error(`Bot WhatsApp tidak aktif untuk nomor ${senderNumber}. Silakan scan QR code terlebih dahulu.`);
  }

  let fileSlip = null;

  try {
    console.log(`📨 Mengirim slip Enakko untuk: ${karyawan.nama || karyawan.no_induk}`);

    // Pastikan data karyawan memiliki field yang diperlukan
    const slipData = {
      id: karyawan.id,
      no_induk: karyawan.no_induk,
      nama: karyawan.nama || karyawan.nama_lengkap,
      jabatan: karyawan.jabatan,
      awal_masuk: karyawan.awal_masuk,
      store_name: karyawan.store_name,
      nohp: karyawan.nohp,
      gaji_pokok: karyawan.gaji_pokok || 0,
      bpjs_kesehatan: karyawan.bpjs_kesehatan || 0,
      insentif: karyawan.insentif || 0,
      total_gaji: karyawan.total_gaji || 0,
      keterangan: karyawan.keterangan || "",
    };

    // 1. Generate PDF
    fileSlip = await generateSlip(slipData, "enakko");

    if (!fileSlip || !fs.existsSync(fileSlip)) {
      throw new Error("Gagal generate PDF slip gaji");
    }

    console.log(`✅ PDF generated: ${fileSlip}`);

    // 2. Format nomor tujuan
    let nomorTujuan = karyawan.nohp ? karyawan.nohp.replace(/[^0-9]/g, "") : "";

    if (!nomorTujuan) {
      throw new Error(`Nomor HP tidak ditemukan untuk karyawan: ${karyawan.nama || karyawan.no_induk}`);
    }

    if (nomorTujuan.startsWith("0")) {
      nomorTujuan = "62" + nomorTujuan.substring(1);
    }

    if (!nomorTujuan.startsWith("62")) {
      nomorTujuan = "62" + nomorTujuan;
    }

    if (nomorTujuan.length < 10 || nomorTujuan.length > 15) {
      throw new Error(`Nomor HP tidak valid: ${nomorTujuan}`);
    }

    const jid = `${nomorTujuan}@s.whatsapp.net`;
    console.log(`📱 Mengirim ke: ${jid}`);

    // 3. Format nama file
    const namaKaryawan = (karyawan.nama || karyawan.nama_lengkap || "karyawan").toString();
    const namaFile = `Slip_Gaji_${namaKaryawan.replace(/[^a-z0-9]/gi, "_")}.pdf`;

    // 4. Baca file PDF
    const pdfBuffer = fs.readFileSync(fileSlip);

    // 5. Kirim PDF
    const sapaan = `Yth. Bapak/Ibu *${namaKaryawan}*,`;
    const isiPesan = `Bersama pesan ini, kami lampirkan Slip Gaji Anda untuk periode ${new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" })}.`;
    const penutup = `Silakan unduh dokumen terlampir untuk melihat rincian selengkapnya.\n\nJika terdapat pertanyaan atau kekeliruan data, mohon segera hubungi bagian Administrasi/HRD.\n\nTerima kasih.`;
    const captionFinal = `${sapaan}\n\n${isiPesan}\n\n${penutup}`;

    await sock.sendMessage(jid, {
      document: pdfBuffer,
      mimetype: "application/pdf",
      fileName: namaFile,
      caption: captionFinal,
    });

    console.log(`✅ Slip Enakko terkirim ke ${namaKaryawan} (${nomorTujuan})`);

    // 6. Hapus file setelah kirim
    if (fileSlip && fs.existsSync(fileSlip)) {
      fs.unlinkSync(fileSlip);
      console.log(`🗑️ File deleted: ${fileSlip}`);
    }

    return { success: true, message: "Slip berhasil dikirim" };
  } catch (err) {
    console.error(`❌ Gagal kirim Enakko ke ${karyawan.nama || karyawan.no_induk}:`, err.message);
    console.error(err.stack);

    if (fileSlip && fs.existsSync(fileSlip)) {
      try {
        fs.unlinkSync(fileSlip);
      } catch (e) {
        console.error("Gagal hapus file:", e);
      }
    }

    throw err;
  }
}
