import express from 'express';
import path from 'path';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createService , getAllServices } from './create_category.controller.js';
import { get } from 'http';

const prisma = new PrismaClient();
const router = express.Router();

router.post('/create_service', createService);
router.get('/services', getAllServices);
export default router;
