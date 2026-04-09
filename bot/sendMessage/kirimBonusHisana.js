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
    let nomorTujuan = bonus.nohp?.replace(/[^0-9]/g, "") || "";

    if (!nomorTujuan) {
      throw new Error(`Nomor HP tidak tersedia untuk ${bonus.nama}`);
    }

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
    const safeNama = bonus.nama?.replace(/[^a-z0-9]/gi, "_") || "karyawan";
    const namaFile = `Bonus_${safeNama}_${bulanText}_${bonus.tahun}.pdf`;

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

    console.log(`✅ Bonus Hisana terkirim ke ${bonus.nama} (${bonus.nohp}) - Rp ${bonus.jumlah_bonus?.toLocaleString()}`);

    // 5. Hapus file setelah kirim
    if (fs.existsSync(fileBonus)) {
      fs.unlinkSync(fileBonus);
    }

    return { success: true };
  } catch (err) {
    console.error(`❌ Gagal kirim bonus Hisana ke ${bonus.nama} (${bonus.nohp}):`, err.message);

    // Pastikan file dihapus jika gagal
    if (fileBonus && fs.existsSync(fileBonus)) {
      try {
        fs.unlinkSync(fileBonus);
      } catch (unlinkErr) {
        console.error(`Gagal hapus file:`, unlinkErr.message);
      }
    }

    throw err;
  }
}
