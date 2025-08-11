import express from 'express';
import { PrismaClient } from '@prisma/client';
import { verifyUser } from '../../../middlewares/verifyUsers.js';
const prisma = new PrismaClient();
const r = express.Router();

const serialize = (data) =>
  JSON.parse(JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));

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
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    

    // Construct full URLs for video and thumbnails depending on storage
    const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:8080';
    const buildS3Url = (bucket, key) => {
      if (!bucket || !key) return null;
      if (process.env.AWS_S3_ENDPOINT) {
        return `${process.env.AWS_S3_ENDPOINT}/${bucket}/${key}`;
      }
      const region = process.env.AWS_REGION || 'us-east-1';
      return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    };

    const buildLocalUrl = (file) => (file ? `${PUBLIC_BASE_URL}/uploads/${file}` : null);

    const serializedRows = rows.map(row => {
      const videoUrl = buildS3Url(row.s3_bucket, row.s3_key) || buildLocalUrl(row.video);
      const thumbnailUrl = buildS3Url(row.s3_bucket, row.s3_thumb_key) || buildLocalUrl(row.thumbnail);

      return {
        ...serialize(row),
        videoUrl,
        thumbnailUrl,
      };
    });

    res.json(serializedRows);
  } catch (error) {
    console.log('Error fetching contents:', error);
    res.status(500).json({ error: 'Failed to fetch contents' });
  }
});

r.get('/:id', async (req, res) => {
  const row = await prisma.content.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(serialize(row)); 
});




export default r;
