const express = require('express');
const dotenv = require('dotenv');
const { prisma, connectDB } = require('./modules/prisma/prisma'); 

dotenv.config();

const app = express();
app.use(express.json());

//Connect to DB and log status
connectDB();

// Sample route
app.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
