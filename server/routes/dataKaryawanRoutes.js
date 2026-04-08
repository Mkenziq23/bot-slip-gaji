// server/routes/dataKaryawanRoutes.js - UPDATED WITH awal_masuk

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

// Helper function untuk mendapatkan nama tabel lokasi store
function getLokasiStoreTableName(company) {
  return company === "hisana" ? "lokasi_store_hisana" : "lokasi_store_enakko";
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
// KONFIGURASI MULTER UNTUK FOTO
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
// KONFIGURASI MULTER UNTUK EXCEL
// =============================
const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// =============================
// GET LOKASI STORE LIST FOR DROPDOWN
// =============================
router.get("/data-karyawan/lokasi-store", async (req, res) => {
  try {
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
    const lokasiTable = getLokasiStoreTableName(company);

    const [rows] = await db.query(
      `SELECT id, nama_store, alamat, latitude, longitude 
       FROM ${lokasiTable} 
       WHERE user_id = ? 
       ORDER BY nama_store ASC`,
      [userId],
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error("❌ Get lokasi store error:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data lokasi store: " + err.message,
    });
  }
});

// =============================
// DOWNLOAD TEMPLATE EXCEL KARYAWAN (UPDATED WITH awal_masuk)
// =============================
router.get("/data-karyawan/template", async (req, res) => {
  try {
    const { company } = req.query;
    const number = checkLogin(req, res);

    if (!number) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const companyType = company === "enakko" ? "enakko" : "hisana";
    const lokasiTable = companyType === "hisana" ? "lokasi_store_hisana" : "lokasi_store_enakko";

    // Ambil daftar lokasi store untuk dropdown reference di template
    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa = ?", [number]);
    if (!users.length) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }
    const userId = users[0].id;

    const [lokasiList] = await db.query(`SELECT nama_store FROM ${lokasiTable} WHERE user_id = ? ORDER BY nama_store ASC`, [userId]);

    // Header untuk template Excel - TAMBAHKAN Awal Masuk
    const headers = ["No Induk*", "Nama Lengkap*", "NIK*", "Tanggal Lahir* (DD/MM/YYYY)", "Alamat Domisili", "No HP*", "Email*", "Password* (min 6 karakter)", "Awal Masuk (YYYY-MM-DD)", "Jabatan*", "Nama Store / Gerai*"];

    // Data contoh - 2 baris
    const templateData = [
      {
        "No Induk*": companyType === "hisana" ? "H001" : "E001",
        "Nama Lengkap*": "Budi Santoso",
        "NIK*": "1234567890123456",
        "Tanggal Lahir* (DD/MM/YYYY)": "15/01/1990",
        "Alamat Domisili": "Jl. Contoh No. 123, Jakarta",
        "No HP*": "08123456789",
        "Email*": "budi@example.com",
        "Password* (min 6 karakter)": "password123",
        "Awal Masuk (YYYY-MM-DD)": "2020-01-15",
        "Jabatan*": "Staff",
        "Nama Store / Gerai*": lokasiList.length > 0 ? lokasiList[0].nama_store : companyType === "hisana" ? "Hisana Thamrin" : "Enakko Thamrin",
      },
      {
        "No Induk*": companyType === "hisana" ? "H002" : "E002",
        "Nama Lengkap*": "Siti Aminah",
        "NIK*": "2345678901234567",
        "Tanggal Lahir* (DD/MM/YYYY)": "20/05/1995",
        "Alamat Domisili": "Jl. Merdeka No. 45, Jakarta",
        "No HP*": "08123456788",
        "Email*": "siti@example.com",
        "Password* (min 6 karakter)": "password123",
        "Awal Masuk (YYYY-MM-DD)": "2021-03-20",
        "Jabatan*": "Supervisor",
        "Nama Store / Gerai*": lokasiList.length > 1 ? lokasiList[1].nama_store : companyType === "hisana" ? "Hisana Pondok Indah" : "Enakko Pondok Indah",
      },
    ];

    // Buat worksheet
    const ws = xlsx.utils.json_to_sheet(templateData, { header: headers });

    // Set lebar kolom
    ws["!cols"] = [
      { wch: 12 }, // No Induk*
      { wch: 20 }, // Nama Lengkap*
      { wch: 18 }, // NIK*
      { wch: 22 }, // Tanggal Lahir* (DD/MM/YYYY)
      { wch: 35 }, // Alamat Domisili
      { wch: 15 }, // No HP*
      { wch: 25 }, // Email*
      { wch: 25 }, // Password* (min 6 karakter)
      { wch: 20 }, // Awal Masuk (YYYY-MM-DD)
      { wch: 15 }, // Jabatan*
      { wch: 30 }, // Nama Store / Gerai*
    ];

    // Tambahkan sheet informasi untuk validasi
    const infoSheetData = [
      ["PETUNJUK PENGISIAN TEMPLATE KARYAWAN"],
      [""],
      ["1. Kolom bertanda * (bintang) WAJIB diisi:", ""],
      ["   - No Induk: Harus unik untuk setiap karyawan", ""],
      ["   - Nama Lengkap: Nama lengkap karyawan", ""],
      ["   - NIK: 16 digit angka", ""],
      ["   - Tanggal Lahir: Format DD/MM/YYYY (contoh: 15/01/1990)", ""],
      ["   - No HP: Bisa dimulai dengan 0 atau 62 (contoh: 08123456789 atau 628123456789)", ""],
      ["   - Email: Format email yang valid", ""],
      ["   - Password: Minimal 6 karakter", ""],
      ["   - Jabatan: Posisi/jabatan karyawan", ""],
      ["   - Nama Store / Gerai: Harus sesuai dengan nama store yang sudah terdaftar di sistem", ""],
      [""],
      ["2. Kolom opsional (tidak wajib):", ""],
      ["   - Alamat Domisili: Alamat tempat tinggal karyawan", ""],
      ["   - Awal Masuk: Tanggal awal karyawan bekerja, format YYYY-MM-DD (contoh: 2020-01-15)", ""],
      [""],
      ["3. Daftar Nama Store / Gerai yang tersedia:", ""],
      ...lokasiList.map((l) => [`   - ${l.nama_store}`, ""]),
      [""],
      ["4. Format Tanggal Lahir yang benar:", ""],
      ["   - Contoh: 15/01/1990 (15 Januari 1990)", ""],
      ["   - Contoh: 20/12/1995 (20 Desember 1995)", ""],
      [""],
      ["5. Format No HP yang benar:", ""],
      ["   - Contoh: 08123456789 (akan otomatis dikonversi ke 628123456789)", ""],
      ["   - Contoh: 628123456789 (format internasional)", ""],
      [""],
      ["6. Catatan Penting:", ""],
      ["   - Data dengan No Induk, Email, atau NIK yang sudah terdaftar akan dilewati", ""],
      ["   - Nama Store / Gerai harus sudah ada di database, jika tidak maka import akan gagal", ""],
      ["   - Pastikan semua data terisi dengan benar sebelum import", ""],
    ];

    const wsInfo = xlsx.utils.aoa_to_sheet(infoSheetData);
    wsInfo["!cols"] = [{ wch: 60 }];

    const wb = xlsx.utils.book_new();
    const sheetName = companyType === "hisana" ? "Template_Hisana" : "Template_Enakko";
    xlsx.utils.book_append_sheet(wb, ws, sheetName);
    xlsx.utils.book_append_sheet(wb, wsInfo, "Petunjuk");

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
// EXPORT EXCEL KARYAWAN (UPDATED WITH awal_masuk)
// =============================
router.get("/data-karyawan/export", async (req, res) => {
  try {
    const { company } = req.query;

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
    const lokasiTable = getLokasiStoreTableName(company);

    // Query dengan JOIN ke lokasi_store - TAMBAHKAN awal_masuk
    const [rows] = await db.query(
      `SELECT 
        k.no_induk, 
        k.nama_lengkap, 
        k.nik, 
        DATE_FORMAT(k.tanggal_lahir, '%d/%m/%Y') as tanggal_lahir,
        k.alamat_domisili, 
        k.no_hp, 
        k.email, 
        DATE_FORMAT(k.awal_masuk, '%Y-%m-%d') as awal_masuk,
        k.jabatan,
        k.lokasi_store_id,
        l.nama_store,
        l.alamat as alamat_store,
        k.foto_diri, 
        k.foto_ktp
       FROM ${tableName} k
       LEFT JOIN ${lokasiTable} l ON k.lokasi_store_id = l.id
       WHERE k.user_id = ? 
       ORDER BY k.no_induk ASC`,
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

    const headers = ["No Induk", "Nama Lengkap", "Nik", "Tanggal Lahir", "Alamat Domisili", "No Hp", "Email", "Awal Masuk", "Jabatan", "Nama Store / Gerai", "Alamat Store", "File Foto Diri", "File Foto Ktp"];

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
        "Awal Masuk": row.awal_masuk || "",
        Jabatan: row.jabatan || "",
        "Nama Store / Gerai": row.nama_store || "",
        "Alamat Store": row.alamat_store || "",
        "File Foto Diri": row.foto_diri ? `foto_diri/foto_diri_${row.no_induk}_${sanitizedName}${path.extname(row.foto_diri)}` : "",
        "File Foto Ktp": row.foto_ktp ? `foto_ktp/foto_ktp_${row.no_induk}_${sanitizedName}${path.extname(row.foto_ktp)}` : "",
      };
    });

    const ws = xlsx.utils.json_to_sheet(exportData, { header: headers });
    ws["!cols"] = [{ wch: 12 }, { wch: 25 }, { wch: 18 }, { wch: 15 }, { wch: 35 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 35 }, { wch: 40 }, { wch: 40 }];

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
// IMPORT EXCEL KARYAWAN (UPDATED WITH awal_masuk)
// =============================
router.post("/data-karyawan/import", uploadExcel.single("file"), async (req, res) => {
  console.log("=== IMPORT KARYAWAN ROUTE HIT ===");

  try {
    const { company } = req.query;

    if (!company || (company !== "hisana" && company !== "enakko")) {
      return res.status(400).json({
        success: false,
        message: "Parameter company harus hisana atau enakko",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Silakan pilih file Excel terlebih dahulu",
      });
    }

    const number = req.session?.number;
    if (!number) {
      return res.status(401).json({
        success: false,
        message: "Sesi login tidak ditemukan, silakan login kembali",
      });
    }

    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa = ?", [number]);
    if (!users.length) {
      return res.status(401).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    const userId = users[0].id;
    const tableName = getTableName(company);
    const lokasiTable = getLokasiStoreTableName(company);

    // Load semua lokasi store untuk mapping (case insensitive)
    const [lokasiList] = await db.query(`SELECT id, nama_store FROM ${lokasiTable} WHERE user_id = ?`, [userId]);

    const lokasiMap = new Map();
    lokasiList.forEach((l) => {
      lokasiMap.set(l.nama_store.toLowerCase().trim(), l.id);
    });

    console.log(`📊 Loaded ${lokasiList.length} lokasi store for mapping`);
    console.log("Available store names:", Array.from(lokasiMap.keys()));

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
        const no_induk = (row["No Induk*"] || row["No Induk"] || row["no_induk"] || row["NO INDUK"] || "").toString().trim();
        const nama_lengkap = (row["Nama Lengkap*"] || row["Nama Lengkap"] || row["nama_lengkap"] || row["NAMA LENGKAP"] || row["Nama"] || "").toString().trim();
        let nik = (row["NIK*"] || row["NIK"] || row["nik"] || row["NIK"] || "").toString().trim();
        let tanggal_lahir = (row["Tanggal Lahir* (DD/MM/YYYY)"] || row["Tanggal Lahir*"] || row["Tanggal Lahir"] || row["tanggal_lahir"] || "").toString().trim();
        const alamat_domisili = (row["Alamat Domisili"] || row["alamat_domisili"] || row["ALAMAT DOMISILI"] || row["Alamat"] || "").toString().trim();
        let no_hp = (row["No HP*"] || row["No HP"] || row["no_hp"] || row["NO HP"] || row["nohp"] || "").toString().trim();
        const email = (row["Email*"] || row["Email"] || row["email"] || row["EMAIL"] || "").toString().trim();
        let password = (row["Password* (min 6 karakter)"] || row["Password*"] || row["Password"] || row["password"] || "").toString().trim();
        let awal_masuk = (row["Awal Masuk (YYYY-MM-DD)"] || row["Awal Masuk"] || row["awal_masuk"] || row["AWAL MASUK"] || "").toString().trim();
        const jabatan = (row["Jabatan*"] || row["Jabatan"] || row["jabatan"] || row["JABATAN"] || row["Posisi"] || "").toString().trim();
        const namaStore = (row["Nama Store / Gerai*"] || row["Nama Store / Gerai"] || row["nama_store"] || row["Nama Store"] || row["Gerai"] || "").toString().trim();

        console.log(`Row ${i + 1}: No Induk=${no_induk}, Nama=${nama_lengkap}, Store=${namaStore}, Awal Masuk=${awal_masuk}`);

        // Validasi field wajib
        const missingFields = [];
        if (!no_induk) missingFields.push("No Induk");
        if (!nama_lengkap) missingFields.push("Nama Lengkap");
        if (!nik) missingFields.push("NIK");
        if (!tanggal_lahir) missingFields.push("Tanggal Lahir");
        if (!no_hp) missingFields.push("No HP");
        if (!email) missingFields.push("Email");
        if (!jabatan) missingFields.push("Jabatan");
        if (!namaStore) missingFields.push("Nama Store / Gerai");

        if (missingFields.length > 0) {
          errorCount++;
          errors.push(`Baris ${i + 2}: Field wajib kosong: ${missingFields.join(", ")}`);
          continue;
        }

        // Cari lokasi_store_id berdasarkan nama store
        let lokasiStoreId = null;
        const storeKey = namaStore.toLowerCase().trim();

        if (lokasiMap.has(storeKey)) {
          lokasiStoreId = lokasiMap.get(storeKey);
          console.log(`✓ Found store: ${namaStore} -> ID: ${lokasiStoreId}`);
        } else {
          errorCount++;
          errors.push(`Baris ${i + 2}: Nama Store "${namaStore}" tidak ditemukan di database. Silakan tambahkan lokasi store terlebih dahulu.`);
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
            const day = parts[0].padStart(2, "0");
            const month = parts[1].padStart(2, "0");
            const year = parts[2];
            if (year.length === 4) {
              formattedDate = `${year}-${month}-${day}`;
            }
          }
        } else if (tanggal_lahir.includes("-")) {
          const parts = tanggal_lahir.split("-");
          if (parts.length === 3) {
            if (parts[0].length === 4) {
              formattedDate = tanggal_lahir;
            } else {
              const day = parts[0].padStart(2, "0");
              const month = parts[1].padStart(2, "0");
              const year = parts[2];
              if (year.length === 4) {
                formattedDate = `${year}-${month}-${day}`;
              }
            }
          }
        }

        if (!formattedDate) {
          errorCount++;
          errors.push(`Baris ${i + 2}: Format Tanggal Lahir tidak valid (gunakan DD/MM/YYYY) - Tanggal: ${tanggal_lahir}`);
          continue;
        }

        // Format awal_masuk jika ada (YYYY-MM-DD)
        let formattedAwalMasuk = null;
        if (awal_masuk) {
          // Cek format YYYY-MM-DD
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (dateRegex.test(awal_masuk)) {
            formattedAwalMasuk = awal_masuk;
          } else {
            // Coba parse dari format lain
            const parts = awal_masuk.split(/[-/]/);
            if (parts.length === 3) {
              if (parts[0].length === 4) {
                formattedAwalMasuk = awal_masuk;
              } else {
                const day = parts[0].padStart(2, "0");
                const month = parts[1].padStart(2, "0");
                const year = parts[2];
                if (year.length === 4) {
                  formattedAwalMasuk = `${year}-${month}-${day}`;
                }
              }
            }
          }
        }

        // Validasi email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          errorCount++;
          errors.push(`Baris ${i + 2}: Email tidak valid - Email: ${email}`);
          continue;
        }

        // Set default password jika kosong
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

        // Insert data dengan lokasi_store_id dan awal_masuk
        const query = `
          INSERT INTO ${tableName} 
          (user_id, no_induk, nama_lengkap, nik, tanggal_lahir, alamat_domisili, 
           no_hp, email, password, awal_masuk, jabatan, lokasi_store_id) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await db.query(query, [userId, no_induk, nama_lengkap, nikClean, formattedDate, alamat_domisili || null, noHpClean, email, hashedPassword, formattedAwalMasuk, jabatan, lokasiStoreId]);

        successCount++;
        console.log(`✅ Imported: ${no_induk} - ${nama_lengkap} (Store ID: ${lokasiStoreId}, Awal Masuk: ${formattedAwalMasuk})`);
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
// GET ALL KARYAWAN (UPDATED WITH awal_masuk)
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
    const lokasiTable = getLokasiStoreTableName(company);

    const [rows] = await db.query(
      `SELECT 
        k.id, 
        k.no_induk, 
        k.nama_lengkap, 
        k.nik, 
        DATE_FORMAT(k.tanggal_lahir, '%Y-%m-%d') as tanggal_lahir,
        k.alamat_domisili, 
        k.no_hp, 
        k.email, 
        DATE_FORMAT(k.awal_masuk, '%Y-%m-%d') as awal_masuk,
        k.jabatan, 
        k.lokasi_store_id,
        l.nama_store,
        l.alamat as alamat_store,
        k.foto_diri, 
        k.foto_ktp, 
        k.created_at 
       FROM ${tableName} k
       LEFT JOIN ${lokasiTable} l ON k.lokasi_store_id = l.id
       WHERE k.user_id = ? 
       ORDER BY k.no_induk ASC`,
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
// GET KARYAWAN BY ID (UPDATED WITH awal_masuk)
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
    const lokasiTable = getLokasiStoreTableName(company);

    const [rows] = await db.query(
      `SELECT 
        k.id, 
        k.no_induk, 
        k.nama_lengkap, 
        k.nik, 
        DATE_FORMAT(k.tanggal_lahir, '%Y-%m-%d') as tanggal_lahir,
        k.alamat_domisili, 
        k.no_hp, 
        k.email, 
        DATE_FORMAT(k.awal_masuk, '%Y-%m-%d') as awal_masuk,
        k.jabatan, 
        k.lokasi_store_id,
        l.nama_store,
        l.alamat as alamat_store
       FROM ${tableName} k
       LEFT JOIN ${lokasiTable} l ON k.lokasi_store_id = l.id
       WHERE k.id = ? AND k.user_id = ?`,
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
// CREATE KARYAWAN (UPDATED WITH awal_masuk)
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
      const { no_induk, nama_lengkap, nik, tanggal_lahir, alamat_domisili, no_hp, email, password, awal_masuk, jabatan, lokasi_store_id } = req.body;

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
        { field: "lokasi_store_id", name: "Lokasi Store" },
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
      const lokasiTable = getLokasiStoreTableName(company);

      // Validasi lokasi_store_id ada
      const [lokasiCheck] = await db.query(`SELECT id FROM ${lokasiTable} WHERE id = ? AND user_id = ?`, [lokasi_store_id, userId]);

      if (lokasiCheck.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Lokasi Store tidak valid",
        });
      }

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
          no_hp, email, password, awal_masuk, jabatan, lokasi_store_id, foto_diri, foto_ktp) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, no_induk.trim(), nama_lengkap.trim(), nik.trim(), tanggal_lahir, alamat_domisili?.trim() || "", no_hp.trim(), email.trim(), hashedPassword, awal_masuk || null, jabatan.trim(), lokasi_store_id, fotoDiriPath, fotoKtpPath],
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
// UPDATE KARYAWAN (UPDATED WITH awal_masuk)
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
      const { no_induk, nama_lengkap, nik, tanggal_lahir, alamat_domisili, no_hp, email, password, awal_masuk, jabatan, lokasi_store_id } = req.body;

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
      const lokasiTable = getLokasiStoreTableName(company);

      const [existing] = await db.query(`SELECT id, foto_diri, foto_ktp FROM ${tableName} WHERE id = ? AND user_id = ?`, [id, userId]);
      if (existing.length === 0) {
        return res.status(404).json({ success: false, message: "Data karyawan tidak ditemukan" });
      }

      // Validasi lokasi_store_id jika diisi
      if (lokasi_store_id) {
        const [lokasiCheck] = await db.query(`SELECT id FROM ${lokasiTable} WHERE id = ? AND user_id = ?`, [lokasi_store_id, userId]);

        if (lokasiCheck.length === 0) {
          return res.status(400).json({
            success: false,
            message: "Lokasi Store tidak valid",
          });
        }
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
          alamat_domisili = ?, no_hp = ?, email = ?, awal_masuk = ?,
          jabatan = ?, lokasi_store_id = ?, foto_diri = ?, foto_ktp = ?
      `;
      let params = [no_induk.trim(), nama_lengkap.trim(), nik.trim(), tanggal_lahir, alamat_domisili?.trim() || "", no_hp.trim(), email.trim(), awal_masuk || null, jabatan.trim(), lokasi_store_id || null, fotoDiriPath, fotoKtpPath];

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
// DELETE KARYAWAN (UPDATED - no changes needed)
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
