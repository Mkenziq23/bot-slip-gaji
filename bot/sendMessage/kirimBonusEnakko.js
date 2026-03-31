import fs from "fs";
import generateBonusPDF from "../generator/bonusGenerator.js";
import { getSocketByNumber } from "../index.js";

export default async function kirimBonusEnakko(bonus, senderNumber) {
  const socket = getSocketByNumber(senderNumber);

  if (!socket) {
    throw new Error("WhatsApp tidak terhubung");
  }

  let fileBonus;

  try {
    // 1. Generate PDF Bonus
    fileBonus = await generateBonusPDF(bonus, "enakko");

    // 2. Format nomor tujuan
    let nomorTujuan = bonus.nohp.replace(/[^0-9]/g, "");

    if (nomorTujuan.startsWith("0")) {
      nomorTujuan = "62" + nomorTujuan.substring(1);
    }

    if (nomorTujuan.length < 10) {
      throw new Error(`Nomor HP tidak valid: ${bonus.nohp}`);
    }

    const jid = `${nomorTujuan}@s.whatsapp.net`;

    // 3. Format nama file
    const bulanNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const bulanText = bulanNames[bonus.bulan - 1] || "-";
    const namaFile = `Bonus_${bonus.nama.replace(/[^a-z0-9]/gi, "_")}_${bulanText}_${bonus.tahun}.pdf`;

    // 4. Kirim PDF
    const sapaan = `Yth. Bapak/Ibu *${bonus.nama}*,`;
    const isiPesan = `Berikut kami lampirkan Slip Bonus Anda untuk periode ${bulanText} ${bonus.tahun}.`;
    const penutup = `Terima kasih atas dedikasi dan performa yang Anda berikan.`;

    const captionFinal = `${sapaan}\n\n${isiPesan}\n\n${penutup}`;

    await sock.sendMessage(jid, {
      document: fs.readFileSync(fileBonus),
      mimetype: "application/pdf",
      fileName: namaFile,
      caption: captionFinal,
    });

    console.log(`✅ Bonus Enakko terkirim ke ${bonus.nama} (${bonus.nohp}) - Rp ${bonus.jumlah_bonus}`);

    // 5. Hapus file
    fs.unlinkSync(fileBonus);

    return true;
  } catch (err) {
    console.error(`❌ Gagal kirim bonus Enakko ke ${bonus.nama} (${bonus.nohp}):`, err.message);

    // Cleanup file jika ada
    if (fileBonus && fs.existsSync(fileBonus)) {
      fs.unlinkSync(fileBonus);
    }

    throw err;
  }
}
