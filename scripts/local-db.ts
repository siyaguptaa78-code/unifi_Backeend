import { MongoMemoryReplSet } from "mongodb-memory-server";
import path from "path";
import fs from "fs";

async function run() {
  const dbPath = path.resolve(process.cwd(), ".local-db");
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath, { recursive: true });
  }

  console.log("Starting local MongoDB Replica Set on port 27017...");
  const replSet = await MongoMemoryReplSet.create({
    replSet: {
      name: "rs0",
      count: 1,
      storageEngine: "wiredTiger",
    },
    instanceOpts: [
      {
        port: 27017,
        dbPath,
      },
    ],
  });

  await replSet.waitUntilRunning();
  const uri = replSet.getUri("unicafe");
  console.log(`\n======================================================`);
  console.log(`  Local MongoDB Replica Set is running!`);
  console.log(`  URI: ${uri}`);
  console.log(`  Data folder: ${dbPath}`);
  console.log(`  Transactions are FULLY supported.`);
  console.log(`======================================================\n`);
  console.log("Press Ctrl+C to stop.");

  process.on("SIGINT", async () => {
    console.log("\nStopping local MongoDB...");
    await replSet.stop();
    process.exit(0);
  });
}

run().catch((err) => {
  console.error("Failed to start local MongoDB:", err);
  process.exit(1);
});

