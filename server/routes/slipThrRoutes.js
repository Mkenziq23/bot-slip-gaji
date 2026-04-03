import express from "express";
import db from "../db.js";
import kirimThrHisana from "../../bot/sendMessage/kirimThrHisana.js";
import kirimThrEnakko from "../../bot/sendMessage/kirimThrEnakko.js";
import { kirimPembatalanThrHisana, kirimPembatalanThrEnakko } from "../../bot/cancelMessage/cancelSlipThr.js";
const router = express.Router();

// Progress tracking untuk THR
let thrProgress = {
  running: false,
  total: 0,
  sent: 0,
  failed: 0,
  results: [],
};

// ============================
// GET ALL THR DATA
// ============================
router.get("/thr", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const { company, year } = req.query;
    let tableName = company === "hisana" ? "thr_hisana" : "thr_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.json([]);
    }
    const userId = users[0].id;

    let query = `SELECT * FROM ${tableName} WHERE user_id = ?`;
    const params = [userId];

    if (year && year !== "all") {
      query += ` AND YEAR(created_at) = ?`;
      params.push(year);
    }

    query += ` ORDER BY created_at DESC, tahun DESC`;

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching THR data:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// GET EMPLOYEE LIST FROM DATA KARYAWAN FOR THR
// ============================
router.get("/thr-employees", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "data_karyawan_hisana" : "data_karyawan_enakko";

    if (!["hisana", "enakko"].includes(company)) {
      return res.status(400).json({ success: false, message: "Company tidak valid" });
    }

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;

    // Ambil data karyawan hanya no_induk, nama_lengkap, no_hp
    const [employees] = await db.query(
      `SELECT no_induk, nama_lengkap as nama, no_hp 
       FROM ${tableName} 
       WHERE user_id = ? 
       ORDER BY no_induk ASC`,
      [userId],
    );

    console.log(`[THR EMPLOYEES] Loaded ${employees.length} employees for ${company}`);

    res.json({
      success: true,
      employees: employees,
    });
  } catch (err) {
    console.error("[GET THR EMPLOYEES ERROR]:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
  }
});

// ============================
// GET THR DATA BY YEAR
// ============================
router.get("/thr/year/:year", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const { company } = req.query;
    const { year } = req.params;
    let tableName = company === "hisana" ? "thr_hisana" : "thr_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.json([]);
    }
    const userId = users[0].id;

    const [rows] = await db.query(`SELECT * FROM ${tableName} WHERE user_id = ? AND YEAR(created_at) = ? ORDER BY created_at DESC`, [userId, year]);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching THR data by year:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// GET AVAILABLE YEARS
// ============================
router.get("/thr-years", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const { company } = req.query;
    let tableName = company === "hisana" ? "thr_hisana" : "thr_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.json({ success: true, years: [] });
    }
    const userId = users[0].id;

    const [rows] = await db.query(`SELECT DISTINCT YEAR(created_at) as tahun FROM ${tableName} WHERE user_id = ? ORDER BY tahun DESC`, [userId]);
    const years = rows.map((row) => row.tahun);
    res.json({ success: true, years });
  } catch (err) {
    console.error("Error fetching THR years:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// GET SINGLE THR DATA
// ============================
router.get("/thr/:id", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const { company } = req.query;
    const { id } = req.params;
    let tableName = company === "hisana" ? "thr_hisana" : "thr_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const [rows] = await db.query(`SELECT * FROM ${tableName} WHERE id = ? AND user_id = ?`, [id, userId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "THR tidak ditemukan" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching THR data:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// CREATE THR DATA
// ============================
router.post("/thr", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const { company } = req.query;
    const { no_induk, nama, tahun, jumlah_thr, nohp } = req.body;

    console.log("========================================");
    console.log("📝 POST /thr - Request received");
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    console.log("Company from query:", company);
    console.log("Company from body:", req.body.company);
    console.log("========================================");

    let finalCompany = company;
    if (!finalCompany && req.body.company) {
      finalCompany = req.body.company;
    }
    if (!finalCompany) {
      finalCompany = "hisana";
    }

    console.log("Final company:", finalCompany);

    if (!no_induk || !nama || !tahun || !jumlah_thr || !nohp) {
      console.log("❌ Missing fields:", { no_induk, nama, tahun, jumlah_thr, nohp });
      return res.status(400).json({ success: false, message: "Semua field harus diisi" });
    }

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    let tableName = finalCompany === "hisana" ? "thr_hisana" : "thr_enakko";
    console.log("📊 Target table:", tableName);

    // Check if no_induk already exists for this user in current year
    const currentYear = new Date().getFullYear();
    const [existing] = await db.query(
      `SELECT COUNT(*) as count FROM ${tableName} 
       WHERE user_id = ? 
       AND no_induk = ? 
       AND YEAR(created_at) = ?`,
      [userId, no_induk, currentYear],
    );

    if (existing[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Nomor induk ${no_induk} sudah memiliki data THR untuk tahun ${currentYear}. Silakan gunakan nomor induk yang berbeda atau edit data yang sudah ada.`,
      });
    }

    const [tables] = await db.query("SHOW TABLES LIKE ?", [tableName]);
    if (tables.length === 0) {
      console.log(`❌ Table ${tableName} does not exist!`);
      return res.status(500).json({ success: false, message: `Table ${tableName} tidak ditemukan` });
    }
    console.log("✅ Table exists");

    const [result] = await db.query(`INSERT INTO ${tableName} (user_id, no_induk, nama, tahun, jumlah_thr, nohp, status, is_duplicated) VALUES (?, ?, ?, ?, ?, ?, 'belum_dikirim', 0)`, [userId, no_induk, nama, tahun, jumlah_thr, nohp]);

    console.log("✅ Insert successful!");
    console.log("Insert result:", result);
    console.log("Inserted ID:", result.insertId);
    console.log("========================================");

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error("❌ Error creating THR:", err);
    console.error("Error stack:", err.stack);
    console.log("========================================");
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// UPDATE THR DATA
// ============================
router.put("/thr/:id", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const { company } = req.query;
    const { id } = req.params;
    const { no_induk, nama, tahun, jumlah_thr, nohp } = req.body;

    console.log("📝 Updating THR:", { id, company, no_induk, nama, tahun, jumlah_thr, nohp });

    let finalCompany = company;
    if (!finalCompany && req.body.company) {
      finalCompany = req.body.company;
    }
    if (!finalCompany) {
      finalCompany = "hisana";
    }

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    let tableName = finalCompany === "hisana" ? "thr_hisana" : "thr_enakko";
    console.log("Target table:", tableName);

    // Check if no_induk already exists for this user in current year (excluding current record)
    const currentYear = new Date().getFullYear();
    const [existing] = await db.query(
      `SELECT COUNT(*) as count FROM ${tableName} 
       WHERE user_id = ? 
       AND no_induk = ? 
       AND YEAR(created_at) = ?
       AND id != ?`,
      [userId, no_induk, currentYear, id],
    );

    if (existing[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Nomor induk ${no_induk} sudah digunakan oleh data THR lain untuk tahun ${currentYear}. Silakan gunakan nomor induk yang berbeda.`,
      });
    }

    const [result] = await db.query(`UPDATE ${tableName} SET no_induk = ?, nama = ?, tahun = ?, jumlah_thr = ?, nohp = ? WHERE id = ? AND user_id = ?`, [no_induk, nama, tahun, jumlah_thr, nohp, id, userId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "THR tidak ditemukan" });
    }

    console.log("✅ THR updated:", id);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error updating THR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// DELETE THR DATA
// ============================
router.delete("/thr/:id", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const { company } = req.query;
    const { id } = req.params;
    let tableName = company === "hisana" ? "thr_hisana" : "thr_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const [result] = await db.query(`DELETE FROM ${tableName} WHERE id = ? AND user_id = ?`, [id, userId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "THR tidak ditemukan" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting THR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// SEND THR
// ============================
router.post("/send-thr", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const { selected, company } = req.body;

    console.log("📨 Sending THR:", { selected, company });

    if (!selected || selected.length === 0) {
      return res.status(400).json({ success: false, message: "Tidak ada data yang dipilih" });
    }

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    let tableName = company === "hisana" ? "thr_hisana" : "thr_enakko";

    const placeholders = selected.map(() => "?").join(",");
    // Include both 'belum_dikirim' AND 'dibatalkan' status for resending
    const [thrList] = await db.query(`SELECT * FROM ${tableName} WHERE id IN (${placeholders}) AND user_id = ? AND (status = 'belum_dikirim' OR status = 'dibatalkan')`, [...selected, userId]);

    console.log(`📊 Found ${thrList.length} THR to send (belum_dikirim + dibatalkan)`);

    if (thrList.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Tidak ada data THR yang dapat dikirim. Pastikan THR yang dipilih berstatus 'Belum Dikirim' atau 'Dibatalkan'.",
      });
    }

    // Setup progress tracking
    thrProgress = {
      running: true,
      total: thrList.length,
      sent: 0,
      failed: 0,
      results: [],
    };

    // Send response immediately
    res.json({ success: true, message: "Pengiriman THR dimulai", total: thrList.length });

    // Process sending in background
    (async () => {
      for (const thr of thrList) {
        try {
          let result;
          if (company === "hisana") {
            result = await kirimThrHisana(thr, number);
          } else {
            result = await kirimThrEnakko(thr, number);
          }

          if (result) {
            // Update status to 'terkirim' after successful send
            await db.query(`UPDATE ${tableName} SET status = 'terkirim' WHERE id = ?`, [thr.id]);
            thrProgress.sent++;
            thrProgress.results.push({ id: thr.id, success: true, name: thr.nama });
            console.log(`✅ THR sent to ${thr.nama} (${thr.nohp})`);
          } else {
            thrProgress.failed++;
            thrProgress.results.push({ id: thr.id, success: false, name: thr.nama, error: "Gagal mengirim" });
            console.log(`❌ Failed to send THR to ${thr.nama}`);
          }
        } catch (err) {
          console.error(`❌ Failed to send THR to ${thr.nama}:`, err.message);
          thrProgress.failed++;
          thrProgress.results.push({ id: thr.id, success: false, name: thr.nama, error: err.message });
        }
        // Delay between sends to avoid rate limiting
        await new Promise((r) => setTimeout(r, 2000));
      }
      thrProgress.running = false;
      console.log(`🎉 THR sending completed: ${thrProgress.sent} success, ${thrProgress.failed} failed`);
    })();
  } catch (err) {
    console.error("Error sending THR:", err);
    thrProgress.running = false;
    res.status(500).json({ success: false, message: err.message });
  }
});

async function sendThrBatch(thrList, company, senderNumber) {
  for (const thr of thrList) {
    try {
      let result;
      if (company === "hisana") {
        result = await kirimThrHisana(thr, senderNumber);
      } else {
        result = await kirimThrEnakko(thr, senderNumber);
      }

      if (result) {
        let tableName = company === "hisana" ? "thr_hisana" : "thr_enakko";
        await db.query(`UPDATE ${tableName} SET status = 'terkirim' WHERE id = ?`, [thr.id]);

        thrProgress.sent++;
        thrProgress.results.push({ id: thr.id, success: true, name: thr.nama });
        console.log(`✅ THR sent to ${thr.nama} (${thr.nohp})`);
      } else {
        thrProgress.failed++;
        thrProgress.results.push({ id: thr.id, success: false, name: thr.nama, error: "Gagal mengirim" });
        console.log(`❌ Failed to send THR to ${thr.nama}`);
      }
    } catch (err) {
      console.error(`❌ Failed to send THR to ${thr.nama}:`, err.message);
      thrProgress.failed++;
      thrProgress.results.push({ id: thr.id, success: false, name: thr.nama, error: err.message });
    }
  }

  thrProgress.running = false;
  console.log(`🎉 THR sending completed: ${thrProgress.sent} success, ${thrProgress.failed} failed`);
}

// ============================
// GET THR PROGRESS
// ============================
router.get("/thr-progress", async (req, res) => {
  res.json(thrProgress);
});

// ============================
// RESET THR PROGRESS
// ============================
router.post("/reset-thr-progress", async (req, res) => {
  try {
    thrProgress = {
      running: false,
      total: 0,
      sent: 0,
      failed: 0,
      results: [],
    };
    console.log("🔄 THR progress has been reset");
    res.json({ success: true, message: "THR progress reset successfully" });
  } catch (err) {
    console.error("Error resetting THR progress:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// CANCEL THR WHATSAPP
// ============================
router.post("/cancel-thr", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const selected = req.body.selected || [];
    const company = req.body.company || "hisana";
    const cancellationNote = req.body.cancellation_note || "Pembatalan oleh user";

    console.log("========================================");
    console.log("📝 CANCEL THR - Request received");
    console.log("Company:", company);
    console.log("Selected IDs:", selected);
    console.log("Cancellation note:", cancellationNote);
    console.log("========================================");

    if (!Array.isArray(selected) || selected.length === 0) {
      return res.status(400).json({ success: false, message: "Pilih THR yang akan dibatalkan" });
    }

    if (!["hisana", "enakko"].includes(company)) {
      return res.status(400).json({ success: false, message: "Company tidak valid" });
    }

    const tableName = company === "hisana" ? "thr_hisana" : "thr_enakko";
    console.log("Target table:", tableName);

    const [users] = await db.query("SELECT id, nomor_wa FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;
    const senderNumber = users[0].nomor_wa;

    // Validasi ID
    const validIds = selected.filter((id) => !isNaN(parseInt(id))).map((id) => parseInt(id));
    if (validIds.length === 0) {
      return res.status(400).json({ success: false, message: "ID tidak valid" });
    }

    // Ambil data THR yang akan dibatalkan (hanya yang status terkirim)
    const placeholders = validIds.map(() => "?").join(",");
    const [rows] = await db.query(`SELECT * FROM ${tableName} WHERE id IN (${placeholders}) AND user_id = ? AND status = 'terkirim'`, [...validIds, userId]);

    console.log(`Found ${rows.length} THR to cancel`);

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Tidak ada THR terkirim yang dipilih. Pastikan THR yang dipilih berstatus 'Terkirim'.",
      });
    }

    let cancelledCount = 0;
    let failedCount = 0;
    let messageSentCount = 0;
    let messageFailedCount = 0;
    const errors = [];

    // Proses pembatalan untuk setiap THR
    for (const thr of rows) {
      try {
        console.log(`\n--- Processing THR ID ${thr.id} (${company}) ---`);
        console.log(`Name: ${thr.nama}`);
        console.log(`Phone: ${thr.nohp}`);

        // 1. Update status menjadi dibatalkan di database
        const updateQuery = `
          UPDATE ${tableName} 
          SET status = 'dibatalkan', 
              cancelled_at = NOW(), 
              cancellation_note = ?,
              cancelled_by = ?
          WHERE id = ? AND user_id = ? AND status = 'terkirim'
        `;

        const [updateResult] = await db.query(updateQuery, [cancellationNote, userId, thr.id, userId]);

        if (updateResult.affectedRows > 0) {
          cancelledCount++;
          console.log(`✅ Database updated for THR ID ${thr.id}`);

          // 2. Kirim pesan pembatalan ke karyawan
          try {
            console.log(`📤 Sending cancellation message for ${company} to ${thr.nama}...`);

            // Import fungsi pengiriman pesan
            const cancelModule = await import("../../bot/cancelMessage/cancelSlipThr.js");

            let sendResult = false;
            if (company === "hisana") {
              if (typeof cancelModule.kirimPembatalanThrHisana === "function") {
                sendResult = await cancelModule.kirimPembatalanThrHisana(thr, senderNumber, cancellationNote);
                console.log(`Hisana send result: ${sendResult}`);
              }
            } else {
              if (typeof cancelModule.kirimPembatalanThrEnakko === "function") {
                sendResult = await cancelModule.kirimPembatalanThrEnakko(thr, senderNumber, cancellationNote);
                console.log(`Enakko send result: ${sendResult}`);
              }
            }

            if (sendResult === true) {
              messageSentCount++;
              console.log(`✅ Cancellation message sent to ${thr.nama}`);
            } else {
              messageFailedCount++;
              console.log(`⚠️ Failed to send cancellation message to ${thr.nama}`);
              errors.push(`ID ${thr.id} (${thr.nama}): Pesan notifikasi gagal terkirim`);
            }
          } catch (sendError) {
            console.error(`❌ Error sending cancellation message to ${thr.nama}:`, sendError.message);
            messageFailedCount++;
            errors.push(`ID ${thr.id} (${thr.nama}): ${sendError.message}`);
            // Jangan anggap ini sebagai kegagalan pembatalan karena database sudah diupdate
          }
        } else {
          failedCount++;
          errors.push(`ID ${thr.id} (${thr.nama}): Tidak ada perubahan (mungkin sudah dibatalkan sebelumnya)`);
          console.log(`⚠️ No rows affected for THR ID ${thr.id}`);
        }

        // Delay 1 detik antar pengiriman pesan
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        console.error(`❌ Failed to cancel THR ID ${thr.id}:`, err.message);
        failedCount++;
        errors.push(`ID ${thr.id} (${thr.nama}): ${err.message}`);
      }
    }

    // Build response message yang konsisten
    const companyName = company === "hisana" ? "Hisana" : "Enakko";
    let message = `Berhasil membatalkan ${cancelledCount} THR ${companyName}.`;

    if (failedCount > 0) {
      message += `\n${failedCount} THR gagal dibatalkan.`;
    }

    if (messageSentCount > 0) {
      message += `\n✓ Notifikasi WhatsApp terkirim ke ${messageSentCount} karyawan.`;
    }

    if (messageFailedCount > 0) {
      message += `\n⚠️ ${messageFailedCount} notifikasi gagal terkirim (database sudah diupdate).`;
    }

    console.log(`
      ========================================
      === LAPORAN PEMBATALAN THR (${companyName.toUpperCase()}) ===
      Total diproses: ${rows.length}
      Berhasil dibatalkan: ${cancelledCount}
      Gagal dibatalkan: ${failedCount}
      Pesan terkirim: ${messageSentCount}
      Pesan gagal: ${messageFailedCount}
      ========================================
    `);

    res.json({
      success: true,
      message: message,
      cancelledCount: cancelledCount,
      failedCount: failedCount,
      messageSentCount: messageSentCount,
      messageFailedCount: messageFailedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("[CANCEL THR ERROR]:", err);
    console.error("Error stack:", err.stack);
    res.status(500).json({ success: false, message: "Terjadi kesalahan server: " + err.message });
  }
});

// ============================
// GET CANCEL THR PROGRESS
// ============================
router.get("/cancel-thr-progress", async (req, res) => {
  res.json(cancelThrProgress);
});

// ============================
// RESET CANCEL THR PROGRESS
// ============================
router.post("/reset-cancel-thr-progress", async (req, res) => {
  try {
    cancelThrProgress = {
      running: false,
      total: 0,
      sent: 0,
      failed: 0,
      results: [],
    };
    console.log("🔄 Cancel THR progress has been reset");
    res.json({ success: true, message: "Cancel THR progress reset successfully" });
  } catch (err) {
    console.error("Error resetting cancel THR progress:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// DUPLICATE THR FROM PREVIOUS YEAR (SEMUA STATUS)
// ============================
router.post("/duplicate-thr", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const { company } = req.body;
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;

    console.log("========================================");
    console.log("📋 DUPLICATE THR - Request received");
    console.log(`Company: ${company}`);
    console.log(`From year: ${previousYear} to ${currentYear}`);
    console.log("========================================");

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    let tableName = company === "hisana" ? "thr_hisana" : "thr_enakko";
    console.log(`Target table: ${tableName}`);

    // Get existing data in current year untuk pengecekan duplikasi
    const [existingCurrent] = await db.query(
      `SELECT no_induk FROM ${tableName} 
       WHERE user_id = ? 
       AND YEAR(created_at) = ?`,
      [userId, currentYear],
    );

    const existingNoInduk = new Set(existingCurrent.map((row) => row.no_induk));
    console.log(`Existing data in current year: ${existingNoInduk.size} records`);

    // Get ALL data from previous year (semua status)
    const [previousData] = await db.query(
      `SELECT * FROM ${tableName} 
       WHERE user_id = ? 
       AND YEAR(created_at) = ?
       ORDER BY id`,
      [userId, previousYear],
    );

    console.log(`Previous year data found: ${previousData.length} records`);

    if (previousData.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada data THR dari tahun ${previousYear} untuk diduplikasi. Pastikan data THR tahun lalu sudah ada.`,
      });
    }

    // Log breakdown status
    const statusBreakdown = previousData.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});
    console.log("Status breakdown from previous year:", statusBreakdown);

    // Filter data to only include employees NOT in current year
    const dataToDuplicate = previousData.filter((item) => !existingNoInduk.has(item.no_induk));
    console.log(`Found ${dataToDuplicate.length} new employees to duplicate (out of ${previousData.length} total)`);

    if (dataToDuplicate.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada data THR baru untuk diduplikasi. Semua karyawan dari tahun ${previousYear} sudah memiliki data THR di tahun ini.`,
      });
    }

    // Mulai transaksi
    const connection = await db.getConnection();
    await connection.beginTransaction();

    let duplicatedCount = 0;
    let skippedCount = previousData.length - dataToDuplicate.length;
    let errors = [];
    let duplicatedIds = [];

    try {
      for (const sourceData of dataToDuplicate) {
        try {
          const nowDate = new Date();

          // Insert new record with is_duplicated flag
          const insertQuery = `
            INSERT INTO ${tableName} (
              user_id, no_induk, nama, tahun, jumlah_thr, nohp, status,
              is_duplicated, duplicated_from_id, duplicated_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          const insertValues = [
            userId,
            sourceData.no_induk,
            sourceData.nama,
            currentYear,
            sourceData.jumlah_thr,
            sourceData.nohp,
            "belum_dikirim", // Always reset to belum_dikirim
            1, // is_duplicated
            sourceData.id, // duplicated_from_id
            nowDate, // duplicated_at
            nowDate, // created_at
          ];

          console.log(`Duplicating THR for employee: ${sourceData.no_induk} (${sourceData.nama}) from ID: ${sourceData.id} (status asli: ${sourceData.status})`);
          const [result] = await connection.query(insertQuery, insertValues);
          duplicatedIds.push(result.insertId);
          duplicatedCount++;
        } catch (err) {
          console.error(`Error inserting record for ${sourceData.no_induk}:`, err);
          errors.push(`${sourceData.no_induk}: ${err.message}`);
        }
      }

      // Commit transaksi
      await connection.commit();
      console.log(`Transaction committed successfully`);

      // Prepare message HTML for SweetAlert
      let messageHtml = `<div style="background:#f0fdf4;border-radius:12px;padding:15px">
          <p><strong>✅ Berhasil menduplikasi data THR dari tahun ${previousYear} ke tahun ${currentYear}.</strong></p>
          <p style="margin-top: 10px;">
            <i class="fas fa-check-circle" style="color:#16a34a"></i> <strong>${duplicatedCount}</strong> data THR berhasil diduplikasi
          </p>`;

      if (skippedCount > 0) {
        messageHtml += `<p style="margin-top: 5px;">
          <i class="fas fa-info-circle" style="color:#f59e0b"></i> <strong>${skippedCount}</strong> data THR dilewati (sudah ada di tahun ini)
        </p>`;
      }

      if (errors.length > 0 && errors.length <= 5) {
        messageHtml += `<div style="margin-top: 10px; padding: 10px; background: #fee2e2; border-radius: 8px;">
          <p style="margin: 0 0 5px 0; font-weight: bold; color: #dc2626;">Data gagal diduplikasi:</p>
          <ul style="margin: 0; padding-left: 20px; color: #dc2626;">`;
        errors.forEach((error) => {
          messageHtml += `<li>${escapeHtml(error)}</li>`;
        });
        messageHtml += `</ul></div>`;
      }

      messageHtml += `</div>`;

      res.json({
        success: true,
        message: `Berhasil menduplikasi ${duplicatedCount} data THR dari tahun ${previousYear} ke tahun ${currentYear}.`,
        messageHtml: messageHtml,
        duplicatedCount: duplicatedCount,
        skippedCount: skippedCount,
        totalPrevious: previousData.length,
        duplicatedIds: duplicatedIds,
        errors: errors.length > 0 ? errors : undefined,
        year: currentYear,
      });
    } catch (err) {
      // Rollback jika ada error
      await connection.rollback();
      console.error("Transaction error, rolling back:", err);
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("Error duplicating THR:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan saat menduplikasi data THR",
    });
  }
});

// ============================
// CANCEL DUPLICATE THR
// ============================
router.post("/cancel-duplicate-thr", async (req, res) => {
  try {
    console.log("[CANCEL DUPLICATE THR] Request received");

    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "thr_hisana" : "thr_enakko";

    if (!["hisana", "enakko"].includes(company)) {
      return res.status(400).json({ success: false, message: "Company tidak valid" });
    }

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const currentYear = new Date().getFullYear();

    // Get all data in current year
    const getDataQuery = `
      SELECT id, no_induk, nama, is_duplicated 
      FROM ${tableName} 
      WHERE user_id = ? 
      AND YEAR(created_at) = ?
    `;
    const [currentData] = await db.query(getDataQuery, [userId, currentYear]);

    console.log(`Found ${currentData.length} records in current year ${currentYear}`);

    if (currentData.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada data THR dari tahun ${currentYear} untuk dibatalkan`,
      });
    }

    const duplicatedData = currentData.filter((item) => item.is_duplicated === 1);
    const manualData = currentData.filter((item) => item.is_duplicated !== 1);

    console.log(`Duplicated records: ${duplicatedData.length}, Manual records: ${manualData.length}`);

    if (duplicatedData.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada data THR hasil duplikasi di tahun ${currentYear} untuk dibatalkan.`,
      });
    }

    // Delete only duplicated data
    const duplicatedIds = duplicatedData.map((item) => item.id);
    const deleteQuery = `DELETE FROM ${tableName} WHERE id IN (${duplicatedIds.map(() => "?").join(",")}) AND user_id = ?`;
    const [result] = await db.query(deleteQuery, [...duplicatedIds, userId]);

    console.log(`Deleted ${result.affectedRows} duplicated records`);

    let message = `Berhasil membatalkan duplikasi THR. ${result.affectedRows} data hasil duplikasi telah dihapus.`;
    if (manualData.length > 0) {
      message += `\n\n${manualData.length} data THR input manual tetap dipertahankan.`;
    }

    res.json({
      success: true,
      message: message,
      deletedCount: result.affectedRows,
      manualDataCount: manualData.length,
      duplicatedDataList: duplicatedData.map((d) => ({
        id: d.id,
        no_induk: d.no_induk,
        nama: d.nama,
      })),
    });
  } catch (err) {
    console.error("[CANCEL DUPLICATE THR ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// CHECK THR DUPLICATE STATUS
// ============================
router.get("/check-thr-duplicate-status", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "thr_hisana" : "thr_enakko";

    if (!["hisana", "enakko"].includes(company)) {
      return res.status(400).json({ success: false, message: "Company tidak valid" });
    }

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const currentYear = new Date().getFullYear();

    const query = `
      SELECT COUNT(*) as count FROM ${tableName} 
      WHERE user_id = ? 
      AND YEAR(created_at) = ?
      AND is_duplicated = 1
    `;
    const [result] = await db.query(query, [userId, currentYear]);

    const hasRecentDuplicate = result[0].count > 0;

    console.log(`[CHECK THR STATUS] User ${userId}, Year ${currentYear}, Has duplicated data: ${hasRecentDuplicate}`);

    res.json({
      success: true,
      hasRecentDuplicate,
    });
  } catch (err) {
    console.error("[CHECK THR DUPLICATE STATUS ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Helper function untuk escape HTML
function escapeHtml(text) {
  if (!text) return "";
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ============================
// GET THR STATISTICS
// ============================
router.get("/thr-stats", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const { company, tahun } = req.query;
    let tableName = company === "hisana" ? "thr_hisana" : "thr_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.json({ success: true, stats: { total: 0, sent: 0, pending: 0, total_nominal: 0 } });
    }
    const userId = users[0].id;

    let query = `SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'terkirim' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status = 'belum_dikirim' THEN 1 ELSE 0 END) as pending,
      SUM(jumlah_thr) as total_nominal
      FROM ${tableName}
      WHERE user_id = ?`;

    const params = [userId];

    if (tahun) {
      query += ` AND YEAR(created_at) = ?`;
      params.push(tahun);
    }

    const [stats] = await db.query(query, params);

    res.json({
      success: true,
      stats: stats[0],
    });
  } catch (err) {
    console.error("Error getting THR statistics:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// EXPORT THR DATA
// ============================
router.get("/export-thr", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const { company, tahun } = req.query;
    let tableName = company === "hisana" ? "thr_hisana" : "thr_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.json({ success: true, data: [], count: 0 });
    }
    const userId = users[0].id;

    let query = `SELECT no_induk, nama, tahun, jumlah_thr, nohp, status, created_at FROM ${tableName} WHERE user_id = ?`;
    const params = [userId];

    if (tahun) {
      query += ` AND YEAR(created_at) = ?`;
      params.push(tahun);
    }

    query += ` ORDER BY created_at DESC, tahun DESC`;

    const [rows] = await db.query(query, params);

    res.json({
      success: true,
      data: rows,
      count: rows.length,
    });
  } catch (err) {
    console.error("Error exporting THR data:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
