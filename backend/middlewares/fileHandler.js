import multer from "multer";
import fs from "fs";
import path from "path";
import buildResponse from "../utils/responseBuilder.js";

/**
 * 🧱 File Type Map
 * ----------------
 * Define allowed MIME types and their extensions.
 */
const FILE_TYPES = {
  image: ["image/jpeg", "image/png", "image/jpg", "image/webp"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  excel: [
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  any: [], // fallback
};

/**
 * 📦 Storage configuration
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const baseDir = "uploads";
    const subFolder = req.uploadType || "misc";
    const uploadPath = path.join(baseDir, subFolder, new Date().getFullYear().toString());

    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

/**
 * 🔐 File filter based on upload type
 */
const fileFilter = (req, file, cb) => {
  const uploadType = req.uploadType || "any";
  const allowed = FILE_TYPES[uploadType];

  if (!allowed.length || allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type for ${uploadType}`), false);
  }
};

/**
 * 🧰 Universal file uploader
 * --------------------------
 * Example usage:
 *   fileHandler("image").single("photo")
 *   fileHandler("excel").single("file")
 */
export const fileHandler = (uploadType = "any") => {
  return (req, res, next) => {
    req.uploadType = uploadType;

    const upload = multer({
      storage,
      fileFilter,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    }).single("file");

    upload(req, res, (err) => {
      if (err) {
        console.error("❌ Upload error:", err.message);
        return buildResponse(res, 400, err.message, null, true, err);
      }
      next();
    });
  };
};

/**
 * 📥 Secure File Downloader
 * -------------------------
 * Serves any uploaded file securely, with role verification.
 */
export const downloadFile = async (req, res) => {
  try {
    const { folder, year, filename } = req.params;
    const filePath = path.join("uploads", folder, year, filename);

    if (!fs.existsSync(filePath)) {
      return buildResponse(res, 404, "File not found");
    }

    // Optional: restrict who can download what (basic check)
    const allowedRoles = ["admin", "hod", "lecturer", "student"];
    if (!allowedRoles.includes(req.user.role)) {
      return buildResponse(res, 403, "Access denied: not authorized");
    }

    res.download(filePath);
  } catch (error) {
    console.error("❌ Download error:", error);
    return buildResponse(res, 500, "File download failed", null, true, error);
  }
};


export default fileHandler;
