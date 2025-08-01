import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsDir = path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);  
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = uuidv4(); 
    const ext = path.extname(file.originalname);  
    cb(null, `${uniqueSuffix}${ext}`); 
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, 
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif']; 
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type'), false);  
    }
    cb(null, true); 
  }
});

export { upload };
