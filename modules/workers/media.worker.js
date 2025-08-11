import 'dotenv/config';

import { Worker } from 'bullmq';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import util from 'util';
import { Upload } from '@aws-sdk/lib-storage';
import { s3 } from '../libs/s3Clinent.js';
import { PrismaClient } from '@prisma/client';
import { connection } from '../libs/queue.js';

const prisma = new PrismaClient();
const unlink = util.promisify(fs.unlink);
const stat = util.promisify(fs.stat);

const bucket = process.env.AWS_S3_BUCKET;
const partSize = (Number(process.env.UPLOAD_PART_SIZE_MB) || 10) * 1024 * 1024;
const queueSize = Number(process.env.UPLOAD_QUEUE_SIZE) || 4;

// Required environment variables
for (const k of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET']) {
  if (!process.env[k]) {
    console.warn(`[env] Missing ${k} — S3 uploads will fail.`);
  }
}

function secsToTimestamp(s) {
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  return `${h}:${m}:${sec}.000`;
}

async function markFailed(contentId, reason) {
  try {
    await prisma.content.update({
      where: { id: contentId },
      data: { content_status: 'failed', failure_reason: String(reason) },
    });
  } catch {
    await prisma.content.update({
      where: { id: contentId },
      data: { content_status: 'failed' },
    });
  }
}

async function generateChecksum(localPath) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(localPath);
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

// Utility function to upload to S3
// Allows specifying a prefix (e.g. "videos" or "thumbnails")
async function uploadToS3(localPath, contentId, ext, mime, prefix = 'videos') {
  const key = `${prefix}/${contentId}${ext}`;

  const uploader = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(localPath),
      ContentType: mime,
      Metadata: { contentId: String(contentId) },
    },
    queueSize,
    partSize,
    leavePartsOnError: false,
  });

  return new Promise((resolve, reject) => {
    uploader.on('httpUploadProgress', (p) => {
      if (p.loaded && p.total) {
        const progress = Math.floor((p.loaded / p.total) * 100);
        console.log(`Upload Progress: ${progress}%`);
      }
    });

    uploader.done().then(resolve).catch(reject);
  });
}

// Worker for processing media uploads
const worker = new Worker('media', async (job) => {
  if (job.name !== 'push-to-s3') return;
  const { contentId, localPath, thumbnailPath } = job.data;

  let durationSec = 0; 
  try {
    console.log('[job] start', { contentId, localPath, bucket });

    await fs.promises.access(localPath).catch((e) => {
      throw new Error(`LOCAL_FILE_NOT_FOUND:${localPath} -> ${e?.message}`);
    });

    await prisma.content.update({
      where: { id: contentId },
      data: { content_status: 'uploading_s3' },
    });

    const fileInfo = await stat(localPath);
    const ext = path.extname(localPath).toLowerCase();
    const mime = getMimeType(ext);

    const checksum = await generateChecksum(localPath);

    // Upload video to S3/MinIO
    const result = await uploadToS3(localPath, contentId, ext, mime, 'videos');

    // Upload thumbnail if provided
    let thumbResult = null;
    if (thumbnailPath) {
      const thumbExt = path.extname(thumbnailPath).toLowerCase();
      const thumbMime = getMimeType(thumbExt);
      thumbResult = await uploadToS3(thumbnailPath, contentId, thumbExt, thumbMime, 'thumbnails');
    }

    console.log('[s3] done', { ETag: result?.ETag, key: result?.Key });

    await prisma.content.update({
      where: { id: contentId },
      data: {
        content_status: 'processing',
        s3_bucket: bucket,
        s3_key: result?.Key,
        s3_thumb_key: thumbResult?.Key ?? null,
        etag: result?.ETag ?? null,
        checksum_sha256: checksum,
        storage_provider: process.env.AWS_S3_ENDPOINT ? 'minio' : 's3',
      },
    });

    // Cleanup original files
    await unlink(localPath).catch(() => {});
    if (thumbnailPath) await unlink(thumbnailPath).catch(() => {});

    await prisma.content.update({
      where: { id: contentId },
      data: {
        duration: String(Math.round(durationSec || 0)),
        content_status: 'published',
        file_size_bytes: BigInt(fileInfo.size),
      },
    });

    console.log('[job] completed', { contentId });
  } catch (err) {
    console.error('[job] failed:', err?.message || err);
    await markFailed(contentId, err?.message || err);
    throw err;
  }
}, { connection, concurrency: 2 });

worker.on('failed', (job, err) => console.error('[worker] failed event', job?.id, err?.message));
worker.on('completed', (job) => console.log('[worker] completed event', job?.id));

function getMimeType(ext) {
  switch (ext) {
    case '.mp4': return 'video/mp4';
    case '.mov': return 'video/quicktime';
    case '.mkv': return 'video/x-matroska';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    default: return 'application/octet-stream';
  }
}
