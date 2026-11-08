
import multer from "multer";
import path from "path";
import fs from "fs";

// Vercel allows temporary file storage only in /tmp.
const uploadPath =
  process.env.VERCEL === "1"
    ? "/tmp/uploads"
    : path.join(process.cwd(), "uploads");

// Create the upload directory if it doesn't exist.
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadPath);
  },

  filename: function (req, file, cb) {
    const unique =
      Date.now() + "-" + Math.round(Math.random() * 1e9);

    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
});

export default upload;
