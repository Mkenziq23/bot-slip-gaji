import db from "./db.js";
import XLSX from "xlsx";

export async function uploadExcel(req, res, number, company) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: "File tidak ditemukan" });
    }

    // Get user ID
    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    // Read Excel file
    const workbook = XLSX.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (!data || data.length === 0) {
      return res.status(400).json({ success: false, message: "File Excel kosong" });
    }

    console.log(`[UPLOAD] Processing ${data.length} rows for ${company}`);

    // Get current date for month/year filtering
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Get existing no_induk for current month to avoid duplicates
    const [existingData] = await db.query(
      `SELECT no_induk FROM ${tableName} 
       WHERE user_id = ? 
       AND MONTH(created_at) = ? 
       AND YEAR(created_at) = ?`,
      [userId, currentMonth, currentYear],
    );

    const existingNoInduk = new Set(existingData.map((row) => row.no_induk));

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors = [];

    // Process each row
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2; // +2 because row 1 is header

      try {
        // Validate required fields based on company
        let noInduk, nama, nohp;

        if (company === "hisana") {
          noInduk = row["No Induk"] || row["no_induk"] || row["NO INDUK"];
          nama = row["NAMA"] || row["Nama"] || row["nama"];
          nohp = row["NO HP"] || row["No HP"] || row["nohp"] || row["NO HP"];

          if (!noInduk) {
            throw new Error(`Baris ${rowNumber}: No Induk tidak boleh kosong`);
          }
          if (!nama) {
            throw new Error(`Baris ${rowNumber}: Nama tidak boleh kosong`);
          }
          if (!nohp) {
            throw new Error(`Baris ${rowNumber}: No HP tidak boleh kosong`);
          }

          // Check if no_induk already exists in current month
          if (existingNoInduk.has(noInduk.toString())) {
            console.log(`[UPLOAD] Skipping ${noInduk} - already exists in current month`);
            skippedCount++;
            errors.push(`Baris ${rowNumber}: Data dengan No Induk ${noInduk} sudah ada di bulan ini`);
            continue;
          }

          // Parse values
          const gaji = parseFloat(row["GAJI"] || row["Gaji"] || row["gaji"] || 0);
          const iuranBpjs = parseFloat(row["Iuran BPJS Ketenagakerjaan"] || row["Iuran BPJS"] || row["iuran_bpjs"] || 0);
          const kerajinan = parseFloat(row["KERAJINAN"] || row["Kerajinan"] || row["kerajinan"] || 0);
          const cuti = parseFloat(row["CUTI"] || row["Cuti"] || row["cuti"] || 0);
          const tunjBpjsPulsa = parseFloat(row["Tunj. BPJS & Pulsa"] || row["Tunj BPJS & Pulsa"] || row["tunj_bpjs_pulsa"] || 0);
          const um = parseFloat(row["UM"] || row["Um"] || row["um"] || 0);
          const kerja = parseInt(row["KERJA"] || row["Kerja"] || row["kerja"] || 0);

          // Calculate jumlah and gaji_total
          const jumlah = gaji - iuranBpjs + kerajinan + cuti + tunjBpjsPulsa;
          const gajiTotal = jumlah + um;

          const query = `
            INSERT INTO ${tableName} (
              user_id, no_induk, nama, posisi, store, awal_masuk, kerja,
              gaji, iuran_bpjs_ketenagakerjaan, kerajinan, cuti, tunj_bpjs_pulsa,
              jumlah, um, keterangan, gaji_total, nohp, status_slip,
              is_imported, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `;

          const values = [
            userId,
            noInduk.toString(),
            nama.toString(),
            row["POSISI"] || row["Posisi"] || row["posisi"] || "",
            row["STORE"] || row["Store"] || row["store"] || "",
            row["AWAL MASUK"] || row["Awal Masuk"] || row["awal_masuk"] || null,
            kerja,
            gaji,
            iuranBpjs,
            kerajinan,
            cuti,
            tunjBpjsPulsa,
            jumlah,
            um,
            row["KETERANGAN"] || row["Keterangan"] || row["keterangan"] || "",
            gajiTotal,
            nohp.toString(),
            "belum_dikirim",
            1,
          ];

          await db.query(query, values);
          successCount++;
          existingNoInduk.add(noInduk.toString());
        } else {
          // Enakko
          noInduk = row["No Induk"] || row["no_induk"] || row["NO INDUK"];
          nama = row["Nama Karyawan"] || row["NAMA KARYAWAN"] || row["nama_karyawan"] || row["Nama"];
          nohp = row["NO HP"] || row["No HP"] || row["nohp"];

          if (!noInduk) {
            throw new Error(`Baris ${rowNumber}: No Induk tidak boleh kosong`);
          }
          if (!nama) {
            throw new Error(`Baris ${rowNumber}: Nama Karyawan tidak boleh kosong`);
          }
          if (!nohp) {
            throw new Error(`Baris ${rowNumber}: No HP tidak boleh kosong`);
          }

          // Check if no_induk already exists in current month
          if (existingNoInduk.has(noInduk.toString())) {
            console.log(`[UPLOAD] Skipping ${noInduk} - already exists in current month`);
            skippedCount++;
            errors.push(`Baris ${rowNumber}: Data dengan No Induk ${noInduk} sudah ada di bulan ini`);
            continue;
          }

          const gajiUtuh = parseFloat(row["Gaji Utuh"] || row["GAJI UTUH"] || row["gaji_utuh"] || 0);
          const gajiPokok = parseFloat(row["Gaji Pokok"] || row["GAJI POKOK"] || row["gaji_pokok"] || 0);
          const bpjsKesehatan = parseFloat(row["BPJS Kesehatan"] || row["BPJS KESEHATAN"] || row["bpjs_kesehatan"] || 0);
          const insentif = parseFloat(row["Insentif"] || row["INSENTIF"] || row["insentif"] || 0);

          const totalGaji = gajiPokok + bpjsKesehatan + insentif;

          const query = `
            INSERT INTO ${tableName} (
              user_id, no_induk, nama_karyawan, tanggal_masuk, jabatan, penempatan,
              gaji_utuh, gaji_pokok, bpjs_kesehatan, insentif, total_gaji,
              keterangan, nohp, status_slip, is_imported, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `;

          let tanggalMasuk = null;
          if (row["Tanggal Masuk"] || row["TANGGAL MASUK"] || row["tanggal_masuk"]) {
            const tgl = row["Tanggal Masuk"] || row["TANGGAL MASUK"] || row["tanggal_masuk"];
            if (tgl) {
              // Try to parse date
              const parsedDate = new Date(tgl);
              if (!isNaN(parsedDate.getTime())) {
                tanggalMasuk = parsedDate.toISOString().split("T")[0];
              } else {
                tanggalMasuk = tgl;
              }
            }
          }

          const values = [
            userId,
            noInduk.toString(),
            nama.toString(),
            tanggalMasuk,
            row["Jabatan"] || row["JABATAN"] || row["jabatan"] || "",
            row["Penempatan"] || row["PENEMPATAN"] || row["penempatan"] || "",
            gajiUtuh,
            gajiPokok,
            bpjsKesehatan,
            insentif,
            totalGaji,
            row["Keterangan"] || row["KETERANGAN"] || row["keterangan"] || "",
            nohp.toString(),
            "belum_dikirim",
            1,
          ];

          await db.query(query, values);
          successCount++;
          existingNoInduk.add(noInduk.toString());
        }
      } catch (err) {
        console.error(`[UPLOAD] Error processing row ${rowNumber}:`, err.message);
        errorCount++;
        errors.push(`Baris ${rowNumber}: ${err.message}`);
      }
    }

    console.log(`[UPLOAD] Complete - Success: ${successCount}, Skipped: ${skippedCount}, Failed: ${errorCount}`);

    // Return response in same format as data karyawan import
    res.json({
      success: true,
      successCount: successCount,
      skippedCount: skippedCount,
      errorCount: errorCount,
      errors: errors,
      message: `Import selesai: ${successCount} berhasil, ${skippedCount} dilewati, ${errorCount} gagal`,
    });
  } catch (err) {
    console.error("[UPLOAD EXCEL ERROR]:", err);
    res.status(500).json({
      success: false,
      message: err.message,
      successCount: 0,
      skippedCount: 0,
      errorCount: 1,
      errors: [err.message],
    });
  }
}
