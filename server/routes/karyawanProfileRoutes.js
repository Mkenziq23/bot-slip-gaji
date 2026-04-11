import express from "express";
import db from "../db.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// =============================
// HELPER FUNCTIONS
// =============================

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

function getPublicDir() {
  return path.join(process.cwd(), "public");
}

async function savePhotoBase64(base64Data, karyawanNoInduk, karyawanNama, type, company) {
  return new Promise((resolve, reject) => {
    try {
      // Cek format base64
      const matches = base64Data.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        reject(new Error("Format foto tidak valid"));
        return;
      }

      const imageBuffer = Buffer.from(matches[2], "base64");
      const imageExt = matches[1] === "jpeg" ? "jpg" : matches[1];

      // Tentukan folder tujuan
      const companyFolder = company === "hisana" ? "hisana" : "enakko";
      const uploadDir = path.join(getPublicDir(), "img", "absensi", companyFolder);

      // Buat folder jika belum ada
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Buat nama file dengan format: NO_INDUK_NAMA_TYPE_TIMESTAMP.jpg
      // Bersihkan nama dari karakter khusus untuk menghindari error file system
      const cleanNama = karyawanNama
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .replace(/_+/g, "_")
        .substring(0, 50); // batasi panjang nama

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 19).replace(/:/g, "-");
      const filename = `${karyawanNoInduk}_${cleanNama}_${type}_${dateStr}_${Date.now()}.${imageExt}`;
      const filepath = path.join(uploadDir, filename);

      // Simpan file
      fs.writeFileSync(filepath, imageBuffer);

      // URL untuk akses via web (relative path dari public folder)
      const fotoUrl = `/img/absensi/${companyFolder}/${filename}`;

      console.log(`[SavePhoto] Foto disimpan: ${filename}`);

      resolve(fotoUrl);
    } catch (err) {
      reject(err);
    }
  });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDate(dateString) {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
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

// =============================
// MIDDLEWARE
// =============================

function requireKaryawan(req, res, next) {
  if (!req.session.karyawan) {
    return res.status(401).json({
      success: false,
      message: "Silakan login terlebih dahulu",
    });
  }
  next();
}

// =============================
// PROFILE ROUTES
// =============================

router.get("/api/karyawan/profile", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const tableName = getKaryawanTableName(company);
    const lokasiTable = getLokasiStoreTableName(company);

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

    let fotoDiriUrl = null;
    let fotoKtpUrl = null;

    if (profileData.foto_diri && profileData.foto_diri !== "" && profileData.foto_diri !== "null") {
      fotoDiriUrl = profileData.foto_diri;
    }

    if (profileData.foto_ktp && profileData.foto_ktp !== "" && profileData.foto_ktp !== "null") {
      fotoKtpUrl = profileData.foto_ktp;
    }

    res.json({
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
    });
  } catch (err) {
    console.error("[Profile] Error:", err);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat memuat data profile",
    });
  }
});

router.put("/api/karyawan/profile", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const tableName = getKaryawanTableName(company);
    const { no_hp, email, alamat_domisili } = req.body;

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
    await db.query(`UPDATE ${tableName} SET ${updateFields.join(", ")} WHERE id = ?`, updateValues);

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

    const bcryptModule = await import("bcrypt");
    const isValid = await bcryptModule.compare(currentPassword, rows[0].password);

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

// =============================
// SLIP, BONUS, THR ROUTES
// =============================

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

    const query = `
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
      ORDER BY s.created_at DESC 
      LIMIT 1
    `;

    const [rows] = await db.query(query, [karyawan.id, currentMonth, currentYear]);

    if (rows.length === 0) {
      return res.json({
        success: false,
        message: "Belum ada slip gaji untuk bulan ini",
        data: null,
      });
    }

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

    res.json({
      success: true,
      data: {
        ...rows[0],
        awal_masuk_formatted: awalMasukFormatted,
        jabatan: rows[0].jabatan || karyawan.jabatan || "-",
        store_name: rows[0].store_name || karyawan.nama_gerai || "-",
      },
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

    const enrichedSlipData = {
      ...slipData,
      nama: karyawan.nama_lengkap,
      no_induk: karyawan.no_induk,
    };

    const generateSlip = (await import("../../bot/generator/slipGeneratorGaji.js")).default;
    const pdfPath = await generateSlip(enrichedSlipData, company);

    res.download(pdfPath, (err) => {
      if (err) console.error("Error sending file:", err);
      setTimeout(() => {
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
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
      ORDER BY b.created_at DESC 
      LIMIT 1
    `;

    const [rows] = await db.query(query, [karyawan.id, currentMonth, currentYear]);

    if (rows.length === 0) {
      return res.json({
        success: false,
        message: "Belum ada bonus untuk bulan ini",
        data: null,
      });
    }

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

    res.json({
      success: true,
      data: {
        ...rows[0],
        awal_masuk_formatted: awalMasukFormatted,
        jabatan: rows[0].jabatan || karyawan.jabatan || "-",
        store_name: rows[0].store_name || karyawan.nama_gerai || "-",
      },
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

    const enrichedBonusData = {
      ...bonusData,
      nama: bonusData.nama || karyawan.nama_lengkap,
      no_induk: bonusData.no_induk || karyawan.no_induk,
      jabatan: bonusData.jabatan || karyawan.jabatan || "-",
      store_name: bonusData.store_name || karyawan.nama_gerai || "-",
      awal_masuk: bonusData.awal_masuk || karyawan.awal_masuk,
    };

    const generateBonusPDF = (await import("../../bot/generator/bonusGenerator.js")).default;
    const pdfPath = await generateBonusPDF(enrichedBonusData, company);

    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const fileName = `Bonus_${karyawan.nama_lengkap}_${monthNames[bonusData.bulan - 1]}_${bonusData.tahun}.pdf`;

    res.download(pdfPath, fileName, (err) => {
      if (err) console.error("Error sending file:", err);
      setTimeout(() => {
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
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

router.get("/api/karyawan/current-thr", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const thrTableName = getThrTableName(company);
    const karyawanTableName = getKaryawanTableName(company);
    const lokasiTableName = getLokasiStoreTableName(company);

    const now = new Date();
    const currentYear = now.getFullYear();

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
      ORDER BY t.created_at DESC 
      LIMIT 1
    `;

    const [rows] = await db.query(query, [karyawan.id, currentYear]);

    if (rows.length === 0) {
      return res.json({
        success: false,
        message: "Belum ada THR untuk tahun ini",
        data: null,
      });
    }

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

    res.json({
      success: true,
      data: {
        ...rows[0],
        awal_masuk_formatted: awalMasukFormatted,
        jabatan: rows[0].jabatan || karyawan.jabatan || "-",
        store_name: rows[0].store_name || karyawan.nama_gerai || "-",
      },
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

    const enrichedThrData = {
      ...thrData,
      nama: thrData.nama || karyawan.nama_lengkap,
      no_induk: thrData.no_induk || karyawan.no_induk,
      jabatan: thrData.jabatan || karyawan.jabatan || "-",
      store_name: thrData.store_name || karyawan.nama_gerai || "-",
      awal_masuk: thrData.awal_masuk || karyawan.awal_masuk,
    };

    const generateTHRPDF = (await import("../../bot/generator/thrGenerator.js")).default;
    const pdfPath = await generateTHRPDF(enrichedThrData, company);

    const fileName = `THR_${karyawan.nama_lengkap}_${thrData.tahun}.pdf`;

    res.download(pdfPath, fileName, (err) => {
      if (err) console.error("Error sending file:", err);
      setTimeout(() => {
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
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

// =============================
// ATTENDANCE ROUTES
// =============================

router.get("/api/karyawan/today-attendance", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const absensiTable = company === "hisana" ? "absensi_karyawan_hisana" : "absensi_karyawan_enakko";

    const today = new Date().toISOString().split("T")[0];

    const [rows] = await db.query(`SELECT * FROM ${absensiTable} WHERE karyawan_id = ? AND tanggal = ?`, [karyawan.id, today]);

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

router.post("/api/karyawan/check-in", requireKaryawan, async (req, res) => {
  let connection;
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const { latitude, longitude, foto } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Lokasi tidak tersedia. Harap aktifkan GPS dan izinkan akses lokasi untuk absensi.",
        code: "LOCATION_REQUIRED",
      });
    }

    if (!foto) {
      return res.status(400).json({
        success: false,
        message: "Foto wajib diambil untuk absensi masuk.",
        code: "PHOTO_REQUIRED",
      });
    }

    const absensiTable = company === "hisana" ? "absensi_karyawan_hisana" : "absensi_karyawan_enakko";
    const karyawanTable = getKaryawanTableName(company);
    const lokasiTable = getLokasiStoreTableName(company);

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Dapatkan data karyawan lengkap dengan lokasi store dan user_id
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
    const storeRadius = 30;

    if (!storeLat || !storeLon) {
      throw new Error("Lokasi store belum dikonfigurasi, silakan hubungi admin");
    }

    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);
    const distance = calculateDistance(userLat, userLon, storeLat, storeLon);

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

    // Simpan foto dengan nama yang menyertakan nama karyawan
    let fotoUrl = null;
    try {
      fotoUrl = await savePhotoBase64(foto, karyawan.no_induk, karyawan.nama_lengkap, "checkin", company);
    } catch (err) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: err.message || "Gagal menyimpan foto",
      });
    }

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
        });
      }

      // Update check in dengan user_id
      await connection.query(
        `UPDATE ${absensiTable} 
         SET check_in_time = ?, status = 'hadir', keterangan = ?, latitude = ?, longitude = ?, foto_check_in = ?, user_id = ?, updated_at = NOW()
         WHERE id = ?`,
        [now, locationMessage, latitude, longitude, fotoUrl, karyawan.user_id, attendance.id],
      );

      await connection.commit();

      res.json({
        success: true,
        message: "Absen masuk berhasil!",
        data: {
          time: timeString,
          distance: Math.round(distance),
          store_name: karyawanData[0].nama_store || "Store",
          foto: fotoUrl,
        },
      });
    } else {
      // Insert new attendance dengan user_id
      await connection.query(
        `INSERT INTO ${absensiTable} 
         (karyawan_id, user_id, no_induk, nama_karyawan, tanggal, check_in_time, status, keterangan, latitude, longitude, foto_check_in, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'hadir', ?, ?, ?, ?, NOW(), NOW())`,
        [karyawan.id, karyawan.user_id, karyawan.no_induk, karyawan.nama_lengkap, today, now, locationMessage, latitude, longitude, fotoUrl],
      );

      await connection.commit();

      res.json({
        success: true,
        message: "Absen masuk berhasil!",
        data: {
          time: timeString,
          distance: Math.round(distance),
          store_name: karyawanData[0].nama_store || "Store",
          foto: fotoUrl,
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

router.post("/api/karyawan/check-out", requireKaryawan, async (req, res) => {
  let connection;
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const { latitude, longitude, foto } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Lokasi tidak tersedia. Harap aktifkan GPS dan izinkan akses lokasi untuk absensi.",
        code: "LOCATION_REQUIRED",
      });
    }

    if (!foto) {
      return res.status(400).json({
        success: false,
        message: "Foto wajib diambil untuk absensi pulang.",
        code: "PHOTO_REQUIRED",
      });
    }

    const absensiTable = company === "hisana" ? "absensi_karyawan_hisana" : "absensi_karyawan_enakko";
    const karyawanTable = getKaryawanTableName(company);
    const lokasiTable = getLokasiStoreTableName(company);

    connection = await db.getConnection();
    await connection.beginTransaction();

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
    const storeRadius = 30;

    if (!storeLat || !storeLon) {
      throw new Error("Lokasi store belum dikonfigurasi, silakan hubungi admin");
    }

    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);
    const distance = calculateDistance(userLat, userLon, storeLat, storeLon);

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

    let fotoUrl = null;
    try {
      fotoUrl = await savePhotoBase64(foto, karyawan.no_induk, karyawan.nama_lengkap, "checkout", company);
    } catch (err) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: err.message || "Gagal menyimpan foto",
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

    let currentKeterangan = attendance[0].keterangan || "";
    const updatedKeterangan = currentKeterangan ? `${currentKeterangan} | ${locationMessage}` : locationMessage;

    // Update check out (user_id sudah ada dari check in, tidak perlu diupdate lagi)
    await connection.query(
      `UPDATE ${absensiTable} 
       SET check_out_time = ?, keterangan = ?, foto_check_out = ?, updated_at = NOW()
       WHERE id = ?`,
      [now, updatedKeterangan, fotoUrl, attendance[0].id],
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Absen pulang berhasil!",
      data: {
        time: timeString,
        distance: Math.round(distance),
        store_name: karyawanData[0].nama_store || "Store",
        foto: fotoUrl,
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

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dateRange.push(d.toISOString().split("T")[0]);
    }

    for (const tanggal of dateRange) {
      const [existing] = await connection.query(`SELECT * FROM ${absensiTable} WHERE karyawan_id = ? AND tanggal = ?`, [karyawan.id, tanggal]);

      const status = type === "izin" ? "izin" : "sakit";
      const keterangan = `Pengajuan ${type}: ${reason}`;

      if (existing.length > 0) {
        const existingRecord = existing[0];
        if (!existingRecord.check_in_time) {
          // Update dengan user_id
          await connection.query(
            `UPDATE ${absensiTable} 
             SET status = ?, keterangan = ?, user_id = ?, updated_at = NOW()
             WHERE id = ?`,
            [status, keterangan, karyawan.user_id, existingRecord.id],
          );
        } else {
          const newKeterangan = existingRecord.keterangan ? `${existingRecord.keterangan} | ${keterangan}` : keterangan;
          await connection.query(
            `UPDATE ${absensiTable} 
             SET keterangan = ?, updated_at = NOW()
             WHERE id = ?`,
            [newKeterangan, existingRecord.id],
          );
        }
      } else {
        // Insert dengan user_id
        await connection.query(
          `INSERT INTO ${absensiTable} 
           (karyawan_id, user_id, no_induk, nama_karyawan, tanggal, status, keterangan, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [karyawan.id, karyawan.user_id, karyawan.no_induk, karyawan.nama_lengkap, tanggal, status, keterangan],
        );
      }
    }

    await connection.commit();

    res.json({
      success: true,
      message: `Pengajuan ${type} berhasil untuk ${dateRange.length === 1 ? `tanggal ${startDate}` : `tanggal ${startDate} s/d ${endDate}`}`,
      data: {
        type: type,
        start_date: startDate,
        end_date: endDate,
        dates: dateRange,
      },
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

router.get("/api/karyawan/monthly-report", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;
    const absensiTable = company === "hisana" ? "absensi_karyawan_hisana" : "absensi_karyawan_enakko";

    let { month, year } = req.query;
    month = parseInt(month);
    year = parseInt(year);

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

    const monthStr = month.toString().padStart(2, "0");
    const datePattern = `${year}-${monthStr}%`;

    const [rows] = await db.query(
      `SELECT * FROM ${absensiTable} 
       WHERE karyawan_id = ? AND tanggal LIKE ?
       ORDER BY tanggal ASC`,
      [karyawan.id, datePattern],
    );

    let hadir = 0,
      izin = 0,
      sakit = 0,
      alpha = 0;

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
        default:
          alpha++;
      }
    });

    const totalHari = rows.length;
    const persentaseKehadiran = totalHari > 0 ? Math.round((hadir / totalHari) * 100) : 0;
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
        total_hari: totalHari,
        total_hari_kerja: daysInMonth,
        persentase_kehadiran: persentaseKehadiran,
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

export default router;
