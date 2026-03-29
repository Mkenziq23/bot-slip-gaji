// bot/cancelMessage/cancelSlipBonus.js

import { getSocketByNumber } from "../index.js";

function rupiah(x) {
  if (!x) return "Rp 0";
  return "Rp " + Number(x).toLocaleString("id-ID");
}

/**
 * Mengirim pesan pembatalan bonus ke karyawan
 */
async function sendCancelBonusNotification(bonus, company, senderNumber, cancellationNote) {
  const sock = getSocketByNumber(senderNumber);

  if (!sock) {
    throw new Error(`Bot tidak aktif untuk nomor ${senderNumber}`);
  }

  try {
    // Format nomor target
    let targetNumber = bonus.nohp;
    if (!targetNumber) {
      throw new Error(`Nomor HP tidak ditemukan untuk ${bonus.nama}`);
    }

    // Bersihkan nomor HP
    targetNumber = targetNumber.replace(/[^0-9]/g, "");
    if (targetNumber.startsWith("0")) targetNumber = "62" + targetNumber.substring(1);

    if (targetNumber.length < 10) {
      throw new Error(`Nomor HP tidak valid: ${bonus.nohp}`);
    }

    const jid = `${targetNumber}@s.whatsapp.net`;

    // Format tanggal & waktu
    const tglObj = new Date();
    const tanggal = tglObj.toLocaleDateString("id-ID", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const jam = tglObj.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

    // Nama bulan untuk periode
    const bulanNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const periodeBulan = bulanNames[bonus.bulan - 1] || "-";

    const namaKaryawan = (bonus.nama || "-").toUpperCase();
    const adminNumber = senderNumber.replace(/[^0-9]/g, "");
    const adminDisplay = adminNumber.length > 8 ? "Admin ***" + adminNumber.slice(-4) : "Admin";

    // TEMPLATE PESAN (Konsisten dengan Slip Gaji)
    const message = `*🛑 PEMBERITAHUAN PEMBATALAN BONUS*
---
Halo, *${namaKaryawan}*
Mohon maaf, rincian bonus Anda telah ditarik kembali:

🆔 *DATA KARYAWAN*
• No. Induk: ${bonus.no_induk || "-"}
• Periode: ${periodeBulan} ${bonus.tahun || ""}

💰 *RINGKASAN BONUS*
▫️ Jenis: Bonus Kinerja/Tahunan
*TOTAL: ${rupiah(bonus.jumlah_bonus || 0)}*

⚠️ *STATUS: DIBATALKAN*
Alasan: ${cancellationNote || "Revisi data oleh admin"}
Waktu: ${tanggal} | ${jam} WIB

---
*KETERANGAN:*
Bonus ini telah dibatalkan dari sistem untuk proses perbaikan data. Mohon tunggu notifikasi terbaru atau hubungi *${adminDisplay}* jika ada pertanyaan.

_Pesan otomatis - Sistem Payroll ${company.toUpperCase()}_`;

    await sock.sendMessage(jid, { text: message });

    console.log(`✅ Notifikasi pembatalan bonus terkirim: ${namaKaryawan}`);
    return true;
  } catch (error) {
    console.error(`❌ Error sendCancelBonus:`, error.message);
    throw error;
  }
}

/**
 * Export functions dengan parameter company yang sesuai
 */
export async function kirimPembatalanBonusHisana(bonus, senderNumber, cancellationNote) {
  return await sendCancelBonusNotification(bonus, "hisana", senderNumber, cancellationNote);
}

export async function kirimPembatalanBonusEnakko(bonus, senderNumber, cancellationNote) {
  return await sendCancelBonusNotification(bonus, "enakko", senderNumber, cancellationNote);
}

// Menjaga kompatibilitas dengan pemanggilan fungsi lama jika ada
export async function kirimPembatalanBonus(bonus, senderNumber, cancellationNote) {
  return await sendCancelBonusNotification(bonus, "payroll", senderNumber, cancellationNote);
}
