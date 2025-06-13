const express = require('express');
const session = require('express-session');
const dotenv = require('dotenv');
const { prisma, connectDB } = require('./modules/prisma/prisma');
const userRoutes = require('./modules/user/user.route');
const path = require('path');

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Connect to the database
connectDB();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));




app.get('/', (req, res) => {
  res.send('🚀 Streamly API is running');
});

// User-related routes (e.g., /register, /login)
app.use('/api/users', userRoutes); // 👈 cleaner URL like /api/users/register


// Global 404 fallback
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
