// /modules/scripts/s3-smoke-test.js
import 'dotenv/config';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

function envBool(v) {
  if (v === undefined) return undefined;
  return String(v).toLowerCase() === 'true';
}

const region = process.env.AWS_REGION;
const endpoint = process.env.AWS_S3_ENDPOINT || undefined;        // MinIO: http://localhost:9000  | AWS: leave empty
const forcePathStyle = envBool(process.env.AWS_S3_FORCE_PATH_STYLE); // MinIO: true                 | AWS: false
const bucket = process.env.AWS_S3_BUCKET;

if (!bucket) {
  console.error('❌ Missing AWS_S3_BUCKET env');
  process.exit(1);
}

const s3 = new S3Client({
  region,
  endpoint,
  forcePathStyle,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const Key = `healthcheck-${Date.now()}.txt`;
const Body = `ok ${new Date().toISOString()}`;

async function readStreamToString(stream) {
  const chunks = [];
  for await (const chunk of stream instanceof Readable ? stream : stream.Body) chunks.push(chunk);
  return Buffer.concat(chunks.map(c => Buffer.isBuffer(c) ? c : Buffer.from(c))).toString('utf8');
}

(async () => {
  try {
    console.log('🔎 Config:', { region, endpoint, forcePathStyle, bucket });

    // 1) Put
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key, Body }));
    console.log('✅ PutObject ok ->', Key);

    // 2) Get (optional)
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key }));
    const text = await readStreamToString(res.Body);
    console.log('✅ GetObject ok ->', text);

    console.log('🎉 Smoke test passed.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Smoke test failed:', err?.name, err?.message);
    // Helpful hints
    if (String(err?.message || '').includes('NoSuchBucket'))
      console.error('👉 Create the bucket in MinIO/AWS first:', bucket);
    if (String(err?.message || '').includes('ECONNREFUSED'))
      console.error('👉 Is MinIO running on the endpoint? (docker compose up)');
    if (String(err?.message || '').includes('AccessDenied'))
      console.error('👉 Check access key/secret and bucket policy.');
    process.exit(1);
  }
})();
