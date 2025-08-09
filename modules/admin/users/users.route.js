import express from 'express';
import path from 'path';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { getAllUsers } from './users.controller.js';
import { get } from 'http';

const prisma = new PrismaClient();
const router = express.Router();

router.get('/allusers', getAllUsers);
export default router;
