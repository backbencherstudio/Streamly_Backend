// src/prisma/prismaClient.js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Manually connect and log
async function connectDB() {
  try {
    await prisma.$connect();
    console.log('Connected to PostgreSQL via Prisma!');
  } catch (error) {
    console.error('Failed to connect to the database:', error);
    process.exit(1); 
  }
}

module.exports = { prisma, connectDB };
