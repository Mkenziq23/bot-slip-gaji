import fs from "fs";
import path from "path";
import generateSlip from "../generator/slipGeneratorGaji.js";
import { getSocketByNumber } from "../index.js";

export default async function kirimSlip(karyawan, senderNumber) {
  const sock = getSocketByNumber(senderNumber);

  if (!sock) {
    throw new Error(`Bot tidak aktif untuk nomor ${senderNumber}`);
  }

  let fileSlip = null;

  try {
    console.log(`📨 Mengirim slip untuk: ${karyawan.nama || karyawan.no_induk}`);

    // 1. Generate PDF
    fileSlip = await generateSlip(karyawan, "hisana");

    if (!fileSlip || !fs.existsSync(fileSlip)) {
      throw new Error("Gagal generate PDF slip gaji");
    }

    console.log(`✅ PDF generated: ${fileSlip}`);

    // 2. Format nomor tujuan
    let nomorTujuan = karyawan.nohp ? karyawan.nohp.replace(/[^0-9]/g, "") : "";

    // Jika tidak ada nohp di karyawan, coba ambil dari no_hp
    if (!nomorTujuan && karyawan.no_hp) {
      nomorTujuan = karyawan.no_hp.replace(/[^0-9]/g, "");
    }

    // Jika masih tidak ada, coba dari data karyawan
    if (!nomorTujuan && karyawan.nomor_wa) {
      nomorTujuan = karyawan.nomor_wa.replace(/[^0-9]/g, "");
    }

    if (!nomorTujuan) {
      throw new Error(`Nomor HP tidak ditemukan untuk karyawan: ${karyawan.nama || karyawan.no_induk}`);
    }

    if (nomorTujuan.startsWith("0")) {
      nomorTujuan = "62" + nomorTujuan.substring(1);
    }

    // Pastikan nomor dimulai dengan 62
    if (!nomorTujuan.startsWith("62")) {
      nomorTujuan = "62" + nomorTujuan;
    }

    if (nomorTujuan.length < 10 || nomorTujuan.length > 15) {
      throw new Error(`Nomor HP tidak valid: ${karyawan.nohp || karyawan.no_hp}`);
    }

    const jid = `${nomorTujuan}@s.whatsapp.net`;
    console.log(`📱 Mengirim ke: ${jid}`);

    // 3. Format nama file
    const namaKaryawan = (karyawan.nama || karyawan.nama_karyawan || karyawan.nama_lengkap || "karyawan").toString();
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

    console.log(`✅ Slip Hisana terkirim ke ${namaKaryawan} (${nomorTujuan})`);

    // 6. Hapus file setelah kirim
    if (fileSlip && fs.existsSync(fileSlip)) {
      fs.unlinkSync(fileSlip);
      console.log(`🗑️ File deleted: ${fileSlip}`);
    }

    return { success: true, message: "Slip berhasil dikirim" };
  } catch (err) {
    console.error(`❌ Gagal kirim ke ${karyawan.nama || karyawan.no_induk}:`, err.message);
    console.error(err.stack);

    // Cleanup file jika ada
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
