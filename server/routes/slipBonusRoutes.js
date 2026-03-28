// server/routes/slipBonusRoutes.js
import express from "express";
import db from "../db.js";
import { body, validationResult } from "express-validator";
import kirimBonusHisana from "../../bot/sendMessage/kirimBonusHisana.js";
import kirimBonusEnakko from "../../bot/sendMessage/kirimBonusEnakko.js";

const router = express.Router();

// ========================
// BONUS PROGRESS TRACKING (SERVER-SIDE)
// ========================
let bonusProgress = {
  running: false,
  total: 0,
  sent: 0,
  failed: 0,
  startTime: null,
  endTime: null,
};

// ========================
// CHECK LOGIN
// ========================
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
// VALIDATION RULES
// ========================
const validateBonus = [
  body("no_induk").notEmpty().withMessage("No Induk harus diisi").trim().escape(),
  body("nama").notEmpty().withMessage("Nama harus diisi").trim().escape(),
  body("periode").optional().isISO8601().withMessage("Format periode tidak valid"),
  body("jumlah_bonus").isNumeric().withMessage("Jumlah bonus harus angka").toFloat(),
  body("nohp")
    .matches(/^\d{10,15}$/)
    .withMessage("Nomor HP tidak valid")
    .trim(),
];

// ========================
// GET BONUS DATA
// ========================
router.get("/bonus", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "bonus_hisana" : "bonus_enakko";

    // Validasi company
    if (!["hisana", "enakko"].includes(company)) {
      return res.status(400).json({ success: false, message: "Company tidak valid" });
    }

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.json([]);
    }

    const userId = users[0].id;

    // Get current date for filtering
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const [rows] = await db.query(
      `
      SELECT id, no_induk, nama, bulan, tahun, jumlah_bonus, nohp, status, created_at, is_duplicated 
      FROM ${tableName} 
      WHERE user_id = ? 
      AND MONTH(created_at) = ? 
      AND YEAR(created_at) = ?
      ORDER BY id DESC
    `,
      [userId, currentMonth, currentYear],
    );

    // Sanitize data sebelum dikirim
    const sanitizedRows = rows.map((row) => ({
      ...row,
      nama: escapeHtml(String(row.nama)),
      no_induk: escapeHtml(String(row.no_induk)),
    }));

    res.json(sanitizedRows);
  } catch (err) {
    console.error("[GET BONUS ERROR]:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
  }
});

// ========================
// INSERT BONUS
// ========================
router.post("/bonus", validateBonus, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validasi gagal",
        errors: errors.array(),
      });
    }

    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "bonus_hisana" : "bonus_enakko";

    if (!["hisana", "enakko"].includes(company)) {
      return res.status(400).json({ success: false, message: "Company tidak valid" });
    }

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;
    const d = req.body;

    // Parse periode (format: YYYY-MM)
    let bulan, tahun;
    if (d.periode) {
      const [year, month] = d.periode.split("-");
      tahun = parseInt(year);
      bulan = parseInt(month);

      // Validasi bulan dan tahun
      if (bulan < 1 || bulan > 12 || tahun < 2000 || tahun > 2100) {
        return res.status(400).json({
          success: false,
          message: "Bulan atau tahun tidak valid",
        });
      }
    } else {
      bulan = d.bulan;
      tahun = d.tahun;
    }

    // Sanitasi input
    const no_induk = String(d.no_induk).trim().substring(0, 50);
    const nama = String(d.nama).trim().substring(0, 100);
    const jumlah_bonus = Math.abs(parseFloat(d.jumlah_bonus));
    const nohp = String(d.nohp)
      .replace(/[^0-9]/g, "")
      .substring(0, 15);

    const query = `
      INSERT INTO ${tableName}
      (user_id, no_induk, nama, bulan, tahun, jumlah_bonus, nohp, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [userId, no_induk, nama, bulan, tahun, jumlah_bonus, nohp, "belum_dikirim"];

    await db.query(query, values);

    res.json({ success: true, message: "Bonus berhasil ditambahkan" });
  } catch (err) {
    console.error("[INSERT BONUS ERROR]:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
  }
});

// ========================
// UPDATE BONUS
// ========================
router.put("/bonus/:id", validateBonus, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validasi gagal",
        errors: errors.array(),
      });
    }

    const number = checkLogin(req, res);
    if (!number) return;

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "ID tidak valid" });
    }

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "bonus_hisana" : "bonus_enakko";

    if (!["hisana", "enakko"].includes(company)) {
      return res.status(400).json({ success: false, message: "Company tidak valid" });
    }

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;
    const d = req.body;

    // Parse periode
    let bulan, tahun;
    if (d.periode) {
      const [year, month] = d.periode.split("-");
      tahun = parseInt(year);
      bulan = parseInt(month);

      if (bulan < 1 || bulan > 12 || tahun < 2000 || tahun > 2100) {
        return res.status(400).json({
          success: false,
          message: "Bulan atau tahun tidak valid",
        });
      }
    } else {
      bulan = d.bulan;
      tahun = d.tahun;
    }

    // Sanitasi input
    const no_induk = String(d.no_induk).trim().substring(0, 50);
    const nama = String(d.nama).trim().substring(0, 100);
    const jumlah_bonus = Math.abs(parseFloat(d.jumlah_bonus));
    const nohp = String(d.nohp)
      .replace(/[^0-9]/g, "")
      .substring(0, 15);

    const [result] = await db.query(
      `
      UPDATE ${tableName} SET
        no_induk = ?,
        nama = ?,
        bulan = ?,
        tahun = ?,
        jumlah_bonus = ?,
        nohp = ?
      WHERE id = ? AND user_id = ? AND status != 'terkirim'
    `,
      [no_induk, nama, bulan, tahun, jumlah_bonus, nohp, id, userId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Data tidak ditemukan, tidak memiliki akses, atau sudah terkirim",
      });
    }

    res.json({ success: true, message: "Bonus berhasil diperbarui" });
  } catch (err) {
    console.error("[UPDATE BONUS ERROR]:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
  }
});

// ========================
// DELETE BONUS
// ========================
router.delete("/bonus/:id", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "ID tidak valid" });
    }

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "bonus_hisana" : "bonus_enakko";

    if (!["hisana", "enakko"].includes(company)) {
      return res.status(400).json({ success: false, message: "Company tidak valid" });
    }

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;

    // Hanya bisa menghapus data yang belum terkirim
    const [result] = await db.query(`DELETE FROM ${tableName} WHERE id = ? AND user_id = ? AND status != 'terkirim'`, [id, userId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Data tidak ditemukan, tidak memiliki akses, atau sudah terkirim",
      });
    }

    res.json({ success: true, message: "Bonus berhasil dihapus" });
  } catch (err) {
    console.error("[DELETE BONUS ERROR]:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
  }
});

// ========================
// KIRIM BONUS WHATSAPP (Dengan Progress Tracking)
// ========================
router.post("/send-bonus", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const selected = req.body.selected || [];
    const company = req.body.company || "hisana";

    if (!Array.isArray(selected) || selected.length === 0) {
      return res.status(400).json({ success: false, message: "Pilih bonus yang akan dikirim" });
    }

    if (selected.length > 100) {
      return res.status(400).json({ success: false, message: "Maksimal 100 bonus per pengiriman" });
    }

    if (!["hisana", "enakko"].includes(company)) {
      return res.status(400).json({ success: false, message: "Company tidak valid" });
    }

    const tableName = company === "hisana" ? "bonus_hisana" : "bonus_enakko";

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;

    // Ambil data berdasarkan ID yang dipilih (validasi ID numeric)
    const validIds = selected.filter((id) => !isNaN(parseInt(id))).map((id) => parseInt(id));
    if (validIds.length === 0) {
      return res.status(400).json({ success: false, message: "ID tidak valid" });
    }

    const placeholders = validIds.map(() => "?").join(",");
    const [rows] = await db.query(`SELECT * FROM ${tableName} WHERE id IN (${placeholders}) AND user_id = ? AND status = 'belum_dikirim'`, [...validIds, userId]);

    if (!rows.length) {
      return res.status(400).json({ success: false, message: "Tidak ada bonus terpilih yang belum dikirim" });
    }

    // Setup bonus progress tracking
    bonusProgress = {
      running: true,
      total: rows.length,
      sent: 0,
      failed: 0,
      startTime: new Date(),
      endTime: null,
    };

    res.json({ success: true, message: "Pengiriman bonus dimulai" });

    // Proses pengiriman secara asynchronous
    (async () => {
      for (const bonus of rows) {
        try {
          if (company === "hisana") {
            await kirimBonusHisana(bonus, number);
          } else {
            await kirimBonusEnakko(bonus, number);
          }

          await db.query(`UPDATE ${tableName} SET status = 'terkirim' WHERE id = ? AND user_id = ?`, [bonus.id, userId]);
          bonusProgress.sent++;
        } catch (err) {
          console.error(`Gagal kirim bonus ke ${bonus.nama} (${bonus.no_induk}):`, err.message);
          bonusProgress.failed++;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      bonusProgress.running = false;
      bonusProgress.endTime = new Date();
    })();
  } catch (err) {
    console.error("[SEND BONUS ERROR]:", err);
    bonusProgress.running = false;
    res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
  }
});

// ========================
// GET BONUS PROGRESS
// ========================
router.get("/bonus-progress", (req, res) => {
  res.json(bonusProgress);
});

// ========================
// DUPLIKASI DATA BONUS DARI BULAN SEBELUMNYA
// ========================
router.post("/duplicate-bonus-data", async (req, res) => {
  try {
    console.log("[DUPLICATE BONUS] Request received");

    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "bonus_hisana" : "bonus_enakko";

    if (!["hisana", "enakko"].includes(company)) {
      return res.status(400).json({ success: false, message: "Company tidak valid" });
    }

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    let previousMonth = currentMonth - 1;
    let previousYear = currentYear;
    if (previousMonth === 0) {
      previousMonth = 12;
      previousYear = currentYear - 1;
    }

    console.log(`[DUPLICATE BONUS] Current: ${currentYear}-${currentMonth}, Previous: ${previousYear}-${previousMonth}`);

    // Get all bonus data from previous month
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
    } catch (err) {
      console.error("[DUPLICATE BONUS] Error fetching previous data:", err);
      return res.status(500).json({ success: false, message: "Error fetching data" });
    }

    if (previousData.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada data bonus dari bulan ${previousMonth}/${previousYear} untuk diduplikasi`,
      });
    }

    // Get existing bonus data in current month
    let existingData;
    try {
      const query = `
        SELECT no_induk FROM ${tableName} 
        WHERE user_id = ? 
        AND MONTH(created_at) = ? 
        AND YEAR(created_at) = ?
      `;
      [existingData] = await db.query(query, [userId, currentMonth, currentYear]);
    } catch (err) {
      console.error("[DUPLICATE BONUS] Error checking existing data:", err);
      return res.status(500).json({ success: false, message: "Error checking existing data" });
    }

    const existingEmployeeIds = new Set(existingData.map((item) => item.no_induk));
    const dataToDuplicate = previousData.filter((item) => !existingEmployeeIds.has(item.no_induk));

    if (dataToDuplicate.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada data bonus baru untuk diduplikasi. Semua karyawan dari bulan ${previousMonth}/${previousYear} sudah memiliki data bonus di bulan ini.`,
      });
    }

    let duplicatedCount = 0;
    let skippedCount = previousData.length - dataToDuplicate.length;
    let errors = [];

    for (const oldData of dataToDuplicate) {
      try {
        const { id, created_at, ...newData } = oldData;

        newData.bulan = currentMonth;
        newData.tahun = currentYear;
        newData.status = "belum_dikirim";
        newData.is_duplicated = true;
        newData.duplicated_from_id = id;
        newData.duplicated_at = new Date();

        const fields = Object.keys(newData);
        const values = Object.values(newData);
        const placeholders = fields.map(() => "?").join(",");

        const insertQuery = `INSERT INTO ${tableName} (${fields.join(",")}) VALUES (${placeholders})`;
        await db.query(insertQuery, values);
        duplicatedCount++;
      } catch (err) {
        console.error(`[DUPLICATE BONUS] Error inserting record for ${oldData.no_induk}:`, err);
        errors.push(`${oldData.no_induk}: ${err.message}`);
      }
    }

    let message = `Berhasil menduplikasi ${duplicatedCount} data bonus baru dari bulan ${previousMonth}/${previousYear}`;
    if (skippedCount > 0) {
      message += `\n\n${skippedCount} data bonus yang sudah ada di bulan ini tidak diduplikasi.`;
    }

    res.json({
      success: true,
      message: message,
      duplicatedCount: duplicatedCount,
      skippedCount: skippedCount,
      totalPrevious: previousData.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("[DUPLICATE BONUS ERROR]:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
  }
});

// ========================
// BATALKAN DUPLIKASI BONUS
// ========================
router.post("/cancel-duplicate-bonus", async (req, res) => {
  try {
    console.log("[CANCEL DUPLICATE BONUS] Request received");

    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "bonus_hisana" : "bonus_enakko";

    if (!["hisana", "enakko"].includes(company)) {
      return res.status(400).json({ success: false, message: "Company tidak valid" });
    }

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    let currentData;
    const getDataQuery = `
      SELECT id, no_induk, nama, is_duplicated 
      FROM ${tableName} 
      WHERE user_id = ? 
      AND MONTH(created_at) = ? 
      AND YEAR(created_at) = ?
    `;
    [currentData] = await db.query(getDataQuery, [userId, currentMonth, currentYear]);

    if (currentData.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada data bonus dari bulan ${currentMonth}/${currentYear} untuk dibatalkan`,
      });
    }

    const duplicatedData = currentData.filter((item) => item.is_duplicated === 1);
    const manualData = currentData.filter((item) => item.is_duplicated !== 1);

    if (duplicatedData.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada data bonus hasil duplikasi di bulan ${currentMonth}/${currentYear} untuk dibatalkan.`,
      });
    }

    const duplicatedIds = duplicatedData.map((item) => item.id);
    const deleteQuery = `DELETE FROM ${tableName} WHERE id IN (${duplicatedIds.map(() => "?").join(",")})`;
    const [result] = await db.query(deleteQuery, duplicatedIds);

    let message = `Berhasil membatalkan duplikasi bonus. ${result.affectedRows} data hasil duplikasi telah dihapus.`;
    if (manualData.length > 0) {
      message += `\n\n${manualData.length} data bonus input manual tetap dipertahankan.`;
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
    console.error("[CANCEL DUPLICATE BONUS ERROR]:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
  }
});

// ========================
// CHECK BONUS DUPLICATE STATUS
// ========================
router.get("/check-bonus-duplicate-status", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || "hisana";
    const tableName = company === "hisana" ? "bonus_hisana" : "bonus_enakko";

    if (!["hisana", "enakko"].includes(company)) {
      return res.status(400).json({ success: false, message: "Company tidak valid" });
    }

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

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

    res.json({
      success: true,
      hasRecentDuplicate,
    });
  } catch (err) {
    console.error("[CHECK BONUS DUPLICATE STATUS ERROR]:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
  }
});

// ========================
// HELPER FUNCTION
// ========================
function escapeHtml(text) {
  if (!text) return "";
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export default router;
