// server/routes/dashboardDataRoutes.js
import express from "express";
import db from "../db.js";

const router = express.Router();

// Helper: Get user_id from session
function getUserId(req) {
  // Prioritas: user_id dari session (QR login) atau admin id
  if (req.session.user_id) return req.session.user_id;
  if (req.session.admin && req.session.admin.id) return req.session.admin.id;
  return null;
}

// Helper: Check if user is superadmin
async function isSuperAdmin(userId) {
  if (!userId) return false;
  try {
    const [rows] = await db.query(`SELECT role FROM users WHERE id = ? AND role = 'superadmin'`, [userId]);
    return rows.length > 0;
  } catch (error) {
    console.error("Error checking superadmin:", error);
    return false;
  }
}

// ============================
// DASHBOARD DATA ROUTE
// ============================
router.get("/dashboard-data", async (req, res) => {
  const company = req.query.company || "hisana";
  const userId = getUserId(req);
  const isSuper = await isSuperAdmin(userId);

  console.log(`[DASHBOARD] Request for company: ${company}, userId: ${userId}, isSuper: ${isSuper}`);

  // Tentukan nama tabel berdasarkan company
  const tableKaryawan = company === "hisana" ? "data_karyawan_hisana" : "data_karyawan_enakko";
  const tableSlipGaji = company === "hisana" ? "slip_gaji_hisana" : "slip_gaji_enakko";
  const tableBonus = company === "hisana" ? "bonus_hisana" : "bonus_enakko";
  const tableThr = company === "hisana" ? "thr_hisana" : "thr_enakko";

  console.log(`[DASHBOARD] Using tables: ${tableKaryawan}, ${tableSlipGaji}, ${tableBonus}, ${tableThr}`);

  try {
    // ========================================
    // GET TOTAL KARYAWAN (FILTER BY USER_ID)
    // ========================================
    let karyawanQuery = `SELECT COUNT(*) as total FROM ${tableKaryawan}`;
    let karyawanParams = [];

    if (!isSuper && userId) {
      karyawanQuery += ` WHERE user_id = ? OR user_id IS NULL`;
      karyawanParams.push(userId);
    }

    const [karyawanCount] = await db.query(karyawanQuery, karyawanParams);
    console.log(`[DASHBOARD] Total karyawan: ${karyawanCount[0]?.total || 0}`);

    // ========================================
    // GET TOTAL SLIP GAJI (FILTER BY USER_ID)
    // ========================================
    let slipQuery = `SELECT COUNT(*) as total FROM ${tableSlipGaji}`;
    let slipParams = [];

    if (!isSuper && userId) {
      // Join dengan tabel karyawan untuk filter user_id
      slipQuery = `
        SELECT COUNT(*) as total 
        FROM ${tableSlipGaji} s
        INNER JOIN ${tableKaryawan} k ON s.no_induk = k.no_induk
        WHERE k.user_id = ? OR k.user_id IS NULL
      `;
      slipParams.push(userId);
    }

    const [slipCount] = await db.query(slipQuery, slipParams);
    console.log(`[DASHBOARD] Total slip: ${slipCount[0]?.total || 0}`);

    // ========================================
    // GET TOTAL BONUS (FILTER BY USER_ID)
    // ========================================
    let bonusQuery = `SELECT COUNT(*) as total FROM ${tableBonus}`;
    let bonusParams = [];

    if (!isSuper && userId) {
      bonusQuery = `
        SELECT COUNT(*) as total 
        FROM ${tableBonus} b
        INNER JOIN ${tableKaryawan} k ON b.no_induk = k.no_induk
        WHERE k.user_id = ? OR k.user_id IS NULL
      `;
      bonusParams.push(userId);
    }

    const [bonusCount] = await db.query(bonusQuery, bonusParams);
    console.log(`[DASHBOARD] Total bonus: ${bonusCount[0]?.total || 0}`);

    // ========================================
    // GET TOTAL THR (FILTER BY USER_ID)
    // ========================================
    let thrQuery = `SELECT COUNT(*) as total FROM ${tableThr}`;
    let thrParams = [];

    if (!isSuper && userId) {
      thrQuery = `
        SELECT COUNT(*) as total 
        FROM ${tableThr} t
        INNER JOIN ${tableKaryawan} k ON t.no_induk = k.no_induk
        WHERE k.user_id = ? OR k.user_id IS NULL
      `;
      thrParams.push(userId);
    }

    const [thrCount] = await db.query(thrQuery, thrParams);
    console.log(`[DASHBOARD] Total THR: ${thrCount[0]?.total || 0}`);

    // ========================================
    // GET RINGKASAN PER KARYAWAN (FILTER BY USER_ID)
    // ========================================
    let karyawanRingkasan = [];

    if (company === "hisana") {
      let query = `
        SELECT 
          k.no_induk,
          k.nama_lengkap as nama,
          k.jabatan,
          COALESCE(SUM(s.gaji_total), 0) as total_gaji,
          COALESCE(SUM(b.jumlah_bonus), 0) as total_bonus,
          COALESCE(SUM(t.jumlah_thr), 0) as total_thr
        FROM ${tableKaryawan} k
        LEFT JOIN ${tableSlipGaji} s ON k.no_induk = s.no_induk
        LEFT JOIN ${tableBonus} b ON k.no_induk = b.no_induk
        LEFT JOIN ${tableThr} t ON k.no_induk = t.no_induk
      `;
      let params = [];

      if (!isSuper && userId) {
        query += ` WHERE k.user_id = ? OR k.user_id IS NULL`;
        params.push(userId);
      }

      query += ` GROUP BY k.id, k.no_induk, k.nama_lengkap, k.jabatan ORDER BY k.no_induk ASC`;

      const [rows] = await db.query(query, params);
      karyawanRingkasan = rows;
    } else {
      let query = `
        SELECT 
          k.no_induk,
          k.nama_lengkap as nama,
          k.jabatan,
          COALESCE(SUM(s.total_gaji), 0) as total_gaji,
          COALESCE(SUM(b.jumlah_bonus), 0) as total_bonus,
          COALESCE(SUM(t.jumlah_thr), 0) as total_thr
        FROM ${tableKaryawan} k
        LEFT JOIN ${tableSlipGaji} s ON k.no_induk = s.no_induk
        LEFT JOIN ${tableBonus} b ON k.no_induk = b.no_induk
        LEFT JOIN ${tableThr} t ON k.no_induk = t.no_induk
      `;
      let params = [];

      if (!isSuper && userId) {
        query += ` WHERE k.user_id = ? OR k.user_id IS NULL`;
        params.push(userId);
      }

      query += ` GROUP BY k.id, k.no_induk, k.nama_lengkap, k.jabatan ORDER BY k.no_induk ASC`;

      const [rows] = await db.query(query, params);
      karyawanRingkasan = rows;
    }

    console.log(`[DASHBOARD] Returning ${karyawanRingkasan.length} karyawan records`);

    res.json({
      success: true,
      totalKaryawan: karyawanCount[0]?.total || 0,
      totalSlip: slipCount[0]?.total || 0,
      totalBonus: bonusCount[0]?.total || 0,
      totalThr: thrCount[0]?.total || 0,
      karyawanRingkasan: karyawanRingkasan,
    });
  } catch (err) {
    console.error("[DASHBOARD] Dashboard data error:", err);
    res.status(500).json({
      success: false,
      error: err.message,
      totalKaryawan: 0,
      totalSlip: 0,
      totalBonus: 0,
      totalThr: 0,
      karyawanRingkasan: [],
    });
  }
});

export default router;
