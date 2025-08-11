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
        name: true,
        email: true,
        status: true,
        role: true,
        created_at: true,
        updated_at: true,
        Subscription: {
          select: {
            status: true,
            start_date: true,
            end_date: true,
            plan: true,
          },
        },
        PaymentTransaction: {
          select: {
            id: true,
             price: true,
            status: true,
            created_at: true,
          },
        
      },
  }});
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
    console.log('Error fetching users:', err);
    
  }
}

export const suspendUser = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await prisma.user.update({
      where: { id: Number(id) },
      data: { status: 'suspended' },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to suspend user' });
    console.log('Error suspending user:', err);
  }
};