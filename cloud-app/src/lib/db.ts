import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

declare global {
  var __irisDb: {
    promise: Promise<typeof mongoose> | null;
    server: MongoMemoryServer | null;
    seeded: boolean;
  };
}

if (!globalThis.__irisDb) {
  globalThis.__irisDb = { promise: null, server: null, seeded: false };
}

async function bootInMemoryMongo(): Promise<string> {
  if (!globalThis.__irisDb.server) {
    globalThis.__irisDb.server = await MongoMemoryServer.create({
      instance: { dbName: "iris" },
    });
  }
  return globalThis.__irisDb.server.getUri();
}

export async function connectDb(): Promise<typeof mongoose> {
  if (globalThis.__irisDb.promise) {
    return globalThis.__irisDb.promise;
  }

  const promise = (async () => {
    try {
      const uri = await bootInMemoryMongo();
      const conn = await mongoose.connect(uri, { dbName: "iris" });
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
