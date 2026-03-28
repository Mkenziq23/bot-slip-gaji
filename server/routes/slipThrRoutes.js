import express from "express";
import db from "../db.js";
import kirimThrHisana from "../../bot/sendMessage/kirimThrHisana.js";
import kirimThrEnakko from "../../bot/sendMessage/kirimThrEnakko.js";

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
    const [thrList] = await db.query(`SELECT * FROM ${tableName} WHERE id IN (${placeholders}) AND user_id = ? AND status = 'belum_dikirim'`, [...selected, userId]);

    console.log(`📊 Found ${thrList.length} THR to send`);

    if (thrList.length === 0) {
      return res.status(400).json({ success: false, message: "Tidak ada data THR yang belum terkirim" });
    }

    thrProgress = {
      running: true,
      total: thrList.length,
      sent: 0,
      failed: 0,
      results: [],
    };

    sendThrBatch(thrList, company, number);

    res.json({ success: true, message: "Pengiriman THR dimulai" });
  } catch (err) {
    console.error("Error sending THR:", err);
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
// DUPLICATE THR FROM PREVIOUS YEAR
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

    console.log(`📋 Duplicating THR from ${previousYear} to ${currentYear} for ${company}`);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    let tableName = company === "hisana" ? "thr_hisana" : "thr_enakko";

    const [existing] = await db.query(`SELECT COUNT(*) as count FROM ${tableName} WHERE user_id = ? AND YEAR(created_at) = ?`, [userId, currentYear]);

    console.log(`📊 Existing data for year ${currentYear}: ${existing[0].count} records`);

    if (existing[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Data THR tahun ${currentYear} sudah ada (${existing[0].count} records).`,
        hasData: true,
        count: existing[0].count,
      });
    }

    const [previousData] = await db.query(`SELECT no_induk, nama, jumlah_thr, nohp, id FROM ${tableName} WHERE user_id = ? AND YEAR(created_at) = ?`, [userId, previousYear]);

    console.log(`📊 Previous year data for ${previousYear}: ${previousData.length} records`);

    if (previousData.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Tidak ada data THR tahun ${previousYear} untuk diduplikasi. Pastikan sudah menginput data THR untuk tahun ${previousYear} terlebih dahulu.`,
        hasPreviousData: false,
      });
    }

    let insertedCount = 0;
    for (const item of previousData) {
      await db.query(`INSERT INTO ${tableName} (user_id, no_induk, nama, tahun, jumlah_thr, nohp, status, is_duplicated, duplicated_from_id, duplicated_at) VALUES (?, ?, ?, ?, ?, ?, 'belum_dikirim', 1, ?, NOW())`, [
        userId,
        item.no_induk,
        item.nama,
        currentYear,
        item.jumlah_thr,
        item.nohp,
        item.id,
      ]);
      insertedCount++;
    }

    console.log(`✅ Duplicated ${insertedCount} THR records from ${previousYear} to ${currentYear}`);

    res.json({
      success: true,
      message: `Berhasil menduplikasi ${insertedCount} data THR dari tahun ${previousYear} ke tahun ${currentYear}`,
      duplicatedCount: insertedCount,
      year: currentYear,
    });
  } catch (err) {
    console.error("Error duplicating THR:", err);
    res.status(500).json({ success: false, message: err.message });
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

    const getDataQuery = `
      SELECT id, no_induk, nama, is_duplicated 
      FROM ${tableName} 
      WHERE user_id = ? 
      AND YEAR(created_at) = ?
    `;
    const [currentData] = await db.query(getDataQuery, [userId, currentYear]);

    if (currentData.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada data THR dari tahun ${currentYear} untuk dibatalkan`,
      });
    }

    const duplicatedData = currentData.filter((item) => item.is_duplicated === 1);
    const manualData = currentData.filter((item) => item.is_duplicated !== 1);

    if (duplicatedData.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada data THR hasil duplikasi di tahun ${currentYear} untuk dibatalkan.`,
      });
    }

    const duplicatedIds = duplicatedData.map((item) => item.id);
    const deleteQuery = `DELETE FROM ${tableName} WHERE id IN (${duplicatedIds.map(() => "?").join(",")}) AND user_id = ?`;
    const [result] = await db.query(deleteQuery, [...duplicatedIds, userId]);

    let message = `Berhasil membatalkan duplikasi THR. ${result.affectedRows} data hasil duplikasi telah dihapus.`;
    if (manualData.length > 0) {
      message += `\n\n${manualData.length} data THR input manual tetap dipertahankan.`;
    }

    res.json({
      success: true,
      message: message,
      deletedCount: result.affectedRows,
      manualDataCount: manualData.length,
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

    res.json({
      success: true,
      hasRecentDuplicate,
    });
  } catch (err) {
    console.error("[CHECK THR DUPLICATE STATUS ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

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
