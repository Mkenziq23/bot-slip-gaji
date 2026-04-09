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

      // Validasi required data
      if (!normalized.nama) {
        throw new Error("Nama karyawan tidak ditemukan");
      }

      const namaKaryawan = normalized.nama.toString();
      const fileName = namaKaryawan.replace(/[^a-z0-9]/gi, "_").substring(0, 30);
      const timestamp = Date.now();
      const filePath = path.join(thrDir, `thr_${company}_${fileName}_${timestamp}.pdf`);

      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        layout: "portrait",
      });

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // ======================
      // CONFIG & THEME (Nuansa Hijau Ketupat untuk THR)
      // ======================
      const theme = {
        primary: company === "hisana" ? "#065F46" : "#065F46",
        secondary: company === "hisana" ? "#10B981" : "#10B981",
        accent: "#FDE047",
        textMain: "#1F2937",
        textSecondary: "#6B7280",
        bgLight: company === "hisana" ? "#ECFDF5" : "#D1FAE5",
        line: "#D1FAE5",
        border: "#A7F3D0",
      };

      const rupiah = (x) => {
        const num = Number(x || 0);
        return new Intl.NumberFormat("id-ID").format(Math.abs(num));
      };

      const companyDisplay = company === "hisana" ? "HISANA" : "ENAKKO";
      const companyFullName = company === "hisana" ? "PT Hisana Cipta Karya" : "PT Enakko Food Indonesia";

      // ======================
      // HEADER DESIGN
      // ======================
      let y = 0;

      // Header background
      doc.rect(0, 0, doc.page.width, 140).fill(theme.primary);

      // Garis hiasan bawah header
      doc.rect(0, 135, doc.page.width, 5).fill(theme.accent);

      // Logo
      const logoPaths = [
        path.join(process.cwd(), "assets", company === "hisana" ? "hisanna.jpeg" : "enakko.jpeg"),
        path.join(process.cwd(), "public", "assets", company === "hisana" ? "hisanna.jpeg" : "enakko.jpeg"),
        path.join(__dirname, "..", "assets", company === "hisana" ? "hisanna.jpeg" : "enakko.jpeg"),
      ];

      let logoLoaded = false;
      for (const logoPath of logoPaths) {
        if (fs.existsSync(logoPath)) {
          try {
            doc.image(logoPath, 50, 35, { width: 70 });
            logoLoaded = true;
            break;
          } catch (err) {
            console.log(`Failed to load logo from ${logoPath}:`, err.message);
          }
        }
      }

      if (!logoLoaded) {
        // Draw placeholder jika logo tidak ditemukan
        doc.circle(85, 70, 30).fill("#FFFFFF").opacity(0.3);
        doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(14);
        doc.text(companyDisplay.charAt(0), 78, 60, { align: "center" });
      }

      // Company Name & Title
      doc
        .fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(24)
        .text(companyDisplay, 135, 45)
        .font("Helvetica")
        .fontSize(10)
        .text(companyFullName, 135, 75)
        .font("Helvetica-Bold")
        .fontSize(16)
        .fillColor(theme.accent)
        .text("SLIP THR", doc.page.width - 150, 55, { align: "right", width: 130 })
        .fontSize(10)
        .fillColor("#FFFFFF")
        .text(`Tahun ${normalized.tahun || "-"}`, doc.page.width - 150, 80, { align: "right", width: 130 });

      // Body Container
      const bodyY = 160;
      doc.roundedRect(40, bodyY, doc.page.width - 80, 380, 12).fill("#FFFFFF");
      doc
        .lineWidth(1.5)
        .strokeColor(theme.border)
        .roundedRect(40, bodyY, doc.page.width - 80, 380, 12)
        .stroke();

      // ======================
      // INFORMASI KARYAWAN
      // ======================
      y = bodyY + 25;

      // Section title
      doc.fillColor(theme.primary).font("Helvetica-Bold").fontSize(14).text("DETAIL PENERIMA", 60, y);
      doc
        .moveTo(60, y + 18)
        .lineTo(doc.page.width - 60, y + 18)
        .lineWidth(1)
        .strokeColor(theme.line)
        .stroke();
      y += 35;

      const drawRow = (label, value, xPos, rowY) => {
        doc.fillColor(theme.textSecondary).font("Helvetica").fontSize(9).text(label, xPos, rowY);
        doc
          .fillColor(theme.textMain)
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(value || "-", xPos, rowY + 14);
      };

      drawRow("NAMA LENGKAP", normalized.nama?.toUpperCase() || "-", 60, y);
      drawRow("ID KARYAWAN", normalized.no_induk || "-", 250, y);
      drawRow("PERUSAHAAN", companyDisplay, 440, y);

      y += 48;

      // Divider
      doc
        .moveTo(60, y)
        .lineTo(doc.page.width - 60, y)
        .lineWidth(1)
        .strokeColor(theme.line)
        .stroke();
      y += 25;

      // ======================
      // RINCIAN THR (Box Emas)
      // ======================
      doc.fillColor(theme.primary).font("Helvetica-Bold").fontSize(14).text("NOMINAL TUNJANGAN", 60, y);
      doc
        .moveTo(60, y + 18)
        .lineTo(doc.page.width - 60, y + 18)
        .lineWidth(1)
        .strokeColor(theme.line)
        .stroke();
      y += 40;

      const boxHeight = 110;
      doc.roundedRect(60, y, doc.page.width - 120, boxHeight, 10).fill(theme.bgLight);
      doc
        .lineWidth(1)
        .strokeColor(theme.secondary)
        .roundedRect(60, y, doc.page.width - 120, boxHeight, 10)
        .stroke();

      doc
        .fillColor(theme.primary)
        .font("Helvetica")
        .fontSize(11)
        .text("Total Diterima (Net):", 75, y + 20);

      const thrAmount = rupiah(normalized.jumlah_thr || 0);
      doc
        .fillColor(theme.primary)
        .font("Helvetica-Bold")
        .fontSize(28)
        .text(`Rp ${thrAmount}`, 75, y + 45);

      // Terbilang (opsional, bisa diaktifkan jika diperlukan)
      // doc
      //   .fillColor(theme.textSecondary)
      //   .font("Helvetica-Oblique")
      //   .fontSize(9)
      //   .text("Terbilang: (Sesuai dengan kebijakan perusahaan)", 75, y + 85);

      y += boxHeight + 30;

      // ======================
      // CATATAN
      // ======================
      doc
        .fillColor(theme.textSecondary)
        .font("Helvetica")
        .fontSize(8)
        .text("Catatan:", 60, y)
        .font("Helvetica-Oblique")
        .text("• Tunjangan Hari Raya ini diberikan sebagai bentuk apresiasi perusahaan.", 60, y + 12)
        .text("• Dokumen ini sah dan dihasilkan secara otomatis melalui sistem payroll.", 60, y + 22)
        .text("• Mohon maaf lahir dan batin. Selamat merayakan hari raya.", 60, y + 32);

      y += 60;

      // ======================
      // SIGNATURE SECTION
      // ======================
      const signY = y;
      doc.moveTo(60, signY).lineTo(200, signY).lineWidth(0.5).strokeColor(theme.border).stroke();
      doc.fillColor(theme.textSecondary).font("Helvetica").fontSize(8);
      doc.text("Penerima", 60, signY + 5);

      doc
        .moveTo(doc.page.width - 200, signY)
        .lineTo(doc.page.width - 60, signY)
        .lineWidth(0.5)
        .strokeColor(theme.border)
        .stroke();
      doc.text("Admin Payroll", doc.page.width - 190, signY + 5);

      // ======================
      // FOOTER
      // ======================
      const footerY = doc.page.height - 40;
      doc
        .fontSize(7)
        .fillColor("#94A3B8")
        .text(`ID Transaksi: THR/${companyDisplay}/${normalized.no_induk || "UNK"}/${timestamp}`, 50, footerY, { align: "center", width: doc.page.width - 100 })
        .text(`Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 50, footerY + 12, { align: "center", width: doc.page.width - 100 });

      // ======================
      // WATERMARK (if status is dibatalkan)
      // ======================
      if (normalized.status === "dibatalkan") {
        doc.save();
        doc.rotate(-30, { origin: { x: doc.page.width / 2, y: doc.page.height / 2 } });
        doc.fillColor("#EF4444").opacity(0.15);
        doc.font("Helvetica-Bold").fontSize(60);
        doc.text("DIBATALKAN", doc.page.width / 2 - 100, doc.page.height / 2 - 30);
        doc.restore();
      }

      doc.end();

      stream.on("finish", () => {
        console.log(`✅ THR PDF generated: ${filePath}`);
        resolve(filePath);
      });

      stream.on("error", (err) => {
        console.error(`❌ Stream error:`, err);
        reject(err);
      });
    } catch (err) {
      console.error(`❌ generateTHRPDF error:`, err);
      reject(err);
    }
  });
}

export default generateTHRPDF;
