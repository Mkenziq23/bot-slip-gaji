// bot/generator/slipGeneratorGaji.js - FULL FIXED VERSION

import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateSlip(data, company = "hisana") {
  return new Promise((resolve, reject) => {
    try {
      // Pastikan folder slips ada
      const slipsDir = path.join(__dirname, "../../slips");
      if (!fs.existsSync(slipsDir)) {
        fs.mkdirSync(slipsDir, { recursive: true });
      }

      // Normalisasi data dengan aman
      const normalized = {};
      if (data && typeof data === "object") {
        Object.keys(data).forEach((key) => {
          const newKey = key.toLowerCase().replace(/[.&]/g, "").replace(/\s+/g, "_");
          normalized[newKey] = data[key];
        });
      }

      // Gunakan nama dari data yang sudah di-join
      const namaKaryawan = (normalized.nama || normalized.nama_karyawan || normalized.nama_lengkap || "karyawan").toString();
      const fileName = namaKaryawan.replace(/[^a-z0-9]/gi, "_").substring(0, 30);
      const filePath = path.join(slipsDir, `slip_${company}_${fileName}_${Date.now()}.pdf`);

      const doc = new PDFDocument({ size: "A4", margin: 0 });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // ======================
      // CONFIG & THEME
      // ======================
      const theme = {
        primary: company === "hisana" ? "#C62828" : "#C62828",
        textMain: "#212121",
        textSecondary: "#757575",
        bgLight: "#F8F9FA",
        line: "#E0E0E0",
        danger: "#D32F2F",
      };

      const rupiah = (x) => {
        const num = Number(x) || 0;
        return new Intl.NumberFormat("id-ID").format(Math.abs(num));
      };

      const formatDate = (d) => {
        if (!d) return "-";
        try {
          return new Date(d).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric",
          });
        } catch (e) {
          return "-";
        }
      };

      // ======================
      // HEADER DESIGN
      // ======================
      doc.rect(0, 0, 600, 140).fill(theme.primary);

      // Logo
      let logoPath = null;
      const possiblePaths = [
        path.join(__dirname, "../../assets", company === "hisana" ? "hisanna.jpeg" : "enakko.jpeg"),
        path.join(__dirname, "../assets", company === "hisana" ? "hisanna.jpeg" : "enakko.jpeg"),
        path.join(process.cwd(), "assets", company === "hisana" ? "hisanna.jpeg" : "enakko.jpeg"),
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          logoPath = p;
          break;
        }
      }

      if (logoPath && fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, 50, 35, { width: 70 });
        } catch (err) {
          console.log("Logo not found, continuing without logo");
        }
      }

      // Nama Perusahaan & Judul
      doc
        .fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(22)
        .text(company === "hisana" ? "HISANA" : "ENAKKO", 135, 45)
        .font("Helvetica")
        .fontSize(10)
        .text("Sistem Penggajian Digital Otomatis", 135, 75)
        .font("Helvetica-Bold")
        .fontSize(14)
        .text("SLIP GAJI KARYAWAN", 380, 55, { align: "right", width: 150 });

      // Body Container
      doc.roundedRect(40, 120, 515, 680, 8).fill("#FFFFFF");
      doc.lineWidth(1).strokeColor(theme.line).roundedRect(40, 120, 515, 680, 8).stroke();

      // ======================
      // INFORMASI KARYAWAN
      // ======================
      let y = 155;
      doc.fillColor(theme.primary).font("Helvetica-Bold").fontSize(12).text("PROFIL KARYAWAN", 70, y);
      y += 25;

      const drawRow = (label, value, xPos, yPos) => {
        doc.fillColor(theme.textSecondary).font("Helvetica").fontSize(9).text(label, xPos, yPos);
        doc
          .fillColor(theme.textMain)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(value || "-", xPos, yPos + 12);
      };

      const namaLengkap = (normalized.nama || normalized.nama_karyawan || normalized.nama_lengkap || "-").toString();
      drawRow("NAMA LENGKAP", namaLengkap.toUpperCase(), 70, y);
      drawRow("ID KARYAWAN", normalized.no_induk || "-", 250, y);
      drawRow("PERIODE", new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" }), 430, y);

      y += 40;
      drawRow("JABATAN", normalized.jabatan || normalized.posisi || "-", 70, y);

      if (company === "hisana") {
        drawRow("STORE/UNIT", normalized.store_name || normalized.store || "-", 250, y);
        drawRow("TANGGAL BERGABUNG", formatDate(normalized.awal_masuk), 430, y);
      } else {
        drawRow("PENEMPATAN", normalized.store_name || normalized.penempatan || "-", 250, y);
        drawRow("TANGGAL MASUK", formatDate(normalized.awal_masuk), 430, y);
      }

      // Divider Line
      y += 45;
      doc.moveTo(70, y).lineTo(525, y).lineWidth(1).strokeColor(theme.line).stroke();
      y += 20;

      // ======================
      // RINCIAN GAJI (TABEL)
      // ======================
      doc.fillColor(theme.primary).font("Helvetica-Bold").fontSize(12).text("RINCIAN PENGHASILAN", 70, y);
      y += 25;

      // Header Tabel
      doc.rect(70, y, 455, 25).fill(theme.bgLight);
      doc
        .fillColor(theme.textSecondary)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text("KOMPONEN", 85, y + 8);
      doc.text("NOMINAL (IDR)", 400, y + 8, { width: 110, align: "right" });
      y += 35;

      let items = [];
      let total = 0;

      if (company === "hisana") {
        // HISANA
        const gaji = Number(normalized.gaji) || 0;
        const um = Number(normalized.um) || 0;
        const kerajinan = Number(normalized.kerajinan) || 0;
        const tunjangan = Number(normalized.tunj_bpjs_pulsa) || 0;
        const cuti = Number(normalized.cuti) || 0;
        const iuran = Number(normalized.iuran_bpjs_ketenagakerjaan) || 0;

        items = [
          ["Gaji Pokok", gaji],
          ["Uang Makan (UM)", um],
          ["Tunjangan Kerajinan", kerajinan],
          ["Tunj. BPJS & Pulsa", tunjangan],
          ["Cuti", cuti],
        ];

        if (iuran > 0) {
          items.push(["Iuran BPJS (Potongan)", -iuran]);
        }

        total = gaji + um + kerajinan + tunjangan + cuti - iuran;
      } else {
        // ENAKKO - hanya 3 komponen
        const gajiPokok = Number(normalized.gaji_pokok) || 0;
        const bpjsKesehatan = Number(normalized.bpjs_kesehatan) || 0;
        const insentif = Number(normalized.insentif) || 0;

        items = [
          ["Gaji Pokok", gajiPokok],
          ["BPJS Kesehatan", bpjsKesehatan],
          ["Insentif", insentif],
        ];

        total = gajiPokok + bpjsKesehatan + insentif;
      }

      // Tampilkan item (hanya yang nilainya > 0)
      items.forEach(([label, value]) => {
        if (value === 0 && label !== "Gaji Pokok") return;

        doc.fillColor(theme.textMain).font("Helvetica").fontSize(10).text(label, 85, y);

        if (value < 0) {
          doc.fillColor(theme.danger).text(`(${rupiah(value)})`, 400, y, { width: 110, align: "right" });
        } else {
          doc.fillColor(theme.textMain).text(rupiah(value), 400, y, { width: 110, align: "right" });
        }

        y += 22;
        doc
          .moveTo(85, y - 5)
          .lineTo(510, y - 5)
          .lineWidth(0.5)
          .strokeColor(theme.line)
          .stroke();
      });

      // Total Box
      y += 15;
      doc.rect(300, y, 225, 45).fill(theme.primary);
      doc
        .fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(10)
        .text("TAKE HOME PAY", 315, y + 10);
      doc.fontSize(14).text(`Rp ${rupiah(total)}`, 315, y + 22, { width: 200, align: "right" });

      // ======================
      // FOOTER
      // ======================
      y = 680;
      const keterangan = normalized.keterangan || "Slip ini adalah dokumen sah yang dihasilkan secara elektronik.";
      doc.fillColor(theme.textSecondary).font("Helvetica-Oblique").fontSize(8).text(`Catatan: ${keterangan}`, 70, y, { width: 250 });

      // Metadata Akhir
      doc
        .fontSize(8)
        .fillColor("#BDC3C7")
        .text(`ID Transaksi: ${Date.now()} | Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 0, 810, { align: "center", width: 595 });

      doc.end();
      stream.on("finish", () => resolve(filePath));
      stream.on("error", (err) => reject(err));
    } catch (err) {
      console.error("PDF Generation Error:", err);
      reject(err);
    }
  });
}

export default generateSlip;
