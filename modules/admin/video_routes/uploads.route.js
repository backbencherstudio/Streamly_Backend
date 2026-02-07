import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { mediaQueue } from '../../libs/queue.js';
import { verifyAdmin } from '../../../middlewares/verifyAdmin.js';

const prisma = new PrismaClient();
const router = express.Router();

const slugToArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
};

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

const buildTypeDetails = ({ content_type, series_id, season_number, episode_number, trailer_for_id }) => {
  if (content_type === 'episode') {
    return {
      episode: {
        season_number,
        episode_number,
        series: series_id ? { id: series_id } : null,
      },
    };
  }
  if (content_type === 'trailer') {
    return {
      trailer: {
        for: trailer_for_id ? { id: trailer_for_id } : null,
      },
    };
  }
  return {};
};

const createAdminUpload = async (req, res, next) => {
  try {
    const adminUserId = req.user?.id;
    if (!adminUserId) return res.status(401).json({ message: 'Unauthenticated' });

    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'Video file is required' });
    }

    const videoFile = req.files.file[0];
    const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

    const {
      title,
      description,
      genre,
      category_id,
      content_type,
      quality,
      is_premium,
      series_id,
      season_number,
      episode_number,
      trailer_for_id,
      release_date,
    } = req.body;

    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (!category_id) return res.status(400).json({ error: 'Category is required' });

    const contentTypeValue = content_type || 'movie';

    if (contentTypeValue === 'episode') {
      if (!series_id) {
        return res.status(400).json({ error: 'series_id is required for episodes' });
      }
      if (!season_number || !episode_number) {
        return res.status(400).json({
          error: 'season_number and episode_number are required for episodes',
        });
      }

      const series = await prisma.content.findFirst({
        where: {
          id: String(series_id),
          deleted_at: null,
          content_type: 'series',
        },
        select: { id: true },
      });
      if (!series) {
        return res.status(400).json({
          error: 'series_id does not reference a valid series',
          code: 'SERIES_NOT_FOUND',
        });
      }
    }

    if (contentTypeValue === 'trailer') {
      if (trailer_for_id) {
        const referencedContent = await prisma.content.findFirst({
          where: {
            id: String(trailer_for_id),
            deleted_at: null,
          },
          select: { id: true },
        });
        if (!referencedContent) {
          return res.status(400).json({
            error: 'trailer_for_id does not reference a valid content',
          });
        }
      }
    }

    const genreArray = slugToArray(genre);

    const content = await prisma.content.create({
      data: {
        title,
        description: description ?? null,
        genre: genreArray.length ? genreArray : [],
        category_id,
        content_type: contentTypeValue,
        mime_type: videoFile.mimetype,
        quality: quality ?? null,
        is_premium: is_premium === 'true' || is_premium === true,
        original_name: videoFile.originalname,
        file_size_bytes: BigInt(videoFile.size),
        storage_provider: 'local',
        content_status: 'uploading_local',
        thumbnail: thumbnailFile ? thumbnailFile.filename : null,
        series_id: series_id ?? null,
        season_number: season_number ? parseInt(season_number) : null,
        episode_number: episode_number ? parseInt(episode_number) : null,
        trailer_for_id: trailer_for_id ?? null,
        release_date: release_date ? new Date(release_date) : null,

        created_by_user_id: adminUserId,
        // review_status defaults to approved in schema
      },
    });

    const created = {
      id: content.id,
      basic: {
        title: content.title,
        description: content.description,
        content_type: content.content_type,
        quality: content.quality,
        release_date: content.release_date,
        is_premium: content.is_premium,
        category_id: content.category_id,
      },
      status: {
        content_status: content.content_status,
        review_status: content.review_status,
      },
      ...buildTypeDetails({
        content_type: content.content_type,
        series_id: content.series_id,
        season_number: content.season_number,
        episode_number: content.episode_number,
        trailer_for_id: content.trailer_for_id,
      }),
      timestamps: {
        created_at: content.created_at,
        updated_at: content.updated_at,
      },
    };

    res.status(201).json({
      success: true,
      message: 'Upload initiated. Processing in background.',
      content: created,
    });

    await mediaQueue.add(
      'push-to-s3',
      {
        contentId: content.id,
        localPath: videoFile.path,
        thumbnailPath: thumbnailFile ? thumbnailFile.path : null,
      },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  } catch (err) {
    next(err);
  }
};

//-----------------upload video and thumbnail-----------------
router.post(
  '/video',
  verifyAdmin,
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  createAdminUpload,
);

//-----------------Get upload status-----------------
router.get('/status/:id', verifyAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const content = await prisma.content.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        content_type: true,
        content_status: true,
        storage_provider: true,
        s3_bucket: true,
        s3_key: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    res.json(content);
  } catch (err) {
    next(err);
    console.error('Error fetching upload status:', err);
  }
});

export default router;
