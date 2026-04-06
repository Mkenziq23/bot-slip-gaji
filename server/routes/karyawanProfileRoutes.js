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

/**
 * GET /api/karyawan/profile
 * Mendapatkan data profil karyawan yang sedang login
 */
router.get("/api/karyawan/profile", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;

    console.log("=== KARYAWAN PROFILE DEBUG ===");
    console.log("Session karyawan:", JSON.stringify(karyawan, null, 2));

    // Ambil company dari session
    const company = karyawan.company;

    console.log("Company from session:", company);

    if (!company) {
      console.error("❌ Company is undefined in session!");
      return res.status(400).json({
        success: false,
        message: "Company tidak ditemukan di session. Silakan login ulang.",
      });
    }

    const tableName = company === "hisana" ? "data_karyawan_hisana" : "data_karyawan_enakko";
    console.log(`Table name: ${tableName}`);

    // Ambil data karyawan dari database
    const [rows] = await db.query(
      `SELECT 
        no_induk,
        nama_lengkap,
        nik,
        tanggal_lahir,
        alamat_domisili,
        no_hp,
        email,
        jabatan,
        cabang,
        nama_gerai,
        foto_diri,
        foto_ktp
      FROM ${tableName} 
      WHERE id = ?`,
      [karyawan.id],
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Data karyawan tidak ditemukan",
      });
    }

    const profileData = rows[0];
    console.log("Profile data from DB:", {
      nama_lengkap: profileData.nama_lengkap,
      foto_diri: profileData.foto_diri,
      foto_ktp: profileData.foto_ktp,
    });

    // Foto URL - langsung gunakan path dari database
    let fotoDiriUrl = null;
    let fotoKtpUrl = null;

    // Proses foto diri
    if (profileData.foto_diri && profileData.foto_diri !== "" && profileData.foto_diri !== "null") {
      fotoDiriUrl = profileData.foto_diri;
      console.log(`Foto diri URL from DB: ${fotoDiriUrl}`);

      // Verifikasi file
      const filePath = path.join(process.cwd(), "public", fotoDiriUrl);
      if (fs.existsSync(filePath)) {
        console.log(`✅ Foto diri file exists at: ${filePath}`);
      } else {
        console.log(`❌ Foto diri file NOT found at: ${filePath}`);
        fotoDiriUrl = null;
      }
    }

    // Proses foto KTP
    if (profileData.foto_ktp && profileData.foto_ktp !== "" && profileData.foto_ktp !== "null") {
      fotoKtpUrl = profileData.foto_ktp;
      console.log(`Foto KTP URL from DB: ${fotoKtpUrl}`);

      const filePath = path.join(process.cwd(), "public", fotoKtpUrl);
      if (fs.existsSync(filePath)) {
        console.log(`✅ Foto KTP file exists at: ${filePath}`);
      } else {
        console.log(`❌ Foto KTP file NOT found at: ${filePath}`);
        fotoKtpUrl = null;
      }
    }

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

    const responseData = {
      success: true,
      profile: {
        no_induk: profileData.no_induk,
        nama_lengkap: profileData.nama_lengkap,
        nik: profileData.nik || "-",
        tanggal_lahir: profileData.tanggal_lahir,
        tanggal_lahir_formatted: tanggalLahirFormatted,
        alamat_domisili: profileData.alamat_domisili || "-",
        no_hp: profileData.no_hp || "-",
        email: profileData.email || "-",
        jabatan: profileData.jabatan || "-",
        cabang: profileData.cabang || "-",
        nama_gerai: profileData.nama_gerai || "-",
        foto_diri_url: fotoDiriUrl,
        foto_ktp_url: fotoKtpUrl,
      },
      slip_gaji: [],
      bonus: [],
      thr: [],
      company: company,
    };

    console.log("=== RESPONSE DATA ===");
    console.log("company:", responseData.company);
    console.log("foto_diri_url:", responseData.profile.foto_diri_url);
    console.log("foto_ktp_url:", responseData.profile.foto_ktp_url);

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
 * Mendapatkan slip gaji bulan berjalan
 */
router.get("/api/karyawan/current-slip", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;

    // Dapatkan bulan dan tahun saat ini
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // MySQL bulan dimulai dari 1

    console.log(`[Current Slip] Looking for slip - Company: ${company}, No Induk: ${karyawan.no_induk}, Month: ${currentMonth}, Year: ${currentYear}`);

    let query = "";
    let params = [];

    if (company === "hisana") {
      query = `
        SELECT * FROM slip_gaji_hisana 
        WHERE no_induk = ? 
        AND MONTH(created_at) = ? 
        AND YEAR(created_at) = ?
        AND (status_slip IS NULL OR status_slip != 'cancelled')
        ORDER BY created_at DESC 
        LIMIT 1
      `;
      params = [karyawan.no_induk, currentMonth, currentYear];
    } else {
      query = `
        SELECT * FROM slip_gaji_enakko 
        WHERE no_induk = ? 
        AND MONTH(created_at) = ? 
        AND YEAR(created_at) = ?
        AND (status_slip IS NULL OR status_slip != 'cancelled')
        ORDER BY created_at DESC 
        LIMIT 1
      `;
      params = [karyawan.no_induk, currentMonth, currentYear];
    }

    const [rows] = await db.query(query, params);

    if (rows.length === 0) {
      console.log(`[Current Slip] No slip found for current month`);
      return res.json({
        success: false,
        message: "Belum ada slip gaji untuk bulan ini",
      });
    }

    console.log(`[Current Slip] Slip found:`, rows[0]);

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (err) {
    console.error("[Current Slip] Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
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

    console.log(`[Download Slip] Generating slip for ${karyawan.nama_lengkap}, Company: ${company}`);

    // Import fungsi generate slip
    const generateSlip = (await import("../../bot/generator/slipGeneratorGaji.js")).default;

    // Generate PDF
    const pdfPath = await generateSlip(slipData, company);

    console.log(`[Download Slip] PDF generated at: ${pdfPath}`);

    // Kirim file PDF
    res.download(pdfPath, (err) => {
      if (err) {
        console.error("Error sending file:", err);
      }
      // Hapus file setelah dikirim
      setTimeout(() => {
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath);
          console.log(`[Download Slip] Deleted temp file: ${pdfPath}`);
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
 * Mendapatkan bonus bulan berjalan
 */
router.get("/api/karyawan/current-bonus", requireKaryawan, async (req, res) => {
  try {
    const karyawan = req.session.karyawan;
    const company = karyawan.company;

    // Dapatkan bulan dan tahun saat ini
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // MySQL bulan dimulai dari 1

    console.log(`[Current Bonus] Looking for bonus - Company: ${company}, No Induk: ${karyawan.no_induk}, Month: ${currentMonth}, Year: ${currentYear}`);

    // Tentukan nama tabel berdasarkan company
    const tableName = company === "hisana" ? "bonus_hisana" : "bonus_enakko";
    console.log(`[Current Bonus] Using table: ${tableName}`);

    // Query untuk mengambil bonus bulan berjalan
    const query = `
      SELECT * FROM ${tableName} 
      WHERE no_induk = ? 
      AND bulan = ? 
      AND tahun = ?
      AND (status != 'cancelled' OR status IS NULL)
      AND cancelled_at IS NULL
      ORDER BY created_at DESC 
      LIMIT 1
    `;

    const [rows] = await db.query(query, [karyawan.no_induk, currentMonth, currentYear]);

    if (rows.length === 0) {
      console.log(`[Current Bonus] No bonus found for current month`);
      return res.json({
        success: false,
        message: "Belum ada bonus untuk bulan ini",
      });
    }

    console.log(`[Current Bonus] Bonus found:`, rows[0]);

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (err) {
    console.error("[Current Bonus] Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
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

    console.log(`[Download Bonus] Generating bonus slip for ${karyawan.nama_lengkap}, Company: ${company}`);

    // Import fungsi generate bonus
    const generateBonusPDF = (await import("../../bot/generator/bonusGenerator.js")).default;

    // Tambahkan nama karyawan ke bonusData jika belum ada
    if (!bonusData.nama && karyawan.nama_lengkap) {
      bonusData.nama = karyawan.nama_lengkap;
    }
    if (!bonusData.no_induk && karyawan.no_induk) {
      bonusData.no_induk = karyawan.no_induk;
    }

    // Generate PDF
    const pdfPath = await generateBonusPDF(bonusData, company);

    console.log(`[Download Bonus] PDF generated at: ${pdfPath}`);

    // Kirim file PDF
    const fullPath = path.join(process.cwd(), pdfPath);
    res.download(fullPath, (err) => {
      if (err) {
        console.error("Error sending file:", err);
      }
      // Hapus file setelah dikirim
      setTimeout(() => {
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          console.log(`[Download Bonus] Deleted temp file: ${fullPath}`);
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

    // Dapatkan tahun saat ini
    const now = new Date();
    const currentYear = now.getFullYear();

    console.log(`[Current THR] Looking for THR - Company: ${company}, No Induk: ${karyawan.no_induk}, Year: ${currentYear}`);

    // Tentukan nama tabel berdasarkan company
    let tableName;
    if (company === "hisana") {
      tableName = "thr_hisana";
    } else if (company === "enakko") {
      tableName = "thr_enakko";
    } else {
      return res.status(400).json({
        success: false,
        message: "Company tidak valid",
      });
    }

    console.log(`[Current THR] Using table: ${tableName}`);

    // Query untuk mengambil THR tahun berjalan
    const query = `
      SELECT * FROM ${tableName} 
      WHERE no_induk = ? 
      AND tahun = ?
      AND (status != 'cancelled' OR status IS NULL)
      AND cancelled_at IS NULL
      ORDER BY created_at DESC 
      LIMIT 1
    `;

    const [rows] = await db.query(query, [karyawan.no_induk, currentYear]);

    if (rows.length === 0) {
      console.log(`[Current THR] No THR found for current year`);
      return res.json({
        success: false,
        message: "Belum ada THR untuk tahun ini",
      });
    }

    console.log(`[Current THR] THR found:`, rows[0]);

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (err) {
    console.error("[Current THR] Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
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

    console.log(`[Download THR] Generating THR slip for ${karyawan.nama_lengkap}, Company: ${company}`);

    // Pastikan direktori thr_slips ada
    const thrDir = path.join(process.cwd(), "thr_slips");
    if (!fs.existsSync(thrDir)) {
      fs.mkdirSync(thrDir, { recursive: true });
    }

    // Import fungsi generate THR
    const generateTHRPDF = (await import("../../bot/generator/thrGenerator.js")).default;

    // Tambahkan nama karyawan ke thrData jika belum ada
    const enrichedThrData = {
      ...thrData,
      nama: thrData.nama || karyawan.nama_lengkap,
      no_induk: thrData.no_induk || karyawan.no_induk,
    };

    // Generate PDF - ini sudah mengembalikan absolute path
    const pdfPath = await generateTHRPDF(enrichedThrData, company);

    console.log(`[Download THR] PDF generated at: ${pdfPath}`);

    // PERBAIKAN: Langsung gunakan pdfPath yang sudah absolute, jangan di-path.join lagi
    // Cek apakah file ada
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`File PDF tidak ditemukan: ${pdfPath}`);
    }

    // Kirim file PDF langsung dari path yang sudah absolute
    res.download(pdfPath, (err) => {
      if (err) {
        console.error("Error sending file:", err);
      }
      // Hapus file setelah dikirim
      setTimeout(() => {
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath);
          console.log(`[Download THR] Deleted temp file: ${pdfPath}`);
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
    const tableName = company === "hisana" ? "data_karyawan_hisana" : "data_karyawan_enakko";

    const { no_hp, email, alamat_domisili } = req.body;

    // Validasi email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Format email tidak valid",
      });
    }

    // Siapkan field yang akan diupdate
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
    const tableName = company === "hisana" ? "data_karyawan_hisana" : "data_karyawan_enakko";

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

    // Ambil password lama dari database
    const [rows] = await db.query(`SELECT password FROM ${tableName} WHERE id = ?`, [karyawan.id]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Data karyawan tidak ditemukan",
      });
    }

    const hashedPassword = rows[0].password;

    // Verifikasi password saat ini
    const bcryptModule = await import("bcrypt");
    const isValid = await bcryptModule.compare(currentPassword, hashedPassword);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: "Password saat ini salah",
      });
    }

    // Hash password baru
    const newHashedPassword = await bcryptModule.hash(newPassword, 10);

    // Update password
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

export default router;
