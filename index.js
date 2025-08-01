import { PrismaClient } from "@prisma/client";
import app from "./app.js";

const PORT = process.env.PORT || 8080;

const prisma = new PrismaClient();


app.listen(PORT, async () => {
  try {
    console.log(`Server running on http://localhost:${PORT}`);
    await prisma.$connect();
    console.log("Database connected to prisma");
  } catch (err) {
    console.error("Database connection error:", err);
  }
});