import { S3Client } from '@aws-sdk/client-s3';

const endpoint = process.env.AWS_S3_ENDPOINT || undefined;
const forcePathStyle = String(process.env.AWS_S3_FORCE_PATH_STYLE) === 'true';

export const s3 = new S3Client({
  region: process.env.AWS_REGION,
  endpoint,                // used for MinIO; undefined for AWS
  forcePathStyle,          // true for MinIO; false for AWS
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});
