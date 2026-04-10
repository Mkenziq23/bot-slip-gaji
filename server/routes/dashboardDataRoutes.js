// server/routes/dashboardDataRoutes.js
import express from "express";
import db from "../db.js";

const router = express.Router();

// Helper: Get user_id from session
function getUserId(req) {
  if (req.session.user_id) return req.session.user_id;
  if (req.session.admin && req.session.admin.id) return req.session.admin.id;
  return null;
}

// Helper function untuk mendapatkan nama tabel
function getKaryawanTableName(company) {
  return company === "hisana" ? "data_karyawan_hisana" : "data_karyawan_enakko";
}

function getSlipTableName(company) {
  return company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";
}

function getBonusTableName(company) {
  return company === "hisana" ? "bonus_hisana" : "bonus_enakko";
}

function getThrTableName(company) {
  return company === "hisana" ? "thr_hisana" : "thr_enakko";
}

// ============================
// DASHBOARD DATA ROUTE
// ============================
router.get("/dashboard-data", async (req, res) => {
  const company = req.query.company || "hisana";
  const userId = getUserId(req);

  // Get current month and year
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  console.log(`[DASHBOARD] Request for company: ${company}, userId: ${userId}`);
  console.log(`[DASHBOARD] Current period: Month ${currentMonth}, Year ${currentYear}`);

  const tableKaryawan = getKaryawanTableName(company);
  const tableSlipGaji = getSlipTableName(company);
  const tableBonus = getBonusTableName(company);
  const tableThr = getThrTableName(company);

  console.log(`[DASHBOARD] Using tables: ${tableKaryawan}, ${tableSlipGaji}, ${tableBonus}, ${tableThr}`);

  try {
    // ========================================
    // GET TOTAL KARYAWAN (hanya untuk user yang login)
    // ========================================
    let karyawanQuery = `SELECT COUNT(*) as total FROM ${tableKaryawan}`;
    let karyawanParams = [];

    if (userId) {
      karyawanQuery += ` WHERE user_id = ?`;
      karyawanParams.push(userId);
    }

    const [karyawanCount] = await db.query(karyawanQuery, karyawanParams);
    console.log(`[DASHBOARD] Total karyawan: ${karyawanCount[0]?.total || 0}`);

    // ========================================
    // GET TOTAL SLIP GAJI BULAN INI (hanya untuk user yang login)
    // ========================================
    let slipQuery = `
      SELECT COUNT(*) as total 
      FROM ${tableSlipGaji} 
      WHERE MONTH(created_at) = ? AND YEAR(created_at) = ?
    `;
    let slipParams = [currentMonth, currentYear];

    if (userId) {
      slipQuery += ` AND user_id = ?`;
      slipParams.push(userId);
    }

    const [slipCount] = await db.query(slipQuery, slipParams);
    console.log(`[DASHBOARD] Total slip bulan ini: ${slipCount[0]?.total || 0}`);

    // ========================================
    // GET TOTAL BONUS BULAN INI (hanya untuk user yang login)
    // ========================================
    let bonusQuery = `
      SELECT COUNT(*) as total 
      FROM ${tableBonus} 
      WHERE bulan = ? AND tahun = ?
    `;
    let bonusParams = [currentMonth, currentYear];

    if (userId) {
      bonusQuery += ` AND user_id = ?`;
      bonusParams.push(userId);
    }

    const [bonusCount] = await db.query(bonusQuery, bonusParams);
    console.log(`[DASHBOARD] Total bonus bulan ini: ${bonusCount[0]?.total || 0}`);

    // ========================================
    // GET TOTAL THR TAHUN INI (hanya untuk user yang login)
    // ========================================
    let thrQuery = `
      SELECT COUNT(*) as total 
      FROM ${tableThr} 
      WHERE tahun = ?
    `;
    let thrParams = [currentYear];

    if (userId) {
      thrQuery += ` AND user_id = ?`;
      thrParams.push(userId);
    }

    const [thrCount] = await db.query(thrQuery, thrParams);
    console.log(`[DASHBOARD] Total THR tahun ini: ${thrCount[0]?.total || 0}`);

    // ========================================
    // GET RINGKASAN PER KARYAWAN (hanya untuk user yang login)
    // ========================================
    let karyawanRingkasan = [];

    if (company === "hisana") {
      // Query untuk Hisana
      let ringkasanQuery = `
        SELECT 
          k.id,
          k.no_induk,
          k.nama_lengkap as nama,
          k.jabatan,
          COALESCE(
            (SELECT SUM(s.gaji_total) FROM ${tableSlipGaji} s 
             WHERE s.karyawan_id = k.id 
             AND MONTH(s.created_at) = ? AND YEAR(s.created_at) = ?), 0
          ) as total_gaji_bulan_ini,
          COALESCE(
            (SELECT SUM(b.jumlah_bonus) FROM ${tableBonus} b 
             WHERE b.karyawan_id = k.id 
             AND b.bulan = ? AND b.tahun = ?), 0
          ) as total_bonus_bulan_ini,
          COALESCE(
            (SELECT SUM(t.jumlah_thr) FROM ${tableThr} t 
             WHERE t.karyawan_id = k.id 
             AND t.tahun = ?), 0
          ) as total_thr_tahun_ini
        FROM ${tableKaryawan} k
      `;

      let ringkasanParams = [currentMonth, currentYear, currentMonth, currentYear, currentYear];

      if (userId) {
        ringkasanQuery += ` WHERE k.user_id = ?`;
        ringkasanParams.push(userId);
      }

      ringkasanQuery += ` ORDER BY k.no_induk ASC`;

      const [ringkasanRows] = await db.query(ringkasanQuery, ringkasanParams);
      karyawanRingkasan = ringkasanRows;
    } else {
      // Query untuk Enakko - menggunakan total_gaji
      let ringkasanQuery = `
        SELECT 
          k.id,
          k.no_induk,
          k.nama_lengkap as nama,
          k.jabatan,
          COALESCE(
            (SELECT SUM(s.total_gaji) FROM ${tableSlipGaji} s 
             WHERE s.karyawan_id = k.id 
             AND MONTH(s.created_at) = ? AND YEAR(s.created_at) = ?), 0
          ) as total_gaji_bulan_ini,
          COALESCE(
            (SELECT SUM(b.jumlah_bonus) FROM ${tableBonus} b 
             WHERE b.karyawan_id = k.id 
             AND b.bulan = ? AND b.tahun = ?), 0
          ) as total_bonus_bulan_ini,
          COALESCE(
            (SELECT SUM(t.jumlah_thr) FROM ${tableThr} t 
             WHERE t.karyawan_id = k.id 
             AND t.tahun = ?), 0
          ) as total_thr_tahun_ini
        FROM ${tableKaryawan} k
      `;

      let ringkasanParams = [currentMonth, currentYear, currentMonth, currentYear, currentYear];

      if (userId) {
        ringkasanQuery += ` WHERE k.user_id = ?`;
        ringkasanParams.push(userId);
      }

      ringkasanQuery += ` ORDER BY k.no_induk ASC`;

      const [ringkasanRows] = await db.query(ringkasanQuery, ringkasanParams);
      karyawanRingkasan = ringkasanRows;
    }

    console.log(`[DASHBOARD] Returning ${karyawanRingkasan.length} karyawan records for ${company}`);

    res.json({
      success: true,
      totalKaryawan: karyawanCount[0]?.total || 0,
      totalSlipBulanIni: slipCount[0]?.total || 0,
      totalBonusBulanIni: bonusCount[0]?.total || 0,
      totalThrTahunIni: thrCount[0]?.total || 0,
      karyawanRingkasan: karyawanRingkasan,
      periode: {
        bulan: currentMonth,
        tahun: currentYear,
      },
    });
  } catch (err) {
    console.error("[DASHBOARD] Dashboard data error:", err);
    res.status(500).json({
      success: false,
      error: err.message,
      totalKaryawan: 0,
      totalSlipBulanIni: 0,
      totalBonusBulanIni: 0,
      totalThrTahunIni: 0,
      karyawanRingkasan: [],
    });
  }
});

export default router;
