import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

import { verifyUser } from "../../middlewares/verifyUsers.js";
import { verifyCreatorSubscribed } from "../../middlewares/verifyCreatorSubscribed.js";
import {
  createCreatorUpload,
  getCreatorUploadedVideoDetails,
  listCreatorUploads,
} from "./creatorUpload.controller.js";

const router = express.Router();

const uploadDir = path.resolve(process.cwd(), "tmp_uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 * 1024 },
});

router.post(
  "/video",
  verifyUser("ANY"),
  verifyCreatorSubscribed,
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  createCreatorUpload,
);

router.get(
  "/video/details/:id",
  verifyUser("ANY"),
  verifyCreatorSubscribed,
  getCreatorUploadedVideoDetails,
);

router.get(
  "/videos",
  verifyUser("ANY"),
  verifyCreatorSubscribed,
  listCreatorUploads,
);

export default router;
