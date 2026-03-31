import express from "express";
import db from "../db.js";
import multer from "multer";
import { uploadExcel } from "../uploadExcel.js";
import kirimSlip from "../../bot/sendMessage/kirimSlipGajiHisana.js";
import kirimSlipEnakko from "../../bot/sendMessage/kirimSlipGajiEnakko.js";
import { progress } from "../progress.js";
import { kirimPembatalanSlipHisana, kirimPembatalanSlipEnakko } from "../../bot/cancelMessage/cancelSlipGaji.js";

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
// GET DATA SLIP DENGAN FILTER BULAN & TAHUN
// ========================
router.get("/my-slip", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const month = req.query.month;
    const year = req.query.year;
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    console.log(`[SERVER] GET /my-slip`);
    console.log(`  Company: ${company}`);
    console.log(`  Month filter: ${month || "none"}`);
    console.log(`  Year filter: ${year || "none"}`);
    console.log(`  User: ${number}`);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);

    if (!users.length) {
      console.log(`[SERVER] User tidak ditemukan untuk nomor: ${number}`);
      return res.json([]);
    }

    const userId = users[0].id;
    console.log(`[SERVER] userId: ${userId}`);

    // Build query with filters
    let query = `
      SELECT * FROM ${tableName} 
      WHERE user_id = ? 
    `;
    const queryParams = [userId];

    // Add month filter - jika month ada dan bukan "all"
    if (month && month !== "all" && month !== "") {
      query += ` AND MONTH(created_at) = ?`;
      queryParams.push(parseInt(month));
      console.log(`[SERVER] Adding month filter: ${month}`);
    }

    // Add year filter - jika year ada dan bukan "all"
    if (year && year !== "all" && year !== "") {
      query += ` AND YEAR(created_at) = ?`;
      queryParams.push(parseInt(year));
      console.log(`[SERVER] Adding year filter: ${year}`);
    }

    query += ` ORDER BY created_at DESC, id DESC`;

    console.log(`[SERVER] Final query: ${query}`);
    console.log(`[SERVER] Query params:`, queryParams);

    const [rows] = await db.query(query, queryParams);

    console.log(`[SERVER] Data ditemukan: ${rows.length} baris`);

    if (rows.length > 0) {
      console.log(`[SERVER] Sample data - created_at: ${rows[0].created_at}, month: ${rows[0].created_at.getMonth() + 1}, year: ${rows[0].created_at.getFullYear()}`);
    }

    res.json(rows);
  } catch (err) {
    console.error("[SERVER] GET SLIP ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========================
// GET AVAILABLE YEARS FOR SLIP
// ========================
router.get("/slip-years", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    if (!["hisana", "enakko"].includes(company)) {
      return res.status(400).json({ success: false, message: "Company tidak valid" });
    }

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;

    // Get distinct years from created_at
    const [rows] = await db.query(`SELECT DISTINCT YEAR(created_at) as tahun FROM ${tableName} WHERE user_id = ? ORDER BY tahun DESC`, [userId]);

    const years = rows.map((row) => row.tahun);

    console.log(`[SLIP YEARS] Available years for ${company}:`, years);

    res.json({ success: true, years });
  } catch (err) {
    console.error("[GET SLIP YEARS ERROR]:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
  }
});

// ========================
// INSERT SLIP (DENGAN PARAMETER COMPANY)
// ========================
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

    // Get current date for month/year filtering
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Check if no_induk already exists for this user in current month
    const noInduk = company === "hisana" ? d.no_induk : d.no_induk;
    const [existing] = await db.query(
      `SELECT COUNT(*) as count FROM ${tableName} 
       WHERE user_id = ? 
       AND no_induk = ? 
       AND MONTH(created_at) = ? 
       AND YEAR(created_at) = ?`,
      [userId, noInduk, currentMonth, currentYear],
    );

    if (existing[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Nomor induk ${noInduk} sudah ada untuk bulan ini. Silakan gunakan nomor induk yang berbeda atau edit data yang sudah ada.`,
      });
    }

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

    // Get current date for month/year filtering
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Check if no_induk already exists for this user in current month (excluding current record)
    const noInduk = company === "hisana" ? d.no_induk : d.no_induk;
    const [existing] = await db.query(
      `SELECT COUNT(*) as count FROM ${tableName} 
       WHERE user_id = ? 
       AND no_induk = ? 
       AND MONTH(created_at) = ? 
       AND YEAR(created_at) = ?
       AND id != ?`,
      [userId, noInduk, currentMonth, currentYear, id],
    );

    if (existing[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Nomor induk ${noInduk} sudah digunakan oleh data lain pada bulan ini. Silakan gunakan nomor induk yang berbeda.`,
      });
    }

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
// BATAL KIRIM SLIP (UNDO SEND)
// ========================
router.post("/undo-send", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const { selected, company, cancellation_note } = req.body;
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";

    if (!selected || selected.length === 0) {
      return res.status(400).json({ success: false, message: "Tidak ada data yang dipilih" });
    }

    const [users] = await db.query("SELECT id, nomor_wa FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;
    const senderNumber = users[0].nomor_wa;

    // Ambil data yang akan dibatalkan (hanya yang statusnya terkirim)
    const placeholders = selected.map(() => "?").join(",");
    const [rows] = await db.query(
      `SELECT * FROM ${tableName} 
       WHERE id IN (${placeholders}) 
       AND user_id = ? 
       AND status_slip = 'terkirim'`,
      [...selected, userId],
    );

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Tidak ada data dengan status terkirim yang dipilih",
      });
    }

    // Kirim pesan pembatalan ke nomor WhatsApp
    const cancelMessages = [];
    for (const slip of rows) {
      try {
        let result;
        if (company === "hisana") {
          result = await kirimPembatalanSlipHisana(slip, senderNumber, cancellation_note);
        } else {
          result = await kirimPembatalanSlipEnakko(slip, senderNumber, cancellation_note);
        }

        cancelMessages.push({
          id: slip.id,
          no_induk: slip.no_induk,
          nama: slip.nama || slip.nama_karyawan,
          success: result.success,
          message: result.message,
        });

        // Delay 1 detik antar pengiriman
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        console.error(`Error sending cancel notification to ${slip.no_induk}:`, err);
        cancelMessages.push({
          id: slip.id,
          no_induk: slip.no_induk,
          nama: slip.nama || slip.nama_karyawan,
          success: false,
          message: err.message,
        });
      }
    }

    // Update status menjadi "dibatalkan" di database
    const updateQuery = `
      UPDATE ${tableName} 
      SET status_slip = 'dibatalkan', 
          cancelled_at = NOW(),
          cancellation_note = ?,
          cancelled_by = ?
      WHERE id IN (${placeholders}) 
      AND user_id = ?
    `;

    const finalCancellationNote = cancellation_note || `Pembatalan kirim slip gaji pada ${new Date().toLocaleString("id-ID")}`;
    const [updateResult] = await db.query(updateQuery, [finalCancellationNote, userId, ...selected, userId]);

    // Hitung statistik
    const successCount = cancelMessages.filter((m) => m.success).length;
    const failedCount = cancelMessages.filter((m) => !m.success).length;

    res.json({
      success: true,
      message: `Berhasil membatalkan ${updateResult.affectedRows} slip gaji. Notifikasi: ${successCount} berhasil, ${failedCount} gagal.`,
      details: cancelMessages,
      successCount,
      failedCount,
      updatedCount: updateResult.affectedRows,
    });
  } catch (err) {
    console.error("[UNDO SEND ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// CHECK UNDO STATUS (apakah data bisa dibatalkan)
// ========================
router.get("/check-undo-status", async (req, res) => {
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

    // Hitung jumlah data dengan status terkirim
    const [result] = await db.query(
      `SELECT COUNT(*) as count FROM ${tableName} 
       WHERE user_id = ? AND status_slip = 'terkirim'`,
      [userId],
    );

    res.json({
      success: true,
      hasSentData: result[0].count > 0,
      sentCount: result[0].count,
    });
  } catch (err) {
    console.error("[CHECK UNDO STATUS ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// GET DATA DENGAN STATUS TERTENTU
// ========================
router.get("/my-slip/status/:status", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";
    const status = req.params.status;

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.json([]);
    }
    const userId = users[0].id;

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const [rows] = await db.query(
      `SELECT * FROM ${tableName} 
       WHERE user_id = ? 
       AND MONTH(created_at) = ? 
       AND YEAR(created_at) = ?
       AND status_slip = ?
       ORDER BY id DESC`,
      [userId, currentMonth, currentYear, status],
    );

    res.json(rows);
  } catch (err) {
    console.error("[GET SLIP BY STATUS ERROR]:", err);
    res.status(500).json({ error: err.message });
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
    console.log("[DUPLICATE] Query params:", req.query);
    console.log("[DUPLICATE] Session number:", req.session.number);

    const number = req.session.number;
    if (!number) {
      console.log("[DUPLICATE] No session number found");
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || "hisana";
    console.log(`[DUPLICATE] Company: ${company}`);

    const tableName = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";
    console.log(`[DUPLICATE] Table name: ${tableName}`);

    // Get user ID
    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      console.log("[DUPLICATE] User not found for number:", number);
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;
    console.log(`[DUPLICATE] User ID: ${userId}`);

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

    // Get existing data in current month untuk pengecekan duplikasi
    let currentDataQuery;
    if (company === "hisana") {
      currentDataQuery = `
        SELECT no_induk FROM ${tableName} 
        WHERE user_id = ? 
        AND MONTH(created_at) = ? 
        AND YEAR(created_at) = ?
      `;
    } else {
      currentDataQuery = `
        SELECT no_induk FROM ${tableName} 
        WHERE user_id = ? 
        AND MONTH(created_at) = ? 
        AND YEAR(created_at) = ?
      `;
    }

    const [existingCurrent] = await db.query(currentDataQuery, [userId, currentMonth, currentYear]);
    const existingNoInduk = new Set(existingCurrent.map((row) => row.no_induk));
    console.log(`[DUPLICATE] Existing data in current month: ${existingNoInduk.size} records`);

    // Get ALL data from previous month (semua status: belum_dikirim, terkirim, dibatalkan)
    let previousDataQuery;
    if (company === "hisana") {
      previousDataQuery = `
        SELECT * FROM ${tableName} 
        WHERE user_id = ? 
        AND MONTH(created_at) = ? 
        AND YEAR(created_at) = ?
        ORDER BY id ASC
      `;
    } else {
      previousDataQuery = `
        SELECT * FROM ${tableName} 
        WHERE user_id = ? 
        AND MONTH(created_at) = ? 
        AND YEAR(created_at) = ?
        ORDER BY id ASC
      `;
    }

    const [previousData] = await db.query(previousDataQuery, [userId, previousMonth, previousYear]);
    console.log(`[DUPLICATE] Previous month data found: ${previousData.length} records`);
    console.log(
      `[DUPLICATE] Data breakdown:`,
      previousData.map((d) => ({
        no_induk: d.no_induk,
        status: d.status_slip,
        nama: company === "hisana" ? d.nama : d.nama_karyawan,
      })),
    );

    if (previousData.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada data slip gaji dari bulan sebelumnya (${previousMonth}/${previousYear}) untuk diduplikasi. Pastikan data bulan lalu sudah ada.`,
      });
    }

    let duplicatedCount = 0;
    let skippedCount = 0;
    const duplicatedIds = [];
    const skippedDetails = [];

    // Prepare insert query based on company
    let insertQuery;
    let insertValues = [];

    // Mulai transaksi
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      for (const sourceData of previousData) {
        // Skip jika no_induk sudah ada di bulan ini
        if (existingNoInduk.has(sourceData.no_induk)) {
          console.log(`[DUPLICATE] Skipping ${sourceData.no_induk} - already exists in current month`);
          skippedCount++;
          skippedDetails.push({
            no_induk: sourceData.no_induk,
            nama: company === "hisana" ? sourceData.nama : sourceData.nama_karyawan,
            reason: "Data sudah ada di bulan ini",
          });
          continue;
        }

        // Copy data from previous month
        const nowDate = new Date();

        if (company === "hisana") {
          insertQuery = `
            INSERT INTO ${tableName} (
              user_id, no_induk, nama, posisi, store, awal_masuk, kerja,
              gaji, iuran_bpjs_ketenagakerjaan, kerajinan, cuti, tunj_bpjs_pulsa,
              jumlah, um, keterangan, gaji_total, nohp, status_slip,
              is_duplicated, duplicated_from_id, duplicated_at, is_imported, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          insertValues = [
            userId,
            sourceData.no_induk,
            sourceData.nama,
            sourceData.posisi,
            sourceData.store,
            sourceData.awal_masuk,
            sourceData.kerja,
            sourceData.gaji,
            sourceData.iuran_bpjs_ketenagakerjaan,
            sourceData.kerajinan,
            sourceData.cuti,
            sourceData.tunj_bpjs_pulsa,
            sourceData.jumlah,
            sourceData.um,
            sourceData.keterangan,
            sourceData.gaji_total,
            sourceData.nohp,
            "belum_dikirim", // status_slip - selalu reset ke belum_dikirim
            1, // is_duplicated
            sourceData.id, // duplicated_from_id
            nowDate, // duplicated_at
            0, // is_imported
            nowDate, // created_at
          ];
        } else {
          // Enakko
          insertQuery = `
            INSERT INTO ${tableName} (
              user_id, no_induk, nama_karyawan, tanggal_masuk, jabatan, penempatan,
              gaji_utuh, gaji_pokok, bpjs_kesehatan, insentif, total_gaji,
              keterangan, nohp, status_slip,
              is_duplicated, duplicated_from_id, duplicated_at, is_imported, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          insertValues = [
            userId,
            sourceData.no_induk,
            sourceData.nama_karyawan,
            sourceData.tanggal_masuk,
            sourceData.jabatan,
            sourceData.penempatan,
            sourceData.gaji_utuh,
            sourceData.gaji_pokok,
            sourceData.bpjs_kesehatan,
            sourceData.insentif,
            sourceData.total_gaji,
            sourceData.keterangan,
            sourceData.nohp,
            "belum_dikirim", // status_slip - selalu reset ke belum_dikirim
            1, // is_duplicated
            sourceData.id, // duplicated_from_id
            nowDate, // duplicated_at
            0, // is_imported
            nowDate, // created_at
          ];
        }

        const [result] = await connection.query(insertQuery, insertValues);
        duplicatedCount++;
        duplicatedIds.push(result.insertId);
        console.log(
          `[DUPLICATE] Duplicated ${sourceData.no_induk} (${company === "hisana" ? sourceData.nama : sourceData.nama_karyawan}) from ID: ${sourceData.id} (status asli: ${sourceData.status_slip}) to new ID: ${result.insertId} (status baru: belum_dikirim)`,
        );
      }

      // Commit transaksi
      await connection.commit();
      console.log(`[DUPLICATE] Transaction committed successfully`);

      // Buat pesan detail untuk ditampilkan
      let messageHtml = `<div style="background:#f0fdf4;border-radius:12px;padding:15px">
          <p><strong>✅ Berhasil menduplikasi data slip gaji dari bulan ${previousMonth}/${previousYear} ke bulan ${currentMonth}/${currentYear}.</strong></p>
          <p style="margin-top: 10px;">
            <i class="fas fa-check-circle" style="color:#16a34a"></i> <strong>${duplicatedCount}</strong> data berhasil diduplikasi
          </p>`;

      if (skippedCount > 0) {
        messageHtml += `<p style="margin-top: 5px;">
          <i class="fas fa-info-circle" style="color:#f59e0b"></i> <strong>${skippedCount}</strong> data dilewati (sudah ada di bulan ini)
        </p>`;

        if (skippedDetails.length > 0 && skippedDetails.length <= 5) {
          messageHtml += `<div style="margin-top: 10px; padding: 10px; background: #fef3c7; border-radius: 8px;">
            <p style="margin: 0 0 5px 0; font-weight: bold;">Data yang dilewati:</p>
            <ul style="margin: 0; padding-left: 20px;">`;
          skippedDetails.forEach((detail) => {
            messageHtml += `<li>${detail.no_induk} - ${detail.nama}</li>`;
          });
          messageHtml += `</ul></div>`;
        }
      }

      messageHtml += `</div>`;

      res.json({
        success: true,
        message: `Berhasil menduplikasi ${duplicatedCount} data slip gaji dari bulan ${previousMonth}/${previousYear} ke bulan ${currentMonth}/${currentYear}.`,
        messageHtml: messageHtml,
        duplicatedCount: duplicatedCount,
        skippedCount: skippedCount,
        totalPrevious: previousData.length,
        duplicatedIds: duplicatedIds,
        skippedDetails: skippedDetails,
        month: currentMonth,
        year: currentYear,
      });
    } catch (err) {
      // Rollback jika ada error
      await connection.rollback();
      console.error("[DUPLICATE] Transaction error, rolling back:", err);
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("[DUPLICATE ERROR]:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan saat menduplikasi data",
    });
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

export default router;
