import express from "express";
import db from "../db.js";
import kirimThrHisana from "../../bot/sendMessage/kirimThrHisana.js";
import kirimThrEnakko from "../../bot/sendMessage/kirimThrEnakko.js";
import { kirimPembatalanThrHisana, kirimPembatalanThrEnakko } from "../../bot/cancelMessage/cancelSlipThr.js";
import { getSocketByNumber } from "../../bot/index.js";

const router = express.Router();

// Helper function untuk mendapatkan nama tabel
function getThrTableName(company) {
  return company === "hisana" ? "thr_hisana" : "thr_enakko";
}

function getKaryawanTableName(company) {
  return company === "hisana" ? "data_karyawan_hisana" : "data_karyawan_enakko";
}

function checkLogin(req, res) {
  const number = req.session.number;
  if (!number) {
    res.status(401).json({ success: false, message: "Belum login" });
    return null;
  }
  return number;
}

// Progress tracking untuk THR
let thrProgress = {
  running: false,
  total: 0,
  sent: 0,
  failed: 0,
  results: [],
};

// ============================
// GET ALL THR DATA (dengan JOIN karyawan)
// ============================
router.get("/thr", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const thrTable = getThrTableName(company);
    const karyawanTable = getKaryawanTableName(company);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    let query = `
      SELECT 
        t.*,
        k.no_induk,
        k.nama_lengkap as nama,
        k.no_hp as nohp
      FROM ${thrTable} t
      INNER JOIN ${karyawanTable} k ON t.karyawan_id = k.id AND k.user_id = ?
      WHERE t.user_id = ?
    `;
    let queryParams = [userId, userId];

    const year = req.query.year;
    const currentYear = new Date().getFullYear();

    // PERBAIKAN: Filter tahun - default ke tahun sekarang jika tidak ada parameter
    let targetYear;
    if (year && year !== "all" && year !== "") {
      targetYear = parseInt(year);
    } else {
      targetYear = currentYear;
    }

    query += ` AND t.tahun = ?`;
    queryParams.push(targetYear);

    console.log(`[GET THR] Company: ${company}, Target year: ${targetYear} (current year: ${currentYear})`);

    query += ` ORDER BY t.created_at DESC, t.tahun DESC`;

    const [rows] = await db.query(query, queryParams);
    console.log(`[GET THR] Found ${rows.length} records for year ${targetYear}`);
    res.json(rows);
  } catch (err) {
    console.error("[GET THR ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// GET AVAILABLE YEARS
// ============================
router.get("/thr-years", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const thrTable = getThrTableName(company);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.json({ success: true, years: [] });
    }
    const userId = users[0].id;

    const [rows] = await db.query(`SELECT DISTINCT tahun FROM ${thrTable} WHERE user_id = ? ORDER BY tahun DESC`, [userId]);
    const years = rows.map((row) => row.tahun);
    console.log(`[GET THR YEARS] Found years: ${years.join(", ")}`);
    res.json({ success: true, years });
  } catch (err) {
    console.error("[GET THR YEARS ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// GET EMPLOYEES FOR THR DROPDOWN
// ============================
router.get("/thr-employees", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const karyawanTable = getKaryawanTableName(company);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const [rows] = await db.query(
      `SELECT id as karyawan_id, no_induk, nama_lengkap as nama, no_hp 
       FROM ${karyawanTable} 
       WHERE user_id = ? 
       ORDER BY no_induk ASC`,
      [userId],
    );

    console.log(`[GET THR EMPLOYEES] Loaded ${rows.length} employees for ${company}`);
    res.json({ success: true, employees: rows });
  } catch (err) {
    console.error("[GET THR EMPLOYEES ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// CREATE THR DATA
// ============================
router.post("/thr", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const thrTable = getThrTableName(company);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const { karyawan_id, tahun, jumlah_thr } = req.body;

    console.log("📝 POST /thr - Request received:", { karyawan_id, tahun, jumlah_thr, company });

    if (!karyawan_id) {
      return res.status(400).json({ success: false, message: "Pilih karyawan terlebih dahulu" });
    }

    if (!tahun) {
      return res.status(400).json({ success: false, message: "Tahun harus diisi" });
    }

    if (!jumlah_thr || jumlah_thr <= 0) {
      return res.status(400).json({ success: false, message: "Jumlah THR harus lebih dari 0" });
    }

    // Cek apakah karyawan_id valid dan milik user
    const karyawanTable = getKaryawanTableName(company);
    const [karyawanCheck] = await db.query(`SELECT id, no_induk, nama_lengkap as nama, no_hp FROM ${karyawanTable} WHERE id = ? AND user_id = ?`, [karyawan_id, userId]);

    if (karyawanCheck.length === 0) {
      return res.status(400).json({ success: false, message: "Karyawan tidak ditemukan" });
    }

    // Cek apakah sudah ada THR untuk karyawan di tahun yang sama
    const [existing] = await db.query(
      `SELECT COUNT(*) as count FROM ${thrTable} 
       WHERE user_id = ? AND karyawan_id = ? AND tahun = ?`,
      [userId, karyawan_id, tahun],
    );

    if (existing[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Karyawan ini sudah memiliki data THR untuk tahun ${tahun}`,
      });
    }

    const query = `
      INSERT INTO ${thrTable} 
      (user_id, karyawan_id, tahun, jumlah_thr, status, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `;

    const [result] = await db.query(query, [userId, karyawan_id, tahun, jumlah_thr, "belum_dikirim"]);

    console.log(`✅ THR berhasil ditambahkan dengan ID: ${result.insertId}`);

    res.json({ success: true, id: result.insertId, message: "THR berhasil ditambahkan" });
  } catch (err) {
    console.error("[POST THR ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// UPDATE THR DATA
// ============================
router.put("/thr/:id", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const id = req.params.id;
    const company = req.query.company || "hisana";
    const thrTable = getThrTableName(company);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const { karyawan_id, tahun, jumlah_thr } = req.body;

    console.log("📝 PUT /thr - Updating:", { id, karyawan_id, tahun, jumlah_thr, company });

    if (!karyawan_id) {
      return res.status(400).json({ success: false, message: "Pilih karyawan terlebih dahulu" });
    }

    if (!tahun) {
      return res.status(400).json({ success: false, message: "Tahun harus diisi" });
    }

    if (!jumlah_thr || jumlah_thr <= 0) {
      return res.status(400).json({ success: false, message: "Jumlah THR harus lebih dari 0" });
    }

    // Cek apakah data THR milik user
    const [check] = await db.query(`SELECT id, status FROM ${thrTable} WHERE id = ? AND user_id = ?`, [id, userId]);

    if (check.length === 0) {
      return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    }

    if (check[0].status === "terkirim") {
      return res.status(400).json({
        success: false,
        message: "THR yang sudah terkirim tidak dapat diedit. Batalkan kirim terlebih dahulu.",
      });
    }

    // Cek duplikasi untuk karyawan lain (selain data yang sedang diedit)
    const [existing] = await db.query(
      `SELECT COUNT(*) as count FROM ${thrTable} 
       WHERE user_id = ? AND karyawan_id = ? AND tahun = ? AND id != ?`,
      [userId, karyawan_id, tahun, id],
    );

    if (existing[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Karyawan ini sudah memiliki data THR untuk tahun ${tahun}`,
      });
    }

    const query = `
      UPDATE ${thrTable} 
      SET karyawan_id = ?, tahun = ?, jumlah_thr = ?
      WHERE id = ? AND user_id = ?
    `;

    const [result] = await db.query(query, [karyawan_id, tahun, jumlah_thr, id, userId]);

    console.log(`✅ THR berhasil diupdate: ID ${id}`);

    res.json({ success: true, message: "THR berhasil diperbarui" });
  } catch (err) {
    console.error("[PUT THR ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// DELETE THR DATA
// ============================
router.delete("/thr/:id", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const id = req.params.id;
    const company = req.query.company || "hisana";
    const thrTable = getThrTableName(company);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const [check] = await db.query(`SELECT status FROM ${thrTable} WHERE id = ? AND user_id = ?`, [id, userId]);

    if (check.length === 0) {
      return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    }

    if (check[0].status === "terkirim") {
      return res.status(400).json({
        success: false,
        message: "THR yang sudah terkirim tidak dapat dihapus. Batalkan kirim terlebih dahulu.",
      });
    }

    const [result] = await db.query(`DELETE FROM ${thrTable} WHERE id = ? AND user_id = ?`, [id, userId]);

    console.log(`✅ THR berhasil dihapus: ID ${id}`);
    res.json({ success: true, message: "THR berhasil dihapus" });
  } catch (err) {
    console.error("[DELETE THR ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// SEND THR WHATSAPP
// ============================
router.post("/send-thr", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const { selected, company } = req.body;
    const thrTable = getThrTableName(company);
    const karyawanTable = getKaryawanTableName(company);

    const [users] = await db.query("SELECT id, nomor_wa FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;
    const senderNumber = users[0].nomor_wa;

    if (!selected || selected.length === 0) {
      return res.status(400).json({ success: false, message: "Tidak ada data yang dipilih" });
    }

    const placeholders = selected.map(() => "?").join(",");

    const [rows] = await db.query(
      `SELECT t.*, k.no_induk, k.nama_lengkap as nama, k.no_hp as nohp
       FROM ${thrTable} t
       INNER JOIN ${karyawanTable} k ON t.karyawan_id = k.id
       WHERE t.id IN (${placeholders}) AND t.user_id = ? AND t.status != 'terkirim'`,
      [...selected, userId],
    );

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: "Tidak ada data terpilih yang belum terkirim" });
    }

    thrProgress = { running: true, total: rows.length, sent: 0, failed: 0, results: [] };
    res.json({ success: true });

    (async () => {
      for (const thr of rows) {
        try {
          if (!thr.nohp) {
            throw new Error(`Nomor HP tidak tersedia untuk ${thr.nama}`);
          }

          const thrData = {
            id: thr.id,
            no_induk: thr.no_induk,
            nama: thr.nama,
            tahun: thr.tahun,
            jumlah_thr: thr.jumlah_thr,
            nohp: thr.nohp,
          };

          if (company === "hisana") {
            await kirimThrHisana(thrData, senderNumber);
          } else {
            await kirimThrEnakko(thrData, senderNumber);
          }

          await db.query(`UPDATE ${thrTable} SET status = 'terkirim' WHERE id = ?`, [thr.id]);
          thrProgress.sent++;
          console.log(`✅ THR ${company} terkirim: ${thr.nama}`);
        } catch (err) {
          console.error(`❌ Gagal kirim THR ke ${thr.nama}:`, err.message);
          thrProgress.failed++;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      thrProgress.running = false;
    })();
  } catch (err) {
    console.error("[SEND THR ERROR]:", err);
    thrProgress.running = false;
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================
// GET THR PROGRESS
// ============================
router.get("/thr-progress", (req, res) => {
  res.json(thrProgress);
});

// ============================
// BATAL KIRIM THR
// ============================
router.post("/cancel-thr", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const { selected, company, cancellation_note } = req.body;
    const thrTable = getThrTableName(company);
    const karyawanTable = getKaryawanTableName(company);

    const [users] = await db.query("SELECT id, nomor_wa FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;
    const senderNumber = users[0].nomor_wa;

    const placeholders = selected.map(() => "?").join(",");

    const [rows] = await db.query(
      `SELECT t.*, k.no_induk, k.nama_lengkap as nama, k.no_hp as nohp
       FROM ${thrTable} t
       INNER JOIN ${karyawanTable} k ON t.karyawan_id = k.id
       WHERE t.id IN (${placeholders}) AND t.user_id = ? AND t.status = 'terkirim'`,
      [...selected, userId],
    );

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: "Tidak ada THR terkirim yang dipilih" });
    }

    let messageSentCount = 0;
    let messageFailedCount = 0;

    for (const thr of rows) {
      try {
        const thrData = {
          id: thr.id,
          no_induk: thr.no_induk,
          nama: thr.nama,
          tahun: thr.tahun,
          jumlah_thr: thr.jumlah_thr,
          nohp: thr.nohp,
        };

        if (company === "hisana") {
          await kirimPembatalanThrHisana(thrData, senderNumber, cancellation_note);
        } else {
          await kirimPembatalanThrEnakko(thrData, senderNumber, cancellation_note);
        }
        messageSentCount++;
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        console.error(`Error sending cancel notification:`, err);
        messageFailedCount++;
      }
    }

    const updateQuery = `
      UPDATE ${thrTable} 
      SET status = 'dibatalkan', cancelled_at = NOW(), cancellation_note = ?, cancelled_by = ?
      WHERE id IN (${placeholders}) AND user_id = ? AND status = 'terkirim'
    `;

    const finalNote = cancellation_note || `Pembatalan THR pada ${new Date().toLocaleString("id-ID")}`;
    const [updateResult] = await db.query(updateQuery, [finalNote, number, ...selected, userId]);

    res.json({
      success: true,
      message: `Berhasil membatalkan ${updateResult.affectedRows} THR. Notifikasi: ${messageSentCount} berhasil, ${messageFailedCount} gagal.`,
      updatedCount: updateResult.affectedRows,
      messageSentCount,
      messageFailedCount,
    });
  } catch (err) {
    console.error("[CANCEL THR ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// DUPLIKASI THR DARI TAHUN SEBELUMNYA
// ============================
router.post("/duplicate-thr", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const { company } = req.body;
    const thrTable = getThrTableName(company);
    const karyawanTable = getKaryawanTableName(company);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;

    console.log(`[DUPLICATE THR] Company: ${company}, From: ${previousYear} To: ${currentYear}`);

    // Cek data yang sudah ada di tahun ini
    const [existingCurrent] = await db.query(`SELECT karyawan_id FROM ${thrTable} WHERE user_id = ? AND tahun = ?`, [userId, currentYear]);
    const existingKaryawanIds = new Set(existingCurrent.map((row) => row.karyawan_id));

    // Ambil data THR tahun sebelumnya
    const [previousData] = await db.query(
      `SELECT t.*, k.no_induk, k.nama_lengkap as nama, k.no_hp
       FROM ${thrTable} t
       INNER JOIN ${karyawanTable} k ON t.karyawan_id = k.id
       WHERE t.user_id = ? AND t.tahun = ? AND k.user_id = ?`,
      [userId, previousYear, userId],
    );

    console.log(`[DUPLICATE THR] Previous year data: ${previousData.length} records`);

    if (previousData.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada data THR dari tahun ${previousYear} untuk diduplikasi.`,
      });
    }

    let duplicatedCount = 0;
    let skippedCount = 0;

    for (const sourceData of previousData) {
      if (existingKaryawanIds.has(sourceData.karyawan_id)) {
        skippedCount++;
        continue;
      }

      await db.query(
        `INSERT INTO ${thrTable} 
         (user_id, karyawan_id, tahun, jumlah_thr, status, is_duplicated, duplicated_from_id, duplicated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [userId, sourceData.karyawan_id, currentYear, sourceData.jumlah_thr, "belum_dikirim", 1, sourceData.id],
      );
      duplicatedCount++;
    }

    console.log(`[DUPLICATE THR] Duplicated: ${duplicatedCount}, Skipped: ${skippedCount}`);

    res.json({
      success: true,
      message: `Berhasil menduplikasi ${duplicatedCount} data THR dari tahun ${previousYear} ke tahun ${currentYear}.`,
      duplicatedCount,
      skippedCount,
    });
  } catch (err) {
    console.error("[DUPLICATE THR ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// CHECK THR DUPLICATE STATUS
// ============================
router.get("/check-thr-duplicate-status", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const thrTable = getThrTableName(company);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const currentYear = new Date().getFullYear();

    const [result] = await db.query(
      `SELECT COUNT(*) as count FROM ${thrTable} 
       WHERE user_id = ? AND tahun = ? AND is_duplicated = 1`,
      [userId, currentYear],
    );

    res.json({ success: true, hasRecentDuplicate: result[0].count > 0 });
  } catch (err) {
    console.error("[CHECK THR DUPLICATE STATUS ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// BATALKAN DUPLIKASI THR
// ============================
router.post("/cancel-duplicate-thr", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const thrTable = getThrTableName(company);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const currentYear = new Date().getFullYear();

    const [result] = await db.query(
      `DELETE FROM ${thrTable} 
       WHERE user_id = ? AND tahun = ? AND is_duplicated = 1`,
      [userId, currentYear],
    );

    res.json({
      success: true,
      message: `Berhasil membatalkan duplikasi. ${result.affectedRows} data THR hasil duplikasi telah dihapus.`,
      deletedCount: result.affectedRows,
    });
  } catch (err) {
    console.error("[CANCEL THR DUPLICATE ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
