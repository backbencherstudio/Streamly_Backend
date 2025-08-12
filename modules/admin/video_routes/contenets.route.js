import express from 'express';
import { PrismaClient } from '@prisma/client';
import { verifyUser } from '../../../middlewares/verifyUsers.js';  // Assuming you are using it elsewhere
const prisma = new PrismaClient();
const r = express.Router();

const serialize = (data) =>
  JSON.parse(JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));

// Helper function to build the S3 URL
const buildS3Url = (bucket, key) => {
  if (!bucket || !key) return null;
  if (process.env.AWS_S3_ENDPOINT) {
    return `${process.env.AWS_S3_ENDPOINT}/${bucket}/${key}`;
  }
  const region = process.env.AWS_REGION || 'us-east-1';
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

// Helper function to build local file URL
const buildLocalUrl = (file) => {
  const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:4005';
  return file ? `${PUBLIC_BASE_URL}/uploads/${file}` : null;
};

// Route to get all contents
r.get('/allContents', async (req, res) => {
  try {
    const rows = await prisma.content.findMany({
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        title: true,
        genre: true,
        content_type: true,
        original_name: true,
        type: true,
        file_size_bytes: true,
        status: true,
        created_at: true,
        content_status: true,
        view_count: true,
        s3_bucket: true,
        s3_key: true,
        s3_thumb_key: true,
        video: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const serializedRows = rows.map((row) => {
      // Construct full URLs for video and thumbnails depending on storage
      const videoUrl = buildS3Url(row.s3_bucket, row.s3_key) || buildLocalUrl(row.video);
      const thumbnailUrl = buildS3Url(row.s3_bucket, row.s3_thumb_key) || buildLocalUrl(row.thumbnail);
      const  thumbnail = thumbnailUrl ? thumbnailUrl : null;

      return {
        ...serialize(row),
        videoUrl,
        thumbnail,
      };
    });

    res.json(serializedRows);
  } catch (error) {
    console.log('Error fetching contents:', error);
    res.status(500).json({ error: 'Failed to fetch contents' });
  }
});

// Route to get content by ID
r.get('/:id', async (req, res) => {
  try {
    const row = await prisma.content.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'not found' });

    // Construct the full URLs
    const videoUrl = buildS3Url(row.s3_bucket, row.s3_key) || buildLocalUrl(row.video);
    const thumbnailUrl = buildS3Url(row.s3_bucket, row.s3_thumb_key) || buildLocalUrl(row.thumbnail);

    // Add the URLs to the response
    res.json({
      ...serialize(row),
      video: videoUrl,
      thumbnail: thumbnailUrl,
    });
  } catch (error) {
    console.log('Error fetching content:', error);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

export default r;
