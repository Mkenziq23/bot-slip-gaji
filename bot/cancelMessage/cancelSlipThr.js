// bot/cancelMessage/cancelSlipThr.js

import { getSocketByNumber } from "../index.js";

function rupiah(x) {
  if (!x) return "Rp 0";
  return "Rp " + Number(x).toLocaleString("id-ID");
}

/**
 * Mengirim pesan pembatalan THR ke karyawan
 */
async function sendCancelThrNotification(thr, company, senderNumber, cancellationNote) {
  const sock = getSocketByNumber(senderNumber);

  if (!sock) {
    throw new Error(`Bot tidak aktif untuk nomor ${senderNumber}`);
  }

  try {
    // Format nomor target
    let targetNumber = thr.nohp;
    if (!targetNumber) {
      throw new Error(`Nomor HP tidak ditemukan untuk ${thr.nama}`);
    }

    // Bersihkan nomor HP
    targetNumber = targetNumber.replace(/[^0-9]/g, "");
    if (targetNumber.startsWith("0")) targetNumber = "62" + targetNumber.substring(1);

    if (targetNumber.length < 10) {
      throw new Error(`Nomor HP tidak valid: ${thr.nohp}`);
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

    const namaKaryawan = (thr.nama || "-").toUpperCase();
    const adminNumber = senderNumber.replace(/[^0-9]/g, "");
    const adminDisplay = adminNumber.length > 8 ? "Admin ***" + adminNumber.slice(-4) : "Admin";

    const companyDisplay = company === "hisana" ? "HISANA" : "ENAKKO";

    // TEMPLATE PESAN
    const message = `*🛑 PEMBERITAHUAN PEMBATALAN THR*
━━━━━━━━━━━━━━━━━━━━
Halo, *${namaKaryawan}*
Mohon maaf, rincian Tunjangan Hari Raya (THR) Anda telah ditarik kembali.

*📋 DATA KARYAWAN*
• No. Induk: ${thr.no_induk || "-"}
• Tahun THR: ${thr.tahun || "-"}
• Perusahaan: ${companyDisplay}

*💰 RINCIAN THR*
• Kategori: Tunjangan Hari Raya Keagamaan
• Jumlah: ${rupiah(thr.jumlah_thr || 0)}

*⚠️ STATUS: DIBATALKAN*
• Alasan: ${cancellationNote || "Revisi data oleh admin"}
• Waktu: ${tanggal} | ${jam} WIB

━━━━━━━━━━━━━━━━━━━━
*📝 KETERANGAN:*
Rincian THR ini telah dibatalkan dari sistem untuk proses sinkronisasi ulang. 
Mohon tunggu notifikasi terbaru atau hubungi *${adminDisplay}* jika ada pertanyaan.

_${new Date().toLocaleString("id-ID")}_
_Pesan otomatis - Sistem Payroll ${companyDisplay}_`;

    await sock.sendMessage(jid, { text: message });

    console.log(`✅ Notifikasi pembatalan THR terkirim: ${namaKaryawan}`);
    return { success: true, message: "Notifikasi terkirim" };
  } catch (error) {
    console.error(`❌ Error sendCancelThr:`, error.message);
    throw error;
  }
}

/**
 * Export functions
 */
export async function kirimPembatalanThrHisana(thr, senderNumber, cancellationNote) {
  return await sendCancelThrNotification(thr, "hisana", senderNumber, cancellationNote);
}

export async function kirimPembatalanThrEnakko(thr, senderNumber, cancellationNote) {
  return await sendCancelThrNotification(thr, "enakko", senderNumber, cancellationNote);
}

// Untuk kompatibilitas dengan pemanggilan lama
export async function kirimPembatalanThr(thr, senderNumber, cancellationNote) {
  return await sendCancelThrNotification(thr, "payroll", senderNumber, cancellationNote);
}
