import fs from "fs";
import XLSX from "xlsx";
import db from "./db.js";

// Konversi string/angka Excel ke number
function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;
  return Number(String(value).replace(/,/g, "")) || 0;
}

// Konversi tanggal Excel ke format YYYY-MM-DD
function excelDateToJSDate(excelDate) {
  if (!excelDate) return null;

  // Jika Excel memberi tanggal sebagai number (serial)
  if (typeof excelDate === "number") {
    const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
    const year = jsDate.getFullYear();
    const month = String(jsDate.getMonth() + 1).padStart(2, "0");
    const day = String(jsDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Jika Excel memberi string seperti "8/12/2023"
  const jsDate = new Date(excelDate);
  if (isNaN(jsDate)) return null;
  const year = jsDate.getFullYear();
  const month = String(jsDate.getMonth() + 1).padStart(2, "0");
  const day = String(jsDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Fungsi upload Excel
export async function uploadExcel(req, res, currentNumber) {
  try {
    if (!req.file) return res.json({ success: false, message: "File tidak ditemukan" });
    if (!currentNumber) return res.json({ success: false, message: "User belum login" });

    // Ambil user_id
    const [users] = await db.query("SELECT id FROM users WHERE nomor_wa=?", [currentNumber]);
    if (!users.length) return res.json({ success: false, message: "User tidak ditemukan" });
    const userId = users[0].id;

    const filePath = req.file.path;
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Baca data Excel
    let data = XLSX.utils.sheet_to_json(sheet, { defval: null });

    // Hapus file Excel setelah dibaca
    fs.unlinkSync(filePath);

    // Ambil data DB untuk user ini
    const [existingRows] = await db.query("SELECT * FROM slip_gaji WHERE user_id=?", [userId]);

    for (const row of data) {
      const { no_induk, nama, posisi, store, awal_masuk, kerja, gaji, iuran_bpjs_ketenagakerjaan, kerajinan, cuti, tunj_bpjs_pulsa, jumlah, um, keterangan, gaji_total, nohp } = row;

      if (!no_induk) continue;

      const exist = existingRows.find(
        (r) =>
          r.no_induk === no_induk &&
          r.nama === nama &&
          r.posisi === posisi &&
          r.store === store &&
          String(r.awal_masuk?.toISOString().slice(0, 10)) === String(excelDateToJSDate(awal_masuk)) &&
          Number(r.kerja) === toNumber(kerja) &&
          Number(r.gaji) === toNumber(gaji) &&
          Number(r.iuran_bpjs_ketenagakerjaan) === toNumber(iuran_bpjs_ketenagakerjaan) &&
          Number(r.kerajinan) === toNumber(kerajinan) &&
          Number(r.cuti) === toNumber(cuti) &&
          Number(r.tunj_bpjs_pulsa) === toNumber(tunj_bpjs_pulsa) &&
          Number(r.jumlah) === toNumber(jumlah) &&
          Number(r.um) === toNumber(um) &&
          r.keterangan === keterangan &&
          Number(r.gaji_total) === toNumber(gaji_total) &&
          r.nohp === nohp,
      );

      if (exist) continue;

      // Update jika no_induk sudah ada
      const existByNoInduk = existingRows.find((r) => r.no_induk === no_induk);
      if (existByNoInduk) {
        await db.query(
          `UPDATE slip_gaji SET
            nama=?, posisi=?, store=?, awal_masuk=?, kerja=?, gaji=?, iuran_bpjs_ketenagakerjaan=?,
            kerajinan=?, cuti=?, tunj_bpjs_pulsa=?, jumlah=?, um=?, keterangan=?, gaji_total=?, nohp=? 
            WHERE user_id=? AND no_induk=?`,
          [
            nama,
            posisi,
            store,
            excelDateToJSDate(awal_masuk),
            toNumber(kerja),
            toNumber(gaji),
            toNumber(iuran_bpjs_ketenagakerjaan),
            toNumber(kerajinan),
            toNumber(cuti),
            toNumber(tunj_bpjs_pulsa),
            toNumber(jumlah),
            toNumber(um),
            keterangan,
            toNumber(gaji_total),
            nohp,
            userId,
            no_induk,
          ],
        );
      } else {
        // Insert baru
        await db.query(
          `INSERT INTO slip_gaji
          (user_id,no_induk,nama,posisi,store,awal_masuk,kerja,gaji,iuran_bpjs_ketenagakerjaan,
          kerajinan,cuti,tunj_bpjs_pulsa,jumlah,um,keterangan,gaji_total,nohp,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
          [
            userId,
            no_induk,
            nama,
            posisi,
            store,
            excelDateToJSDate(awal_masuk),
            toNumber(kerja),
            toNumber(gaji),
            toNumber(iuran_bpjs_ketenagakerjaan),
            toNumber(kerajinan),
            toNumber(cuti),
            toNumber(tunj_bpjs_pulsa),
            toNumber(jumlah),
            toNumber(um),
            keterangan,
            toNumber(gaji_total),
            nohp,
          ],
        );
      }
    }

    res.json({ success: true, message: "Upload berhasil" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
}
