// bot/cancelMessage/cancelSlipGaji.js

import { getSocketByNumber } from "../index.js";

function rupiah(x) {
  if (!x) return "Rp 0";
  return "Rp " + Number(x).toLocaleString("id-ID");
}

async function sendCancelSlipGajiNotification(slip, company, senderNumber, cancellationNote) {
  const sock = getSocketByNumber(senderNumber);

  if (!sock) {
    return {
      success: false,
      message: `Bot tidak aktif untuk nomor ${senderNumber}`,
    };
  }

  try {
    // Format nomor target
    let targetNumber = slip.nohp || slip.no_hp;

    if (!targetNumber) {
      return {
        success: false,
        message: `Nomor HP tidak ditemukan untuk ${slip.nama || slip.nama_karyawan}`,
      };
    }

    // Bersihkan nomor HP
    targetNumber = targetNumber.replace(/[^0-9]/g, "");
    if (targetNumber.startsWith("0")) targetNumber = "62" + targetNumber.substring(1);

    if (targetNumber.length < 10) {
      return {
        success: false,
        message: `Nomor HP tidak valid: ${targetNumber}`,
      };
    }

    const jid = `${targetNumber}@s.whatsapp.net`;

    // Format tanggal
    const tanggal = new Date().toLocaleDateString("id-ID", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const jam = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

    // Format Data Gaji berdasarkan company
    let nominalGaji = 0;
    let detailKomp = "";

    if (company === "hisana") {
      nominalGaji = slip.gaji_total || 0;
      detailKomp = [
        `▫️ Gaji Pokok: ${rupiah(slip.gaji || 0)}`,
        `▫️ Iuran BPJS: -${rupiah(slip.iuran_bpjs_ketenagakerjaan || 0)}`,
        `▫️ Kerajinan: ${rupiah(slip.kerajinan || 0)}`,
        `▫️ Cuti: ${rupiah(slip.cuti || 0)}`,
        `▫️ Tunjangan BPJS & Pulsa: ${rupiah(slip.tunj_bpjs_pulsa || 0)}`,
        `▫️ Uang Makan (UM): ${rupiah(slip.um || 0)}`,
      ].join("\n");
    } else {
      // ENAKKO - menggunakan field yang benar dari tabel slip_gaji_enakko
      nominalGaji = slip.total_gaji || 0;
      detailKomp = [`▫️ Gaji Pokok: ${rupiah(slip.gaji_pokok || 0)}`, `▫️ BPJS Kesehatan: ${rupiah(slip.bpjs_kesehatan || 0)}`, `▫️ Insentif: ${rupiah(slip.insentif || 0)}`].join("\n");
    }

    const namaKaryawan = (slip.nama || slip.nama_karyawan || slip.nama_lengkap || "-").toUpperCase();
    const adminNumber = senderNumber.replace(/[^0-9]/g, "");
    const adminDisplay = adminNumber.length > 8 ? "Admin ***" + adminNumber.slice(-4) : "Admin";

    // TEMPLATE PESAN
    const message = `*🛑 PEMBERITAHUAN PEMBATALAN SLIP*
---
Halo, *${namaKaryawan}*
Mohon maaf, slip gaji Anda dengan rincian:

🆔 *DATA KARYAWAN*
• No. Induk: ${slip.no_induk || "-"}
• Posisi: ${slip.jabatan || slip.posisi || "-"}
• Store: ${slip.store_name || slip.penempatan || "-"}

💰 *RINGKASAN GAJI*
${detailKomp}
*TOTAL: ${rupiah(nominalGaji)}*

⚠️ *STATUS: DIBATALKAN*
Alasan: ${cancellationNote || "Revisi data oleh admin"}
Waktu: ${tanggal} | ${jam} WIB

---
*KETERANGAN:*
Slip gaji di atas telah ditarik dari sistem. Mohon tunggu informasi selanjutnya atau hubungi *${adminDisplay}* untuk klarifikasi lebih lanjut.

_Pesan otomatis - Sistem Payroll ${company === "hisana" ? "HISANA" : "ENAKKO"}_`;

    await sock.sendMessage(jid, { text: message });

    console.log(`✅ Notifikasi pembatalan terkirim ke ${namaKaryawan} (${company})`);
    return { success: true, message: `Notifikasi terkirim ke ${namaKaryawan}` };
  } catch (error) {
    console.error(`❌ Error sendCancelSlip untuk ${company}:`, error.message);
    return { success: false, message: error.message };
  }
}

export async function kirimPembatalanSlipHisana(slip, senderNumber, cancellationNote) {
  return await sendCancelSlipGajiNotification(slip, "hisana", senderNumber, cancellationNote);
}

export async function kirimPembatalanSlipEnakko(slip, senderNumber, cancellationNote) {
  return await sendCancelSlipGajiNotification(slip, "enakko", senderNumber, cancellationNote);
}
