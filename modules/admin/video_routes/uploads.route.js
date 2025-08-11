import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { mediaQueue } from '../../libs/queue.js';
import { verifyUser } from '../../../middlewares/verifyUsers.js';

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

router.post('/video', upload.fields([
  { name: 'file', maxCount: 1 }, 
  { name: 'thumbnail', maxCount: 1 } 
]), async (req, res, next) => {
  try {
    if (!req.files || !req.files.file) return res.status(400).json({ error: 'Video file is required' });

    const { title, description, genre, category_id } = req.body;
    const videoFile = req.files.file[0]; 
    const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

    const content = await prisma.content.create({
      data: {
        title: title ?? null,
        description: description ?? null,
        genre: genre ?? null,
        category_id: category_id,
        content_type: videoFile.mimetype,
        original_name: videoFile.originalname,
        file_size_bytes: BigInt(videoFile.size),
        storage_provider: 'local',
        content_status: 'uploading_local',
        thumbnail: thumbnailFile ? thumbnailFile.filename : null,
      },
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

    res.json({ id: content.id, status: content.content_status });
  } catch (err) {
    next(err);
    console.log('Error uploading video and thumbnail:', err);
  }
});


//get all uploads
router.get('/', async (req, res) => {
  try {
    const uploads = await prisma.content.findMany({
      where: { content_status: 'uploading_local' },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        genre: true,
        content_type: true,
        original_name: true,
        file_size_bytes: true,
        created_at: true,
      },
    });
    res.json(uploads);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch uploads' });
  }
});
//get all contents
router.get('/all', async (req, res) => {
  try {
    const contents = await prisma.content.findMany({
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        genre: true,
        content_type: true,
        original_name: true,
        file_size_bytes: true,
        created_at: true,
        content_status: true,
      },
    });
    res.json(contents);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch contents' });
  }
});

export default router;
