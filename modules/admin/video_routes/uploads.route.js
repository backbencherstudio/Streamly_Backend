import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { mediaQueue } from '../../libs/queue.js';

const prisma = new PrismaClient();
const router = express.Router();

const uploadDir = path.resolve(process.cwd(), 'tmp_uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 * 1024 },
});

//-----------------upload video and thumbnail-----------------
router.post('/video', upload.fields([
  { name: 'file', maxCount: 1 }, 
  { name: 'thumbnail', maxCount: 1 },  
]), async (req, res, next) => {
  try {
    if (!req.files || !req.files.file) return res.status(400).json({ error: 'Video file is required' });

    const { title, description, genre, category_id , type } = req.body;
    const videoFile = req.files.file[0]; 
    const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null; 

    const content = await prisma.content.create({
      data: {
        title: title ?? null,
        description: description ?? null,
        genre: genre ?? null,
        type:type,
        category_id: category_id,
        content_type: videoFile.mimetype,
        original_name: videoFile.originalname,
        file_size_bytes: BigInt(videoFile.size),
        storage_provider: 'local', 
        content_status: 'uploading_local',
        thumbnail: thumbnailFile ? thumbnailFile.filename : null,
      },
    });

    const videoUrl = `/uploads/videos/${videoFile.filename}`;
    const thumbnailUrl = thumbnailFile ? `/uploads/thumbnails/${thumbnailFile.filename}` : null;

    res.json({
      id: content.id,
      status: content.content_status,
      videoUrl: videoUrl,
      thumbnailUrl: thumbnailUrl,
    });

    await mediaQueue.add('push-to-s3', {
      contentId: content.id,
      localPath: videoFile.path,
      thumbnailPath: thumbnailFile ? thumbnailFile.path : null,
    }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: false,
    });

  } catch (err) {
    next(err);
    console.log('Error uploading video and thumbnail:', err);
  }
});

const app = express();
app.use('/uploads', express.static(path.resolve(process.cwd(), 'tmp_uploads')));

export default router;
