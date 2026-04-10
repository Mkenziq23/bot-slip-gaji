import express from "express";
import db from "../db.js";
import path from "path";
import fs from "fs";

const router = express.Router();

/**
 * Middleware untuk cek login karyawan
 */
function requireKaryawan(req, res, next) {
  if (!req.session.karyawan) {
    return res.status(401).json({
      success: false,
      message: "Silakan login terlebih dahulu",
    });
  }
  next();
}

// Helper function untuk mendapatkan nama tabel
function getKaryawanTableName(company) {
  return company === "hisana" ? "data_karyawan_hisana" : "data_karyawan_enakko";
}

function getLokasiStoreTableName(company) {
  return company === "hisana" ? "lokasi_store_hisana" : "lokasi_store_enakko";
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

/**
 * GET /api/karyawan/profile
 * Mendapatkan data profil karyawan yang sedang login
 */
router.get("/api/karyawan/profile", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const tableName = getKaryawanTableName(company);
    const lokasiTable = getLokasiStoreTableName(company);

    console.log("[Profile] Company:", company);
    console.log("[Profile] Karyawan ID:", karyawan.id);

    // Ambil data karyawan dari database dengan JOIN ke lokasi_store
    const [rows] = await db.query(
      `SELECT 
        k.id,
        k.no_induk,
        k.nama_lengkap,
        k.nik,
        k.tanggal_lahir,
        k.alamat_domisili,
        k.no_hp,
        k.email,
        k.jabatan,
        k.lokasi_store_id,
        l.nama_store,
        l.alamat as alamat_store,
        k.foto_diri,
        k.foto_ktp,
        k.awal_masuk
      FROM ${tableName} k
      LEFT JOIN ${lokasiTable} l ON k.lokasi_store_id = l.id
      WHERE k.id = ?`,
      [karyawan.id],
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Data karyawan tidak ditemukan",
      });
    }

    const profileData = rows[0];

    // Format tanggal lahir
    let tanggalLahirFormatted = "-";
    if (profileData.tanggal_lahir) {
      const date = new Date(profileData.tanggal_lahir);
      if (!isNaN(date.getTime())) {
        tanggalLahirFormatted = date.toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
      }
    }

    // Format awal masuk
    let awalMasukFormatted = "-";
    if (profileData.awal_masuk) {
      const date = new Date(profileData.awal_masuk);
      if (!isNaN(date.getTime())) {
        awalMasukFormatted = date.toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
      }
    }

    // Proses foto URL
    let fotoDiriUrl = null;
    let fotoKtpUrl = null;

    if (profileData.foto_diri && profileData.foto_diri !== "" && profileData.foto_diri !== "null") {
      fotoDiriUrl = profileData.foto_diri;
    }

    if (profileData.foto_ktp && profileData.foto_ktp !== "" && profileData.foto_ktp !== "null") {
      fotoKtpUrl = profileData.foto_ktp;
    }

    const responseData = {
      success: true,
      profile: {
        id: profileData.id,
        no_induk: profileData.no_induk,
        nama_lengkap: profileData.nama_lengkap,
        nik: profileData.nik || "-",
        tanggal_lahir: profileData.tanggal_lahir,
        tanggal_lahir_formatted: tanggalLahirFormatted,
        awal_masuk: profileData.awal_masuk,
        awal_masuk_formatted: awalMasukFormatted,
        alamat_domisili: profileData.alamat_domisili || "-",
        no_hp: profileData.no_hp || "-",
        email: profileData.email || "-",
        jabatan: profileData.jabatan || "-",
        nama_gerai: profileData.nama_store || "-",
        cabang: profileData.alamat_store || "-",
        foto_diri_url: fotoDiriUrl,
        foto_ktp_url: fotoKtpUrl,
      },
      company: company,
    };

    res.json(responseData);
  } catch (err) {
    console.error("[Profile] Error:", err);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat memuat data profile",
      error: err.message,
    });
  }
});

/**
 * GET /api/karyawan/current-slip
 * Mendapatkan slip gaji bulan berjalan dengan data karyawan lengkap
 */
router.get("/api/karyawan/current-slip", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const slipTableName = getSlipTableName(company);
    const karyawanTableName = getKaryawanTableName(company);
    const lokasiTableName = getLokasiStoreTableName(company);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    console.log(`[Current Slip] Company: ${company}, Karyawan ID: ${karyawan.id}, Month: ${currentMonth}, Year: ${currentYear}`);

    // PERBAIKAN: Query dengan JOIN untuk mendapatkan data karyawan lengkap
    let query = "";
    let params = [];

    if (company === "hisana") {
      query = `
        SELECT 
          s.*,
          k.no_induk,
          k.nama_lengkap as nama,
          k.jabatan,
          DATE_FORMAT(k.awal_masuk, '%Y-%m-%d') as awal_masuk,
          l.nama_store as store_name,
          l.alamat as store_alamat,
          k.no_hp
        FROM ${slipTableName} s
        LEFT JOIN ${karyawanTableName} k ON s.karyawan_id = k.id
        LEFT JOIN ${lokasiTableName} l ON k.lokasi_store_id = l.id
        WHERE s.karyawan_id = ? 
        AND MONTH(s.created_at) = ? 
        AND YEAR(s.created_at) = ?
        AND (s.status_slip IS NULL OR s.status_slip = 'belum_dikirim' OR s.status_slip = 'terkirim')
        ORDER BY s.created_at DESC 
        LIMIT 1
      `;
      params = [karyawan.id, currentMonth, currentYear];
    } else {
      query = `
        SELECT 
          s.*,
          k.no_induk,
          k.nama_lengkap as nama,
          k.jabatan,
          DATE_FORMAT(k.awal_masuk, '%Y-%m-%d') as awal_masuk,
          l.nama_store as store_name,
          l.alamat as store_alamat,
          k.no_hp
        FROM ${slipTableName} s
        LEFT JOIN ${karyawanTableName} k ON s.karyawan_id = k.id
        LEFT JOIN ${lokasiTableName} l ON k.lokasi_store_id = l.id
        WHERE s.karyawan_id = ? 
        AND MONTH(s.created_at) = ? 
        AND YEAR(s.created_at) = ?
        AND (s.status_slip IS NULL OR s.status_slip = 'belum_dikirim' OR s.status_slip = 'terkirim')
        ORDER BY s.created_at DESC 
        LIMIT 1
      `;
      params = [karyawan.id, currentMonth, currentYear];
    }

    const [rows] = await db.query(query, params);

    if (rows.length === 0) {
      console.log(`[Current Slip] No slip found`);
      return res.json({
        success: false,
        message: "Belum ada slip gaji untuk bulan ini",
        data: null,
      });
    }

    // Format tanggal awal masuk
    let awalMasukFormatted = "-";
    if (rows[0].awal_masuk) {
      const date = new Date(rows[0].awal_masuk);
      if (!isNaN(date.getTime())) {
        awalMasukFormatted = date.toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
      }
    }

    // Tambahkan data yang sudah diformat
    const slipData = {
      ...rows[0],
      awal_masuk_formatted: awalMasukFormatted,
      jabatan: rows[0].jabatan || karyawan.jabatan || "-",
      store_name: rows[0].store_name || karyawan.nama_gerai || "-",
    };

    console.log(`[Current Slip] Slip found with data:`, {
      id: slipData.id,
      nama: slipData.nama,
      jabatan: slipData.jabatan,
      store_name: slipData.store_name,
      awal_masuk: slipData.awal_masuk_formatted,
    });

    res.json({
      success: true,
      data: slipData,
    });
  } catch (err) {
    console.error("[Current Slip] Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
      data: null,
    });
  }
});
/**
 * POST /api/karyawan/download-slip
 * Generate dan download slip gaji
 */
router.post("/api/karyawan/download-slip", requireKaryawan, async (req, res) => {
  try {
    const { slipData, company } = req.body;
    const karyawan = req.session.karyawan;

    if (!slipData) {
      return res.status(400).json({
        success: false,
        message: "Data slip tidak ditemukan",
      });
    }

    // Tambahkan nama dan no_induk dari session jika belum ada
    const enrichedSlipData = {
      ...slipData,
      nama: karyawan.nama_lengkap,
      no_induk: karyawan.no_induk,
    };

    const generateSlip = (await import("../../bot/generator/slipGeneratorGaji.js")).default;
    const pdfPath = await generateSlip(enrichedSlipData, company);

    res.download(pdfPath, (err) => {
      if (err) {
        console.error("Error sending file:", err);
      }
      setTimeout(() => {
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath);
        }
      }, 1000);
    });
  } catch (err) {
    console.error("[Download Slip] Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

/**
 * GET /api/karyawan/current-bonus
 * Mendapatkan bonus bulan berjalan dengan data karyawan lengkap
 */
router.get("/api/karyawan/current-bonus", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const bonusTableName = getBonusTableName(company);
    const karyawanTableName = getKaryawanTableName(company);
    const lokasiTableName = getLokasiStoreTableName(company);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    console.log(`[Current Bonus] Company: ${company}, Karyawan ID: ${karyawan.id}, Month: ${currentMonth}, Year: ${currentYear}`);

    // PERBAIKAN: Query dengan JOIN untuk mendapatkan data karyawan lengkap
    const query = `
      SELECT 
        b.*,
        k.no_induk,
        k.nama_lengkap as nama,
        k.jabatan,
        DATE_FORMAT(k.awal_masuk, '%Y-%m-%d') as awal_masuk,
        l.nama_store as store_name,
        l.alamat as store_alamat,
        k.no_hp
      FROM ${bonusTableName} b
      LEFT JOIN ${karyawanTableName} k ON b.karyawan_id = k.id
      LEFT JOIN ${lokasiTableName} l ON k.lokasi_store_id = l.id
      WHERE b.karyawan_id = ? 
      AND b.bulan = ? 
      AND b.tahun = ?
      AND (b.status IS NULL OR b.status = 'belum_dikirim' OR b.status = 'terkirim')
      ORDER BY b.created_at DESC 
      LIMIT 1
    `;

    const [rows] = await db.query(query, [karyawan.id, currentMonth, currentYear]);

    if (rows.length === 0) {
      console.log(`[Current Bonus] No bonus found`);
      return res.json({
        success: false,
        message: "Belum ada bonus untuk bulan ini",
        data: null,
      });
    }

    // Format tanggal awal masuk
    let awalMasukFormatted = "-";
    if (rows[0].awal_masuk) {
      const date = new Date(rows[0].awal_masuk);
      if (!isNaN(date.getTime())) {
        awalMasukFormatted = date.toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
      }
    }

    // Tambahkan data yang sudah diformat
    const bonusData = {
      ...rows[0],
      awal_masuk_formatted: awalMasukFormatted,
      jabatan: rows[0].jabatan || karyawan.jabatan || "-",
      store_name: rows[0].store_name || karyawan.nama_gerai || "-",
    };

    console.log(`[Current Bonus] Bonus found with data:`, {
      id: bonusData.id,
      nama: bonusData.nama,
      jabatan: bonusData.jabatan,
      store_name: bonusData.store_name,
      jumlah_bonus: bonusData.jumlah_bonus,
    });

    res.json({
      success: true,
      data: bonusData,
    });
  } catch (err) {
    console.error("[Current Bonus] Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
      data: null,
    });
  }
});

/**
 * POST /api/karyawan/download-bonus
 * Generate dan download bonus slip
 */
router.post("/api/karyawan/download-bonus", requireKaryawan, async (req, res) => {
  try {
    const { bonusData, company } = req.body;
    const karyawan = req.session.karyawan;

    if (!bonusData) {
      return res.status(400).json({
        success: false,
        message: "Data bonus tidak ditemukan",
      });
    }

    // PERBAIKAN: Pastikan data yang dikirim lengkap
    const enrichedBonusData = {
      ...bonusData,
      nama: bonusData.nama || karyawan.nama_lengkap,
      no_induk: bonusData.no_induk || karyawan.no_induk,
      jabatan: bonusData.jabatan || karyawan.jabatan || "-",
      store_name: bonusData.store_name || karyawan.nama_gerai || "-",
      awal_masuk: bonusData.awal_masuk || karyawan.awal_masuk,
      awal_masuk_formatted: bonusData.awal_masuk_formatted || karyawan.awal_masuk_formatted,
    };

    console.log("Sending bonus data for download:", enrichedBonusData);

    const generateBonusPDF = (await import("../../bot/generator/bonusGenerator.js")).default;
    const pdfPath = await generateBonusPDF(enrichedBonusData, company);

    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const fileName = `Bonus_${karyawan.nama_lengkap}_${monthNames[bonusData.bulan - 1]}_${bonusData.tahun}.pdf`;

    res.download(pdfPath, fileName, (err) => {
      if (err) {
        console.error("Error sending file:", err);
      }
      setTimeout(() => {
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath);
        }
      }, 1000);
    });
  } catch (err) {
    console.error("[Download Bonus] Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

/**
 * GET /api/karyawan/current-thr
 * Mendapatkan THR tahun berjalan
 */
router.get("/api/karyawan/current-thr", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const thrTableName = getThrTableName(company);
    const karyawanTableName = getKaryawanTableName(company);
    const lokasiTableName = getLokasiStoreTableName(company);

    const now = new Date();
    const currentYear = now.getFullYear();

    console.log(`[Current THR] Company: ${company}, Karyawan ID: ${karyawan.id}, Year: ${currentYear}`);

    // PERBAIKAN: Query dengan JOIN untuk mendapatkan data karyawan lengkap
    const query = `
      SELECT 
        t.*,
        k.no_induk,
        k.nama_lengkap as nama,
        k.jabatan,
        DATE_FORMAT(k.awal_masuk, '%Y-%m-%d') as awal_masuk,
        l.nama_store as store_name,
        l.alamat as store_alamat,
        k.no_hp
      FROM ${thrTableName} t
      LEFT JOIN ${karyawanTableName} k ON t.karyawan_id = k.id
      LEFT JOIN ${lokasiTableName} l ON k.lokasi_store_id = l.id
      WHERE t.karyawan_id = ? 
      AND t.tahun = ?
      AND (t.status IS NULL OR t.status = 'belum_dikirim' OR t.status = 'terkirim')
      ORDER BY t.created_at DESC 
      LIMIT 1
    `;

    const [rows] = await db.query(query, [karyawan.id, currentYear]);

    if (rows.length === 0) {
      console.log(`[Current THR] No THR found`);
      return res.json({
        success: false,
        message: "Belum ada THR untuk tahun ini",
        data: null,
      });
    }

    // Format tanggal awal masuk
    let awalMasukFormatted = "-";
    if (rows[0].awal_masuk) {
      const date = new Date(rows[0].awal_masuk);
      if (!isNaN(date.getTime())) {
        awalMasukFormatted = date.toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
      }
    }

    // Tambahkan data yang sudah diformat
    const thrData = {
      ...rows[0],
      awal_masuk_formatted: awalMasukFormatted,
      jabatan: rows[0].jabatan || karyawan.jabatan || "-",
      store_name: rows[0].store_name || karyawan.nama_gerai || "-",
    };

    console.log(`[Current THR] THR found with data:`, {
      id: thrData.id,
      nama: thrData.nama,
      jabatan: thrData.jabatan,
      store_name: thrData.store_name,
      jumlah_thr: thrData.jumlah_thr,
    });

    res.json({
      success: true,
      data: thrData,
    });
  } catch (err) {
    console.error("[Current THR] Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
      data: null,
    });
  }
});

/**
 * POST /api/karyawan/download-thr
 * Generate dan download THR slip
 */
router.post("/api/karyawan/download-thr", requireKaryawan, async (req, res) => {
  try {
    const { thrData, company } = req.body;
    const karyawan = req.session.karyawan;

    if (!thrData) {
      return res.status(400).json({
        success: false,
        message: "Data THR tidak ditemukan",
      });
    }

    // PERBAIKAN: Pastikan data yang dikirim lengkap
    const enrichedThrData = {
      ...thrData,
      nama: thrData.nama || karyawan.nama_lengkap,
      no_induk: thrData.no_induk || karyawan.no_induk,
      jabatan: thrData.jabatan || karyawan.jabatan || "-",
      store_name: thrData.store_name || karyawan.nama_gerai || "-",
      awal_masuk: thrData.awal_masuk || karyawan.awal_masuk,
      awal_masuk_formatted: thrData.awal_masuk_formatted || karyawan.awal_masuk_formatted,
    };

    console.log("Sending THR data for download:", enrichedThrData);

    const generateTHRPDF = (await import("../../bot/generator/thrGenerator.js")).default;
    const pdfPath = await generateTHRPDF(enrichedThrData, company);

    const fileName = `THR_${karyawan.nama_lengkap}_${thrData.tahun}.pdf`;

    res.download(pdfPath, fileName, (err) => {
      if (err) {
        console.error("Error sending file:", err);
      }
      setTimeout(() => {
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath);
        }
      }, 1000);
    });
  } catch (err) {
    console.error("[Download THR] Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

/**
 * PUT /api/karyawan/profile
 * Update profil karyawan
 */
router.put("/api/karyawan/profile", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const tableName = getKaryawanTableName(company);

    const { no_hp, email, alamat_domisili } = req.body;

    // Validasi email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Format email tidak valid",
      });
    }

    const updateFields = [];
    const updateValues = [];

    if (no_hp !== undefined) {
      updateFields.push("no_hp = ?");
      updateValues.push(no_hp);
    }

    if (email !== undefined) {
      updateFields.push("email = ?");
      updateValues.push(email);
    }

    if (alamat_domisili !== undefined) {
      updateFields.push("alamat_domisili = ?");
      updateValues.push(alamat_domisili);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Tidak ada data yang diupdate",
      });
    }

    updateValues.push(karyawan.id);

    const query = `UPDATE ${tableName} SET ${updateFields.join(", ")} WHERE id = ?`;
    await db.query(query, updateValues);

    // Update session data
    if (no_hp) req.session.karyawan.no_hp = no_hp;
    if (email) req.session.karyawan.email = email;

    req.session.save(() => {
      res.json({
        success: true,
        message: "Profil berhasil diupdate",
      });
    });
  } catch (err) {
    console.error("[Profile] Error updating:", err);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat update profile",
    });
  }
});

/**
 * PUT /api/karyawan/password
 * Update password karyawan
 */
router.put("/api/karyawan/password", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const tableName = getKaryawanTableName(company);

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Password saat ini dan password baru harus diisi",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password baru minimal 6 karakter",
      });
    }

    const [rows] = await db.query(`SELECT password FROM ${tableName} WHERE id = ?`, [karyawan.id]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Data karyawan tidak ditemukan",
      });
    }

    const hashedPassword = rows[0].password;
    const bcryptModule = await import("bcrypt");
    const isValid = await bcryptModule.compare(currentPassword, hashedPassword);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: "Password saat ini salah",
      });
    }

    const newHashedPassword = await bcryptModule.hash(newPassword, 10);
    await db.query(`UPDATE ${tableName} SET password = ? WHERE id = ?`, [newHashedPassword, karyawan.id]);

    res.json({
      success: true,
      message: "Password berhasil diubah",
    });
  } catch (err) {
    console.error("[Profile] Error updating password:", err);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat update password",
    });
  }
});

/**
 * GET /api/karyawan/today-attendance
 * Mendapatkan status absensi hari ini
 */
router.get("/api/karyawan/today-attendance", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const absensiTable = company === "hisana" ? "absensi_karyawan_hisana" : "absensi_karyawan_enakko";

    const today = new Date().toISOString().split("T")[0];

    const [rows] = await db.query(
      `SELECT * FROM ${absensiTable} 
       WHERE karyawan_id = ? AND tanggal = ?`,
      [karyawan.id, today],
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        data: {
          check_in: null,
          check_out: null,
          status: "belum",
        },
      });
    }

    const attendance = rows[0];
    res.json({
      success: true,
      data: {
        check_in: attendance.check_in_time ? new Date(attendance.check_in_time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : null,
        check_out: attendance.check_out_time ? new Date(attendance.check_out_time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : null,
        status: attendance.status || "belum",
      },
    });
  } catch (err) {
    console.error("[Today Attendance] Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

/**
 * POST /api/karyawan/check-in
 * Absen masuk dengan validasi lokasi WAJIB
 */
router.post("/api/karyawan/check-in", requireKaryawan, async (req, res) => {
  let connection;
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const { latitude, longitude } = req.body;

    // WAJIB ada data lokasi
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Lokasi tidak tersedia. Harap aktifkan GPS dan izinkan akses lokasi untuk absensi.",
        code: "LOCATION_REQUIRED",
      });
    }

    const absensiTable = company === "hisana" ? "absensi_karyawan_hisana" : "absensi_karyawan_enakko";
    const karyawanTable = getKaryawanTableName(company);
    const lokasiTable = getLokasiStoreTableName(company);

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Dapatkan data karyawan lengkap dengan lokasi store (tanpa radius)
    const [karyawanData] = await connection.query(
      `SELECT k.*, l.latitude as store_lat, l.longitude as store_lon, l.nama_store, l.alamat as store_alamat
       FROM ${karyawanTable} k
       LEFT JOIN ${lokasiTable} l ON k.lokasi_store_id = l.id
       WHERE k.id = ?`,
      [karyawan.id],
    );

    if (!karyawanData || karyawanData.length === 0) {
      throw new Error("Data karyawan tidak ditemukan");
    }

    const storeLat = parseFloat(karyawanData[0].store_lat);
    const storeLon = parseFloat(karyawanData[0].store_lon);
    const storeRadius = 100; // Radius default 100 meter (bisa disesuaikan)

    // Cek apakah lokasi store tersedia
    if (!storeLat || !storeLon) {
      throw new Error("Lokasi store belum dikonfigurasi, silakan hubungi admin");
    }

    // Hitung jarak antara lokasi user dan store
    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);

    const distance = calculateDistance(userLat, userLon, storeLat, storeLon);

    // VALIDASI WAJIB: Jarak harus <= radius store
    if (distance > storeRadius) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Anda berada di luar area absensi! Jarak Anda ${Math.round(distance)} meter dari store. Maksimal jarak yang diizinkan adalah ${storeRadius} meter.`,
        code: "OUT_OF_RANGE",
        data: {
          distance: Math.round(distance),
          maxDistance: storeRadius,
          storeName: karyawanData[0].nama_store || "Store",
          storeAddress: karyawanData[0].store_alamat || "-",
        },
      });
    }

    // Cek apakah sudah absen hari ini
    const today = new Date().toISOString().split("T")[0];
    const [existingAttendance] = await connection.query(`SELECT * FROM ${absensiTable} WHERE karyawan_id = ? AND tanggal = ?`, [karyawan.id, today]);

    const now = new Date();
    const timeString = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const locationMessage = `Check in dari store (jarak: ${Math.round(distance)} meter)`;

    if (existingAttendance.length > 0) {
      const attendance = existingAttendance[0];

      if (attendance.check_in_time) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Anda sudah melakukan absen masuk hari ini",
          data: { check_in_time: attendance.check_in_time },
        });
      }

      // Update check in
      await connection.query(
        `UPDATE ${absensiTable} 
         SET check_in_time = ?, status = 'hadir', keterangan = ?, latitude = ?, longitude = ?, updated_at = NOW()
         WHERE id = ?`,
        [now, locationMessage, latitude, longitude, attendance.id],
      );

      await connection.commit();

      res.json({
        success: true,
        message: "Absen masuk berhasil!",
        data: {
          time: timeString,
          distance: Math.round(distance),
          store_name: karyawanData[0].nama_store || "Store",
          message: locationMessage,
        },
      });
    } else {
      // Insert new attendance
      await connection.query(
        `INSERT INTO ${absensiTable} 
         (karyawan_id, no_induk, nama_karyawan, tanggal, check_in_time, status, keterangan, latitude, longitude, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'hadir', ?, ?, ?, NOW(), NOW())`,
        [karyawan.id, karyawan.no_induk, karyawan.nama_lengkap, today, now, locationMessage, latitude, longitude],
      );

      await connection.commit();

      res.json({
        success: true,
        message: "Absen masuk berhasil!",
        data: {
          time: timeString,
          distance: Math.round(distance),
          store_name: karyawanData[0].nama_store || "Store",
          message: locationMessage,
        },
      });
    }
  } catch (err) {
    if (connection) await connection.rollback();
    console.error("[Check In] Error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan saat absen masuk",
    });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * POST /api/karyawan/check-out
 * Absen pulang dengan validasi lokasi WAJIB
 */
router.post("/api/karyawan/check-out", requireKaryawan, async (req, res) => {
  let connection;
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const { latitude, longitude } = req.body;

    // WAJIB ada data lokasi
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Lokasi tidak tersedia. Harap aktifkan GPS dan izinkan akses lokasi untuk absensi.",
        code: "LOCATION_REQUIRED",
      });
    }

    const absensiTable = company === "hisana" ? "absensi_karyawan_hisana" : "absensi_karyawan_enakko";
    const karyawanTable = getKaryawanTableName(company);
    const lokasiTable = getLokasiStoreTableName(company);

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Dapatkan data karyawan lengkap dengan lokasi store (tanpa radius)
    const [karyawanData] = await connection.query(
      `SELECT k.*, l.latitude as store_lat, l.longitude as store_lon, l.nama_store, l.alamat as store_alamat
       FROM ${karyawanTable} k
       LEFT JOIN ${lokasiTable} l ON k.lokasi_store_id = l.id
       WHERE k.id = ?`,
      [karyawan.id],
    );

    if (!karyawanData || karyawanData.length === 0) {
      throw new Error("Data karyawan tidak ditemukan");
    }

    const storeLat = parseFloat(karyawanData[0].store_lat);
    const storeLon = parseFloat(karyawanData[0].store_lon);
    const storeRadius = 100; // Radius default 100 meter

    // Cek apakah lokasi store tersedia
    if (!storeLat || !storeLon) {
      throw new Error("Lokasi store belum dikonfigurasi, silakan hubungi admin");
    }

    // Hitung jarak antara lokasi user dan store
    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);

    const distance = calculateDistance(userLat, userLon, storeLat, storeLon);

    // VALIDASI WAJIB: Jarak harus <= radius store
    if (distance > storeRadius) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Anda berada di luar area absensi! Jarak Anda ${Math.round(distance)} meter dari store. Maksimal jarak yang diizinkan adalah ${storeRadius} meter.`,
        code: "OUT_OF_RANGE",
        data: {
          distance: Math.round(distance),
          maxDistance: storeRadius,
          storeName: karyawanData[0].nama_store || "Store",
          storeAddress: karyawanData[0].store_alamat || "-",
        },
      });
    }

    const today = new Date().toISOString().split("T")[0];
    const [attendance] = await connection.query(`SELECT * FROM ${absensiTable} WHERE karyawan_id = ? AND tanggal = ?`, [karyawan.id, today]);

    if (attendance.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Belum melakukan absen masuk hari ini",
      });
    }

    if (attendance[0].check_out_time) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Anda sudah melakukan absen pulang",
      });
    }

    const now = new Date();
    const timeString = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const locationMessage = `Check out dari store (jarak: ${Math.round(distance)} meter)`;

    // Update keterangan
    let currentKeterangan = attendance[0].keterangan || "";
    const updatedKeterangan = currentKeterangan ? `${currentKeterangan} | ${locationMessage}` : locationMessage;

    await connection.query(
      `UPDATE ${absensiTable} 
       SET check_out_time = ?, keterangan = ?, updated_at = NOW()
       WHERE id = ?`,
      [now, updatedKeterangan, attendance[0].id],
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Absen pulang berhasil!",
      data: {
        time: timeString,
        distance: Math.round(distance),
        store_name: karyawanData[0].nama_store || "Store",
        message: locationMessage,
      },
    });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error("[Check Out] Error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan saat absen pulang",
    });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * POST /api/karyawan/permit
 * Mengajukan izin/sakit
 */
router.post("/api/karyawan/permit", requireKaryawan, async (req, res) => {
  let connection;
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const { type, reason, startDate, endDate } = req.body;

    const absensiTable = company === "hisana" ? "absensi_karyawan_hisana" : "absensi_karyawan_enakko";

    connection = await db.getConnection();
    await connection.beginTransaction();

    const start = new Date(startDate);
    const end = new Date(endDate);
    const dateRange = [];

    // Generate date range
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dateRange.push(d.toISOString().split("T")[0]);
    }

    for (const tanggal of dateRange) {
      const [existing] = await connection.query(`SELECT * FROM ${absensiTable} WHERE karyawan_id = ? AND tanggal = ?`, [karyawan.id, tanggal]);

      const status = type === "izin" ? "izin" : "sakit";
      const keterangan = `Pengajuan ${type}: ${reason}`;

      if (existing.length > 0) {
        // Update existing record
        await connection.query(
          `UPDATE ${absensiTable} 
           SET status = ?, keterangan = ?, updated_at = NOW()
           WHERE id = ?`,
          [status, keterangan, existing[0].id],
        );
      } else {
        // Insert new record
        await connection.query(
          `INSERT INTO ${absensiTable} 
           (karyawan_id, no_induk, nama_karyawan, tanggal, status, keterangan, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [karyawan.id, karyawan.no_induk, karyawan.nama_lengkap, tanggal, status, keterangan],
        );
      }
    }

    await connection.commit();

    res.json({
      success: true,
      message: `Pengajuan ${type} berhasil untuk tanggal ${dateRange.length === 1 ? startDate : `${startDate} s/d ${endDate}`}`,
    });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error("[Permit] Error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan saat mengajukan izin",
    });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * GET /api/karyawan/attendance-history
 * Mendapatkan riwayat absensi
 */
router.get("/api/karyawan/attendance-history", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const absensiTable = company === "hisana" ? "absensi_karyawan_hisana" : "absensi_karyawan_enakko";

    const limit = parseInt(req.query.limit) || 30;

    const [rows] = await db.query(
      `SELECT * FROM ${absensiTable} 
       WHERE karyawan_id = ? 
       ORDER BY tanggal DESC 
       LIMIT ?`,
      [karyawan.id, limit],
    );

    const formattedData = rows.map((row) => ({
      date: row.tanggal ? new Date(row.tanggal).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }) : "-",
      check_in: row.check_in_time ? new Date(row.check_in_time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-",
      check_out: row.check_out_time ? new Date(row.check_out_time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-",
      status: row.status || "alpha",
      reason: row.keterangan || "",
    }));

    res.json({
      success: true,
      data: formattedData,
    });
  } catch (err) {
    console.error("[Attendance History] Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

/**
 * GET /api/karyawan/monthly-report
 * Mendapatkan rekap absensi per bulan
 */
router.get("/api/karyawan/monthly-report", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const absensiTable = company === "hisana" ? "absensi_karyawan_hisana" : "absensi_karyawan_enakko";

    let { month, year } = req.query;

    // Parse parameters
    month = parseInt(month);
    year = parseInt(year);

    console.log(`[Monthly Report] Request params - month: ${month} (${typeof month}), year: ${year} (${typeof year})`);

    // Validate parameters
    if (isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: "Bulan tidak valid",
      });
    }

    if (isNaN(year) || year < 2000 || year > 2100) {
      return res.status(400).json({
        success: false,
        message: "Tahun tidak valid",
      });
    }

    // Format month with leading zero
    const monthStr = month.toString().padStart(2, "0");
    const datePattern = `${year}-${monthStr}%`;

    console.log(`[Monthly Report] Query pattern: ${datePattern}`);

    const [rows] = await db.query(
      `SELECT * FROM ${absensiTable} 
       WHERE karyawan_id = ? AND tanggal LIKE ?
       ORDER BY tanggal ASC`,
      [karyawan.id, datePattern],
    );

    console.log(`[Monthly Report] Found ${rows.length} records`);

    // Calculate statistics
    let hadir = 0;
    let izin = 0;
    let sakit = 0;
    let alpha = 0;
    let invalidLocation = 0;

    rows.forEach((row) => {
      const status = row.status || "alpha";
      switch (status) {
        case "hadir":
          hadir++;
          break;
        case "izin":
          izin++;
          break;
        case "sakit":
          sakit++;
          break;
        case "invalid_location":
          invalidLocation++;
          alpha++; // Count as alpha for attendance percentage
          break;
        default:
          alpha++;
      }
    });

    const totalHari = rows.length;
    const persentaseKehadiran = totalHari > 0 ? Math.round((hadir / totalHari) * 100) : 0;

    // Get days in month
    const daysInMonth = new Date(year, month, 0).getDate();

    res.json({
      success: true,
      data: {
        month: month,
        year: year,
        hadir: hadir,
        izin: izin,
        sakit: sakit,
        alpha: alpha,
        invalid_location: invalidLocation,
        total_hari: totalHari,
        total_hari_kerja: daysInMonth,
        persentase_kehadiran: persentaseKehadiran,
        details: rows.map((row) => ({
          tanggal: row.tanggal,
          check_in: row.check_in_time,
          check_out: row.check_out_time,
          status: row.status || "alpha",
          keterangan: row.keterangan,
        })),
      },
    });
  } catch (err) {
    console.error("[Monthly Report] Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// Helper function untuk menghitung jarak menggunakan Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radius bumi dalam meter
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default router;
