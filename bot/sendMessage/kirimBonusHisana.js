import fs from "fs";
import generateBonusPDF from "../generator/bonusGenerator.js";
import { getSocketByNumber } from "../index.js";

export default async function kirimBonusHisana(bonus, senderNumber) {
  const sock = getSocketByNumber(senderNumber);

  if (!sock) {
    throw new Error(`Bot tidak aktif untuk nomor ${senderNumber}`);
  }

  let fileBonus;

  try {
    // 1. Generate PDF Bonus
    fileBonus = await generateBonusPDF(bonus, "hisana");

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
    await sock.sendMessage(jid, {
      document: fs.readFileSync(fileBonus),
      mimetype: "application/pdf",
      fileName: namaFile,
      caption: `Halo *${bonus.nama}*, berikut slip bonus Anda untuk periode ${bulanText} ${bonus.tahun}.`,
    });

    console.log(`✅ Bonus Hisana terkirim ke ${bonus.nama} (${bonus.nohp}) - Rp ${bonus.jumlah_bonus}`);

    // 5. Hapus file setelah kirim
    fs.unlinkSync(fileBonus);

    return true;
  } catch (err) {
    console.error(`❌ Gagal kirim bonus ke ${bonus.nama} (${bonus.nohp}):`, err.message);
    // Pastikan file dihapus jika gagal
    if (fileBonus && fs.existsSync(fileBonus)) {
      fs.unlinkSync(fileBonus);
    }
    throw err;
  }
}
