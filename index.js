import { PrismaClient } from "@prisma/client";
import app from "./app.js";
import { spawn } from 'node:child_process';




const PORT = process.env.PORT || 4005;

const prisma = new PrismaClient();

// Start media upload worker
const mediaWorker = spawn(process.execPath, ['./modules/workers/media.worker.js'], {
  stdio: 'inherit',
  env: process.env,
});

// Start download worker
const downloadWorker = spawn(process.execPath, ['./modules/workers/download.worker.js'], {
  stdio: 'inherit',
  env: process.env,
});

app.listen(PORT, async () => {
  try {
    console.log(`Server running on http://localhost:${PORT}`);
    await prisma.$connect();
    console.log("Database connected to prisma");
  } catch (err) {
    console.error("Database connection error:", err);
  }
});
