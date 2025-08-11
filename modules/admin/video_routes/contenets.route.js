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
    

    // Construct full URLs for video and thumbnails
    const minioEndpoint = process.env.AWS_S3_ENDPOINT || 'http://localhost:9000'; // Default to MinIO if not set
    const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:8080'; // Fallback for local storage

    const serializedRows = rows.map(row => {
      const videoUrl = `${minioEndpoint}/${row.s3_bucket}/${row.s3_key}`;
      const thumbnailUrl = row.s3_thumb_key
        ? `${minioEndpoint}/${row.s3_bucket}/${row.s3_thumb_key}`
        : null;

      return {
        ...serialize(row), // Serialize the content as needed
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
