import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { apiRouter } from "./routes/api.routes";
import { errorHandler } from "./middleware/auth";

const PORT = Number(process.env.PORT || 5000);
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/unicafe?replicaSet=rs0";

const app = express();

// Middlewares
app.use(
  cors({
    origin: [
      process.env.APP_URL || "http://localhost:3000",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      /\.vercel\.app$/,
    ],
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "unicafe-backend",
    version: "1.0.0",
    database: mongoose.connection.readyState === 1 ? "connected" : "connecting",
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use("/api", apiRouter);

// Global Error Handler
app.use(errorHandler);

async function start() {
  console.log("\n=======================================================");
  console.log("       ☕ UNICAFE STANDALONE BACKEND SERVICE");
  console.log("=======================================================\n");

  try {
    console.log("Connecting to MongoDB:", MONGODB_URI.replace(/:[^:@]+@/, ":****@"));
    await mongoose.connect(MONGODB_URI);
    console.log("✅ MongoDB Connected successfully.\n");
  } catch (err) {
    console.warn("⚠️ Warning: Initial MongoDB connection deferred:", err);
  }

  app.listen(PORT, () => {
    console.log(`🚀 UniCafe Backend API listening on port ${PORT}`);
    console.log(`   Health Check: http://localhost:${PORT}/health`);
    console.log(`   API Endpoint: http://localhost:${PORT}/api\n`);
  });
}

start().catch((err) => {
  console.error("Fatal Server Startup Error:", err);
  process.exit(1);
});

