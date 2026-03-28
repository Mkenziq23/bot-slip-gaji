import fs from "fs";
import path from "path";
import generateTHRPDF from "../generator/thrGenerator.js";
import { getSocketByNumber } from "../index.js";

export default async function kirimThrHisana(thr, senderNumber) {
  const sock = getSocketByNumber(senderNumber);

  if (!sock) {
    throw new Error(`Bot tidak aktif untuk nomor ${senderNumber}`);
  }

  let fileThr;

  try {
    console.log(`📄 Generating THR PDF for ${thr.nama}...`);

    // 1. Generate PDF THR
    fileThr = await generateTHRPDF(thr, "hisana");
    console.log(`✅ PDF generated: ${fileThr}`);

    // 2. Format nomor tujuan
    let nomorTujuan = thr.nohp.replace(/[^0-9]/g, "");

    if (nomorTujuan.startsWith("0")) {
      nomorTujuan = "62" + nomorTujuan.substring(1);
    }

    if (nomorTujuan.length < 10 || nomorTujuan.length > 15) {
      throw new Error(`Nomor HP tidak valid: ${thr.nohp}`);
    }

    const jid = `${nomorTujuan}@s.whatsapp.net`;

    // 3. Format nama file
    const namaFile = `THR_${thr.nama.replace(/[^a-z0-9]/gi, "_")}_${thr.tahun}.pdf`;

    // 4. Kirim PDF
    console.log(`📤 Sending THR to ${thr.nama} (${nomorTujuan})...`);

    await sock.sendMessage(jid, {
      document: fs.readFileSync(fileThr),
      mimetype: "application/pdf",
      fileName: namaFile,
      caption: `Assalamu'alaikum *${thr.nama}*, berikut slip THR (Tunjangan Hari Raya) Anda untuk tahun ${thr.tahun}. Mohon segera dikonfirmasi penerimaannya. Terima kasih.`,
    });

    console.log(`✅ THR Hisana terkirim ke ${thr.nama} (${thr.nohp}) - Rp ${thr.jumlah_thr}`);

    // 5. Hapus file setelah kirim
    if (fs.existsSync(fileThr)) {
      fs.unlinkSync(fileThr);
      console.log(`🗑️ Deleted temp file: ${fileThr}`);
    }

    return true;
  } catch (err) {
    console.error(`❌ Gagal kirim THR ke ${thr.nama} (${thr.nohp}):`, err.message);

    // Cleanup file jika ada
    if (fileThr && fs.existsSync(fileThr)) {
      try {
        fs.unlinkSync(fileThr);
        console.log(`🗑️ Cleaned up file: ${fileThr}`);
      } catch (unlinkErr) {
        console.error(`Failed to delete file: ${unlinkErr.message}`);
      }
    }

    throw err;
  }
}
