// server/routes/absensiKaryawanRoutes.js - USING karyawan.id

import express from "express";
import db from "../db.js";

const router = express.Router();

// Helper: Get table name based on company
function getTableName(company) {
  if (company === "hisana") return "absensi_karyawan_hisana";
  if (company === "enakko") return "absensi_karyawan_enakko";
  throw new Error("Invalid company");
}

// Middleware untuk cek login karyawan
function requireKaryawan(req, res, next) {
  if (!req.session.karyawan) {
    return res.status(401).json({
      success: false,
      message: "Silakan login terlebih dahulu",
    });
  }

  // Pastikan id karyawan ada di session
  if (!req.session.karyawan.id) {
    console.error("[Auth Error] Karyawan ID not found in session:", req.session.karyawan);
    return res.status(401).json({
      success: false,
      message: "Session tidak valid. Silakan login kembali.",
    });
  }

  next();
}

// =============================
// CHECK IN (Absen Masuk) - USING karyawan.id
// =============================
router.post("/api/karyawan/check-in", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const { latitude, longitude } = req.body;
    const karyawanId = karyawan.id; // Menggunakan id dari tabel karyawan

    const tableName = getTableName(company);
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    const currentTime = now.toTimeString().split(" ")[0];

    // Cek apakah sudah absen hari ini menggunakan karyawan_id
    const [existing] = await db.query(
      `SELECT id, check_in_time FROM ${tableName} 
       WHERE karyawan_id = ? AND tanggal = ?`,
      [karyawanId, today],
    );

    if (existing.length > 0 && existing[0].check_in_time) {
      return res.status(400).json({
        success: false,
        message: "Anda sudah melakukan absen masuk hari ini",
      });
    }

    const status = "hadir";

    if (existing.length > 0) {
      // Update existing record dengan karyawan_id
      await db.query(
        `UPDATE ${tableName} 
         SET check_in_time = ?, status = ?, latitude = ?, longitude = ?, updated_at = NOW()
         WHERE karyawan_id = ? AND tanggal = ?`,
        [currentTime, status, latitude || null, longitude || null, karyawanId, today],
      );
    } else {
      // Insert new record dengan karyawan_id
      await db.query(
        `INSERT INTO ${tableName} 
         (karyawan_id, no_induk, nama_karyawan, tanggal, check_in_time, status, latitude, longitude) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [karyawanId, karyawan.no_induk, karyawan.nama_lengkap, today, currentTime, status, latitude || null, longitude || null],
      );
    }

    console.log(`[Check In] ${karyawan.nama_lengkap} (Karyawan ID: ${karyawanId}) - ${currentTime}`);

    res.json({
      success: true,
      message: "Absen masuk berhasil!",
      data: {
        time: currentTime,
        status: "hadir",
      },
    });
  } catch (err) {
    console.error("[Check In] Error:", err);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat absen masuk",
      error: err.message,
    });
  }
});

// =============================
// CHECK OUT (Absen Pulang) - USING karyawan.id
// =============================
router.post("/api/karyawan/check-out", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const { latitude, longitude } = req.body;
    const karyawanId = karyawan.id;

    const tableName = getTableName(company);
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    const currentTime = now.toTimeString().split(" ")[0];

    // Cek apakah sudah ada record hari ini menggunakan karyawan_id
    const [existing] = await db.query(
      `SELECT id, check_in_time, check_out_time FROM ${tableName} 
       WHERE karyawan_id = ? AND tanggal = ?`,
      [karyawanId, today],
    );

    if (existing.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Anda belum absen masuk hari ini. Silakan absen masuk terlebih dahulu.",
      });
    }

    if (existing[0].check_out_time) {
      return res.status(400).json({
        success: false,
        message: "Anda sudah melakukan absen pulang hari ini",
      });
    }

    // Update check out time dengan karyawan_id
    await db.query(
      `UPDATE ${tableName} 
       SET check_out_time = ?, latitude = ?, longitude = ?, updated_at = NOW()
       WHERE karyawan_id = ? AND tanggal = ?`,
      [currentTime, latitude || null, longitude || null, karyawanId, today],
    );

    console.log(`[Check Out] ${karyawan.nama_lengkap} (Karyawan ID: ${karyawanId}) - ${currentTime}`);

    res.json({
      success: true,
      message: "Absen pulang berhasil!",
      data: {
        time: currentTime,
      },
    });
  } catch (err) {
    console.error("[Check Out] Error:", err);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat absen pulang",
      error: err.message,
    });
  }
});

// =============================
// AJUKAN IZIN / SAKIT - USING karyawan.id
// =============================
router.post("/api/karyawan/permit", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const { type, reason, startDate, endDate } = req.body;
    const karyawanId = karyawan.id;

    const tableName = getTableName(company);

    if (!type || !reason) {
      return res.status(400).json({
        success: false,
        message: "Jenis izin dan alasan harus diisi",
      });
    }

    // Proses multiple days
    let dates = [];
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      for (let i = 0; i < diffDays; i++) {
        const currentDate = new Date(start);
        currentDate.setDate(start.getDate() + i);
        const dateStr = currentDate.toISOString().split("T")[0];
        dates.push(dateStr);
      }
    } else {
      dates = [new Date().toISOString().split("T")[0]];
    }

    let successCount = 0;

    for (const date of dates) {
      // Cek apakah sudah ada absensi untuk tanggal tersebut menggunakan karyawan_id
      const [existing] = await db.query(
        `SELECT id FROM ${tableName} 
         WHERE karyawan_id = ? AND tanggal = ?`,
        [karyawanId, date],
      );

      const status = type === "izin" ? "izin" : "sakit";

      if (existing.length > 0) {
        // Update existing record dengan karyawan_id
        await db.query(
          `UPDATE ${tableName} 
           SET status = ?, keterangan = ?, updated_at = NOW()
           WHERE karyawan_id = ? AND tanggal = ?`,
          [status, reason, karyawanId, date],
        );
      } else {
        // Insert new record dengan karyawan_id
        await db.query(
          `INSERT INTO ${tableName} 
           (karyawan_id, no_induk, nama_karyawan, tanggal, status, keterangan) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [karyawanId, karyawan.no_induk, karyawan.nama_lengkap, date, status, reason],
        );
      }
      successCount++;
    }

    console.log(`[Permit] ${karyawan.nama_lengkap} (Karyawan ID: ${karyawanId}) - ${type} - ${dates.length} days`);

    res.json({
      success: true,
      message: `Pengajuan ${type === "izin" ? "Izin" : "Sakit"} berhasil untuk ${dates.length} hari`,
      data: {
        type: type,
        reason: reason,
        dates: dates,
        successCount: successCount,
      },
    });
  } catch (err) {
    console.error("[Permit] Error:", err);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat mengajukan izin",
      error: err.message,
    });
  }
});

// =============================
// GET TODAY ATTENDANCE STATUS - USING karyawan.id
// =============================
router.get("/api/karyawan/today-attendance", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const karyawanId = karyawan.id;
    const tableName = getTableName(company);
    const today = new Date().toISOString().split("T")[0];

    const [rows] = await db.query(
      `SELECT check_in_time, check_out_time, status, keterangan 
       FROM ${tableName} 
       WHERE karyawan_id = ? AND tanggal = ?`,
      [karyawanId, today],
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        data: {
          check_in: null,
          check_out: null,
          status: "belum",
          keterangan: null,
        },
      });
    }

    res.json({
      success: true,
      data: {
        check_in: rows[0].check_in_time,
        check_out: rows[0].check_out_time,
        status: rows[0].status || "belum",
        keterangan: rows[0].keterangan,
      },
    });
  } catch (err) {
    console.error("[Today Attendance] Error:", err);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan",
      error: err.message,
    });
  }
});

// =============================
// GET ATTENDANCE HISTORY - USING karyawan.id
// =============================
router.get("/api/karyawan/attendance-history", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const karyawanId = karyawan.id;
    const tableName = getTableName(company);
    const { month, year, limit = 30 } = req.query;

    let query = `SELECT tanggal, check_in_time, check_out_time, status, keterangan 
                 FROM ${tableName} 
                 WHERE karyawan_id = ?`;
    let params = [karyawanId];

    if (month && year) {
      query += ` AND MONTH(tanggal) = ? AND YEAR(tanggal) = ?`;
      params.push(parseInt(month), parseInt(year));
    }

    query += ` ORDER BY tanggal DESC LIMIT ?`;
    params.push(parseInt(limit));

    const [rows] = await db.query(query, params);

    const formattedData = rows.map((row) => ({
      date: row.tanggal,
      check_in: row.check_in_time,
      check_out: row.check_out_time,
      status: row.status || "alpha",
      reason: row.keterangan,
    }));

    res.json({
      success: true,
      data: formattedData,
    });
  } catch (err) {
    console.error("[Attendance History] Error:", err);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan",
      error: err.message,
    });
  }
});

// =============================
// GET MONTHLY REPORT - USING karyawan.id
// =============================
router.get("/api/karyawan/monthly-report", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const karyawanId = karyawan.id;
    const tableName = getTableName(company);

    let { month, year } = req.query;
    const now = new Date();

    let targetMonth = month ? parseInt(month, 10) : now.getMonth() + 1;
    let targetYear = year ? parseInt(year, 10) : now.getFullYear();

    if (targetMonth < 1 || targetMonth > 12) {
      return res.status(400).json({
        success: false,
        message: "Bulan tidak valid. Harus antara 1-12",
      });
    }

    console.log(`[Monthly Report] Karyawan ID: ${karyawanId}, Month: ${targetMonth}, Year: ${targetYear}`);

    // Get all days in the selected month
    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();

    // Query dengan karyawan_id
    const [rows] = await db.query(
      `SELECT 
        tanggal,
        status,
        check_in_time,
        check_out_time
       FROM ${tableName} 
       WHERE karyawan_id = ? 
       AND MONTH(tanggal) = ? 
       AND YEAR(tanggal) = ?`,
      [karyawanId, targetMonth, targetYear],
    );

    console.log(`[Monthly Report] Found ${rows.length} attendance records`);

    let hadir = 0;
    let izin = 0;
    let sakit = 0;
    let alpha = 0;

    const attendanceMap = new Map();
    rows.forEach((row) => {
      const dateObj = new Date(row.tanggal);
      const day = dateObj.getDate();
      attendanceMap.set(day, row);
    });

    for (let day = 1; day <= daysInMonth; day++) {
      const attendance = attendanceMap.get(day);

      if (attendance) {
        switch (attendance.status) {
          case "hadir":
            hadir++;
            break;
          case "izin":
            izin++;
            break;
          case "sakit":
            sakit++;
            break;
          default:
            alpha++;
        }
      } else {
        alpha++;
      }
    }

    const total_hari = daysInMonth;
    const persentase = total_hari > 0 ? ((hadir / total_hari) * 100).toFixed(1) : 0;

    const result = {
      month: targetMonth,
      year: targetYear,
      total_hari: total_hari,
      hadir: hadir,
      izin: izin,
      sakit: sakit,
      alpha: alpha,
      persentase_kehadiran: persentase,
    };

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error("[Monthly Report] Error:", err);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat mengambil data rekap",
      error: err.message,
    });
  }
});

export default router;
