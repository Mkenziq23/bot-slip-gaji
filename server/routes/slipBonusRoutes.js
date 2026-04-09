import express from "express";
import db from "../db.js";
import kirimBonusHisana from "../../bot/sendMessage/kirimBonusHisana.js";
import kirimBonusEnakko from "../../bot/sendMessage/kirimBonusEnakko.js";
import { kirimPembatalanBonusHisana, kirimPembatalanBonusEnakko } from "../../bot/cancelMessage/cancelSlipBonus.js";
import { getSocketByNumber } from "../../bot/index.js";

const router = express.Router();

// Helper function untuk mendapatkan nama tabel
function getBonusTableName(company) {
  return company === "hisana" ? "bonus_hisana" : "bonus_enakko";
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

// Helper untuk mendapatkan socket yang valid
async function getValidSocket(senderNumber, maxRetries = 5) {
  console.log(`[SOCKET CHECK] Checking socket for ${senderNumber}`);

  for (let i = 0; i < maxRetries; i++) {
    const sock = getSocketByNumber(senderNumber);

    if (sock && sock.user && sock.user.id) {
      console.log(`✅ Socket valid untuk ${senderNumber}`);
      return sock;
    }

    if (i === 2) {
      console.log(`[SOCKET CHECK] Attempting to restart bot for ${senderNumber}`);
      try {
        const { startBot } = await import("../../bot/index.js");
        await startBot({ number: senderNumber });
      } catch (err) {
        console.error(`Failed to restart bot:`, err.message);
      }
    }

    await new Promise((r) => setTimeout(r, 3000));
  }

  throw new Error(`Bot WhatsApp tidak aktif untuk nomor ${senderNumber}`);
}

// ========================
// GET BONUS DATA (dengan JOIN karyawan)
// ========================
router.get("/bonus", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const bonusTable = getBonusTableName(company);
    const karyawanTable = getKaryawanTableName(company);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    let query = `
      SELECT 
        b.*,
        k.no_induk,
        k.nama_lengkap as nama,
        k.no_hp as nohp
      FROM ${bonusTable} b
      INNER JOIN ${karyawanTable} k ON b.karyawan_id = k.id AND k.user_id = ?
      WHERE b.user_id = ?
    `;
    let queryParams = [userId, userId];

    const month = req.query.month;
    const year = req.query.year;

    if (month && month !== "all" && month !== "") {
      query += ` AND b.bulan = ?`;
      queryParams.push(parseInt(month));
    }

    if (year && year !== "all" && year !== "") {
      query += ` AND b.tahun = ?`;
      queryParams.push(parseInt(year));
    }

    query += ` ORDER BY b.created_at DESC`;

    const [rows] = await db.query(query, queryParams);
    res.json(rows);
  } catch (err) {
    console.error("[GET BONUS ERROR]:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========================
// GET BONUS YEARS
// ========================
router.get("/bonus-years", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const bonusTable = getBonusTableName(company);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const [rows] = await db.query(`SELECT DISTINCT tahun FROM ${bonusTable} WHERE user_id = ? ORDER BY tahun DESC`, [userId]);
    const years = rows.map((row) => row.tahun);

    res.json({ success: true, years });
  } catch (err) {
    console.error("[GET BONUS YEARS ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// GET EMPLOYEES FOR BONUS DROPDOWN
// ========================
router.get("/bonus-employees", async (req, res) => {
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

    res.json({ success: true, employees: rows });
  } catch (err) {
    console.error("[BONUS EMPLOYEES ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// POST BONUS
// ========================
router.post("/bonus", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const bonusTable = getBonusTableName(company);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const { karyawan_id, bulan, tahun, jumlah_bonus, nohp } = req.body;

    console.log("📝 Received bonus data:", { karyawan_id, bulan, tahun, jumlah_bonus, nohp, company });

    // VALIDASI
    if (!karyawan_id) {
      return res.status(400).json({ success: false, message: "Pilih karyawan terlebih dahulu" });
    }

    if (!bulan || !tahun) {
      return res.status(400).json({ success: false, message: "Bulan dan tahun harus diisi" });
    }

    if (!jumlah_bonus || jumlah_bonus <= 0) {
      return res.status(400).json({ success: false, message: "Jumlah bonus harus lebih dari 0" });
    }

    // Validasi nohp (opsional, tapi jika ada harus valid)
    if (nohp && nohp !== "") {
      let cleanNohp = nohp.replace(/[^0-9]/g, "");
      if (!cleanNohp.startsWith("62")) {
        if (cleanNohp.startsWith("0")) {
          cleanNohp = "62" + cleanNohp.substring(1);
        } else if (cleanNohp.length >= 10 && cleanNohp.length <= 12) {
          cleanNohp = "62" + cleanNohp;
        }
      }
      // Tidak perlu menyimpan nohp di tabel bonus, karena akan diambil dari data_karyawan
    }

    // Cek apakah karyawan_id valid dan milik user
    const karyawanTable = getKaryawanTableName(company);
    const [karyawanCheck] = await db.query(`SELECT id, no_hp FROM ${karyawanTable} WHERE id = ? AND user_id = ?`, [karyawan_id, userId]);

    if (karyawanCheck.length === 0) {
      return res.status(400).json({ success: false, message: "Karyawan tidak ditemukan" });
    }

    // Cek apakah sudah ada bonus untuk karyawan di bulan/tahun yang sama
    const [existing] = await db.query(
      `SELECT COUNT(*) as count FROM ${bonusTable} 
       WHERE user_id = ? AND karyawan_id = ? AND bulan = ? AND tahun = ?`,
      [userId, karyawan_id, bulan, tahun],
    );

    if (existing[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Karyawan ini sudah memiliki bonus untuk bulan ${bulan}/${tahun}`,
      });
    }

    // INSERT ke database
    const query = `
      INSERT INTO ${bonusTable} 
      (user_id, karyawan_id, bulan, tahun, jumlah_bonus, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `;

    const [result] = await db.query(query, [userId, karyawan_id, bulan, tahun, jumlah_bonus, "belum_dikirim"]);

    console.log(`✅ Bonus berhasil ditambahkan dengan ID: ${result.insertId}`);

    res.json({
      success: true,
      id: result.insertId,
      message: "Bonus berhasil ditambahkan",
    });
  } catch (err) {
    console.error("[POST BONUS ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// PUT BONUS
// ========================
router.put("/bonus/:id", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const id = req.params.id;
    const company = req.query.company || "hisana";
    const bonusTable = getBonusTableName(company);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const { karyawan_id, bulan, tahun, jumlah_bonus } = req.body;

    console.log("📝 Updating bonus data:", { id, karyawan_id, bulan, tahun, jumlah_bonus, company });

    // VALIDASI
    if (!karyawan_id) {
      return res.status(400).json({ success: false, message: "Pilih karyawan terlebih dahulu" });
    }

    if (!bulan || !tahun) {
      return res.status(400).json({ success: false, message: "Bulan dan tahun harus diisi" });
    }

    if (!jumlah_bonus || jumlah_bonus <= 0) {
      return res.status(400).json({ success: false, message: "Jumlah bonus harus lebih dari 0" });
    }

    // Cek apakah data bonus milik user
    const [check] = await db.query(`SELECT id, status FROM ${bonusTable} WHERE id = ? AND user_id = ?`, [id, userId]);

    if (check.length === 0) {
      return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    }

    // Jika status sudah terkirim, tidak bisa diedit
    if (check[0].status === "terkirim") {
      return res.status(400).json({
        success: false,
        message: "Bonus yang sudah terkirim tidak dapat diedit",
      });
    }

    // Cek duplikasi untuk karyawan lain (selain data yang sedang diedit)
    const [existing] = await db.query(
      `SELECT COUNT(*) as count FROM ${bonusTable} 
       WHERE user_id = ? AND karyawan_id = ? AND bulan = ? AND tahun = ? AND id != ?`,
      [userId, karyawan_id, bulan, tahun, id],
    );

    if (existing[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Karyawan ini sudah memiliki bonus untuk bulan ${bulan}/${tahun}`,
      });
    }

    // UPDATE database
    const query = `
      UPDATE ${bonusTable} 
      SET karyawan_id = ?, bulan = ?, tahun = ?, jumlah_bonus = ?
      WHERE id = ? AND user_id = ?
    `;

    await db.query(query, [karyawan_id, bulan, tahun, jumlah_bonus, id, userId]);

    console.log(`✅ Bonus berhasil diupdate: ID ${id}`);

    res.json({ success: true, message: "Bonus berhasil diperbarui" });
  } catch (err) {
    console.error("[PUT BONUS ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// DELETE BONUS
// ========================
router.delete("/bonus/:id", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const id = req.params.id;
    const company = req.query.company || "hisana";
    const bonusTable = getBonusTableName(company);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    // Cek status bonus sebelum hapus
    const [check] = await db.query(`SELECT status FROM ${bonusTable} WHERE id = ? AND user_id = ?`, [id, userId]);

    if (check.length === 0) {
      return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    }

    if (check[0].status === "terkirim") {
      return res.status(400).json({
        success: false,
        message: "Bonus yang sudah terkirim tidak dapat dihapus. Batalkan kirim terlebih dahulu.",
      });
    }

    const [result] = await db.query(`DELETE FROM ${bonusTable} WHERE id = ? AND user_id = ?`, [id, userId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    }

    console.log(`✅ Bonus berhasil dihapus: ID ${id}`);

    res.json({ success: true, message: "Bonus berhasil dihapus" });
  } catch (err) {
    console.error("[DELETE BONUS ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// KIRIM BONUS WHATSAPP
// ========================
let bonusProgress = { running: false, total: 0, sent: 0, failed: 0 };

router.post("/send-bonus", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const { selected, company } = req.body;
    const bonusTable = getBonusTableName(company);
    const karyawanTable = getKaryawanTableName(company);

    const [users] = await db.query("SELECT id, nomor_wa FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;
    const senderNumber = users[0].nomor_wa;

    // CEK SOCKET
    try {
      await getValidSocket(senderNumber);
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (!selected || selected.length === 0) {
      return res.status(400).json({ success: false, message: "Tidak ada data yang dipilih" });
    }

    const placeholders = selected.map(() => "?").join(",");

    const [rows] = await db.query(
      `SELECT b.*, k.no_induk, k.nama_lengkap as nama, k.no_hp as nohp
       FROM ${bonusTable} b
       INNER JOIN ${karyawanTable} k ON b.karyawan_id = k.id
       WHERE b.id IN (${placeholders}) AND b.user_id = ? AND b.status != 'terkirim'`,
      [...selected, userId],
    );

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: "Tidak ada data terpilih yang belum terkirim" });
    }

    bonusProgress = { running: true, total: rows.length, sent: 0, failed: 0 };
    res.json({ success: true });

    (async () => {
      for (const bonus of rows) {
        try {
          if (!bonus.nohp) {
            throw new Error(`Nomor HP tidak tersedia untuk ${bonus.nama}`);
          }

          const bonusData = {
            id: bonus.id,
            no_induk: bonus.no_induk,
            nama: bonus.nama,
            bulan: bonus.bulan,
            tahun: bonus.tahun,
            jumlah_bonus: bonus.jumlah_bonus,
            nohp: bonus.nohp,
          };

          if (company === "hisana") {
            await kirimBonusHisana(bonusData, senderNumber);
          } else {
            await kirimBonusEnakko(bonusData, senderNumber);
          }

          await db.query(`UPDATE ${bonusTable} SET status = 'terkirim' WHERE id = ?`, [bonus.id]);
          bonusProgress.sent++;
          console.log(`✅ Bonus ${company} terkirim: ${bonus.nama}`);
        } catch (err) {
          console.error(`❌ Gagal kirim bonus ke ${bonus.nama}:`, err.message);
          bonusProgress.failed++;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      bonusProgress.running = false;
    })();
  } catch (err) {
    console.error("[SEND BONUS ERROR]:", err);
    bonusProgress.running = false;
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================
// BONUS PROGRESS
// ========================
router.get("/bonus-progress", (req, res) => {
  res.json(bonusProgress);
});

// ========================
// BATAL KIRIM BONUS
// ========================
router.post("/cancel-bonus", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const { selected, company, cancellation_note } = req.body;
    const bonusTable = getBonusTableName(company);
    const karyawanTable = getKaryawanTableName(company);

    const [users] = await db.query("SELECT id, nomor_wa FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;
    const senderNumber = users[0].nomor_wa;

    try {
      await getValidSocket(senderNumber);
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    const placeholders = selected.map(() => "?").join(",");

    const [rows] = await db.query(
      `SELECT b.*, k.no_induk, k.nama_lengkap as nama, k.no_hp as nohp
       FROM ${bonusTable} b
       INNER JOIN ${karyawanTable} k ON b.karyawan_id = k.id
       WHERE b.id IN (${placeholders}) AND b.user_id = ? AND b.status = 'terkirim'`,
      [...selected, userId],
    );

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: "Tidak ada bonus terkirim yang dipilih" });
    }

    let messageSentCount = 0;
    let messageFailedCount = 0;

    for (const bonus of rows) {
      try {
        const bonusData = {
          id: bonus.id,
          no_induk: bonus.no_induk,
          nama: bonus.nama,
          bulan: bonus.bulan,
          tahun: bonus.tahun,
          jumlah_bonus: bonus.jumlah_bonus,
          nohp: bonus.nohp,
        };

        if (company === "hisana") {
          await kirimPembatalanBonusHisana(bonusData, senderNumber, cancellation_note);
        } else {
          await kirimPembatalanBonusEnakko(bonusData, senderNumber, cancellation_note);
        }
        messageSentCount++;
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        console.error(`Error sending cancel notification:`, err);
        messageFailedCount++;
      }
    }

    const updateQuery = `
      UPDATE ${bonusTable} 
      SET status = 'dibatalkan', cancelled_at = NOW(), cancellation_note = ?, cancelled_by = ?
      WHERE id IN (${placeholders}) AND user_id = ? AND status = 'terkirim'
    `;

    const finalNote = cancellation_note || `Pembatalan bonus pada ${new Date().toLocaleString("id-ID")}`;
    const [updateResult] = await db.query(updateQuery, [finalNote, number, ...selected, userId]);

    res.json({
      success: true,
      message: `Berhasil membatalkan ${updateResult.affectedRows} bonus. Notifikasi: ${messageSentCount} berhasil, ${messageFailedCount} gagal.`,
      updatedCount: updateResult.affectedRows,
      messageSentCount,
      messageFailedCount,
    });
  } catch (err) {
    console.error("[CANCEL BONUS ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// DUPLIKASI BONUS DARI BULAN SEBELUMNYA
// ========================
router.post("/duplicate-bonus-data", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const bonusTable = getBonusTableName(company);
    const karyawanTable = getKaryawanTableName(company);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const now = new Date();
    let currentMonth = now.getMonth() + 1;
    let currentYear = now.getFullYear();

    let previousMonth = currentMonth - 1;
    let previousYear = currentYear;
    if (previousMonth === 0) {
      previousMonth = 12;
      previousYear = currentYear - 1;
    }

    // Cek data yang sudah ada di bulan ini
    const [existingCurrent] = await db.query(`SELECT karyawan_id FROM ${bonusTable} WHERE user_id = ? AND bulan = ? AND tahun = ?`, [userId, currentMonth, currentYear]);
    const existingKaryawanIds = new Set(existingCurrent.map((row) => row.karyawan_id));

    // Ambil data bonus bulan sebelumnya
    const [previousData] = await db.query(
      `SELECT b.*, k.no_induk, k.nama_lengkap as nama, k.no_hp
       FROM ${bonusTable} b
       INNER JOIN ${karyawanTable} k ON b.karyawan_id = k.id
       WHERE b.user_id = ? AND b.bulan = ? AND b.tahun = ? AND k.user_id = ?`,
      [userId, previousMonth, previousYear, userId],
    );

    if (previousData.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada data bonus dari bulan sebelumnya (${previousMonth}/${previousYear}) untuk diduplikasi.`,
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
        `INSERT INTO ${bonusTable} 
         (user_id, karyawan_id, bulan, tahun, jumlah_bonus, status, is_duplicated, duplicated_from_id, duplicated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [userId, sourceData.karyawan_id, currentMonth, currentYear, sourceData.jumlah_bonus, "belum_dikirim", 1, sourceData.id],
      );
      duplicatedCount++;
    }

    res.json({
      success: true,
      message: `Berhasil menduplikasi ${duplicatedCount} data bonus`,
      duplicatedCount,
      skippedCount,
    });
  } catch (err) {
    console.error("[DUPLICATE BONUS ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// CHECK BONUS DUPLICATE STATUS
// ========================
router.get("/check-bonus-duplicate-status", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const bonusTable = getBonusTableName(company);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const [result] = await db.query(
      `SELECT COUNT(*) as count FROM ${bonusTable} 
       WHERE user_id = ? AND bulan = ? AND tahun = ? AND is_duplicated = 1`,
      [userId, currentMonth, currentYear],
    );

    res.json({ success: true, hasRecentDuplicate: result[0].count > 0 });
  } catch (err) {
    console.error("[CHECK BONUS DUPLICATE STATUS ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// BATALKAN DUPLIKASI BONUS
// ========================
router.post("/cancel-duplicate-bonus", async (req, res) => {
  try {
    const number = checkLogin(req, res);
    if (!number) return;

    const company = req.query.company || "hisana";
    const bonusTable = getBonusTableName(company);

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const [result] = await db.query(
      `DELETE FROM ${bonusTable} 
       WHERE user_id = ? AND bulan = ? AND tahun = ? AND is_duplicated = 1`,
      [userId, currentMonth, currentYear],
    );

    res.json({
      success: true,
      message: `Berhasil membatalkan duplikasi. ${result.affectedRows} data bonus hasil duplikasi telah dihapus.`,
      deletedCount: result.affectedRows,
    });
  } catch (err) {
    console.error("[CANCEL BONUS DUPLICATE ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
