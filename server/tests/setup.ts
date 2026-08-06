import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach } from 'vitest';

// process.env.MONGODB_URI se setea ANTES de importar config/db (dinámicamente),
// para que env.ts valide contra la base en memoria y no contra la real de desarrollo.
const mongoServer = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongoServer.getUri();

const { connectDB } = await import('../src/config/db');
await connectDB();

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});
