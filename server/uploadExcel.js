import db from "./db.js";
import XLSX from "xlsx";

// Helper function untuk mendapatkan nama tabel karyawan
function getKaryawanTableName(company) {
  return company === "hisana" ? "data_karyawan_hisana" : "data_karyawan_enakko";
}

// Helper function untuk parse currency
function parseCurrencyFromExcel(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const cleanValue = String(value).replace(/[^\d]/g, "");
  return parseInt(cleanValue) || 0;
}

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
    const karyawanTable = getKaryawanTableName(company);

    // Read Excel file
    const workbook = XLSX.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (!data || data.length === 0) {
      return res.status(400).json({ success: false, message: "File Excel kosong" });
    }

    console.log(`[UPLOAD] Processing ${data.length} rows for ${company}`);

    // Load semua karyawan untuk mapping no_induk ke karyawan_id
    const [karyawanList] = await db.query(`SELECT id as karyawan_id, no_induk FROM ${karyawanTable} WHERE user_id = ?`, [userId]);

    const karyawanMap = new Map();
    karyawanList.forEach((k) => {
      karyawanMap.set(k.no_induk, k);
    });

    console.log(`[UPLOAD] Loaded ${karyawanList.length} karyawan for mapping`);

    // Get current date for month/year filtering
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Get existing karyawan_id for current month to avoid duplicates
    const [existingData] = await db.query(
      `SELECT karyawan_id FROM ${tableName} 
       WHERE user_id = ? 
       AND MONTH(created_at) = ? 
       AND YEAR(created_at) = ?`,
      [userId, currentMonth, currentYear],
    );

    const existingKaryawanIds = new Set(existingData.map((row) => row.karyawan_id));

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
        let noInduk, nohp;

        if (company === "hisana") {
          noInduk = row["No Induk"] || row["no_induk"] || row["NO INDUK"];
          nohp = row["NO HP"] || row["No HP"] || row["nohp"];

          if (!noInduk) {
            throw new Error(`Baris ${rowNumber}: No Induk tidak boleh kosong`);
          }
          if (!nohp) {
            throw new Error(`Baris ${rowNumber}: No HP tidak boleh kosong`);
          }

          // Cari karyawan_id berdasarkan no_induk
          const karyawan = karyawanMap.get(noInduk.toString());
          if (!karyawan) {
            throw new Error(`Baris ${rowNumber}: No Induk "${noInduk}" tidak ditemukan di database karyawan`);
          }

          // Check if karyawan already exists in current month
          if (existingKaryawanIds.has(karyawan.karyawan_id)) {
            console.log(`[UPLOAD] Skipping ${noInduk} - already exists in current month`);
            skippedCount++;
            errors.push(`Baris ${rowNumber}: Data dengan No Induk ${noInduk} sudah ada di bulan ini`);
            continue;
          }

          // Parse values
          const kerja = parseInt(row["Kerja"] || row["KERJA"] || 0);
          const gaji = parseCurrencyFromExcel(row["Gaji"] || row["GAJI"] || 0);
          const iuranBpjs = parseCurrencyFromExcel(row["Iuran BPJS Ketenagakerjaan"] || row["Iuran BPJS"] || 0);
          const kerajinan = parseCurrencyFromExcel(row["Kerajinan"] || row["KERAJINAN"] || 0);
          const cuti = parseCurrencyFromExcel(row["Cuti"] || row["CUTI"] || 0);
          const tunjBpjsPulsa = parseCurrencyFromExcel(row["Tunj. BPJS & Pulsa"] || row["Tunj BPJS & Pulsa"] || 0);
          const um = parseCurrencyFromExcel(row["UM"] || row["Um"] || 0);
          const keterangan = row["KETERANGAN"] || row["Keterangan"] || "";

          // Calculate jumlah and gaji_total
          const jumlah = gaji - iuranBpjs + kerajinan + cuti + tunjBpjsPulsa;
          const gajiTotal = jumlah + um;

          const query = `
            INSERT INTO ${tableName} (
              user_id, karyawan_id, kerja, gaji, iuran_bpjs_ketenagakerjaan,
              kerajinan, cuti, tunj_bpjs_pulsa, jumlah, um, keterangan,
              gaji_total, nohp, status_slip, is_imported, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `;

          const values = [userId, karyawan.karyawan_id, kerja, gaji, iuranBpjs, kerajinan, cuti, tunjBpjsPulsa, jumlah, um, keterangan, gajiTotal, nohp.toString(), "belum_dikirim", 1];

          await db.query(query, values);
          successCount++;
          existingKaryawanIds.add(karyawan.karyawan_id);
        } else {
          // Enakko
          noInduk = row["No Induk"] || row["no_induk"] || row["NO INDUK"];
          nohp = row["NO HP"] || row["No HP"] || row["nohp"];

          if (!noInduk) {
            throw new Error(`Baris ${rowNumber}: No Induk tidak boleh kosong`);
          }
          if (!nohp) {
            throw new Error(`Baris ${rowNumber}: No HP tidak boleh kosong`);
          }

          // Cari karyawan_id berdasarkan no_induk
          const karyawan = karyawanMap.get(noInduk.toString());
          if (!karyawan) {
            throw new Error(`Baris ${rowNumber}: No Induk "${noInduk}" tidak ditemukan di database karyawan`);
          }

          // Check if karyawan already exists in current month
          if (existingKaryawanIds.has(karyawan.karyawan_id)) {
            console.log(`[UPLOAD] Skipping ${noInduk} - already exists in current month`);
            skippedCount++;
            errors.push(`Baris ${rowNumber}: Data dengan No Induk ${noInduk} sudah ada di bulan ini`);
            continue;
          }

          const gajiPokok = parseCurrencyFromExcel(row["Gaji Pokok"] || row["GAJI POKOK"] || 0);
          const bpjsKesehatan = parseCurrencyFromExcel(row["BPJS Kesehatan"] || row["BPJS KESEHATAN"] || 0);
          const insentif = parseCurrencyFromExcel(row["Insentif"] || row["INSENTIF"] || 0);
          const keterangan = row["Keterangan"] || row["KETERANGAN"] || "";

          const totalGaji = gajiPokok + bpjsKesehatan + insentif;

          const query = `
            INSERT INTO ${tableName} (
              user_id, karyawan_id, gaji_pokok, bpjs_kesehatan,
              insentif, total_gaji, keterangan, nohp, status_slip, is_imported, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `;

          const values = [userId, karyawan.karyawan_id, gajiPokok, bpjsKesehatan, insentif, totalGaji, keterangan, nohp.toString(), "belum_dikirim", 1];

          await db.query(query, values);
          successCount++;
          existingKaryawanIds.add(karyawan.karyawan_id);
        }
      } catch (err) {
        console.error(`[UPLOAD] Error processing row ${rowNumber}:`, err.message);
        errorCount++;
        errors.push(`Baris ${rowNumber}: ${err.message}`);
      }
    }

    console.log(`[UPLOAD] Complete - Success: ${successCount}, Skipped: ${skippedCount}, Failed: ${errorCount}`);

    // Return response
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
