// bot/generator/bonusGenerator.js
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateBonusPDF(data, company = "hisana") {
  return new Promise((resolve, reject) => {
    try {
      const bonusDir = path.join(__dirname, "../../bonus_slips");
      if (!fs.existsSync(bonusDir)) {
        fs.mkdirSync(bonusDir, { recursive: true });
      }

      const normalized = {};
      Object.keys(data || {}).forEach((key) => {
        const newKey = key.toLowerCase().replace(/[.&]/g, "").replace(/\s+/g, "_");
        normalized[newKey] = data[key];
      });

      const namaKaryawan = (normalized.nama || normalized.nama_karyawan || "karyawan").toString();
      const fileName = namaKaryawan.replace(/[^a-z0-9]/gi, "_").substring(0, 30);
      const filePath = path.join(bonusDir, `bonus_${company}_${fileName}_${Date.now()}.pdf`);

      const doc = new PDFDocument({ size: "A4", margin: 0 });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const theme = {
        primary: "#F59E0B", // Amber Gold
        textMain: "#212121",
        textSecondary: "#757575",
        bgLight: "#FFFBEB",
        line: "#E0E0E0",
      };

      const rupiah = (x) => new Intl.NumberFormat("id-ID").format(Math.abs(Number(x || 0)));
      const formatDate = (d) => {
        if (!d) return "-";
        try {
          return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
        } catch (e) {
          return "-";
        }
      };

      // ======================
      // HEADER DESIGN
      // ======================
      doc.rect(0, 0, 600, 140).fill(theme.primary);

      // Logo Handling dengan Masking (Hapus Background Putih)
      const logoPath = path.join(__dirname, "../../assets", company === "hisana" ? "hisanna.jpeg" : "enakko.jpeg");
      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, 50, 35, {
            width: 70,
            masked: [255, 255, 255, 255, 255, 255], // Mencoba membuat warna putih transparan
          });
        } catch (e) {
          try {
            doc.image(logoPath, 50, 35, { width: 70 });
          } catch (err) {}
        }
      }

      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(22).text(company.toUpperCase(), 135, 45);
      doc.font("Helvetica").fontSize(10).text("Sistem Payroll Digital Otomatis", 135, 75);
      doc.fontSize(16).text("SLIP BONUS", 380, 55, { align: "right", width: 150 });

      // Body Container
      doc.roundedRect(40, 120, 515, 680, 8).fill("#FFFFFF");
      doc.lineWidth(1).strokeColor(theme.line).roundedRect(40, 120, 515, 680, 8).stroke();

      // ======================
      // PROFIL KARYAWAN
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

      drawRow("NAMA LENGKAP", namaKaryawan.toUpperCase(), 70, y);
      drawRow("ID KARYAWAN", normalized.no_induk || "-", 250, y);
      drawRow("PERIODE", new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" }), 430, y);

      y += 40;
      drawRow("JABATAN", normalized.jabatan || normalized.posisi || "-", 70, y);
      drawRow("STORE/UNIT", normalized.store_name || normalized.store || "-", 250, y);
      drawRow("AWAL MASUK", formatDate(normalized.awal_masuk), 430, y);

      y += 45;
      doc.moveTo(70, y).lineTo(525, y).lineWidth(1).strokeColor(theme.line).stroke();
      y += 30;

      // ======================
      // RINCIAN BONUS
      // ======================
      doc.fillColor(theme.primary).font("Helvetica-Bold").fontSize(12).text("RINCIAN BONUS", 70, y);
      y += 25;

      doc.roundedRect(70, y, 455, 80, 10).fill(theme.bgLight);
      doc
        .fillColor(theme.primary)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text("TOTAL BONUS DITERIMA", 85, y + 20);
      doc
        .fillColor(theme.textMain)
        .fontSize(22)
        .text(`Rp ${rupiah(normalized.jumlah_bonus)}`, 85, y + 40, { width: 420, align: "right" });

      doc.end();
      stream.on("finish", () => resolve(filePath));
      stream.on("error", (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}
export default generateBonusPDF;
