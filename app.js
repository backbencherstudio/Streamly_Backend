import express from "express";
import cors from "cors";
import morgan from "morgan";
import { fileURLToPath } from 'url';
import path from "path";
import userRoutes from "./modules/user/user.route.js";
import nodeCron from "node-cron";
import { PrismaClient } from "@prisma/client";
import uploadsRoutes from "./modules/admin/video_routes/uploads.route.js";
import contentsRoutes from "./modules/admin/video_routes/contenets.route.js";
import pay from "./modules/paymnet/stripe.route.js";
import create from "./modules/admin/create-category/create_category.route.js"
import usermanagementRoutes from "./modules/admin/users/users.route.js";
//Import Swagger spec and UI
import { swaggerSpec } from "./swagger/index.js";
import swaggerUi from "swagger-ui-express";

const app = express();
const prisma = new PrismaClient();
app.set('json replacer', (key, value) =>
  typeof value === 'bigint' ? value.toString() : value
);

BigInt.prototype.toJSON = function () { return this.toString(); };
//Swagger UI route
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(
  cors({
    origin: [
      "http://192.168.30.102:3000",
      "http://localhost:5173",
      "http://localhost:3000",
      "http://localhost:8080",
      "http://127.0.0.1:5500",
      "https://f7acfea4e102.ngrok-free.app",
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  })
);

//Cron job
let counter = 0;
nodeCron.schedule('0 * * * *', async () => { 
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
        user: { select: { id: true } },
      },
    });

    if (subscriptionsToUpdate.length === 0) {
      console.log("No subscriptions to update today.");
      return;
    }

    const userIds = [...new Set(subscriptionsToUpdate.map((sub) => sub.user.id))];

    await prisma.$transaction([
      prisma.subscription.updateMany({
        where: { id: { in: subscriptionsToUpdate.map((sub) => sub.id) } },
        data: { status: "Ended" },
      }),
      prisma.user.updateMany({
        where: { id: { in: userIds } },
        data: { is_subscribed: false, role: "normal" },
      }),
    ]);

    console.log(
      `Updated ${subscriptionsToUpdate.length} subscriptions and ${userIds.length} users.`
    );
  } catch (error) {
    console.error("Error in daily subscription cleanup:", error);
  }
});

//JSON parser + Webhook exception
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook') {
    express.raw({ type: 'application/json' })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});

app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

//Use routes
app.use('/api/users', userRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/contents', contentsRoutes);
app.use('/api/payments', pay);
app.use('/api/admin/services', create);
app.use('/api/admin/user', usermanagementRoutes);
//Resolve __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//Serve uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

//Root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

//Error handling
app.use((req, res, next) => {
  res.status(404).json({ message: `404 route not found` });
});

app.use((err, req, res, next) => {
  res.status(500).json({
    message: `500 Something broken!`,
    error: err.message,
  });
});

app.use(express.static(path.join(__dirname, "public")));

export default app;
