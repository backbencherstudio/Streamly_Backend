import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { mediaQueue } from '../../libs/queue.js';

const prisma = new PrismaClient();
const router = express.Router();

// Helper to extract enum values from schema
const getEnumValuesFromSchema = (enumName) => {
  try {
    const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    
    // Match enum block: enum EnumName { value1 value2 ... }
    const enumRegex = new RegExp(`enum\\s+${enumName}\\s*\\{([^}]+)\\}`, 's');
    const match = schema.match(enumRegex);
    
    if (match) {
      // Extract values from enum block
      const values = match[1]
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('//'))
        .map(line => line.split('//')[0].trim()); // Remove comments
      return values.filter(v => v);
    }
    return [];
  } catch (err) {
    console.warn(`Could not fetch enum values for ${enumName}:`, err);
    return [];
  }
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

//-----------------upload video and thumbnail-----------------
router.post('/video', upload.fields([
  { name: 'file', maxCount: 1 }, 
  { name: 'thumbnail', maxCount: 1 },  
]), async (req, res, next) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'Video file is required' });
    }

    const videoFile = req.files.file[0]; 
    const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null; 

    // Extract fields from request body
    const { 
      title, 
      description, 
      genre,           // Can be single genre or comma-separated list
      category_id, 
      content_type,    // movie | series | episode | trailer
      quality,         // 4k | 1080p | 720p | 480p
      is_premium,      // true | false
      // Series/episode fields
      series_id,       // For episodes: parent content ID
      season_number,   // For episodes: season number
      episode_number,  // For episodes: episode number
      // Trailer fields
      trailer_for_id,  // For trailers: content this trailer is for (movie, series, or episode)
      release_date,    // ISO date string
    } = req.body;

    // Validation
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!category_id) {
      return res.status(400).json({ error: 'Category is required' });
    }

    const contentTypeValue = content_type || 'movie';

    // Validate episode requirements
    if (contentTypeValue === 'episode') {
      if (!series_id) {
        return res.status(400).json({ error: 'series_id is required for episodes' });
      }
      if (!season_number || !episode_number) {
        return res.status(400).json({ error: 'season_number and episode_number are required for episodes' });
      }
    }

    // Validate trailer requirements
    if (contentTypeValue === 'trailer') {
      if (!trailer_for_id) {
        return res.status(400).json({ error: 'trailer_for_id is required for trailers (content ID of movie/series/episode this trailer is for)' });
      }
    }

    // Parse genre (convert comma-separated string to array, or single genre to array)
    let genreArray = [];
    if (genre) {
      if (typeof genre === 'string') {
        genreArray = genre.split(',').map(g => g.trim());
      } else if (Array.isArray(genre)) {
        genreArray = genre.map(g => String(g).trim());
      }
    }

    // Create content record
    const content = await prisma.content.create({
      data: {
        title,
        description: description ?? null,
        genre: genreArray.length > 0 ? genreArray : [],
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
        // Series/episode fields
        series_id: series_id ?? null,
        season_number: season_number ? parseInt(season_number) : null,
        episode_number: episode_number ? parseInt(episode_number) : null,
        // Trailer field
        trailer_for_id: trailer_for_id ?? null,
        release_date: release_date ? new Date(release_date) : null,
      },
    }).catch((err) => {
      // Handle Prisma validation errors (invalid enums, etc.)
      if (err.message.includes('Invalid enum value') || err.message.includes('Invalid value for argument')) {
        let errorMsg = 'Invalid enum value: ';
        
        if (err.message.includes('genre')) {
          const genraValues = getEnumValuesFromSchema('Genra');
          errorMsg += `genre must be one of: [${genraValues.join(', ')}]`;
        } else if (err.message.includes('content_type')) {
          const contentTypeValues = getEnumValuesFromSchema('ContentType');
          errorMsg += `content_type must be one of: [${contentTypeValues.join(', ')}]`;
        } else if (err.message.includes('content_status')) {
          const contentStatusValues = getEnumValuesFromSchema('Content_status');
          errorMsg += `content_status must be one of: [${contentStatusValues.join(', ')}]`;
        } else {
          errorMsg += err.message;
        }
        
        throw { status: 400, message: errorMsg };
      }
      if (err.code === 'P2025') {
        throw { status: 404, message: 'Category not found' };
      }
      throw err;
    });

    const videoUrl = `/uploads/videos/${videoFile.filename}`;
    const thumbnailUrl = thumbnailFile ? `/uploads/thumbnails/${thumbnailFile.filename}` : null;

    res.json({
      id: content.id,
      status: content.content_status,
      content_type: content.content_type,
      title: content.title,
      genre: content.genre,
      videoUrl,
      thumbnailUrl,
      message: 'Upload initiated. Processing in background.',
    });

    // Queue for S3 upload and processing
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
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
    console.error('Error uploading video and thumbnail:', err);
  }
});

const app = express();
app.use('/uploads', express.static(path.resolve(process.cwd(), 'tmp_uploads')));

//-----------------Get upload status-----------------
router.get('/status/:id', async (req, res, next) => {
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
