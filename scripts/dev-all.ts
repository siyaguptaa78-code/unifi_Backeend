import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { MongoMemoryReplSet } from "mongodb-memory-server";

async function main() {
  const dbPath = path.resolve(process.cwd(), ".local-db");
  if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });

  console.log("\n=======================================================");
  console.log("       ☕ UNICAFE FULL-STACK LOCAL RUNNER");
  console.log("=======================================================\n");

  console.log("1. Starting local MongoDB Replica Set on port 27017...");
  let replSet: MongoMemoryReplSet | null = null;
  try {
    replSet = await MongoMemoryReplSet.create({
      replSet: { name: "rs0", count: 1, storageEngine: "wiredTiger" },
      instanceOpts: [{ port: 27017, dbPath }],
    });
    await replSet.waitUntilRunning();
    console.log("   ✅ Database is live on mongodb://127.0.0.1:27017/unicafe?replicaSet=rs0\n");
  } catch (err: any) {
    console.log("   ℹ️  Port 27017 already in use (external MongoDB or existing daemon). Proceeding...\n");
  }

  console.log("2. Starting Next.js (Frontend & Backend APIs) on http://localhost:3000...\n");
  const nextCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const nextProcess = spawn(nextCmd, ["next", "dev", "-p", "3000"], {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      MONGODB_URI: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/unicafe?replicaSet=rs0",
    },
  });

  const cleanup = async () => {
    console.log("\nStopping UniCafe servers...");
    try {
      nextProcess.kill();
    } catch {}
    if (replSet) {
      try {
        await replSet.stop();
      } catch {}
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  nextProcess.on("exit", async () => {
    if (replSet) {
      try {
        await replSet.stop();
      } catch {}
    }
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Failed to start UniCafe:", err);
  process.exit(1);
});

