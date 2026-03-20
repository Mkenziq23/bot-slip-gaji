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

    console.log(`[UPLOAD] ${rawData.length} baris ditemukan di Excel`);

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

        // Cek apakah data sudah ada
        const [existing] = await db.query("SELECT * FROM slip_gaji_hisana WHERE user_id=? AND no_induk=?", [userId, no_induk]);

        if (existing.length) {
          const e = existing[0];
          // Bandingkan data, jika sama persis -> skip
          if (
            e.nama === nama &&
            e.posisi === posisi &&
            e.store === store &&
            e.awal_masuk === awal_masuk &&
            e.kerja == kerja &&
            parseFloat(e.gaji) === parseFloat(gaji) &&
            parseFloat(e.iuran_bpjs_ketenagakerjaan) === parseFloat(iuran_bpjs_ketenagakerjaan) &&
            parseFloat(e.kerajinan) === parseFloat(kerajinan) &&
            parseFloat(e.cuti) === parseFloat(cuti) &&
            parseFloat(e.tunj_bpjs_pulsa) === parseFloat(tunj_bpjs_pulsa) &&
            parseFloat(e.jumlah) === parseFloat(jumlah) &&
            parseFloat(e.um) === parseFloat(um) &&
            e.keterangan === keterangan &&
            parseFloat(e.gaji_total) === parseFloat(gaji_total) &&
            e.nohp === nohp
          ) {
            continue; // Data sama, skip
          }

          // Jika ada perubahan, update
          await db.query(
            `UPDATE slip_gaji_hisana SET 
              nama=?, posisi=?, store=?, awal_masuk=?, kerja=?, gaji=?, 
              iuran_bpjs_ketenagakerjaan=?, kerajinan=?, cuti=?, tunj_bpjs_pulsa=?, 
              jumlah=?, um=?, keterangan=?, gaji_total=?, nohp=? 
            WHERE id=?`,
            [
              nama,
              posisi,
              store,
              awal_masuk,
              kerja,
              parseFloat(gaji) || 0,
              parseFloat(iuran_bpjs_ketenagakerjaan) || 0,
              parseFloat(kerajinan) || 0,
              parseFloat(cuti) || 0,
              parseFloat(tunj_bpjs_pulsa) || 0,
              parseFloat(jumlah) || 0,
              parseFloat(um) || 0,
              keterangan,
              parseFloat(gaji_total) || 0,
              nohp,
              e.id,
            ],
          );
        } else {
          // Insert jika belum ada
          await db.query(
            `INSERT INTO slip_gaji_hisana
            (user_id, no_induk, nama, posisi, store, awal_masuk, kerja, gaji,
             iuran_bpjs_ketenagakerjaan, kerajinan, cuti, tunj_bpjs_pulsa,
             jumlah, um, keterangan, gaji_total, nohp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              no_induk,
              nama,
              posisi,
              store,
              awal_masuk,
              kerja,
              parseFloat(gaji) || 0,
              parseFloat(iuran_bpjs_ketenagakerjaan) || 0,
              parseFloat(kerajinan) || 0,
              parseFloat(cuti) || 0,
              parseFloat(tunj_bpjs_pulsa) || 0,
              parseFloat(jumlah) || 0,
              parseFloat(um) || 0,
              keterangan,
              parseFloat(gaji_total) || 0,
              nohp,
            ],
          );
        }
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

        const [existing] = await db.query("SELECT * FROM slip_gaji_enakko WHERE user_id=? AND no_induk=?", [userId, no_induk]);

        if (existing.length) {
          const e = existing[0];
          if (
            e.nama_karyawan === nama_karyawan &&
            e.tanggal_masuk === tanggal_masuk &&
            e.jabatan === jabatan &&
            e.penempatan === penempatan &&
            parseFloat(e.gaji_utuh) === parseFloat(gaji_utuh) &&
            parseFloat(e.gaji_pokok) === parseFloat(gaji_pokok) &&
            parseFloat(e.bpjs_kesehatan) === parseFloat(bpjs_kesehatan) &&
            parseFloat(e.insentif) === parseFloat(insentif) &&
            parseFloat(e.total_gaji) === parseFloat(total_gaji) &&
            e.keterangan === keterangan &&
            e.nohp === nohp
          ) {
            continue; // Sama persis, skip
          }

          await db.query(
            `UPDATE slip_gaji_enakko SET
              nama_karyawan=?, tanggal_masuk=?, jabatan=?, penempatan=?,
              gaji_utuh=?, gaji_pokok=?, bpjs_kesehatan=?, insentif=?, total_gaji=?,
              keterangan=?, nohp=?
            WHERE id=?`,
            [nama_karyawan, tanggal_masuk, jabatan, penempatan, parseFloat(gaji_utuh) || 0, parseFloat(gaji_pokok) || 0, parseFloat(bpjs_kesehatan) || 0, parseFloat(insentif) || 0, parseFloat(total_gaji) || 0, keterangan, nohp, e.id],
          );
        } else {
          // Insert jika belum ada
          await db.query(
            `INSERT INTO slip_gaji_enakko
            (user_id, no_induk, nama_karyawan, tanggal_masuk, jabatan, penempatan,
             gaji_utuh, gaji_pokok, bpjs_kesehatan, insentif, total_gaji, keterangan, nohp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              no_induk,
              nama_karyawan,
              tanggal_masuk,
              jabatan,
              penempatan,
              parseFloat(gaji_utuh) || 0,
              parseFloat(gaji_pokok) || 0,
              parseFloat(bpjs_kesehatan) || 0,
              parseFloat(insentif) || 0,
              parseFloat(total_gaji) || 0,
              keterangan,
              nohp,
            ],
          );
        }
      }
    } else {
      return res.status(400).json({ success: false, message: "Company tidak dikenali" });
    }

    // Hapus file sementara
    fs.unlinkSync(req.file.path);

    res.json({ success: true, message: "Upload selesai, data baru ditambahkan atau diperbarui" });
  } catch (err) {
    console.error("[UPLOAD EXCEL ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
}
