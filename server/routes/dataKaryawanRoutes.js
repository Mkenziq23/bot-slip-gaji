import express from "express";
import multer from "multer";
import xlsx from "xlsx";
import bcrypt from "bcrypt";
import path from "path";
import fs from "fs";
import archiver from "archiver";
import { fileURLToPath } from "url";
import db from "../db.js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================
// HELPER FUNCTION checkLogin
// =============================
function checkLogin(req, res) {
  if (!req.session || !req.session.number) {
    console.log("❌ Unauthorized: No session or number");
    return null;
  }
  console.log("✅ User authenticated:", req.session.number);
  return req.session.number;
}

// Helper function untuk mendapatkan nama tabel berdasarkan company
function getTableName(company) {
  return company === "hisana" ? "data_karyawan_hisana" : "data_karyawan_enakko";
}

// Helper function untuk mendapatkan folder upload berdasarkan company
function getUploadFolder(company, type) {
  const baseDir = path.join(process.cwd(), "public/uploads");
  const companyFolder = company === "hisana" ? "hisana" : "enakko";
  const typeFolder = type === "foto_diri" ? "foto_diri" : "foto_ktp";
  const fullPath = path.join(baseDir, companyFolder, typeFolder);

  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
  return fullPath;
}

// =============================
// KONFIGURASI MULTER UNTUK FOTO (dengan fileFilter gambar)
// =============================
const uploadFoto = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const { company } = req.query;
      const type = file.fieldname === "foto_diri_file" ? "foto_diri" : "foto_ktp";
      const uploadPath = getUploadFolder(company, type);
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "_" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, uniqueSuffix + ext);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error("Hanya file gambar yang diperbolehkan (jpeg, jpg, png, gif, webp)"));
    }
  },
});

// =============================
// KONFIGURASI MULTER UNTUK EXCEL (tanpa fileFilter)
// =============================
const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

// =============================
// DOWNLOAD TEMPLATE EXCEL KARYAWAN
// =============================
router.get("/data-karyawan/template", async (req, res) => {
  try {
    const { company } = req.query;
    const number = checkLogin(req, res);

    if (!number) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    console.log(`📥 Download template karyawan for company: ${company || "hisana"}`);

    const companyType = company === "enakko" ? "enakko" : "hisana";

    // Header yang SIMPLE dan MATCH dengan import
    const headers = ["No Induk", "Nama Lengkap", "Nik", "Tanggal Lahir", "Alamat Domisili", "No Hp", "Email", "Password", "Jabatan", "Cabang", "Nama Gerai"];

    // Data contoh - 2 baris
    const templateData = [
      {
        "No Induk": companyType === "hisana" ? "H001" : "E001",
        "Nama Lengkap": "Budi Santoso",
        Nik: "1234567890123456",
        "Tanggal Lahir": "15/01/1990",
        "Alamat Domisili": "Jl. Contoh No. 123, Jakarta",
        "No Hp": "08123456789",
        Email: "budi@example.com",
        Password: "password123",
        Jabatan: "Staff",
        Cabang: "Jakarta Pusat",
        "Nama Gerai": companyType === "hisana" ? "Hisana Thamrin" : "Enakko Thamrin",
      },
      {
        "No Induk": companyType === "hisana" ? "H002" : "E002",
        "Nama Lengkap": "Siti Aminah",
        Nik: "2345678901234567",
        "Tanggal Lahir": "20/05/1995",
        "Alamat Domisili": "Jl. Merdeka No. 45, Jakarta",
        "No Hp": "08123456788",
        Email: "siti@example.com",
        Password: "password123",
        Jabatan: "Supervisor",
        Cabang: "Jakarta Selatan",
        "Nama Gerai": companyType === "hisana" ? "Hisana Pondok Indah" : "Enakko Pondok Indah",
      },
    ];

    // Buat worksheet
    const ws = xlsx.utils.json_to_sheet(templateData, { header: headers });

    // Set lebar kolom
    ws["!cols"] = [
      { wch: 12 }, // No Induk
      { wch: 20 }, // Nama Lengkap
      { wch: 18 }, // Nik
      { wch: 15 }, // Tanggal Lahir
      { wch: 35 }, // Alamat Domisili
      { wch: 15 }, // No Hp
      { wch: 25 }, // Email
      { wch: 15 }, // Password
      { wch: 15 }, // Jabatan
      { wch: 15 }, // Cabang
      { wch: 20 }, // Nama Gerai
    ];

    const wb = xlsx.utils.book_new();
    const sheetName = companyType === "hisana" ? "Template_Hisana" : "Template_Enakko";
    xlsx.utils.book_append_sheet(wb, ws, sheetName);

    const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = companyType === "hisana" ? "template_karyawan_hisana.xlsx" : "template_karyawan_enakko.xlsx";

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=${encodeURIComponent(filename)}`);
    res.setHeader("Cache-Control", "no-cache");
    res.send(buffer);
  } catch (err) {
    console.error("❌ Download template error:", err);
    res.status(500).json({ success: false, message: "Gagal download template: " + err.message });
  }
});

// =============================
// EXPORT EXCEL KARYAWAN + FOTO (ZIP)
// =============================
router.get("/data-karyawan/export", async (req, res) => {
  try {
    const { company } = req.query;

    console.log(`📥 Export karyawan with photos requested for company: ${company}`);

    if (!company || (company !== "hisana" && company !== "enakko")) {
      return res.status(400).json({
        success: false,
        message: "Parameter company harus hisana atau enakko",
      });
    }

    const number = checkLogin(req, res);
    if (!number) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa = ?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;
    const tableName = getTableName(company);

    const [rows] = await db.query(
      `SELECT no_induk, nama_lengkap, nik, 
              DATE_FORMAT(tanggal_lahir, '%d/%m/%Y') as tanggal_lahir,
              alamat_domisili, no_hp, email, jabatan, cabang, nama_gerai,
              foto_diri, foto_ktp
       FROM ${tableName} WHERE user_id = ? ORDER BY no_induk ASC`,
      [userId],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Data karyawan tidak ditemukan",
      });
    }

    const filename = company === "hisana" ? "data_karyawan_hisana.zip" : "data_karyawan_enakko.zip";
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename=${encodeURIComponent(filename)}`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    const headers = ["No Induk", "Nama Lengkap", "Nik", "Tanggal Lahir", "Alamat Domisili", "No Hp", "Email", "Jabatan", "Cabang", "Nama Gerai", "File Foto Diri", "File Foto Ktp"];

    const exportData = rows.map((row) => {
      const sanitizedName = row.nama_lengkap ? row.nama_lengkap.replace(/\s+/g, "_") : "unknown";
      return {
        "No Induk": row.no_induk || "",
        "Nama Lengkap": row.nama_lengkap || "",
        Nik: row.nik || "",
        "Tanggal Lahir": row.tanggal_lahir || "",
        "Alamat Domisili": row.alamat_domisili || "",
        "No Hp": row.no_hp ? (row.no_hp.startsWith("62") ? "0" + row.no_hp.substring(2) : row.no_hp) : "",
        Email: row.email || "",
        Jabatan: row.jabatan || "",
        Cabang: row.cabang || "",
        "Nama Gerai": row.nama_gerai || "",
        "File Foto Diri": row.foto_diri ? `foto_diri/foto_diri_${row.no_induk}_${sanitizedName}${path.extname(row.foto_diri)}` : "",
        "File Foto Ktp": row.foto_ktp ? `foto_ktp/foto_ktp_${row.no_induk}_${sanitizedName}${path.extname(row.foto_ktp)}` : "",
      };
    });

    const ws = xlsx.utils.json_to_sheet(exportData, { header: headers });
    ws["!cols"] = [{ wch: 12 }, { wch: 25 }, { wch: 18 }, { wch: 15 }, { wch: 35 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 40 }, { wch: 40 }];

    const wb = xlsx.utils.book_new();
    const sheetName = company === "hisana" ? "Data_Karyawan_Hisana" : "Data_Karyawan_Enakko";
    xlsx.utils.book_append_sheet(wb, ws, sheetName);
    const excelBuffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

    archive.append(excelBuffer, { name: `data_karyawan_${company}.xlsx` });

    for (const row of rows) {
      const sanitizedName = row.nama_lengkap ? row.nama_lengkap.replace(/\s+/g, "_") : "unknown";

      if (row.foto_diri && row.foto_diri !== "") {
        const fotoPath = path.join(process.cwd(), "public", row.foto_diri);
        if (fs.existsSync(fotoPath)) {
          const ext = path.extname(row.foto_diri);
          const fotoFilename = `foto_diri_${row.no_induk}_${sanitizedName}${ext}`;
          archive.file(fotoPath, { name: `foto_diri/${fotoFilename}` });
        }
      }

      if (row.foto_ktp && row.foto_ktp !== "") {
        const fotoPath = path.join(process.cwd(), "public", row.foto_ktp);
        if (fs.existsSync(fotoPath)) {
          const ext = path.extname(row.foto_ktp);
          const fotoFilename = `foto_ktp_${row.no_induk}_${sanitizedName}${ext}`;
          archive.file(fotoPath, { name: `foto_ktp/${fotoFilename}` });
        }
      }
    }

    await archive.finalize();
    console.log(`✅ Export ZIP completed for ${company}`);
  } catch (err) {
    console.error("❌ Export with photos error:", err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Gagal export data: " + err.message });
    }
  }
});

// =============================
// IMPORT EXCEL KARYAWAN (DIREVISI - menggunakan uploadExcel)
// =============================
router.post("/data-karyawan/import", uploadExcel.single("file"), async (req, res) => {
  console.log("=== IMPORT KARYAWAN ROUTE HIT ===");

  try {
    const { company } = req.query;
    console.log("Company:", company);

    // Validasi company
    if (!company || (company !== "hisana" && company !== "enakko")) {
      return res.status(400).json({
        success: false,
        message: "Parameter company harus hisana atau enakko",
      });
    }

    // Validasi file
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Silakan pilih file Excel terlebih dahulu",
      });
    }

    console.log("File received:", req.file.originalname, "Size:", req.file.size, "bytes");

    // Cek login
    const number = req.session?.number;
    if (!number) {
      return res.status(401).json({
        success: false,
        message: "Sesi login tidak ditemukan, silakan login kembali",
      });
    }

    // Cek user
    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa = ?", [number]);
    if (!users.length) {
      return res.status(401).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    const userId = users[0].id;
    const tableName = company === "hisana" ? "data_karyawan_hisana" : "data_karyawan_enakko";
    console.log(`User ID: ${userId}, Table: ${tableName}`);

    // Baca file Excel
    let data = [];
    try {
      const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      data = xlsx.utils.sheet_to_json(worksheet);
      console.log(`📊 Found ${data.length} rows to import`);

      if (data.length === 0) {
        return res.status(400).json({
          success: false,
          message: "File Excel tidak mengandung data",
        });
      }

      console.log("First row keys:", Object.keys(data[0]));
    } catch (err) {
      console.error("Error reading Excel:", err);
      return res.status(400).json({
        success: false,
        message: "Gagal membaca file Excel: " + err.message,
      });
    }

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const errors = [];

    // Proses setiap baris
    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      try {
        // Ambil data sesuai header (case insensitive)
        const no_induk = (row["No Induk"] || row["no_induk"] || row["NO INDUK"] || "").toString().trim();
        const nama_lengkap = (row["Nama Lengkap"] || row["nama_lengkap"] || row["NAMA LENGKAP"] || row["Nama"] || "").toString().trim();
        let nik = (row["Nik"] || row["nik"] || row["NIK"] || "").toString().trim();
        let tanggal_lahir = (row["Tanggal Lahir"] || row["tanggal_lahir"] || row["TANGGAL LAHIR"] || "").toString().trim();
        const alamat_domisili = (row["Alamat Domisili"] || row["alamat_domisili"] || row["ALAMAT DOMISILI"] || row["Alamat"] || "").toString().trim();
        let no_hp = (row["No Hp"] || row["no_hp"] || row["NO HP"] || row["No HP"] || row["nohp"] || "").toString().trim();
        const email = (row["Email"] || row["email"] || row["EMAIL"] || "").toString().trim();
        let password = (row["Password"] || row["password"] || row["PASSWORD"] || "").toString().trim();
        const jabatan = (row["Jabatan"] || row["jabatan"] || row["JABATAN"] || row["Posisi"] || "").toString().trim();
        const cabang = (row["Cabang"] || row["cabang"] || row["CABANG"] || "").toString().trim();
        const nama_gerai = (row["Nama Gerai"] || row["nama_gerai"] || row["NAMA GERAI"] || row["Gerai"] || "").toString().trim();

        console.log(`Row ${i + 1}: No Induk=${no_induk}, Nama=${nama_lengkap}`);

        // Validasi field wajib
        const missingFields = [];
        if (!no_induk) missingFields.push("No Induk");
        if (!nama_lengkap) missingFields.push("Nama Lengkap");
        if (!nik) missingFields.push("Nik");
        if (!tanggal_lahir) missingFields.push("Tanggal Lahir");
        if (!no_hp) missingFields.push("No Hp");
        if (!email) missingFields.push("Email");
        if (!jabatan) missingFields.push("Jabatan");

        if (missingFields.length > 0) {
          errorCount++;
          errors.push(`Baris ${i + 2}: Field wajib kosong: ${missingFields.join(", ")}`);
          continue;
        }

        // Validasi NIK - 16 digit angka
        const nikClean = nik.replace(/\D/g, "");
        if (nikClean.length !== 16) {
          errorCount++;
          errors.push(`Baris ${i + 2}: NIK harus 16 digit angka (${nikClean.length} digit) - NIK: ${nik}`);
          continue;
        }

        // Format No HP (08123456789 -> 628123456789)
        let noHpClean = no_hp.replace(/\D/g, "");
        if (noHpClean.startsWith("0")) {
          noHpClean = "62" + noHpClean.substring(1);
        } else if (!noHpClean.startsWith("62")) {
          noHpClean = "62" + noHpClean;
        }

        if (noHpClean.length < 10 || noHpClean.length > 15) {
          errorCount++;
          errors.push(`Baris ${i + 2}: No HP tidak valid (${noHpClean.length} digit) - HP: ${no_hp}`);
          continue;
        }

        // Format tanggal lahir (DD/MM/YYYY -> YYYY-MM-DD)
        let formattedDate = null;
        if (tanggal_lahir.includes("/")) {
          const parts = tanggal_lahir.split("/");
          if (parts.length === 3) {
            formattedDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
          }
        } else if (tanggal_lahir.includes("-")) {
          const parts = tanggal_lahir.split("-");
          if (parts.length === 3) {
            if (parts[0].length === 4) {
              formattedDate = tanggal_lahir;
            } else {
              formattedDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
            }
          }
        }

        if (!formattedDate) {
          errorCount++;
          errors.push(`Baris ${i + 2}: Format Tanggal Lahir tidak valid (gunakan DD/MM/YYYY) - Tanggal: ${tanggal_lahir}`);
          continue;
        }

        // Validasi email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          errorCount++;
          errors.push(`Baris ${i + 2}: Email tidak valid - Email: ${email}`);
          continue;
        }

        // Set default password
        if (!password) {
          password = "default123";
        }

        if (password.length < 6) {
          errorCount++;
          errors.push(`Baris ${i + 2}: Password minimal 6 karakter`);
          continue;
        }

        // Cek duplikasi data
        try {
          const [existingNoInduk] = await db.query(`SELECT id FROM ${tableName} WHERE no_induk = ? AND user_id = ?`, [no_induk, userId]);
          if (existingNoInduk.length > 0) {
            skippedCount++;
            errors.push(`Baris ${i + 2}: No Induk "${no_induk}" sudah terdaftar, dilewati`);
            continue;
          }

          const [existingEmail] = await db.query(`SELECT id FROM ${tableName} WHERE email = ? AND user_id = ?`, [email, userId]);
          if (existingEmail.length > 0) {
            skippedCount++;
            errors.push(`Baris ${i + 2}: Email "${email}" sudah terdaftar, dilewati`);
            continue;
          }

          const [existingNik] = await db.query(`SELECT id FROM ${tableName} WHERE nik = ? AND user_id = ?`, [nikClean, userId]);
          if (existingNik.length > 0) {
            skippedCount++;
            errors.push(`Baris ${i + 2}: NIK "${nik}" sudah terdaftar, dilewati`);
            continue;
          }
        } catch (err) {
          errorCount++;
          errors.push(`Baris ${i + 2}: Gagal cek duplikasi - ${err.message}`);
          continue;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert data
        const query = `
          INSERT INTO ${tableName} 
          (user_id, no_induk, nama_lengkap, nik, tanggal_lahir, alamat_domisili, 
           no_hp, email, password, jabatan, cabang, nama_gerai) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await db.query(query, [userId, no_induk, nama_lengkap, nikClean, formattedDate, alamat_domisili, noHpClean, email, hashedPassword, jabatan, cabang, nama_gerai]);

        successCount++;
        console.log(`✅ Imported: ${no_induk} - ${nama_lengkap}`);
      } catch (err) {
        errorCount++;
        errors.push(`Baris ${i + 2}: ${err.message}`);
        console.error(`Error row ${i + 2}:`, err);
      }
    }

    const resultMessage = `Import selesai: ${successCount} berhasil, ${skippedCount} dilewati (duplikat), ${errorCount} gagal`;
    console.log(resultMessage);

    return res.json({
      success: true,
      message: resultMessage,
      successCount: successCount,
      skippedCount: skippedCount,
      errorCount: errorCount,
      errors: errors.slice(0, 30),
    });
  } catch (err) {
    console.error("❌ Fatal import error:", err);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server: " + err.message,
    });
  }
});

// =============================
// GET ALL KARYAWAN
// =============================
router.get("/data-karyawan", async (req, res) => {
  try {
    console.log("=== GET /data-karyawan called ===");

    const number = checkLogin(req, res);
    if (!number) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Silakan login kembali.",
      });
    }

    const { company } = req.query;

    if (!company || (company !== "hisana" && company !== "enakko")) {
      return res.status(400).json({
        success: false,
        message: "Parameter company harus hisana atau enakko",
      });
    }

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa = ?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;
    const tableName = getTableName(company);

    const [rows] = await db.query(
      `SELECT id, no_induk, nama_lengkap, nik, DATE_FORMAT(tanggal_lahir, '%Y-%m-%d') as tanggal_lahir,
              alamat_domisili, no_hp, email, jabatan, cabang, nama_gerai, 
              foto_diri, foto_ktp, created_at 
       FROM ${tableName} WHERE user_id = ? ORDER BY no_induk ASC`,
      [userId],
    );

    console.log(`Successfully fetched ${rows.length} rows`);
    res.json(rows);
  } catch (err) {
    console.error("❌ Get karyawan error:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data karyawan: " + err.message,
    });
  }
});

// =============================
// GET KARYAWAN BY ID
// =============================
router.get("/data-karyawan/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { company } = req.query;

    const number = checkLogin(req, res);
    if (!number) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa = ?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;
    const tableName = getTableName(company);

    const [rows] = await db.query(
      `SELECT id, no_induk, nama_lengkap, nik, DATE_FORMAT(tanggal_lahir, '%Y-%m-%d') as tanggal_lahir,
              alamat_domisili, no_hp, email, jabatan, cabang, nama_gerai, foto_diri, foto_ktp 
       FROM ${tableName} WHERE id = ? AND user_id = ?`,
      [id, userId],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Data karyawan tidak ditemukan",
      });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ Get karyawan by id error:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data karyawan: " + err.message,
    });
  }
});

// =============================
// CREATE KARYAWAN (dengan uploadFoto)
// =============================
router.post(
  "/data-karyawan",
  uploadFoto.fields([
    { name: "foto_diri_file", maxCount: 1 },
    { name: "foto_ktp_file", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const number = checkLogin(req, res);
      if (!number) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { company } = req.query;
      const { no_induk, nama_lengkap, nik, tanggal_lahir, alamat_domisili, no_hp, email, password, jabatan, cabang, nama_gerai } = req.body;

      const [users] = await db.query("SELECT id FROM users WHERE nomor_wa = ?", [number]);
      if (!users.length) {
        return res.status(401).json({ success: false, message: "User tidak ditemukan" });
      }
      const userId = users[0].id;

      const requiredFields = [
        { field: "no_induk", name: "No Induk" },
        { field: "nama_lengkap", name: "Nama Lengkap" },
        { field: "nik", name: "NIK" },
        { field: "tanggal_lahir", name: "Tanggal Lahir" },
        { field: "no_hp", name: "No HP" },
        { field: "email", name: "Email" },
        { field: "password", name: "Password" },
        { field: "jabatan", name: "Jabatan" },
      ];

      for (const reqField of requiredFields) {
        if (!req.body[reqField.field] || req.body[reqField.field].trim() === "") {
          return res.status(400).json({
            success: false,
            message: `Field ${reqField.name} wajib diisi`,
          });
        }
      }

      const tableName = getTableName(company);

      const [existingNoInduk] = await db.query(`SELECT id FROM ${tableName} WHERE no_induk = ? AND user_id = ?`, [no_induk.trim(), userId]);
      if (existingNoInduk.length > 0) {
        return res.status(400).json({ success: false, message: `No Induk ${no_induk} sudah terdaftar` });
      }

      const [existingEmail] = await db.query(`SELECT id FROM ${tableName} WHERE email = ? AND user_id = ?`, [email.trim(), userId]);
      if (existingEmail.length > 0) {
        return res.status(400).json({ success: false, message: `Email ${email} sudah terdaftar` });
      }

      const [existingNik] = await db.query(`SELECT id FROM ${tableName} WHERE nik = ? AND user_id = ?`, [nik.trim(), userId]);
      if (existingNik.length > 0) {
        return res.status(400).json({ success: false, message: `NIK ${nik} sudah terdaftar` });
      }

      let fotoDiriPath = "";
      let fotoKtpPath = "";

      if (req.files && req.files["foto_diri_file"]) {
        const file = req.files["foto_diri_file"][0];
        fotoDiriPath = `/uploads/${company}/foto_diri/${file.filename}`;
      }

      if (req.files && req.files["foto_ktp_file"]) {
        const file = req.files["foto_ktp_file"][0];
        fotoKtpPath = `/uploads/${company}/foto_ktp/${file.filename}`;
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const [result] = await db.query(
        `INSERT INTO ${tableName} 
         (user_id, no_induk, nama_lengkap, nik, tanggal_lahir, alamat_domisili, 
          no_hp, email, password, jabatan, cabang, nama_gerai, foto_diri, foto_ktp) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          no_induk.trim(),
          nama_lengkap.trim(),
          nik.trim(),
          tanggal_lahir,
          alamat_domisili?.trim() || "",
          no_hp.trim(),
          email.trim(),
          hashedPassword,
          jabatan.trim(),
          cabang?.trim() || "",
          nama_gerai?.trim() || "",
          fotoDiriPath,
          fotoKtpPath,
        ],
      );

      res.json({
        success: true,
        message: "Data karyawan berhasil ditambahkan",
        id: result.insertId,
      });
    } catch (err) {
      console.error("❌ Create karyawan error:", err);
      res.status(500).json({
        success: false,
        message: "Gagal menambahkan data karyawan: " + err.message,
      });
    }
  },
);

// =============================
// UPDATE KARYAWAN (dengan uploadFoto)
// =============================
router.put(
  "/data-karyawan/:id",
  uploadFoto.fields([
    { name: "foto_diri_file", maxCount: 1 },
    { name: "foto_ktp_file", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { company } = req.query;
      const { no_induk, nama_lengkap, nik, tanggal_lahir, alamat_domisili, no_hp, email, password, jabatan, cabang, nama_gerai } = req.body;

      const number = checkLogin(req, res);
      if (!number) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const [users] = await db.query("SELECT id FROM users WHERE nomor_wa = ?", [number]);
      if (!users.length) {
        return res.status(401).json({ success: false, message: "User tidak ditemukan" });
      }

      const userId = users[0].id;
      const tableName = getTableName(company);

      const [existing] = await db.query(`SELECT id, foto_diri, foto_ktp FROM ${tableName} WHERE id = ? AND user_id = ?`, [id, userId]);
      if (existing.length === 0) {
        return res.status(404).json({ success: false, message: "Data karyawan tidak ditemukan" });
      }

      const [duplicateNoInduk] = await db.query(`SELECT id FROM ${tableName} WHERE no_induk = ? AND id != ? AND user_id = ?`, [no_induk.trim(), id, userId]);
      if (duplicateNoInduk.length > 0) {
        return res.status(400).json({ success: false, message: `No Induk ${no_induk} sudah terdaftar untuk karyawan lain` });
      }

      const [duplicateEmail] = await db.query(`SELECT id FROM ${tableName} WHERE email = ? AND id != ? AND user_id = ?`, [email.trim(), id, userId]);
      if (duplicateEmail.length > 0) {
        return res.status(400).json({ success: false, message: `Email ${email} sudah terdaftar untuk karyawan lain` });
      }

      const [duplicateNik] = await db.query(`SELECT id FROM ${tableName} WHERE nik = ? AND id != ? AND user_id = ?`, [nik.trim(), id, userId]);
      if (duplicateNik.length > 0) {
        return res.status(400).json({ success: false, message: `NIK ${nik} sudah terdaftar untuk karyawan lain` });
      }

      let fotoDiriPath = existing[0].foto_diri || "";
      let fotoKtpPath = existing[0].foto_ktp || "";

      if (req.files && req.files["foto_diri_file"]) {
        if (existing[0].foto_diri && existing[0].foto_diri !== "") {
          const oldPath = path.join(process.cwd(), "public", existing[0].foto_diri);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        const file = req.files["foto_diri_file"][0];
        fotoDiriPath = `/uploads/${company}/foto_diri/${file.filename}`;
      }

      if (req.files && req.files["foto_ktp_file"]) {
        if (existing[0].foto_ktp && existing[0].foto_ktp !== "") {
          const oldPath = path.join(process.cwd(), "public", existing[0].foto_ktp);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        const file = req.files["foto_ktp_file"][0];
        fotoKtpPath = `/uploads/${company}/foto_ktp/${file.filename}`;
      }

      let updateQuery = `
        UPDATE ${tableName} SET 
          no_induk = ?, nama_lengkap = ?, nik = ?, tanggal_lahir = ?, 
          alamat_domisili = ?, no_hp = ?, email = ?, jabatan = ?, 
          cabang = ?, nama_gerai = ?, foto_diri = ?, foto_ktp = ?
      `;
      let params = [no_induk.trim(), nama_lengkap.trim(), nik.trim(), tanggal_lahir, alamat_domisili?.trim() || "", no_hp.trim(), email.trim(), jabatan.trim(), cabang?.trim() || "", nama_gerai?.trim() || "", fotoDiriPath, fotoKtpPath];

      if (password && password.trim() !== "") {
        const hashedPassword = await bcrypt.hash(password, 10);
        updateQuery += `, password = ?`;
        params.push(hashedPassword);
      }

      updateQuery += ` WHERE id = ? AND user_id = ?`;
      params.push(id, userId);

      await db.query(updateQuery, params);

      res.json({
        success: true,
        message: "Data karyawan berhasil diperbarui",
      });
    } catch (err) {
      console.error("❌ Update karyawan error:", err);
      res.status(500).json({
        success: false,
        message: "Gagal memperbarui data karyawan: " + err.message,
      });
    }
  },
);

// =============================
// DELETE KARYAWAN
// =============================
router.delete("/data-karyawan/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { company } = req.query;

    const number = checkLogin(req, res);
    if (!number) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa = ?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const userId = users[0].id;
    const tableName = getTableName(company);

    const [existing] = await db.query(`SELECT foto_diri, foto_ktp FROM ${tableName} WHERE id = ? AND user_id = ?`, [id, userId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: "Data karyawan tidak ditemukan" });
    }

    if (existing[0].foto_diri) {
      const fotoPath = path.join(process.cwd(), "public", existing[0].foto_diri);
      if (fs.existsSync(fotoPath)) fs.unlinkSync(fotoPath);
    }
    if (existing[0].foto_ktp) {
      const fotoPath = path.join(process.cwd(), "public", existing[0].foto_ktp);
      if (fs.existsSync(fotoPath)) fs.unlinkSync(fotoPath);
    }

    await db.query(`DELETE FROM ${tableName} WHERE id = ? AND user_id = ?`, [id, userId]);

    res.json({
      success: true,
      message: "Data karyawan berhasil dihapus",
    });
  } catch (err) {
    console.error("❌ Delete karyawan error:", err);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus data karyawan: " + err.message,
    });
  }
});

export default router;
