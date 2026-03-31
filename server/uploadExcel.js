// server/uploadExcel.js
import xlsx from "xlsx";
import fs from "fs";
import db from "./db.js";

export async function uploadExcel(req, res, number, company) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "File tidak ditemukan" });
    }

    // Ambil user_id
    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    // Baca file Excel
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: "" });

    console.log(`[UPLOAD] ${rawData.length} baris ditemukan di Excel untuk company: ${company}`);

    // Get current date untuk filter bulan dan tahun
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    let insertedCount = 0;
    let duplicateInMonthCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    if (company === "hisana") {
      for (const row of rawData) {
        const {
          "No Induk": no_induk,
          NAMA: nama,
          POSISI: posisi,
          STORE: store,
          "AWAL MASUK": awal_masuk,
          KERJA: kerja,
          GAJI: gaji,
          "Iuran BPJS Ketenagakerjaan": iuran_bpjs_ketenagakerjaan,
          KERAJINAN: kerajinan,
          CUTI: cuti,
          "Tunj. BPJS & Pulsa": tunj_bpjs_pulsa,
          JUMLAH: jumlah,
          UM: um,
          KETERANGAN: keterangan,
          "GAJI TOTAL": gaji_total,
          "NO HP": nohp,
        } = row;

        // Validasi data minimal
        if (!no_induk || !nama) {
          console.log(`[UPLOAD] Skip baris karena No Induk atau Nama kosong`);
          skippedCount++;
          continue;
        }

        // CEK DATA DI BULAN YANG SAMA
        const [existingInMonth] = await db.query(
          `SELECT * FROM slip_gaji_hisana 
           WHERE user_id = ? 
           AND no_induk = ? 
           AND MONTH(created_at) = ? 
           AND YEAR(created_at) = ?`,
          [userId, no_induk, currentMonth, currentYear],
        );

        if (existingInMonth.length > 0) {
          console.log(`[UPLOAD] Data untuk no_induk ${no_induk} sudah ada di bulan ${currentMonth}/${currentYear}, dilewati`);
          duplicateInMonthCount++;
          continue;
        }

        // INSERT DATA BARU (tidak update, selalu insert baru untuk bulan ini)
        await db.query(
          `INSERT INTO slip_gaji_hisana
          (user_id, no_induk, nama, posisi, store, awal_masuk, kerja, gaji,
           iuran_bpjs_ketenagakerjaan, kerajinan, cuti, tunj_bpjs_pulsa,
           jumlah, um, keterangan, gaji_total, nohp, status_slip, is_imported)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            no_induk,
            nama,
            posisi,
            store,
            awal_masuk || null,
            kerja || 0,
            parseFloat(gaji) || 0,
            parseFloat(iuran_bpjs_ketenagakerjaan) || 0,
            parseFloat(kerajinan) || 0,
            parseFloat(cuti) || 0,
            parseFloat(tunj_bpjs_pulsa) || 0,
            parseFloat(jumlah) || 0,
            parseFloat(um) || 0,
            keterangan || "",
            parseFloat(gaji_total) || 0,
            nohp || "",
            "belum_dikirim",
            1, // is_imported = true
          ],
        );
        insertedCount++;
        console.log(`[UPLOAD] Insert data untuk no_induk ${no_induk} berhasil`);
      }
    } else if (company === "enakko") {
      for (const row of rawData) {
        const {
          "No Induk": no_induk,
          "Nama Karyawan": nama_karyawan,
          "Tanggal Masuk": tanggal_masuk,
          Jabatan: jabatan,
          Penempatan: penempatan,
          "Gaji Utuh": gaji_utuh,
          "Gaji Pokok": gaji_pokok,
          "BPJS Kesehatan": bpjs_kesehatan,
          Insentif: insentif,
          "Total Gaji": total_gaji,
          Keterangan: keterangan,
          "No HP": nohp,
        } = row;

        // Validasi data minimal
        if (!no_induk || !nama_karyawan) {
          console.log(`[UPLOAD] Skip baris karena No Induk atau Nama kosong`);
          skippedCount++;
          continue;
        }

        // CEK DATA DI BULAN YANG SAMA
        const [existingInMonth] = await db.query(
          `SELECT * FROM slip_gaji_enakko 
           WHERE user_id = ? 
           AND no_induk = ? 
           AND MONTH(created_at) = ? 
           AND YEAR(created_at) = ?`,
          [userId, no_induk, currentMonth, currentYear],
        );

        if (existingInMonth.length > 0) {
          console.log(`[UPLOAD] Data untuk no_induk ${no_induk} sudah ada di bulan ${currentMonth}/${currentYear}, dilewati`);
          duplicateInMonthCount++;
          continue;
        }

        // INSERT DATA BARU
        await db.query(
          `INSERT INTO slip_gaji_enakko
          (user_id, no_induk, nama_karyawan, tanggal_masuk, jabatan, penempatan,
           gaji_utuh, gaji_pokok, bpjs_kesehatan, insentif, total_gaji, 
           keterangan, nohp, status_slip, is_imported)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            no_induk,
            nama_karyawan,
            tanggal_masuk || null,
            jabatan || "",
            penempatan || "",
            parseFloat(gaji_utuh) || 0,
            parseFloat(gaji_pokok) || 0,
            parseFloat(bpjs_kesehatan) || 0,
            parseFloat(insentif) || 0,
            parseFloat(total_gaji) || 0,
            keterangan || "",
            nohp || "",
            "belum_dikirim",
            1, // is_imported = true
          ],
        );
        insertedCount++;
        console.log(`[UPLOAD] Insert data untuk no_induk ${no_induk} berhasil`);
      }
    } else {
      return res.status(400).json({ success: false, message: "Company tidak dikenali" });
    }

    // Hapus file sementara
    try {
      fs.unlinkSync(req.file.path);
    } catch (unlinkErr) {
      console.error("[UPLOAD] Error deleting temp file:", unlinkErr);
    }

    // Buat pesan response yang informatif
    let message = `Berhasil mengimport ${insertedCount} data baru untuk bulan ${currentMonth}/${currentYear}`;
    if (duplicateInMonthCount > 0) {
      message += `, ${duplicateInMonthCount} data dilewati karena sudah ada di bulan ini`;
    }
    if (skippedCount > 0) {
      message += `, ${skippedCount} data dilewati karena tidak valid`;
    }

    console.log(`[UPLOAD] Selesai: ${message}`);

    res.json({
      success: true,
      message: message,
      stats: {
        inserted: insertedCount,
        duplicateInMonth: duplicateInMonthCount,
        skipped: skippedCount,
        total: rawData.length,
      },
    });
  } catch (err) {
    console.error("[UPLOAD EXCEL ERROR]:", err);

    // Hapus file jika ada error
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkErr) {
        console.error("[UPLOAD] Error deleting temp file after error:", unlinkErr);
      }
    }

    res.status(500).json({ success: false, message: err.message });
  }
}
