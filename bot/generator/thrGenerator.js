import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateTHRPDF(data, company = "hisana") {
  return new Promise((resolve, reject) => {
    try {
      const thrDir = path.join(process.cwd(), "thr_slips");
      if (!fs.existsSync(thrDir)) {
        fs.mkdirSync(thrDir, { recursive: true });
      }

      // Normalisasi data
      const normalized = {};
      Object.keys(data || {}).forEach((key) => {
        const newKey = key.toLowerCase().replace(/[.&]/g, "").replace(/\s+/g, "_");
        normalized[newKey] = data[key];
      });

      const namaKaryawan = (normalized.nama || "karyawan").toString();
      const fileName = namaKaryawan.replace(/[^a-z0-9]/gi, "_").substring(0, 30);
      const filePath = path.join(thrDir, `thr_${company}_${fileName}_${Date.now()}.pdf`);

      const doc = new PDFDocument({ size: "A4", margin: 0 });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // ======================
      // CONFIG & THEME
      // ======================
      const theme = {
        primary: "#10B981",
        textMain: "#212121",
        textSecondary: "#757575",
        bgLight: "#D1FAE5",
        line: "#E0E0E0",
        success: "#059669",
      };

      const rupiah = (x) => new Intl.NumberFormat("id-ID").format(Math.abs(Number(x || 0)));

      // ======================
      // HEADER DESIGN
      // ======================
      doc.rect(0, 0, 600, 140).fill(theme.primary);

      // Logo
      const assetsDir = path.join(process.cwd(), "assets");
      const logoPath = path.join(assetsDir, company === "hisana" ? "hisanna.jpeg" : "enakko.jpeg");
      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, 50, 35, { width: 70 });
        } catch (err) {
          console.log("Logo not found or invalid:", err.message);
        }
      }

      // Nama Perusahaan & Judul
      doc
        .fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(22)
        .text(company.toUpperCase(), 135, 45)
        .font("Helvetica")
        .fontSize(10)
        .text("Sistem Penggajian Digital Otomatis", 135, 75)
        .font("Helvetica-Bold")
        .fontSize(14)
        .text("SLIP THR", 420, 55, { align: "right", width: 150 })
        .font("Helvetica")
        .fontSize(10)
        .text(`Tahun ${normalized.tahun || "-"}`, 420, 80, { align: "right", width: 150 });

      // Body Container
      doc.roundedRect(40, 120, 515, 400, 8).fill("#FFFFFF");
      doc.lineWidth(1).strokeColor(theme.line).roundedRect(40, 120, 515, 400, 8).stroke();

      // ======================
      // INFORMASI KARYAWAN
      // ======================
      let y = 155;
      doc.fillColor(theme.primary).font("Helvetica-Bold").fontSize(12).text("INFORMASI KARYAWAN", 70, y);
      y += 25;

      const drawRow = (label, value, xPos, yPos) => {
        doc.fillColor(theme.textSecondary).font("Helvetica").fontSize(9).text(label, xPos, yPos);
        doc
          .fillColor(theme.textMain)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(value, xPos, yPos + 12);
      };

      drawRow("NAMA LENGKAP", (normalized.nama || "-").toUpperCase(), 70, y);
      drawRow("ID KARYAWAN", normalized.no_induk || "-", 250, y);
      drawRow("TAHUN", normalized.tahun || "-", 430, y);

      y += 40;
      drawRow("PERUSAHAAN", company.toUpperCase(), 70, y);
      drawRow("JENIS", "THR (Tunjangan Hari Raya)", 250, y);

      // Divider Line
      y += 45;
      doc.moveTo(70, y).lineTo(525, y).lineWidth(1).strokeColor(theme.line).stroke();
      y += 20;

      // ======================
      // RINCIAN THR
      // ======================
      doc.fillColor(theme.primary).font("Helvetica-Bold").fontSize(12).text("RINCIAN THR", 70, y);
      y += 25;

      // Box untuk THR
      doc.roundedRect(70, y, 455, 100, 8).fill(theme.bgLight);
      doc.roundedRect(70, y, 455, 100, 8).stroke();

      doc.fillColor(theme.textMain).font("Helvetica").fontSize(12);
      doc.text("Jumlah THR", 85, y + 20);
      doc
        .fillColor(theme.success)
        .font("Helvetica-Bold")
        .fontSize(20)
        .text(`Rp ${rupiah(normalized.jumlah_thr || 0)}`, 85, y + 50);

      // Keterangan
      doc
        .fillColor(theme.textSecondary)
        .font("Helvetica-Oblique")
        .fontSize(9)
        .text("Tunjangan Hari Raya (THR) merupakan kewajiban perusahaan yang diberikan menjelang hari raya keagamaan.", 85, y + 85, { width: 420 });

      // ======================
      // FOOTER & SIGNATURE
      // ======================
      y = 420;
      doc.fillColor(theme.textSecondary).font("Helvetica-Oblique").fontSize(8).text("Catatan: THR wajib diberikan minimal 7 hari sebelum hari raya.", 70, y, { width: 250 });

      // Tanda Tangan
      doc.fillColor(theme.textMain).font("Helvetica").fontSize(10);
      doc.text("Diterima Oleh,", 400, y);
      doc.text("________________________", 400, y + 60);
      doc.font("Helvetica-Bold").text(namaKaryawan.toUpperCase(), 400, y + 75, {
        width: 130,
        align: "center",
      });

      // Metadata Akhir
      doc
        .fontSize(8)
        .fillColor("#BDC3C7")
        .text(`ID Transaksi: ${Date.now()} | Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 0, 550, { align: "center", width: 595 });

      doc.end();
      stream.on("finish", () => resolve(filePath));
      stream.on("error", (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

export default generateTHRPDF;
