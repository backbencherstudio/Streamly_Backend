import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

export const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        username: true,
        email: true,
        status: true,
        Subscription: {
          select: {
            status: true,
            end_date: true,
            name: true,
            plan: true,
          },
        },
        PaymentTransaction: {
          select: {
            id: true,
            amount: true,
            status: true,
            created_at: true,
          },
        role: true,
        created_at: true,
        
      },
  }});
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}