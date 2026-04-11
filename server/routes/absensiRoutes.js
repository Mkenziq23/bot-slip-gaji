import express from "express";
import db from "../db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Helper: Get user_id from session (sama seperti dashboard)
function getUserId(req) {
  if (req.session.user_id) return req.session.user_id;
  if (req.session.admin && req.session.admin.id) return req.session.admin.id;
  return null;
}

// Helper function untuk mendapatkan nama tabel
function getKaryawanTableName(company) {
  return company === "hisana" ? "data_karyawan_hisana" : "data_karyawan_enakko";
}

function getAbsensiTableName(company) {
  return company === "hisana" ? "absensi_karyawan_hisana" : "absensi_karyawan_enakko";
}

function getLokasiStoreTableName(company) {
  return company === "hisana" ? "lokasi_store_hisana" : "lokasi_store_enakko";
}

// Helper function untuk format tanggal dengan aman
function formatDate(dateValue) {
  if (!dateValue) return "-";
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch (e) {
    return "-";
  }
}

// Helper function untuk format waktu dengan aman
function formatTime(timeValue) {
  if (!timeValue) return "-";

  try {
    const timePattern = /^([0-1][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9])$/;
    if (timePattern.test(timeValue)) {
      return timeValue;
    }

    const date = new Date(timeValue);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch (e) {
    return "-";
  }
}

// Middleware untuk cek login
function requireLogin(req, res, next) {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Silakan login terlebih dahulu",
    });
  }
  next();
}

/**
 * GET /api/absensi/stores
 * Mendapatkan daftar store untuk dropdown filter
 */
router.get("/api/absensi/stores", requireLogin, async (req, res) => {
  try {
    const { company } = req.query;
    const userId = getUserId(req);

    if (!company || (company !== "hisana" && company !== "enakko")) {
      return res.status(400).json({
        success: false,
        message: "Company parameter required (hisana/enakko)",
      });
    }

    const lokasiTable = getLokasiStoreTableName(company);

    let query = `SELECT id, nama_store, alamat, latitude, longitude FROM ${lokasiTable}`;
    let params = [];

    if (userId) {
      query += ` WHERE user_id = ?`;
      params.push(userId);
    }

    query += ` ORDER BY nama_store ASC`;

    const [rows] = await db.query(query, params);

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error("[Get Stores] Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

/**
 * GET /api/absensi
 * Mendapatkan data absensi karyawan dengan filter (termasuk filter tanggal)
 */
router.get("/api/absensi", requireLogin, async (req, res) => {
  try {
    const {
      company,
      store_id,
      month,
      year,
      status,
      search,
      tanggal, // TAMBAHKAN PARAMETER TANGGAL
      page = 1,
      limit = 20,
    } = req.query;

    const userId = getUserId(req);

    if (!company || (company !== "hisana" && company !== "enakko")) {
      return res.status(400).json({
        success: false,
        message: "Company parameter required (hisana/enakko)",
      });
    }

    const absensiTable = getAbsensiTableName(company);
    const karyawanTable = getKaryawanTableName(company);
    const lokasiTable = getLokasiStoreTableName(company);

    let whereConditions = [];
    let params = [];

    // Filter berdasarkan user_id
    if (userId) {
      whereConditions.push(`k.user_id = ?`);
      params.push(userId);
    }

    // Filter berdasarkan store
    if (store_id && store_id !== "all") {
      whereConditions.push(`k.lokasi_store_id = ?`);
      params.push(store_id);
    }

    // ========================================
    // FILTER TANGGAL - PRIORITAS TANGGAL DULU
    // ========================================
    if (tanggal && tanggal !== "all" && tanggal !== "") {
      // Filter berdasarkan tanggal spesifik (YYYY-MM-DD)
      whereConditions.push(`a.tanggal = ?`);
      params.push(tanggal);
    }
    // Filter berdasarkan bulan dan tahun
    else if (month && month !== "all" && year && year !== "all") {
      whereConditions.push(`MONTH(a.tanggal) = ? AND YEAR(a.tanggal) = ?`);
      params.push(month, year);
    }
    // Filter berdasarkan tahun saja
    else if (year && year !== "all") {
      whereConditions.push(`YEAR(a.tanggal) = ?`);
      params.push(year);
    }
    // Filter berdasarkan bulan saja (gunakan tahun sekarang)
    else if (month && month !== "all") {
      const currentYear = new Date().getFullYear();
      whereConditions.push(`MONTH(a.tanggal) = ? AND YEAR(a.tanggal) = ?`);
      params.push(month, currentYear);
    }

    // Filter berdasarkan status
    if (status && status !== "all") {
      whereConditions.push(`a.status = ?`);
      params.push(status);
    }

    // Filter pencarian
    if (search) {
      whereConditions.push(`(k.no_induk LIKE ? OR k.nama_lengkap LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const query = `
      SELECT 
        a.*,
        k.no_induk,
        k.nama_lengkap as nama_karyawan,
        k.jabatan,
        l.nama_store,
        l.alamat as store_alamat,
        l.latitude as store_lat,
        l.longitude as store_lon
      FROM ${absensiTable} a
      LEFT JOIN ${karyawanTable} k ON a.karyawan_id = k.id
      LEFT JOIN ${lokasiTable} l ON k.lokasi_store_id = l.id
      ${whereClause}
      ORDER BY a.tanggal DESC, k.nama_lengkap ASC
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM ${absensiTable} a
      LEFT JOIN ${karyawanTable} k ON a.karyawan_id = k.id
      ${whereClause}
    `;

    const [rows] = await db.query(query, params);
    const [countResult] = await db.query(countQuery, params);

    // Format data untuk response
    const formattedData = rows.map((row) => ({
      id: row.id,
      tanggal: formatDate(row.tanggal),
      tanggal_raw: row.tanggal || null,
      no_induk: row.no_induk || "-",
      nama_karyawan: row.nama_karyawan || "-",
      jabatan: row.jabatan || "-",
      store_name: row.nama_store || "-",
      store_alamat: row.store_alamat || "-",
      check_in_time: formatTime(row.check_in_time),
      check_in_raw: row.check_in_time || null,
      check_out_time: formatTime(row.check_out_time),
      check_out_raw: row.check_out_time || null,
      status: row.status || "alpha",
      keterangan: row.keterangan || "-",
      latitude: row.latitude ? parseFloat(row.latitude) : null,
      longitude: row.longitude ? parseFloat(row.longitude) : null,
      foto_check_in: row.foto_check_in || null,
      foto_check_out: row.foto_check_out || null,
    }));

    // Hitung statistik
    const statsQuery = `
      SELECT 
        COUNT(CASE WHEN a.status = 'hadir' THEN 1 END) as hadir,
        COUNT(CASE WHEN a.status = 'izin' THEN 1 END) as izin,
        COUNT(CASE WHEN a.status = 'sakit' THEN 1 END) as sakit,
        COUNT(CASE WHEN a.status = 'alpha' OR a.status IS NULL THEN 1 END) as alpha
      FROM ${absensiTable} a
      LEFT JOIN ${karyawanTable} k ON a.karyawan_id = k.id
      ${whereClause}
    `;

    const [statsRows] = await db.query(statsQuery, params);
    const stats = statsRows[0] || { hadir: 0, izin: 0, sakit: 0, alpha: 0 };

    res.json({
      success: true,
      data: formattedData,
      pagination: {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total: countResult[0]?.total || 0,
        total_pages: Math.ceil((countResult[0]?.total || 0) / parseInt(limit)),
      },
      stats: {
        hadir: parseInt(stats.hadir) || 0,
        izin: parseInt(stats.izin) || 0,
        sakit: parseInt(stats.sakit) || 0,
        alpha: parseInt(stats.alpha) || 0,
      },
    });
  } catch (err) {
    console.error("[Get Absensi] Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

/**
 * GET /api/absensi/export
 * Export data absensi ke Excel
 */
router.get("/api/absensi/export", requireLogin, async (req, res) => {
  try {
    const { company, store_id, month, year, status, search, tanggal } = req.query;

    const userId = getUserId(req);

    if (!company || (company !== "hisana" && company !== "enakko")) {
      return res.status(400).json({
        success: false,
        message: "Company parameter required (hisana/enakko)",
      });
    }

    const absensiTable = getAbsensiTableName(company);
    const karyawanTable = getKaryawanTableName(company);
    const lokasiTable = getLokasiStoreTableName(company);

    let whereConditions = [];
    let params = [];

    if (userId) {
      whereConditions.push(`k.user_id = ?`);
      params.push(userId);
    }

    if (store_id && store_id !== "all") {
      whereConditions.push(`k.lokasi_store_id = ?`);
      params.push(store_id);
    }

    // Filter tanggal
    if (tanggal && tanggal !== "all" && tanggal !== "") {
      whereConditions.push(`a.tanggal = ?`);
      params.push(tanggal);
    } else if (month && month !== "all" && year && year !== "all") {
      whereConditions.push(`MONTH(a.tanggal) = ? AND YEAR(a.tanggal) = ?`);
      params.push(month, year);
    } else if (year && year !== "all") {
      whereConditions.push(`YEAR(a.tanggal) = ?`);
      params.push(year);
    } else if (month && month !== "all") {
      const currentYear = new Date().getFullYear();
      whereConditions.push(`MONTH(a.tanggal) = ? AND YEAR(a.tanggal) = ?`);
      params.push(month, currentYear);
    }

    if (status && status !== "all") {
      whereConditions.push(`a.status = ?`);
      params.push(status);
    }

    if (search) {
      whereConditions.push(`(k.no_induk LIKE ? OR k.nama_lengkap LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const query = `
      SELECT 
        a.tanggal,
        k.no_induk,
        k.nama_lengkap as nama_karyawan,
        k.jabatan,
        l.nama_store,
        l.alamat as store_alamat,
        a.check_in_time,
        a.check_out_time,
        a.status,
        a.keterangan,
        a.latitude,
        a.longitude
      FROM ${absensiTable} a
      LEFT JOIN ${karyawanTable} k ON a.karyawan_id = k.id
      LEFT JOIN ${lokasiTable} l ON k.lokasi_store_id = l.id
      ${whereClause}
      ORDER BY a.tanggal DESC, k.nama_lengkap ASC
    `;

    const [rows] = await db.query(query, params);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tidak ada data absensi untuk diexport",
      });
    }

    const statusMap = {
      hadir: "Hadir",
      izin: "Izin",
      sakit: "Sakit",
      alpha: "Alpha (Tidak Hadir)",
    };

    const excelData = rows.map((row) => ({
      Tanggal: row.tanggal ? formatDate(row.tanggal) : "-",
      "No Induk": row.no_induk || "-",
      "Nama Karyawan": row.nama_karyawan || "-",
      Jabatan: row.jabatan || "-",
      Store: row.nama_store || "-",
      "Alamat Store": row.store_alamat || "-",
      "Check In": row.check_in_time ? formatTime(row.check_in_time) : "-",
      "Check Out": row.check_out_time ? formatTime(row.check_out_time) : "-",
      Status: statusMap[row.status] || row.status || "Alpha",
      Keterangan: row.keterangan || "-",
      Latitude: row.latitude || "-",
      Longitude: row.longitude || "-",
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);

    ws["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 30 }, { wch: 15 }, { wch: 15 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Absensi Karyawan");

    const companyName = company === "hisana" ? "Hisana" : "Enakko";
    const fileName = `Absensi_${companyName}_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.xlsx`;

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (err) {
    console.error("[Export Absensi] Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

/**
 * GET /api/absensi/available-years
 * Mendapatkan tahun-tahun yang tersedia untuk filter
 */
router.get("/api/absensi/available-years", requireLogin, async (req, res) => {
  try {
    const { company } = req.query;
    const userId = getUserId(req);

    if (!company || (company !== "hisana" && company !== "enakko")) {
      return res.status(400).json({
        success: false,
        message: "Company parameter required (hisana/enakko)",
      });
    }

    const absensiTable = getAbsensiTableName(company);
    const karyawanTable = getKaryawanTableName(company);

    let query = `
      SELECT DISTINCT YEAR(a.tanggal) as tahun
      FROM ${absensiTable} a
      LEFT JOIN ${karyawanTable} k ON a.karyawan_id = k.id
    `;
    let params = [];

    if (userId) {
      query += ` WHERE k.user_id = ?`;
      params.push(userId);
    }

    query += ` ORDER BY tahun DESC`;

    const [rows] = await db.query(query, params);

    const years = rows.map((row) => row.tahun).filter((year) => year !== null);

    if (years.length === 0) {
      years.push(new Date().getFullYear());
    }

    res.json({
      success: true,
      years: years,
    });
  } catch (err) {
    console.error("[Get Available Years] Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

/**
 * DELETE /api/absensi/:id
 * Menghapus data absensi berdasarkan ID
 */
router.delete("/api/absensi/:id", requireLogin, async (req, res) => {
  try {
    const { id } = req.params;
    const { company } = req.query;
    const userId = getUserId(req);

    if (!company || (company !== "hisana" && company !== "enakko")) {
      return res.status(400).json({
        success: false,
        message: "Company parameter required (hisana/enakko)",
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "ID absensi required",
      });
    }

    const absensiTable = getAbsensiTableName(company);
    const karyawanTable = getKaryawanTableName(company);

    // Cek apakah data absensi ada dan milik user yang login
    const [checkRows] = await db.query(
      `SELECT a.id 
       FROM ${absensiTable} a
       LEFT JOIN ${karyawanTable} k ON a.karyawan_id = k.id
       WHERE a.id = ? AND k.user_id = ?`,
      [id, userId],
    );

    if (checkRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Data absensi tidak ditemukan atau tidak memiliki akses",
      });
    }

    // Hapus data absensi
    await db.query(`DELETE FROM ${absensiTable} WHERE id = ?`, [id]);

    res.json({
      success: true,
      message: "Data absensi berhasil dihapus",
    });
  } catch (err) {
    console.error("[Delete Absensi] Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

export default router;
