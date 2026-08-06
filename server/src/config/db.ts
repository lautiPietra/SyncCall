import mongoose from 'mongoose';
import { config } from './env';

export async function connectDB(): Promise<void> {
  await mongoose.connect(config.mongoUri);
}
