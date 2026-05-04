import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

declare global {
  var __irisDb: {
    promise: Promise<typeof mongoose> | null;
    server: MongoMemoryServer | null;
    seeded: boolean;
    uri: string | null;
  };
}

if (!globalThis.__irisDb) {
  globalThis.__irisDb = { promise: null, server: null, seeded: false, uri: null };
}

const DB_NAME = process.env.MONGODB_DB ?? "iris";

async function bootInMemoryMongo(): Promise<string> {
  if (!globalThis.__irisDb.server) {
    globalThis.__irisDb.server = await MongoMemoryServer.create({
      instance: { dbName: "iris" },
    });
  }
  return globalThis.__irisDb.server.getUri();
}

async function resolveMongoUri(): Promise<string> {
  const configuredUri = process.env.MONGODB_URI?.trim();
  if (configuredUri) return configuredUri;

  if (process.env.NODE_ENV === "production") {
    throw new Error("MONGODB_URI is required in production.");
  }

  return bootInMemoryMongo();
}

export async function connectDb(): Promise<typeof mongoose> {
  if (globalThis.__irisDb.promise) {
    return globalThis.__irisDb.promise;
  }

  const promise = (async () => {
    try {
      const uri = await resolveMongoUri();
      const conn = await mongoose.connect(uri, { dbName: DB_NAME });
      globalThis.__irisDb.uri = uri;
      if (!globalThis.__irisDb.seeded) {
        const { runSeed } = await import("./seed");
        await runSeed();
        globalThis.__irisDb.seeded = true;
      }
      return conn;
    } catch (err) {
      globalThis.__irisDb.promise = null;
      throw err;
    }
  })();

  globalThis.__irisDb.promise = promise;
  return promise;
}
