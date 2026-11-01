import mongoose from "mongoose";

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null; txSupported: boolean | null };

const globalForMongoose = globalThis as unknown as { __mongoose?: Cache };
const cache: Cache = globalForMongoose.__mongoose ?? { conn: null, promise: null, txSupported: null };
globalForMongoose.__mongoose = cache;

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn && mongoose.connection.readyState === 1) return cache.conn;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured. See ENVIRONMENT_VARIABLES.md");
  if (!cache.promise) {
    mongoose.set("strictQuery", true);
    cache.promise = mongoose.connect(uri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 20 });
  }
  try {
    cache.conn = await cache.promise;
  } catch (e) {
    cache.promise = null;
    throw e;
  }
  return cache.conn;
}

/** Returns true when the connected deployment supports multi-document transactions (replica set / sharded). */
export async function supportsTransactions(): Promise<boolean> {
  if (cache.txSupported !== null) return cache.txSupported;
  await connectDB();
  try {
    const admin = mongoose.connection.db!.admin();
    const hello = await admin.command({ hello: 1 });
    cache.txSupported = Boolean(hello.setName || hello.msg === "isdbgrid");
  } catch {
    cache.txSupported = false;
  }
  return cache.txSupported;
}

/** Reset cached capability info (used by tests when switching connections). */
export function resetDbCache() {
  cache.conn = null;
  cache.promise = null;
  cache.txSupported = null;
}

/**
 * Runs `fn` inside a MongoDB transaction when supported. When the deployment does not
 * support transactions, runs without a session — services still rely on atomic
 * conditional updates and unique indexes, so correctness against double-credit /
 * double-debit is preserved, only multi-document atomicity is weakened.
 */
export async function withTransaction<T>(fn: (session: mongoose.ClientSession | undefined) => Promise<T>): Promise<T> {
  await connectDB();
  if (!(await supportsTransactions())) return fn(undefined);
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}

