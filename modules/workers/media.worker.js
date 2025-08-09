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
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

const prisma = new PrismaClient();
const unlink = util.promisify(fs.unlink);
const stat = util.promisify(fs.stat);

const bucket = process.env.AWS_S3_BUCKET;
const partSize = (Number(process.env.UPLOAD_PART_SIZE_MB) || 10) * 1024 * 1024;
const queueSize = Number(process.env.UPLOAD_QUEUE_SIZE) || 4;

//required environment variables
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
      data: { content_status: 'failed', failure_reason: String(reason) }, // if column exists
    });
  } catch {
    // fallback if failure_reason column does not exist
    await prisma.content.update({
      where: { id: contentId },
      data: { content_status: 'failed' },
    });
  }
}

// worker for processing media uploads
const worker = new Worker('media', async (job) => {
  if (job.name !== 'push-to-s3') return;
  const { contentId, localPath } = job.data;

  try {
    console.log('[job] start', { contentId, localPath, bucket });

    // 0) file must exist where the worker runs
    await fs.promises.access(localPath).catch((e) => {
      throw new Error(`LOCAL_FILE_NOT_FOUND:${localPath} -> ${e?.message}`);
    });

    await prisma.content.update({
      where: { id: contentId },
      data: { content_status: 'uploading_s3' },
    });

    const fileInfo = await stat(localPath);
    const ext = path.extname(localPath).toLowerCase();
    const key = `videos/${contentId}${ext}`;

    const mime =
      ext === '.mp4' ? 'video/mp4' :
      ext === '.mov' ? 'video/quicktime' :
      ext === '.mkv' ? 'video/x-matroska' :
      'application/octet-stream';

    // checksum
    const checksum = await new Promise((resolve, reject) => {
      const h = crypto.createHash('sha256');
      const s = fs.createReadStream(localPath);
      s.on('data', (d) => h.update(d));
      s.on('end', () => resolve(h.digest('hex')));
      s.on('error', reject);
    });

    const uploader = new Upload({
      client: s3,
      params: {
        Bucket: bucket,
        Key: key,
        Body: fs.createReadStream(localPath),
        ContentType: mime,
        Metadata: { contentId: String(contentId) }, // S3 metadata must be strings
      },
      queueSize,
      partSize,
      leavePartsOnError: false,
    });

    uploader.on('httpUploadProgress', (p) => {
      if (p.loaded && p.total) job.updateProgress(Math.floor((p.loaded / p.total) * 100));
    });

    const result = await uploader.done();
    console.log('[s3] done', { ETag: result?.ETag, key });

    await prisma.content.update({
      where: { id: contentId },
      data: {
        content_status: 'processing',
        s3_bucket: bucket,
        s3_key: key,
        etag: result?.ETag ?? null,
        checksum_sha256: checksum,
        storage_provider: process.env.AWS_S3_ENDPOINT ? 'local' : 's3', // MinIO vs AWS
      },
    });

    // thumbnails — non-blocking
    let durationSec = 0;
    let thumbLocal = null;
    try {
      ({ durationSec, thumbLocal } = await extractThumb(localPath));
      if (thumbLocal) {
        const thumbKey = `thumbnails/${contentId}.jpg`;
        await new Upload({
          client: s3,
          params: {
            Bucket: bucket,
            Key: thumbKey,
            Body: fs.createReadStream(thumbLocal),
            ContentType: 'image/jpeg',
          },
        }).done();
        await prisma.content.update({
          where: { id: contentId },
          data: { s3_thumb_key: thumbKey },
        });
        await unlink(thumbLocal).catch(() => {});
      }
    } catch (e) {
      console.warn('[thumb] skipped:', e?.message);
    }

    // cleanup original
    await unlink(localPath).catch(() => {});

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

function extractThumb(inputPath) {
  return new Promise((resolve, reject) => {
    const out = inputPath + '.thumb.jpg';
    ffmpeg.ffprobe(inputPath, (err, meta) => {
      if (err) return reject(err);
      const durationSec = Number(meta?.format?.duration || 0);
      const t = Math.max(1, Math.floor(durationSec * 0.10));
      ffmpeg(inputPath)
        .on('end', () => resolve({ durationSec, thumbLocal: out }))
        .on('error', reject)
        .screenshots({
          count: 1,
          timemarks: [secsToTimestamp(t)],
          filename: path.basename(out),
          folder: path.dirname(out),
          size: '640x?',
        });
    });
  });
}
