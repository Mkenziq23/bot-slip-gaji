// server/routes/slipBonusRoutes.js
import express from "express";
import db from "../db.js";
import { body, validationResult } from "express-validator";
import kirimBonusHisana from "../../bot/sendMessage/kirimBonusHisana.js";
import kirimBonusEnakko from "../../bot/sendMessage/kirimBonusEnakko.js";
import { kirimPembatalanBonusHisana, kirimPembatalanBonusEnakko } from "../../bot/cancelMessage/cancelSlipBonus.js";

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
// GET EMPLOYEE LIST FROM DATA KARYAWAN
// ========================
router.get("/bonus-employees", async (req, res) => {
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

    // Ambil data karyawan hanya no_induk, nama, no_hp
    const [employees] = await db.query(
      `SELECT no_induk, nama_lengkap as nama, no_hp 
       FROM ${tableName} 
       WHERE user_id = ? 
       ORDER BY no_induk ASC`,
      [userId],
    );

    console.log(`[BONUS EMPLOYEES] Loaded ${employees.length} employees for ${company}`);

    res.json({
      success: true,
      employees: employees,
    });
  } catch (err) {
    console.error("[GET BONUS EMPLOYEES ERROR]:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
  }
});

// ========================
// GET BONUS DATA
// ========================
router.get("/bonus", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const month = req.query.month;
    const year = req.query.year;
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

    // Build query dengan filter menggunakan kolom bulan dan tahun
    let query = `
      SELECT id, no_induk, nama, bulan, tahun, jumlah_bonus, nohp, status, 
            created_at, is_duplicated, cancelled_at, cancellation_note, cancelled_by 
      FROM ${tableName} 
      WHERE user_id = ? 
    `;

    const queryParams = [userId];

    // Add month filter if provided and not "all"
    if (month && month !== "all" && month !== "") {
      query += ` AND bulan = ?`;
      queryParams.push(parseInt(month));
      console.log(`[BONUS] Adding month filter: ${month}`);
    }

    // Add year filter if provided and not "all"
    if (year && year !== "all" && year !== "") {
      query += ` AND tahun = ?`;
      queryParams.push(parseInt(year));
      console.log(`[BONUS] Adding year filter: ${year}`);
    }

    // Add order by
    query += ` ORDER BY tahun DESC, bulan DESC, id DESC`;

    console.log(`[BONUS] Query: ${query}, Params:`, queryParams);

    const [rows] = await db.query(query, queryParams);

    console.log(`[BONUS] Found ${rows.length} records for ${company} with month=${month}, year=${year}`);

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
// GET AVAILABLE BONUS YEARS
// ========================
router.get("/bonus-years", async (req, res) => {
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

    // Get distinct years from kolom tahun (bukan created_at)
    const [rows] = await db.query(
      `SELECT DISTINCT tahun FROM ${tableName} 
       WHERE user_id = ? 
       ORDER BY tahun DESC`,
      [userId],
    );

    const years = rows.map((row) => row.tahun);

    console.log(`[BONUS YEARS] Available years for ${company}:`, years);

    res.json({ success: true, years });
  } catch (err) {
    console.error("[GET BONUS YEARS ERROR]:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
  }
});

// ========================
// INSERT BONUS
// ========================
router.post(
  "/bonus",
  [
    body("no_induk").notEmpty().withMessage("No Induk harus diisi").trim().escape(),
    body("nama").notEmpty().withMessage("Nama harus diisi").trim().escape(),
    body("periode").optional().isISO8601().withMessage("Format periode tidak valid"),
    body("jumlah_bonus").isNumeric().withMessage("Jumlah bonus harus angka").toFloat(),
    body("nohp")
      .matches(/^\d{10,15}$/)
      .withMessage("Nomor HP tidak valid")
      .trim(),
  ],
  async (req, res) => {
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

      // Check if no_induk already exists for this user in current month
      const [existing] = await db.query(
        `SELECT COUNT(*) as count FROM ${tableName} 
       WHERE user_id = ? 
       AND no_induk = ? 
       AND bulan = ? 
       AND tahun = ?`,
        [userId, d.no_induk, bulan, tahun],
      );

      if (existing[0].count > 0) {
        return res.status(400).json({
          success: false,
          message: `Nomor induk ${d.no_induk} sudah memiliki data bonus untuk bulan ${bulan}/${tahun}. Silakan gunakan nomor induk yang berbeda atau edit data yang sudah ada.`,
        });
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
  },
);

// ========================
// UPDATE BONUS
// ========================
router.put(
  "/bonus/:id",
  [
    body("no_induk").notEmpty().withMessage("No Induk harus diisi").trim().escape(),
    body("nama").notEmpty().withMessage("Nama harus diisi").trim().escape(),
    body("periode").optional().isISO8601().withMessage("Format periode tidak valid"),
    body("jumlah_bonus").isNumeric().withMessage("Jumlah bonus harus angka").toFloat(),
    body("nohp")
      .matches(/^\d{10,15}$/)
      .withMessage("Nomor HP tidak valid")
      .trim(),
  ],
  async (req, res) => {
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

      // Check if no_induk already exists for this user in current month (excluding current record)
      const [existing] = await db.query(
        `SELECT COUNT(*) as count FROM ${tableName} 
       WHERE user_id = ? 
       AND no_induk = ? 
       AND bulan = ? 
       AND tahun = ?
       AND id != ?`,
        [userId, d.no_induk, bulan, tahun, id],
      );

      if (existing[0].count > 0) {
        return res.status(400).json({
          success: false,
          message: `Nomor induk ${d.no_induk} sudah memiliki data bonus untuk bulan ${bulan}/${tahun}. Silakan gunakan nomor induk yang berbeda.`,
        });
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
  },
);

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
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

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
    // Include both 'belum_dikirim' AND 'dibatalkan' status for resending
    const [rows] = await db.query(`SELECT * FROM ${tableName} WHERE id IN (${placeholders}) AND user_id = ? AND (status = 'belum_dikirim' OR status = 'dibatalkan')`, [...validIds, userId]);

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: "Tidak ada bonus yang dapat dikirim. Pastikan bonus yang dipilih berstatus 'Belum Dikirim' atau 'Dibatalkan'.",
      });
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

    // IMPORTANT: Send response BEFORE processing
    res.json({ success: true, message: "Pengiriman bonus dimulai", total: rows.length });

    // Proses pengiriman secara asynchronous
    (async () => {
      for (const bonus of rows) {
        try {
          if (company === "hisana") {
            await kirimBonusHisana(bonus, number);
          } else {
            await kirimBonusEnakko(bonus, number);
          }

          // Update status to "terkirim" after successful send
          await db.query(`UPDATE ${tableName} SET status = 'terkirim' WHERE id = ? AND user_id = ?`, [bonus.id, userId]);
          bonusProgress.sent++;
          console.log(`✅ Bonus terkirim: ${bonus.nama} (${bonus.no_induk})`);
        } catch (err) {
          console.error(`❌ Gagal kirim bonus ke ${bonus.nama} (${bonus.no_induk}):`, err.message);
          bonusProgress.failed++;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      bonusProgress.running = false;
      bonusProgress.endTime = new Date();
      console.log(`🎉 Pengiriman bonus selesai: ${bonusProgress.sent} berhasil, ${bonusProgress.failed} gagal`);
    })();
  } catch (err) {
    console.error("[SEND BONUS ERROR]:", err);
    bonusProgress.running = false;
    res.status(500).json({ success: false, message: "Terjadi kesalahan server: " + err.message });
  }
});

// ========================
// CANCEL BONUS WHATSAPP
// ========================
router.post("/cancel-bonus", async (req, res) => {
  try {
    const number = req.session.number;
    if (!number) {
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const selected = req.body.selected || [];
    const company = req.body.company || "hisana";
    const cancellationNote = req.body.cancellation_note || "Pembatalan oleh user";

    if (!Array.isArray(selected) || selected.length === 0) {
      return res.status(400).json({ success: false, message: "Pilih bonus yang akan dibatalkan" });
    }

    if (!["hisana", "enakko"].includes(company)) {
      return res.status(400).json({ success: false, message: "Company tidak valid" });
    }

    const tableName = company === "hisana" ? "bonus_hisana" : "bonus_enakko";

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

    // Ambil data bonus yang akan dibatalkan
    const placeholders = validIds.map(() => "?").join(",");
    const [rows] = await db.query(`SELECT * FROM ${tableName} WHERE id IN (${placeholders}) AND user_id = ? AND status = 'terkirim'`, [...validIds, userId]);

    if (!rows.length) {
      return res.status(400).json({ success: false, message: "Tidak ada bonus terkirim yang dipilih" });
    }

    // Kirim response segera
    res.json({ success: true, message: "Pembatalan bonus dimulai" });

    // Proses pembatalan secara asynchronous
    (async () => {
      let cancelledCount = 0;
      let failedCount = 0;
      let messageSentCount = 0;
      let messageFailedCount = 0;

      for (const bonus of rows) {
        try {
          // 1. Update status menjadi dibatalkan di database
          const updateQuery = `
            UPDATE ${tableName} 
            SET status = 'dibatalkan', 
                cancelled_at = NOW(), 
                cancellation_note = ?,
                cancelled_by = ?
            WHERE id = ? AND user_id = ?
          `;

          await db.query(updateQuery, [cancellationNote, userId, bonus.id, userId]);
          cancelledCount++;

          // 2. Kirim pesan pembatalan ke karyawan
          try {
            if (company === "hisana") {
              await kirimPembatalanBonusHisana(bonus, senderNumber, cancellationNote);
            } else {
              await kirimPembatalanBonusEnakko(bonus, senderNumber, cancellationNote);
            }
            messageSentCount++;
          } catch (sendError) {
            console.error(`Gagal kirim pesan ke ${bonus.nama}:`, sendError.message);
            messageFailedCount++;
          }

          // Delay 2 detik antar pengiriman untuk menghindari rate limit
          await new Promise((r) => setTimeout(r, 2000));
        } catch (err) {
          console.error(`Gagal membatalkan bonus ID ${bonus.id}:`, err.message);
          failedCount++;
        }
      }

      console.log(`
        === LAPORAN PEMBATALAN BONUS ===
        Total diproses: ${rows.length}
        Berhasil dibatalkan: ${cancelledCount}
        Gagal dibatalkan: ${failedCount}
        Pesan terkirim: ${messageSentCount}
        Pesan gagal: ${messageFailedCount}
      `);
    })();
  } catch (err) {
    console.error("[CANCEL BONUS ERROR]:", err);
    // Jika response belum dikirim
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
    }
  }
});

// ========================
// GET BONUS PROGRESS
// ========================
router.get("/bonus-progress", (req, res) => {
  res.json(bonusProgress);
});

// ========================
// DUPLIKASI DATA BONUS DARI BULAN SEBELUMNYA (SEMUA STATUS)
// ========================
router.post("/duplicate-bonus-data", async (req, res) => {
  try {
    console.log("[DUPLICATE BONUS] Request received");
    console.log("[DUPLICATE BONUS] Query params:", req.query);
    console.log("[DUPLICATE BONUS] Session number:", req.session.number);

    const number = req.session.number;
    if (!number) {
      console.log("[DUPLICATE BONUS] No session number found");
      return res.status(401).json({ success: false, message: "Belum login" });
    }

    const company = req.query.company || "hisana";
    console.log(`[DUPLICATE BONUS] Company: ${company}`);

    const tableName = company === "hisana" ? "bonus_hisana" : "bonus_enakko";
    console.log(`[DUPLICATE BONUS] Table name: ${tableName}`);

    // Get user ID
    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      console.log("[DUPLICATE BONUS] User not found for number:", number);
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;
    console.log(`[DUPLICATE BONUS] User ID: ${userId}`);

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

    console.log(`[DUPLICATE BONUS] Current: ${currentYear}-${currentMonth}, Previous: ${previousYear}-${previousMonth}`);

    // Get ALL bonus data from previous month (semua status)
    let previousData;
    try {
      const query = `
        SELECT * FROM ${tableName} 
        WHERE user_id = ? 
        AND bulan = ? 
        AND tahun = ?
        ORDER BY id
      `;
      [previousData] = await db.query(query, [userId, previousMonth, previousYear]);
      console.log(`[DUPLICATE BONUS] Found ${previousData.length} records from previous month`);

      // Log breakdown status
      const statusBreakdown = previousData.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {});
      console.log(`[DUPLICATE BONUS] Status breakdown:`, statusBreakdown);
    } catch (err) {
      console.error("[DUPLICATE BONUS] Error fetching previous data:", err);
      return res.status(500).json({ success: false, message: "Error fetching data: " + err.message });
    }

    if (previousData.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada data bonus dari bulan ${previousMonth}/${previousYear} untuk diduplikasi. Pastikan data bonus bulan lalu sudah ada.`,
      });
    }

    // Get existing bonus data in current month
    let existingData;
    try {
      const query = `
        SELECT no_induk FROM ${tableName} 
        WHERE user_id = ? 
        AND bulan = ? 
        AND tahun = ?
      `;
      [existingData] = await db.query(query, [userId, currentMonth, currentYear]);
      console.log(`[DUPLICATE BONUS] Existing employees in current month: ${existingData.length}`);
    } catch (err) {
      console.error("[DUPLICATE BONUS] Error checking existing data:", err);
      return res.status(500).json({ success: false, message: "Error checking existing data: " + err.message });
    }

    // Create set of existing employee IDs
    const existingEmployeeIds = new Set(existingData.map((item) => item.no_induk));
    console.log(`[DUPLICATE BONUS] Existing employee IDs:`, Array.from(existingEmployeeIds));

    // Filter data from previous month to only include employees NOT in current month
    const dataToDuplicate = previousData.filter((item) => !existingEmployeeIds.has(item.no_induk));
    console.log(`[DUPLICATE BONUS] Found ${dataToDuplicate.length} new employees to duplicate (out of ${previousData.length} total)`);

    if (dataToDuplicate.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada data bonus baru untuk diduplikasi. Semua karyawan dari bulan ${previousMonth}/${previousYear} sudah memiliki data bonus di bulan ini.`,
      });
    }

    // Duplicate data menggunakan transaksi
    const connection = await db.getConnection();
    await connection.beginTransaction();

    let duplicatedCount = 0;
    let skippedCount = previousData.length - dataToDuplicate.length;
    let errors = [];
    let duplicatedIds = [];

    try {
      for (const oldData of dataToDuplicate) {
        try {
          // Create new data object
          const newData = {
            user_id: userId,
            no_induk: oldData.no_induk,
            nama: oldData.nama,
            bulan: currentMonth,
            tahun: currentYear,
            jumlah_bonus: oldData.jumlah_bonus,
            nohp: oldData.nohp,
            status: "belum_dikirim", // Always reset to belum_dikirim
            is_duplicated: 1,
            duplicated_from_id: oldData.id,
            duplicated_at: new Date(),
            created_at: new Date(),
          };

          // Build insert query
          const fields = Object.keys(newData);
          const values = Object.values(newData);
          const placeholders = fields.map(() => "?").join(",");

          const insertQuery = `INSERT INTO ${tableName} (${fields.join(",")}) VALUES (${placeholders})`;

          console.log(`[DUPLICATE BONUS] Duplicating employee: ${oldData.no_induk} (${oldData.nama}) from ID: ${oldData.id} (status asli: ${oldData.status})`);
          const [result] = await connection.query(insertQuery, values);
          duplicatedIds.push(result.insertId);
          duplicatedCount++;
        } catch (err) {
          console.error(`[DUPLICATE BONUS] Error inserting record for ${oldData.no_induk}:`, err);
          errors.push(`${oldData.no_induk}: ${err.message}`);
        }
      }

      // Commit transaksi
      await connection.commit();
      console.log(`[DUPLICATE BONUS] Transaction committed successfully`);

      // Prepare message HTML for SweetAlert
      let messageHtml = `<div style="background:#f0fdf4;border-radius:12px;padding:15px">
          <p><strong>✅ Berhasil menduplikasi data bonus dari bulan ${previousMonth}/${previousYear} ke bulan ${currentMonth}/${currentYear}.</strong></p>
          <p style="margin-top: 10px;">
            <i class="fas fa-check-circle" style="color:#16a34a"></i> <strong>${duplicatedCount}</strong> data bonus berhasil diduplikasi
          </p>`;

      if (skippedCount > 0) {
        messageHtml += `<p style="margin-top: 5px;">
          <i class="fas fa-info-circle" style="color:#f59e0b"></i> <strong>${skippedCount}</strong> data bonus dilewati (sudah ada di bulan ini)
        </p>`;
      }

      if (errors.length > 0 && errors.length <= 5) {
        messageHtml += `<div style="margin-top: 10px; padding: 10px; background: #fee2e2; border-radius: 8px;">
          <p style="margin: 0 0 5px 0; font-weight: bold; color: #dc2626;">Data gagal diduplikasi:</p>
          <ul style="margin: 0; padding-left: 20px; color: #dc2626;">`;
        errors.forEach((error) => {
          messageHtml += `<li>${error}</li>`;
        });
        messageHtml += `</ul></div>`;
      }

      messageHtml += `</div>`;

      res.json({
        success: true,
        message: `Berhasil menduplikasi ${duplicatedCount} data bonus dari bulan ${previousMonth}/${previousYear} ke bulan ${currentMonth}/${currentYear}.`,
        messageHtml: messageHtml,
        duplicatedCount: duplicatedCount,
        skippedCount: skippedCount,
        totalPrevious: previousData.length,
        duplicatedIds: duplicatedIds,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (err) {
      // Rollback jika ada error
      await connection.rollback();
      console.error("[DUPLICATE BONUS] Transaction error, rolling back:", err);
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("[DUPLICATE BONUS ERROR]:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan saat menduplikasi data bonus",
    });
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
      AND bulan = ? 
      AND tahun = ?
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

    // GUNAKAN kolom bulan dan tahun, BUKAN MONTH(created_at) dan YEAR(created_at)
    const query = `
      SELECT COUNT(*) as count FROM ${tableName} 
      WHERE user_id = ? 
      AND bulan = ? 
      AND tahun = ?
      AND is_duplicated = 1
    `;
    const [result] = await db.query(query, [userId, currentMonth, currentYear]);

    const hasRecentDuplicate = result[0].count > 0;

    console.log(`[CHECK BONUS STATUS] User ${userId}, Month ${currentMonth}/${currentYear}, Has duplicated data: ${hasRecentDuplicate}`);

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
