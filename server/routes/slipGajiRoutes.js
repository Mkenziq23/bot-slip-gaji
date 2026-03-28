import express from "express";
import db from "../db.js";
import multer from "multer";
import { uploadExcel } from "../uploadExcel.js";
import kirimSlip from "../../bot/sendMessage/kirimSlipGajiHisana.js";
import kirimSlipEnakko from "../../bot/sendMessage/kirimSlipGajiEnakko.js";
import { progress } from "../progress.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

/*
========================
CHECK LOGIN
========================
*/
function checkLogin(req, res) {
  const number = req.session.number;

  if (!number) {
    res.status(401).json({
      success: false,
      message: "Belum login",
    });
    return null;
  }

  return number;
}

// ========================
// GET DATA SLIP (HANYA BULAN INI)
// ========================
router.get("/my-slip", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    console.log(`[SERVER] GET /my-slip - company: ${company}, table: ${tableName}, user: ${number}`);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);

    if (!users.length) {
      console.log(`[SERVER] User tidak ditemukan untuk nomor: ${number}`);
      return res.json([]);
    }

    const userId = users[0].id;
    console.log(`[SERVER] userId: ${userId}`);

    // Get current date
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Hanya ambil data dari bulan ini
    const [rows] = await db.query(
      `
      SELECT * FROM ${tableName} 
      WHERE user_id = ? 
      AND MONTH(created_at) = ? 
      AND YEAR(created_at) = ?
      ORDER BY id DESC
    `,
      [userId, currentMonth, currentYear],
    );

    console.log(`[SERVER] Data ditemukan untuk bulan ${currentMonth}/${currentYear}: ${rows.length} baris`);

    if (rows.length > 0) {
      console.log(`[SERVER] Sample data:`, rows[0]);
    }

    res.json(rows);
  } catch (err) {
    console.error("[SERVER] GET SLIP ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/*
========================
INSERT SLIP (DENGAN PARAMETER COMPANY)
========================
*/
router.post("/slip", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);

    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;
    const d = req.body;

    console.log("=".repeat(50));
    console.log("[INSERT] Received data:", JSON.stringify(d, null, 2));
    console.log("[INSERT] Company:", company);
    console.log("[INSERT] Table:", tableName);
    console.log("[INSERT] User ID:", userId);

    if (company === "hisana") {
      // PERBAIKAN: Hisana insert - hanya field yang diperlukan
      const query = `
        INSERT INTO ${tableName}
        (user_id, no_induk, nama, posisi, store, awal_masuk, kerja, gaji,
        iuran_bpjs_ketenagakerjaan, kerajinan, cuti, tunj_bpjs_pulsa,
        jumlah, um, keterangan, gaji_total, nohp, status_slip)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        userId,
        d.no_induk || "",
        d.nama || "",
        d.posisi || "",
        d.store || "",
        d.awal_masuk || null,
        d.kerja || 0,
        d.gaji || 0,
        d.iuran_bpjs_ketenagakerjaan || 0,
        d.kerajinan || 0,
        d.cuti || 0,
        d.tunj_bpjs_pulsa || 0,
        d.jumlah || 0,
        d.um || 0,
        d.keterangan || "",
        d.gaji_total || 0,
        d.nohp || "",
        "belum_dikirim",
      ];

      console.log("[INSERT Hisana] Query:", query);
      console.log("[INSERT Hisana] Values:", values);

      await db.query(query, values);
    } else {
      // Enakko insert logic
      console.log("[INSERT Enakko] Processing...");

      // Validasi field yang diperlukan
      const requiredFields = ["no_induk", "tanggal_masuk", "jabatan", "nohp"];
      const missingFields = requiredFields.filter((field) => !d[field]);

      if (missingFields.length > 0) {
        console.error("[INSERT Enakko] Missing fields:", missingFields);
        return res.status(400).json({
          success: false,
          message: `Field yang diperlukan tidak lengkap: ${missingFields.join(", ")}`,
        });
      }

      // Pastikan field nama_karyawan ada
      const namaKaryawan = d.nama_karyawan || d.nama;
      if (!namaKaryawan) {
        console.error("[INSERT Enakko] Missing nama_karyawan field");
        return res.status(400).json({
          success: false,
          message: "Nama karyawan harus diisi",
        });
      }

      const query = `
        INSERT INTO ${tableName}
        (user_id, no_induk, nama_karyawan, tanggal_masuk, jabatan, penempatan,
        gaji_utuh, gaji_pokok, bpjs_kesehatan, insentif, 
        total_gaji, keterangan, nohp, status_slip)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        userId,
        d.no_induk,
        namaKaryawan,
        d.tanggal_masuk,
        d.jabatan,
        d.penempatan || "",
        parseFloat(d.gaji_utuh) || 0,
        parseFloat(d.gaji_pokok) || 0,
        parseFloat(d.bpjs_kesehatan) || 0,
        parseFloat(d.insentif) || 0,
        parseFloat(d.total_gaji) || 0,
        d.keterangan || "",
        d.nohp,
        "belum_dikirim",
      ];

      console.log("[INSERT Enakko] Query:", query);
      console.log("[INSERT Enakko] Values:", values);

      await db.query(query, values);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("=".repeat(50));
    console.error("[INSERT ERROR] Details:");
    console.error("Error message:", err.message);
    console.error("Error code:", err.code);
    console.error("SQL State:", err.sqlState);
    console.error("SQL Message:", err.sqlMessage);
    console.error("=".repeat(50));

    res.status(500).json({
      success: false,
      message: err.sqlMessage || err.message,
      code: err.code,
    });
  }
});

/*
========================
UPDATE SLIP (DENGAN PARAMETER COMPANY)
========================
*/
router.put("/slip/:id", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const id = req.params.id;
    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);

    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;
    const d = req.body;

    console.log(`[UPDATE] Company: ${company}, ID: ${id}, Data:`, d);

    let result;
    if (company === "hisana") {
      // PERBAIKAN: Hisana update - hanya field yang diperlukan
      const query = `
        UPDATE ${tableName} SET
          no_induk = ?,
          nama = ?,
          posisi = ?,
          store = ?,
          awal_masuk = ?,
          kerja = ?,
          gaji = ?,
          iuran_bpjs_ketenagakerjaan = ?,
          kerajinan = ?,
          cuti = ?,
          tunj_bpjs_pulsa = ?,
          jumlah = ?,
          um = ?,
          keterangan = ?,
          gaji_total = ?,
          nohp = ?
        WHERE id = ? AND user_id = ?
      `;

      const values = [
        d.no_induk || "",
        d.nama || "",
        d.posisi || "",
        d.store || "",
        d.awal_masuk || null,
        d.kerja || 0,
        d.gaji || 0,
        d.iuran_bpjs_ketenagakerjaan || 0,
        d.kerajinan || 0,
        d.cuti || 0,
        d.tunj_bpjs_pulsa || 0,
        d.jumlah || 0,
        d.um || 0,
        d.keterangan || "",
        d.gaji_total || 0,
        d.nohp || "",
        id,
        userId,
      ];

      console.log("[UPDATE Hisana] Query:", query);
      console.log("[UPDATE Hisana] Values:", values);

      [result] = await db.query(query, values);
    } else {
      // PERBAIKAN: Enakko update
      const namaKaryawan = d.nama_karyawan || d.nama;

      const query = `
        UPDATE ${tableName} SET
          no_induk = ?,
          nama_karyawan = ?,
          tanggal_masuk = ?,
          jabatan = ?,
          penempatan = ?,
          gaji_utuh = ?,
          gaji_pokok = ?,
          bpjs_kesehatan = ?,
          insentif = ?,
          total_gaji = ?,
          keterangan = ?,
          nohp = ?
        WHERE id = ? AND user_id = ?
      `;

      const values = [
        d.no_induk || "",
        namaKaryawan || "",
        d.tanggal_masuk || null,
        d.jabatan || "",
        d.penempatan || "",
        parseFloat(d.gaji_utuh) || 0,
        parseFloat(d.gaji_pokok) || 0,
        parseFloat(d.bpjs_kesehatan) || 0,
        parseFloat(d.insentif) || 0,
        parseFloat(d.total_gaji) || 0,
        d.keterangan || "",
        d.nohp || "",
        id,
        userId,
      ];

      console.log("[UPDATE Enakko] Query:", query);
      console.log("[UPDATE Enakko] Values:", values);

      [result] = await db.query(query, values);
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Data tidak ditemukan atau tidak memiliki akses",
      });
    }

    res.json({
      success: true,
      message: "Data berhasil diperbarui",
    });
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({
      success: false,
      message: err.sqlMessage || err.message,
      code: err.code,
    });
  }
});
/*
========================
DELETE SLIP (DENGAN PARAMETER COMPANY)
========================
*/
router.delete("/slip/:id", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const id = req.params.id;
    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);

    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;

    const [result] = await db.query(`DELETE FROM ${tableName} WHERE id = ? AND user_id = ?`, [id, userId]);

    res.json({
      success: result.affectedRows > 0,
    });
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================
// UPLOAD EXCEL
// ========================
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || req.body.company || "hisana";
    console.log(`[UPLOAD ROUTE] Company: ${company}, User: ${number}`);

    // Panggil fungsi uploadExcel
    await uploadExcel(req, res, number, company);
  } catch (err) {
    console.error("[UPLOAD ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// KIRIM SLIP WHATSAPP
// ========================
router.post("/start-send", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const selected = req.body.selected || [];
    const company = req.body.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);

    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;

    // Ambil data berdasarkan user_id dan no_induk yang dipilih
    const [rows] = await db.query(`SELECT * FROM ${tableName} WHERE user_id = ?`, [userId]);

    let toSend;
    if (company === "hisana") {
      toSend = rows.filter((d) => selected.includes(d.no_induk) && d.status_slip !== "terkirim");
    } else {
      toSend = rows.filter((d) => selected.includes(d.no_induk) && d.status_slip !== "terkirim");
    }

    if (!toSend.length) {
      return res.status(400).json({ success: false, message: "Tidak ada data terpilih" });
    }

    progress.running = true;
    progress.total = toSend.length;
    progress.sent = 0;
    progress.failed = 0;

    res.json({ success: true });

    // Proses pengiriman secara asynchronous
    (async () => {
      for (const karyawan of toSend) {
        try {
          if (company === "hisana") {
            await kirimSlip(karyawan, number);
          } else {
            await kirimSlipEnakko(karyawan, number);
          }

          // Update status menjadi terkirim
          await db.query(`UPDATE ${tableName} SET status_slip = 'terkirim' WHERE id = ? AND user_id = ?`, [karyawan.id, userId]);
          progress.sent++;
        } catch (err) {
          console.error(`Gagal kirim ke ${karyawan.no_induk}:`, err);
          // Status tetap belum_dikirim karena gagal
          progress.failed++;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      progress.running = false;
    })();
  } catch (err) {
    console.error("START SEND ERROR:", err);
    progress.running = false;
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================
// GET PROGRESS
// ========================
router.get("/progress", (req, res) => {
  res.json(progress);
});

// ========================
// DUPLIKASI DATA DARI BULAN SEBELUMNYA (MERGE LOGIC WITH FLAG)
// ========================
router.post("/duplicate-data", async (req, res) => {
  try {
    console.log("[DUPLICATE] Request received");

    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    // Get user ID
    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    // Get current date and previous month
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    let previousMonth = currentMonth - 1;
    let previousYear = currentYear;
    if (previousMonth === 0) {
      previousMonth = 12;
      previousYear = currentYear - 1;
    }

    console.log(`[DUPLICATE] Current: ${currentYear}-${currentMonth}, Previous: ${previousYear}-${previousMonth}`);

    // Get all data from previous month
    let previousData;
    try {
      const query = `
        SELECT * FROM ${tableName} 
        WHERE user_id = ? 
        AND MONTH(created_at) = ? 
        AND YEAR(created_at) = ?
        ORDER BY id
      `;
      [previousData] = await db.query(query, [userId, previousMonth, previousYear]);
      console.log(`[DUPLICATE] Found ${previousData.length} records from previous month`);
    } catch (err) {
      console.error("[DUPLICATE] Error fetching previous data:", err);
      return res.status(500).json({ success: false, message: "Error fetching data: " + err.message });
    }

    if (previousData.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada data dari bulan ${previousMonth}/${previousYear} untuk diduplikasi`,
      });
    }

    // Get existing data in current month (to check which employees already have data)
    let existingData;
    try {
      const query = `
        SELECT no_induk, is_duplicated FROM ${tableName} 
        WHERE user_id = ? 
        AND MONTH(created_at) = ? 
        AND YEAR(created_at) = ?
      `;
      [existingData] = await db.query(query, [userId, currentMonth, currentYear]);
      console.log(`[DUPLICATE] Existing employees in current month: ${existingData.length}`);
    } catch (err) {
      console.error("[DUPLICATE] Error checking existing data:", err);
      return res.status(500).json({ success: false, message: "Error checking existing data: " + err.message });
    }

    // Create set of existing employee IDs
    const existingEmployeeIds = new Set(existingData.map((item) => item.no_induk));
    console.log(`[DUPLICATE] Existing employee IDs:`, Array.from(existingEmployeeIds));

    // Filter data from previous month to only include employees NOT in current month
    const dataToDuplicate = previousData.filter((item) => !existingEmployeeIds.has(item.no_induk));
    console.log(`[DUPLICATE] Found ${dataToDuplicate.length} new employees to duplicate (out of ${previousData.length} total)`);

    if (dataToDuplicate.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada data baru untuk diduplikasi. Semua karyawan dari bulan ${previousMonth}/${previousYear} sudah memiliki data di bulan ini.`,
      });
    }

    // Duplicate only the new data with flags
    let duplicatedCount = 0;
    let skippedCount = previousData.length - dataToDuplicate.length;
    let errors = [];
    let duplicatedIds = [];

    // Di dalam route duplicate-data, pastikan created_at diisi dengan tanggal sekarang
    for (const oldData of dataToDuplicate) {
      try {
        // Remove id and created_at, then insert as new
        const { id, created_at, ...newData } = oldData;

        // Set flags for duplicated data
        newData.status_slip = "belum_dikirim";
        newData.is_duplicated = true;
        newData.duplicated_from_id = id;
        newData.duplicated_at = new Date();
        // created_at akan otomatis terisi dengan CURRENT_TIMESTAMP oleh database

        // Build insert query
        const fields = Object.keys(newData);
        const values = Object.values(newData);
        const placeholders = fields.map(() => "?").join(",");

        const insertQuery = `INSERT INTO ${tableName} (${fields.join(",")}) VALUES (${placeholders})`;

        console.log(`[DUPLICATE] Inserting record for employee: ${oldData.no_induk}`);
        const [result] = await db.query(insertQuery, values);
        duplicatedIds.push(result.insertId);
        duplicatedCount++;
      } catch (err) {
        console.error(`[DUPLICATE] Error inserting record for ${oldData.no_induk}:`, err);
        errors.push(`${oldData.no_induk}: ${err.message}`);
      }
    }

    console.log(`[DUPLICATE] Summary: Duplicated ${duplicatedCount} new records, Skipped ${skippedCount} existing records`);

    if (duplicatedCount === 0 && errors.length > 0) {
      return res.status(500).json({
        success: false,
        message: `Gagal menduplikasi data. Errors: ${errors.join(", ")}`,
      });
    }

    // Prepare message
    let message = `Berhasil menduplikasi ${duplicatedCount} data baru dari bulan ${previousMonth}/${previousYear}`;
    if (skippedCount > 0) {
      message += `\n\n${skippedCount} karyawan yang sudah memiliki data di bulan ini tidak diduplikasi.`;
    }

    res.json({
      success: true,
      message: message,
      duplicatedCount: duplicatedCount,
      skippedCount: skippedCount,
      totalPrevious: previousData.length,
      duplicatedIds: duplicatedIds,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("[DUPLICATE ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// BATALKAN DUPLIKASI (HAPUS HANYA DATA HASIL DUPLIKASI)
// ========================
router.post("/cancel-duplicate", async (req, res) => {
  try {
    console.log("[CANCEL DUPLICATE] Request received");

    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    // Get user ID
    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    // Get current date
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    console.log(`[CANCEL DUPLICATE] Checking data for ${currentYear}-${currentMonth}, user ${userId}, company ${company}`);

    // First, get all data in current month - PERBAIKAN: gunakan kolom yang sesuai untuk nama
    let currentData;
    let getDataQuery;

    if (company === "hisana") {
      getDataQuery = `
        SELECT id, no_induk, nama, is_duplicated 
        FROM ${tableName} 
        WHERE user_id = ? 
        AND MONTH(created_at) = ? 
        AND YEAR(created_at) = ?
      `;
    } else {
      getDataQuery = `
        SELECT id, no_induk, nama_karyawan as nama, is_duplicated 
        FROM ${tableName} 
        WHERE user_id = ? 
        AND MONTH(created_at) = ? 
        AND YEAR(created_at) = ?
      `;
    }

    [currentData] = await db.query(getDataQuery, [userId, currentMonth, currentYear]);

    if (currentData.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada data dari bulan ${currentMonth}/${currentYear} untuk dibatalkan`,
      });
    }

    // Separate data into duplicated and manual input
    const duplicatedData = currentData.filter((item) => item.is_duplicated === 1);
    const manualData = currentData.filter((item) => item.is_duplicated !== 1);

    console.log(`[CANCEL DUPLICATE] Found: ${duplicatedData.length} duplicated records, ${manualData.length} manual records`);

    if (duplicatedData.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada data hasil duplikasi di bulan ${currentMonth}/${currentYear} untuk dibatalkan. Data yang ada adalah hasil input manual.`,
      });
    }

    // Get IDs of duplicated data to delete
    const duplicatedIds = duplicatedData.map((item) => item.id);

    // Delete only duplicated data
    const deleteQuery = `
      DELETE FROM ${tableName} 
      WHERE id IN (${duplicatedIds.map(() => "?").join(",")})
    `;

    const [result] = await db.query(deleteQuery, duplicatedIds);

    console.log(`[CANCEL DUPLICATE] Deleted ${result.affectedRows} duplicated records`);

    // Prepare detailed message
    let message = `Berhasil membatalkan duplikasi. ${result.affectedRows} data hasil duplikasi telah dihapus.`;

    if (manualData.length > 0) {
      message += `\n\n${manualData.length} data input manual tetap dipertahankan.`;
    }

    res.json({
      success: true,
      message: message,
      deletedCount: result.affectedRows,
      manualDataCount: manualData.length,
      duplicatedDataList: duplicatedData.map((d) => ({
        id: d.id,
        no_induk: d.no_induk,
        nama: d.nama, // Sekarang nama sudah tersedia untuk kedua perusahaan
      })),
    });
  } catch (err) {
    console.error("[CANCEL DUPLICATE ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// CHECK DUPLICATE STATUS
// ========================
router.get("/check-duplicate-status", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    // Get user ID
    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    // Get current date
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Check if there are duplicated data in current month
    let result;
    const query = `
      SELECT COUNT(*) as count FROM ${tableName} 
      WHERE user_id = ? 
      AND MONTH(created_at) = ? 
      AND YEAR(created_at) = ?
      AND is_duplicated = 1
    `;
    [result] = await db.query(query, [userId, currentMonth, currentYear]);

    const hasRecentDuplicate = result[0].count > 0;

    console.log(`[CHECK STATUS] User ${userId}, Month ${currentMonth}/${currentYear}, Has duplicated data: ${hasRecentDuplicate}`);

    res.json({
      success: true,
      hasRecentDuplicate,
    });
  } catch (err) {
    console.error("[CHECK DUPLICATE STATUS ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
