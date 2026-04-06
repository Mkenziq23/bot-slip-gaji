// server/routes/LokasiStoreRoutes.js - WITH USER ID FILTER
import express from "express";
import db from "../db.js"; // Langsung gunakan pool yang sudah ada

const router = express.Router();

// Helper: Get table name based on company
function getTableName(company) {
  if (company === "hisana") return "lokasi_store_hisana";
  if (company === "enakko") return "lokasi_store_enakko";
  throw new Error("Invalid company");
}

// Helper: Get user_id from session
function getUserId(req) {
  // Prioritas: user_id dari session (QR login) atau admin id
  if (req.session.user_id) return req.session.user_id;
  if (req.session.admin && req.session.admin.id) return req.session.admin.id;
  return null;
}

// Helper: Check if user is superadmin
async function isSuperAdmin(userId) {
  if (!userId) return false;
  try {
    const [rows] = await db.query(`SELECT role FROM users WHERE id = ? AND role = 'superadmin'`, [userId]);
    return rows.length > 0;
  } catch (error) {
    console.error("Error checking superadmin:", error);
    return false;
  }
}

// =============================
// GET ALL LOKASI STORE (FILTER BY USER)
// =============================
router.get("/", async (req, res) => {
  const { company } = req.query;
  const userId = getUserId(req);

  console.log(`[LOKASI] GET all - company: ${company}, userId: ${userId}`);

  if (!company || (company !== "hisana" && company !== "enakko")) {
    return res.status(400).json({
      success: false,
      message: 'Parameter company tidak valid. Gunakan "hisana" atau "enakko"',
    });
  }

  try {
    const tableName = getTableName(company);
    const isSuper = await isSuperAdmin(userId);

    let query = `
      SELECT id, nama_store, alamat, latitude, longitude, user_id, created_at, updated_at 
      FROM ${tableName} 
    `;
    let params = [];

    // Filter by user_id jika bukan superadmin
    if (!isSuper && userId) {
      query += ` WHERE user_id = ? OR user_id IS NULL`;
      params.push(userId);
    }

    query += ` ORDER BY nama_store ASC`;

    const [rows] = await db.query(query, params);

    console.log(`[LOKASI] Found ${rows.length} records for user ${userId || "all"}`);
    res.json(rows);
  } catch (error) {
    console.error("[LOKASI] Error getting data:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data lokasi store: " + error.message,
      error: error.message,
    });
  }
});

// =============================
// GET SINGLE LOKASI STORE BY ID
// =============================
router.get("/:id", async (req, res) => {
  const { company } = req.query;
  const { id } = req.params;
  const userId = getUserId(req);

  if (!company || (company !== "hisana" && company !== "enakko")) {
    return res.status(400).json({
      success: false,
      message: "Parameter company tidak valid",
    });
  }

  try {
    const tableName = getTableName(company);
    const isSuper = await isSuperAdmin(userId);

    let query = `
      SELECT id, nama_store, alamat, latitude, longitude, user_id, created_at, updated_at 
      FROM ${tableName} 
      WHERE id = ?
    `;
    let params = [id];

    // Filter by user_id jika bukan superadmin
    if (!isSuper && userId) {
      query += ` AND (user_id = ? OR user_id IS NULL)`;
      params.push(userId);
    }

    const [rows] = await db.query(query, params);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Data lokasi store tidak ditemukan",
      });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Error getting lokasi store by id:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data lokasi store",
      error: error.message,
    });
  }
});

// =============================
// CREATE NEW LOKASI STORE
// =============================
router.post("/", async (req, res) => {
  const { company } = req.query;
  const { nama_store, alamat, latitude, longitude } = req.body;
  const userId = getUserId(req);

  console.log(`[LOKASI] POST - company: ${company}, userId: ${userId}`);

  if (!company || (company !== "hisana" && company !== "enakko")) {
    return res.status(400).json({
      success: false,
      message: "Parameter company tidak valid",
    });
  }

  if (!nama_store || !alamat || latitude === undefined || longitude === undefined) {
    return res.status(400).json({
      success: false,
      message: "Semua field (nama_store, alamat, latitude, longitude) wajib diisi",
    });
  }

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);

  if (isNaN(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({
      success: false,
      message: "Latitude tidak valid. Harus angka antara -90 hingga 90",
    });
  }

  if (isNaN(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({
      success: false,
      message: "Longitude tidak valid. Harus angka antara -180 hingga 180",
    });
  }

  try {
    const tableName = getTableName(company);
    const isSuper = await isSuperAdmin(userId);

    // Cek duplikasi nama untuk user yang sama
    let duplicateQuery = `SELECT id FROM ${tableName} WHERE nama_store = ?`;
    let duplicateParams = [nama_store];

    if (!isSuper && userId) {
      duplicateQuery += ` AND (user_id = ? OR user_id IS NULL)`;
      duplicateParams.push(userId);
    }

    const [existing] = await db.query(duplicateQuery, duplicateParams);

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Nama store "${nama_store}" sudah ada`,
      });
    }

    const [result] = await db.query(
      `INSERT INTO ${tableName} (nama_store, alamat, latitude, longitude, user_id) 
       VALUES (?, ?, ?, ?, ?)`,
      [nama_store, alamat, lat, lng, userId || null],
    );

    res.status(201).json({
      success: true,
      message: "Lokasi store berhasil ditambahkan",
      data: {
        id: result.insertId,
        nama_store,
        alamat,
        latitude: lat,
        longitude: lng,
        user_id: userId,
      },
    });
  } catch (error) {
    console.error("Error creating lokasi store:", error);
    res.status(500).json({
      success: false,
      message: "Gagal menambahkan data lokasi store: " + error.message,
      error: error.message,
    });
  }
});

// =============================
// UPDATE LOKASI STORE
// =============================
router.put("/:id", async (req, res) => {
  const { company } = req.query;
  const { id } = req.params;
  const { nama_store, alamat, latitude, longitude } = req.body;
  const userId = getUserId(req);

  if (!company || (company !== "hisana" && company !== "enakko")) {
    return res.status(400).json({
      success: false,
      message: "Parameter company tidak valid",
    });
  }

  if (!nama_store || !alamat || latitude === undefined || longitude === undefined) {
    return res.status(400).json({
      success: false,
      message: "Semua field (nama_store, alamat, latitude, longitude) wajib diisi",
    });
  }

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);

  if (isNaN(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({
      success: false,
      message: "Latitude tidak valid",
    });
  }

  if (isNaN(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({
      success: false,
      message: "Longitude tidak valid",
    });
  }

  try {
    const tableName = getTableName(company);
    const isSuper = await isSuperAdmin(userId);

    // Cek apakah data ada dan user berhak mengedit
    const [existing] = await db.query(`SELECT id, user_id FROM ${tableName} WHERE id = ?`, [id]);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Data lokasi store tidak ditemukan",
      });
    }

    // Cek kepemilikan data (kecuali superadmin)
    if (!isSuper && existing[0].user_id !== userId && existing[0].user_id !== null) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses untuk mengedit data ini",
      });
    }

    // Cek duplikasi nama (kecuali untuk record yang sama)
    let duplicateQuery = `SELECT id FROM ${tableName} WHERE nama_store = ? AND id != ?`;
    let duplicateParams = [nama_store, id];

    if (!isSuper && userId) {
      duplicateQuery += ` AND (user_id = ? OR user_id IS NULL)`;
      duplicateParams.push(userId);
    }

    const [duplicate] = await db.query(duplicateQuery, duplicateParams);

    if (duplicate.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Nama store "${nama_store}" sudah digunakan`,
      });
    }

    await db.query(
      `UPDATE ${tableName} 
       SET nama_store = ?, alamat = ?, latitude = ?, longitude = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nama_store, alamat, lat, lng, id],
    );

    res.json({
      success: true,
      message: "Lokasi store berhasil diperbarui",
      data: {
        id: parseInt(id),
        nama_store,
        alamat,
        latitude: lat,
        longitude: lng,
      },
    });
  } catch (error) {
    console.error("Error updating lokasi store:", error);
    res.status(500).json({
      success: false,
      message: "Gagal memperbarui data lokasi store: " + error.message,
      error: error.message,
    });
  }
});

// =============================
// DELETE LOKASI STORE
// =============================
router.delete("/:id", async (req, res) => {
  const { company } = req.query;
  const { id } = req.params;
  const userId = getUserId(req);

  if (!company || (company !== "hisana" && company !== "enakko")) {
    return res.status(400).json({
      success: false,
      message: "Parameter company tidak valid",
    });
  }

  try {
    const tableName = getTableName(company);
    const isSuper = await isSuperAdmin(userId);

    // Cek apakah data ada dan user berhak menghapus
    const [existing] = await db.query(`SELECT id, user_id FROM ${tableName} WHERE id = ?`, [id]);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Data lokasi store tidak ditemukan",
      });
    }

    // Cek kepemilikan data (kecuali superadmin)
    if (!isSuper && existing[0].user_id !== userId && existing[0].user_id !== null) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses untuk menghapus data ini",
      });
    }

    await db.query(`DELETE FROM ${tableName} WHERE id = ?`, [id]);

    res.json({
      success: true,
      message: "Lokasi store berhasil dihapus",
    });
  } catch (error) {
    console.error("Error deleting lokasi store:", error);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus data lokasi store: " + error.message,
      error: error.message,
    });
  }
});

// =============================
// GET NEARBY LOCATIONS (DENGAN FILTER USER)
// =============================
router.get("/nearby/:lat/:lng", async (req, res) => {
  const { company } = req.query;
  const { lat, lng } = req.params;
  const radius = req.query.radius || 10;
  const userId = getUserId(req);

  if (!company || (company !== "hisana" && company !== "enakko")) {
    return res.status(400).json({
      success: false,
      message: "Parameter company tidak valid",
    });
  }

  const userLat = parseFloat(lat);
  const userLng = parseFloat(lng);

  if (isNaN(userLat) || isNaN(userLng)) {
    return res.status(400).json({
      success: false,
      message: "Latitude atau longitude tidak valid",
    });
  }

  try {
    const tableName = getTableName(company);
    const isSuper = await isSuperAdmin(userId);

    let query = `
      SELECT 
        id, 
        nama_store, 
        alamat, 
        latitude, 
        longitude,
        user_id,
        (
            6371 * acos(
                cos(radians(?)) * cos(radians(latitude)) *
                cos(radians(longitude) - radians(?)) +
                sin(radians(?)) * sin(radians(latitude))
            )
        ) AS distance
      FROM ${tableName}
    `;
    let params = [userLat, userLng, userLat];
    let whereClause = [];

    // Filter by user_id jika bukan superadmin
    if (!isSuper && userId) {
      whereClause.push(`(user_id = ? OR user_id IS NULL)`);
      params.push(userId);
    }

    if (whereClause.length > 0) {
      query += ` WHERE ` + whereClause.join(" AND ");
    }

    query += ` HAVING distance < ? ORDER BY distance ASC`;
    params.push(radius);

    const [rows] = await db.query(query, params);

    res.json(rows);
  } catch (error) {
    console.error("Error getting nearby locations:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil lokasi terdekat",
      error: error.message,
    });
  }
});

export default router;
