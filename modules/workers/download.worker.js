import 'dotenv/config';
import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { connection } from '../libs/queue.js';
import { s3 } from '../libs/s3Clinent.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { sendNotification } from '../../utils/notificationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// Base directory for downloads (local storage)
const DOWNLOADS_DIR = path.join(process.cwd(), 'downloads');

// Ensure downloads directory exists
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// Helper: Get user's download directory
const getUserDownloadDir = (userId) => {
  const userDir = path.join(DOWNLOADS_DIR, 'users', userId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  return userDir;
};

// Helper: Download from S3 and save to local disk (with resume support)
const downloadFromS3ToLocal = async (s3Key, localPath, onProgress, resumeFromByte = 0) => {
  try {
    // Check if partial file exists and get its size
    let startByte = resumeFromByte;
    if (startByte === 0 && fs.existsSync(localPath)) {
      const stats = fs.statSync(localPath);
      startByte = stats.size;
      console.log(`[Download] Resuming from byte ${startByte}`);
    }

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: s3Key,
      Range: startByte > 0 ? `bytes=${startByte}-` : undefined, // Resume from where it stopped
    });

    const response = await s3.send(command);
    const contentLength = response.ContentLength || 0;
    const totalFileSize = startByte + contentLength; // Total file size
    let downloadedBytes = startByte; // Start counting from resume point

    // Append to existing file if resuming, otherwise create new
    const writeStream = fs.createWriteStream(localPath, {
      flags: startByte > 0 ? 'a' : 'w', // 'a' = append, 'w' = write new
    });
    const readStream = response.Body;

    return new Promise((resolve, reject) => {
      readStream.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const progress = Math.round((downloadedBytes / totalFileSize) * 100);
        if (onProgress) {
          onProgress(downloadedBytes, progress, totalFileSize);
        }
      });

      readStream.on('error', (err) => {
        writeStream.close();
        reject(err);
      });
      
      writeStream.on('error', (err) => {
        readStream.destroy();
        reject(err);
      });
      
      writeStream.on('finish', () => resolve(downloadedBytes));

      readStream.pipe(writeStream);
    });
  } catch (error) {
    console.error('Error downloading from S3:', error);
    throw error;
  }
};

// Create download worker
const downloadWorker = new Worker(
  'downloads',
  async (job) => {
    console.log(`[Download Worker] Processing download job: ${job.id}`, job.data);

    const { downloadId, userId, contentId, quality } = job.data;

    try {
      // Get download and content info
      const download = await prisma.download.findUnique({
        where: { id: downloadId },
        include: {
          content: {
            select: {
              id: true,
              title: true,
              s3_key: true,
              s3_bucket: true,
              file_size_bytes: true,
            },
          },
        },
      });

      if (!download) {
        throw new Error('Download record not found');
      }

      // Update status to downloading
      await prisma.download.update({
        where: { id: downloadId },
        data: {
          status: 'downloading',
          progress: 0,
        },
      });

      console.log(`[Download Worker] Download ${downloadId} started`);

      // Get content's S3 key (original video)
      const s3Key = download.content.s3_key;
      
      if (!s3Key) {
        throw new Error('Content does not have S3 key - cannot download');
      }

      // Generate local file path
      const userDir = getUserDownloadDir(userId);
      const fileName = `${contentId}_${quality}.mp4`;
      const localFilePath = path.join(userDir, fileName);

      // Download from S3 to local disk (resume from previous attempt if any)
      const resumeFromByte = Number(download.downloaded_bytes || 0);
      console.log(`[Download Worker] Downloading from S3: ${s3Key} -> ${localFilePath}`);
      if (resumeFromByte > 0) {
        console.log(`[Download Worker] Resuming from ${resumeFromByte} bytes (${download.progress}%)`);
      }

      const totalBytes = await downloadFromS3ToLocal(
        s3Key,
        localFilePath,
        async (downloadedBytes, progress, totalFileSize) => {
          // Update progress in database
          await prisma.download.update({
            where: { id: downloadId },
            data: {
              progress,
              downloaded_bytes: BigInt(downloadedBytes),
              file_size_bytes: BigInt(totalFileSize),
            },
          });

          // Report progress to queue
          await job.updateProgress(progress);
        },
        resumeFromByte
      );

      // Mark as completed
      const completedDownload = await prisma.download.update({
        where: { id: downloadId },
        data: {
          status: 'completed',
          progress: 100,
          downloaded_bytes: download.file_size_bytes,
          file_path: localFilePath,
        },
      });

      console.log(`[Download Worker] Download ${downloadId} completed successfully at ${localFilePath}`);

      try {
        await sendNotification({
          receiverId: userId,
          type: 'download.completed',
          entityId: downloadId,
          text: download?.content?.title
            ? `Download completed: ${download.content.title}`
            : 'Your download has completed.',
        });
      } catch (e) {
        console.warn('[notify] failed to send download completed notification:', e?.message || e);
      }
      
      return {
        success: true,
        downloadId,
        status: 'completed',
        progress: 100,
        filePath: localFilePath,
      };
    } catch (error) {
      console.error(`[Download Worker] Error processing download ${downloadId}:`, error);

      // Mark download as failed
      try {
        await prisma.download.update({
          where: { id: downloadId },
          data: {
            status: 'failed',
            error_message: error.message,
            failed_count: {
              increment: 1,
            },
          },
        });

        try {
          await sendNotification({
            receiverId: userId,
            type: 'download.failed',
            entityId: downloadId,
            text: 'Your download failed. Please try again.',
          });
        } catch (e) {
          console.warn('[notify] failed to send download failed notification:', e?.message || e);
        }
      } catch (updateError) {
        console.error(`[Download Worker] Failed to update download status:`, updateError);
      }

      throw error; // Fail the job so it can be retried
    }
  },
  {
    connection,
    // Concurrency: process 2 downloads in parallel
    concurrency: 2,
    // Attempt failed jobs 3 times with exponential backoff
    settings: {
      maxStalledCount: 2,
      lockDuration: 30000, // 30 seconds lock
      lockRenewTime: 15000, // Renew lock every 15 seconds
    },
  }
);

// Event handlers
downloadWorker.on('completed', (job) => {
  console.log(`[Download Worker] Job completed: ${job.id}`);
});

downloadWorker.on('failed', (job, err) => {
  console.error(`[Download Worker] Job failed: ${job.id}`, err.message);
});

downloadWorker.on('error', (error) => {
  console.error('[Download Worker] Worker error:', error);
});

downloadWorker.on('closed', () => {
  console.log('[Download Worker] Worker connection closed');
});

console.log('[Download Worker] Download worker started and listening for jobs...');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Download Worker] Received SIGTERM, shutting down gracefully...');
  await downloadWorker.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Download Worker] Received SIGINT, shutting down gracefully...');
  await downloadWorker.close();
  await prisma.$disconnect();
  process.exit(0);
});

export default downloadWorker;
