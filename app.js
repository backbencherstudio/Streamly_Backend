import express from "express";
import cors from "cors";
import morgan from "morgan";
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import path from "path";
import userRoutes from "./modules/user/user.route.js";
import nodeCron from "node-cron";
import { PrismaClient } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();
app.use(
  cors({
    origin: [
      "http://192.168.30.102:3000",    
      "http://localhost:5173",         
      "http://localhost:3000",         
      "http://localhost:8080",         
      "http://127.0.0.1:5500",        
      "https://f7acfea4e102.ngrok-free.app",
      "https://maintenance-genie-72uvp6qac-bbsfullstacks-projects.vercel.app/admin",
      "https://maintenance-genie-bay.vercel.app"
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'], 
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],  
    credentials: true,  
  })
);
//cron job to update subscriptions daily
// Refresh the counter every day at midnight
let counter = 0;
nodeCron.schedule('0 0 * * *', async () => { 
  try {
    const now = new Date();
    console.log(`Daily cron job running at: ${now.toISOString()} - Counter: ${counter++}`);
    const batchSize = 1000; 
    const subscriptionsToUpdate = await prisma.subscription.findMany({
      where: {
        end_date: {
          lte: now,
        },
        status: "Active",
      },
      take: batchSize,
      include: {
        user: {
          select: {
            id: true,
          },
        },
      },
    });
    if (subscriptionsToUpdate.length === 0) {
      console.log("No subscriptions to update today.");
      return;
    }
    const userIds = [...new Set(subscriptionsToUpdate.map((sub) => sub.user.id))];
    await prisma.$transaction([
      prisma.subscription.updateMany({
        where: {
          id: {
            in: subscriptionsToUpdate.map((sub) => sub.id),
          },
        },
        data: {
          status: "Ended",
        },
      }),
      prisma.user.updateMany({
        where: {
          id: {
            in: userIds,
          },
        },
        data: {
          is_subscribed: false,
          role: "normal",
        },
      }),
    ]);
    console.log(
      `Updated ${subscriptionsToUpdate.length} subscriptions and ${userIds.length} users.`
    );
  } catch (error) {
    console.error("Error in daily subscription cleanup:", error);
  }
});
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook') {
    express.raw({ type: 'application/json' })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});

app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use('/api/users', userRoutes);

// app.use('/api/payments', pay);
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use((req, res, next) => {
  res.status(404).json({
    message: `404 route not found`,
  });
});

app.use((err, req, res, next) => {
  res.status(500).json({
    message: `500 Something broken!`,
    error: err.message,
  });
});
app.use(express.static(path.join(__dirname, "public")));
export default app;

