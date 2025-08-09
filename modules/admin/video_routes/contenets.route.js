import express from 'express';
import { PrismaClient } from '@prisma/client';
import { verifyUser } from '../../../middlewares/verifyUsers.js';
const prisma = new PrismaClient();
const r = express.Router();

const serialize = (data) =>
  JSON.parse(JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));

r.get('/:id', verifyUser("admin"),async (req, res) => {
  const row = await prisma.content.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(serialize(row)); 
});

export default r;
