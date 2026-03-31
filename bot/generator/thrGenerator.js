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
      // CONFIG & THEME (Nuansa Hijau Ketupat)
      // ======================
      const theme = {
        primary: "#065F46", // Hijau Tua
        secondary: "#10B981", // Hijau Terang
        accent: "#FDE047", // Kuning Emas (Aksen Ketupat)
        textMain: "#1F2937",
        textSecondary: "#6B7280",
        bgLight: "#ECFDF5",
        line: "#D1FAE5",
      };

      const rupiah = (x) => new Intl.NumberFormat("id-ID").format(Math.abs(Number(x || 0)));

      // ======================
      // BACKGROUND DECORATION (ORNAMEN HARI RAYA)
      // ======================

      // 1. Background dasar tipis
      doc.rect(0, 0, 600, 842).fill("#F9FAFB");

      // 2. Ornamen Ketupat Sederhana (Vektor) di Pojok-Pojok
      const drawKetupat = (x, y, size) => {
        doc.save();
        doc.translate(x, y).rotate(45, { origin: [0, 0] });
        // Pola anyaman ketupat
        doc.rect(0, 0, size, size).fill(theme.secondary);
        doc.rect(size / 2, 0, size / 2, size / 2).fill(theme.accent);
        doc.rect(0, size / 2, size / 2, size / 2).fill(theme.accent);
        doc.restore();
      };

      drawKetupat(540, 40, 30); // Pojok kanan atas
      drawKetupat(50, 780, 25); // Pojok kiri bawah

      // 3. Header Banner
      doc.rect(0, 0, 600, 160).fill(theme.primary);

      // Garis hiasan bawah header (Pola anyaman)
      doc.rect(0, 155, 600, 5).fill(theme.accent);

      // ======================
      // HEADER CONTENT
      // ======================
      // Logo - cek path yang benar
      const assetsDir = path.join(process.cwd(), "assets");
      let logoPath;

      if (company === "hisana") {
        logoPath = path.join(assetsDir, "hisanna.jpeg");
        // Cek juga kemungkinan nama file lain
        if (!fs.existsSync(logoPath)) {
          const alternativePath = path.join(assetsDir, "hisana.jpeg");
          if (fs.existsSync(alternativePath)) {
            logoPath = alternativePath;
          }
        }
      } else {
        logoPath = path.join(assetsDir, "enakko.jpeg");
        if (!fs.existsSync(logoPath)) {
          const alternativePath = path.join(assetsDir, "enakko.jpg");
          if (fs.existsSync(alternativePath)) {
            logoPath = alternativePath;
          }
        }
      }

      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, 50, 45, { width: 70 });
          console.log(`✅ Logo loaded: ${logoPath}`);
        } catch (imgErr) {
          console.error(`❌ Failed to load logo: ${imgErr.message}`);
        }
      } else {
        console.log(`⚠️ Logo not found at: ${logoPath}`);
        // Fallback: tampilkan teks sebagai pengganti logo
        doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(14).text(company.toUpperCase(), 50, 65);
      }

      doc
        .fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(24)
        .text(company.toUpperCase(), 135, 55)
        .font("Helvetica")
        .fontSize(10)
        .fillColor(theme.line)
        .text("Selamat Hari Raya Idul Fitri - Mohon Maaf Lahir & Batin", 135, 85)
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor(theme.accent)
        .text("SLIP THR", 400, 65, { align: "right", width: 150 })
        .fontSize(10)
        .fillColor("#FFFFFF")
        .text(`Tahun ${normalized.tahun || "-"}`, 400, 90, { align: "right", width: 150 });

      // Body Container
      doc.roundedRect(40, 140, 515, 450, 10).fill("#FFFFFF");
      doc.lineWidth(1).strokeColor(theme.line).roundedRect(40, 140, 515, 450, 10).stroke();

      // ======================
      // INFORMASI KARYAWAN
      // ======================
      let y = 180;
      doc.fillColor(theme.primary).font("Helvetica-Bold").fontSize(12).text("DETAIL PENERIMA", 70, y);

      const drawRow = (label, value, xPos, yPos) => {
        doc.fillColor(theme.textSecondary).font("Helvetica").fontSize(9).text(label, xPos, yPos);
        doc
          .fillColor(theme.textMain)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(value, xPos, yPos + 12);
      };

      y += 30;
      drawRow("NAMA LENGKAP", (normalized.nama || "-").toUpperCase(), 70, y);
      drawRow("ID KARYAWAN", normalized.no_induk || "-", 250, y);
      drawRow("PERUSAHAAN", company.toUpperCase(), 430, y);

      // Divider
      y += 45;
      doc.moveTo(70, y).lineTo(525, y).lineWidth(0.5).strokeColor(theme.line).stroke();

      // ======================
      // RINCIAN THR (Tampilan Box Emas)
      // ======================
      y += 30;
      doc.fillColor(theme.primary).font("Helvetica-Bold").fontSize(12).text("NOMINAL TUNJANGAN", 70, y);

      y += 25;
      doc.roundedRect(70, y, 455, 120, 8).fill(theme.bgLight);
      doc.lineWidth(1).strokeColor(theme.secondary).roundedRect(70, y, 455, 120, 8).stroke();

      doc
        .fillColor(theme.primary)
        .font("Helvetica")
        .fontSize(11)
        .text("Total Diterima (Net):", 90, y + 25);
      doc
        .fillColor(theme.primary)
        .font("Helvetica-Bold")
        .fontSize(28)
        .text(`Rp ${rupiah(normalized.jumlah_thr || 0)}`, 90, y + 45);

      doc
        .fillColor(theme.textSecondary)
        .font("Helvetica-Oblique")
        .fontSize(9)
        .text("Terbilang: (Sesuai dengan kebijakan perusahaan)", 90, y + 90);

      // Footer Catatan
      y += 150;
      doc
        .fillColor(theme.textSecondary)
        .font("Helvetica")
        .fontSize(8)
        .text("Catatan:", 70, y)
        .font("Helvetica-Oblique")
        .text("• Tunjangan Hari Raya ini diberikan sebagai bentuk apresiasi perusahaan.", 70, y + 12)
        .text("• Dokumen ini sah dan dihasilkan secara otomatis melalui sistem payroll.", 70, y + 22);

      // Metadata Akhir
      doc
        .fontSize(8)
        .fillColor("#BDC3C7")
        .text(`ID Transaksi: ${Date.now()} | Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 0, 560, { align: "center", width: 595 });

      doc.end();
      stream.on("finish", () => resolve(filePath));
      stream.on("error", (err) => reject(err));
    } catch (err) {
      console.error("Error generating THR PDF:", err);
      reject(err);
    }
  });
}

export default generateTHRPDF;
