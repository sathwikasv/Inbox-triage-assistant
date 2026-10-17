import mongoose from "mongoose";

export async function connectDb(uri = process.env.MONGODB_URI) {
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  return mongoose.connection;
}
