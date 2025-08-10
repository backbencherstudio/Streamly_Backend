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
  limits: { fileSize: 30 * 1024 * 1024 * 1024 }, // 30 GB
});
router.post('/video', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' });

    const { title, description, genre } = req.body;
    const f = req.file;

    const content = await prisma.content.create({
      data: {
        title: title ?? null,
        description: description ?? null,
        genre: genre ?? null,
        content_type: f.mimetype,
        original_name: f.originalname,
        file_size_bytes: BigInt(f.size),
        storage_provider: 'local',
        content_status: 'uploading_local',
      },
    });

    await mediaQueue.add('push-to-s3', {
      contentId: content.id,
      localPath: f.path,
    }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: false,
    });

    res.json({ id: content.id, status: content.content_status });
  } catch (err) {
    next(err);
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
