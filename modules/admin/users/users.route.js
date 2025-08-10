import express from 'express';
import path from 'path';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { getAllUsers } from './users.controller.js';
import { get } from 'http';
import { verifyUser } from '../../../middlewares/verifyUsers.js';

const prisma = new PrismaClient();
const router = express.Router();

router.get('/allusers',  verifyUser("admin"), getAllUsers);
export default router;
