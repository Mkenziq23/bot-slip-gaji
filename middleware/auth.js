export function requireUser(req, res, next) {
  if (!req.session.number && !req.session.admin && !req.session.karyawan) {
    return res.redirect("/");
  }
  next();
}

export function requireOwnership(req, res, next) {
  const requestedUserId = req.params.userId || req.body.user_id;

  // Admin bisa akses semua
  if (req.session.admin) {
    return next();
  }

  // User hanya bisa akses datanya sendiri
  if (req.session.user_id && req.session.user_id == requestedUserId) {
    return next();
  }

  // Karyawan hanya bisa lihat data sendiri
  if (req.session.karyawan && req.session.karyawan.id == requestedUserId) {
    return next();
  }

  return res.status(403).json({ error: "Akses ditolak" });
}
