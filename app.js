import express from "express";
import { Server } from "socket.io";
import cors from "cors";
import morgan from "morgan";
import { fileURLToPath } from "url";
import path from "path";
import userRoutes from "./modules/user/user.route.js";
import nodeCron from "node-cron";
import { PrismaClient } from "@prisma/client";
import uploadsRoutes from "./modules/admin/video_routes/uploads.route.js";
import pay from "./modules/paymnet/stripe.route.js";
import createRoutes from "./modules/admin/create-category/create_category.route.js";
import usermanagementRoutes from "./modules/admin/users/users.route.js";
import ratingRoutes from "./modules/rating/rating.route.js";
import contentsRoute from "./modules/admin/video_routes/contenets.route.js";
import userContentsRoute from "./modules/contents/contents.route.js";
import favouriteRoutes from "./modules/Favourite/favourite.route.js";
import downloadRoutes from "./modules/Download/download.route.js";
import adminSettingsRoutes from "./modules/admin/settings/admin_settigns.route.js";
import supportRoutes from "./modules/helpSupport/support.route.js";
import notificationRoutes from "./modules/notifications/notification.route.js";
import creatorChannelRoutes from "./modules/creator/creator_channel.route.js";
import creatorUploadRoutes from "./modules/creator/uploads/creator_upload.route.js";
import adminCreatorChannelRoutes from "./modules/admin/creator_channels/creator_channels.route.js";
import adminCreatorContentRoutes from "./modules/admin/creator_content/creator_content.route.js";
import { swaggerSpec } from "./swagger/index.js";
import swaggerUi from "swagger-ui-express";
import { sendEmail } from "./utils/mailService.js";
import { emailUnsuspendUser } from "./constants/email_message.js";
import dotenv from "dotenv";
import { setSocketServer } from "./utils/notificationService.js";
import session from "express-session";
import passport from "./config/passport.js"; 
import http from 'http';  
dotenv.config();

const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient();
app.set("json replacer", (key, value) =>
  typeof value === "bigint" ? value.toString() : value
);
BigInt.prototype.toJSON = function () {
  return this.toString();
};
//----------------------initialize socket.io----------------------
export const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  },
});
setSocketServer(io);

//Swagger UI route
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use(
  cors({
    origin: [
      "http://localhost:3001",
      "http://192.168.4.42:3000",
      "http://192.168.4.42:3000/auth/google/callback",
      "http://localhost:5173",
      "http://192.168.4.42:3000",
      "http://localhost:3000",
       "http://localhost:3000/auth",
      "http://192.168.4.42:3000/auth",
      "https://accounts.google.com/o/oauth2/v2/auth",
      "http://localhost:8080",
      "http://127.0.0.1:5500",
      "https://f7acfea4e102.ngrok-free.app",
      "https://decisions-spanish-protecting-anime.trycloudflare.com/api/users/auth/google/callback",
      "https://decisions-spanish-protecting-anime.trycloudflare.com",
      "https://susdent-dashboard-f11o.vercel.app"
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    // allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", ],
    credentials: true,
    preflightContinue: true,
    optionsSuccessStatus: 204,
  })
);
// Session middleware 
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your_secret_key",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === "production" },
  })
);
app.use(passport.initialize());
app.use(passport.session());


//--------------Cron job for subscription cleanup-------------------
let counter = 0;
nodeCron.schedule("0 0 * * *", async () => {
  try {
    const now = new Date();
    console.log(
      `Daily cron job running at: ${now.toISOString()} - Counter: ${counter++}`
    );
    const batchSize = 1000;
    const subscriptionsToUpdate = await prisma.subscription.findMany({
      where: {
        end_date: {
          lte: now,
        },
        status: "active",
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

    const userIds = [
      ...new Set(subscriptionsToUpdate.map((sub) => sub.user.id)),
    ];

    await prisma.$transaction([
      prisma.subscription.updateMany({
        where: { id: { in: subscriptionsToUpdate.map((sub) => sub.id) } },
        data: { status: "expired" },
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

//-----------------Cron job for unsuspend users----------------------
nodeCron.schedule("0 0 * * *", async () => {
  console.log("Cron job triggered at:", new Date().toISOString());
  try {
    const now = new Date();
    console.log(
      `Checking for suspended users to unsuspend at: ${now.toISOString()}`
    );

    const usersToUpdate = await prisma.user.findMany({
      where: {
        status: "suspended",
        suspend_endTime: {
          lte: now,
        },
      },
    });

    if (usersToUpdate.length > 0) {
      console.log(`Found ${usersToUpdate.length} users to unsuspend.`);

      await prisma.user.updateMany({
        where: { id: { in: usersToUpdate.map((user) => user.id) } },
        data: { status: "active", suspend_endTime: null },
      });

      for (const user of usersToUpdate) {
        const emailContent = emailUnsuspendUser(user.email);
        await sendEmail(
          user.email,
          "Your Account Has Been Reactivated",
          emailContent
        );
        console.log(`Email sent to ${user.email}`);
      }

      console.log(`Unsuspended and notified ${usersToUpdate.length} users.`);
    } else {
      console.log("No users to unsuspend today.");
    }
  } catch (error) {
    console.error("Error in cron job:", error);
  }
});

//-------------------Cron job for user reactivation-------------------
nodeCron.schedule("0 0 * * *", async () => {
  try {
    const now = new Date();
    console.log(`Cron job running at: ${now.toISOString()}`);

    const usersToUpdate = await prisma.user.findMany({
      where: {
        status: "deactivated",
        deactivation_end_date: {
          lte: now,
        },
      },
    });

    if (usersToUpdate.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: usersToUpdate.map((user) => user.id) } },
        data: {
          status: "active",
          deactivation_start_date: null,
          deactivation_end_date: null,
        },
      });

      for (const user of usersToUpdate) {
        const emailContent = emailReactivateUser(user.email);
        await sendEmail(
          user.email,
          "Your Account Has Been Reactivated",
          emailContent
        );
        console.log(`Email sent to ${user.email}`);
      }

      console.log(`Reactivated and notified ${usersToUpdate.length} users.`);
    } else {
      console.log("No users to reactivate.");
    }
  } catch (error) {
    console.error("Error in reactivation cron job:", error);
  }
});

//-------------------JSON parser + Webhook exception-------------------
app.use((req, res, next) => {
  if (req.originalUrl === "/api/payments/webhook") {
    express.raw({ type: "application/json" })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});

app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

//Use routes
app.use("/api/users", userRoutes);
app.use("/api/users", notificationRoutes);
app.use("/api/uploads", uploadsRoutes);
app.use("/api/contents", contentsRoute);
app.use("/api/contents/user", userContentsRoute);
app.use("/api/payments", pay);
app.use("/api/categories", createRoutes);
app.use("/api/admin/categories", createRoutes);
app.use("/api/admin/user", usermanagementRoutes);
app.use("/api/admin/settings", adminSettingsRoutes);
app.use("/api/ratings", ratingRoutes);
app.use("/api/favourites", favouriteRoutes);
app.use("/api/downloads", downloadRoutes);
app.use("/api/storage", downloadRoutes);
app.use("/api/support", supportRoutes);

// Creator flow
app.use("/api/creator", creatorChannelRoutes);
app.use("/api/creator/uploads", creatorUploadRoutes);
app.use("/api/admin/creator", adminCreatorChannelRoutes);
app.use("/api/admin/creator", adminCreatorContentRoutes);

//Resolve __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//Serve uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

//Root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
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

export default server;
