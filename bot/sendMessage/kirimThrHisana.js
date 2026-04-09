import fs from "fs";
import path from "path";
import generateTHRPDF from "../generator/thrGenerator.js";
import { getSocketByNumber } from "../index.js";

export default async function kirimThrHisana(thr, senderNumber) {
  const socket = getSocketByNumber(senderNumber);

  if (!socket) {
    console.error(`❌ Bot tidak aktif untuk nomor ${senderNumber}`);
    throw new Error("WhatsApp tidak terhubung");
  }

  let fileThr;

  try {
    console.log(`📄 Generating THR PDF for ${thr.nama} (Hisana)...`);

    // 1. Generate PDF THR
    fileThr = await generateTHRPDF(thr, "hisana");
    console.log(`✅ PDF generated: ${fileThr}`);

    // 2. Format nomor tujuan
    let nomorTujuan = thr.nohp?.replace(/[^0-9]/g, "") || "";

    if (!nomorTujuan) {
      throw new Error(`Nomor HP tidak tersedia untuk ${thr.nama}`);
    }

    if (nomorTujuan.startsWith("0")) {
      nomorTujuan = "62" + nomorTujuan.substring(1);
    }

    if (nomorTujuan.length < 10 || nomorTujuan.length > 15) {
      throw new Error(`Nomor HP tidak valid: ${thr.nohp} (cleaned: ${nomorTujuan})`);
    }

    const jid = `${nomorTujuan}@s.whatsapp.net`;

    // 3. Format nama file
    const safeNama = thr.nama?.replace(/[^a-z0-9]/gi, "_") || "karyawan";
    const namaFile = `THR_${safeNama}_${thr.tahun}.pdf`;

    // 4. Kirim PDF
    console.log(`📤 Sending THR Hisana to ${thr.nama} (${nomorTujuan})...`);

    const sapaan = `Assalamu'alaikum / Salam Sejahtera Bapak/Ibu *${thr.nama}*,`;
    const isiPesan = `Bersama pesan ini, kami sampaikan dokumen elektronik Slip Tunjangan Hari Raya (THR) Anda untuk Tahun ${thr.tahun}.`;
    const doaPenutup = `Semoga bermanfaat bagi Anda dan keluarga. Mohon dapat diperiksa dan disimpan sebagaimana mestinya.\n\nTerima kasih atas dedikasi Anda.`;
    const captionFinal = `${sapaan}\n\n${isiPesan}\n\n${doaPenutup}`;

    await socket.sendMessage(jid, {
      document: fs.readFileSync(fileThr),
      mimetype: "application/pdf",
      fileName: namaFile,
      caption: captionFinal,
    });

    console.log(`✅ THR Hisana terkirim ke ${thr.nama} (${thr.nohp}) - Rp ${thr.jumlah_thr?.toLocaleString()}`);

    // 5. Hapus file setelah kirim
    if (fs.existsSync(fileThr)) {
      fs.unlinkSync(fileThr);
      console.log(`🗑️ Deleted temp file: ${fileThr}`);
    }

    return true;
  } catch (err) {
    console.error(`❌ Gagal kirim THR Hisana ke ${thr.nama} (${thr.nohp}):`, err.message);
    console.error("Error stack:", err.stack);

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
