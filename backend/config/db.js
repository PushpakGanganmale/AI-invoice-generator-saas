
import mongoose from "mongoose";

let connectionPromise = null;

export const connectDB = async () => {
  const mongoURI = process.env.MONGO_URI;

  if (!mongoURI) {
    throw new Error("MONGO_URI environment variable is missing");
  }

  // Reuse an existing connection.
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  // Reset a stale connection promise.
  if (mongoose.connection.readyState === 0) {
    connectionPromise = null;
  }

  // Prevent multiple simultaneous connection attempts.
  if (!connectionPromise) {
    console.log("Connecting to MongoDB...");

    connectionPromise = mongoose
      .connect(mongoURI, {
        serverSelectionTimeoutMS: 10000,
      })
      .then(() => {
        console.log(
          `MongoDB Connected: ${mongoose.connection.host}`
        );

        return mongoose;
      })
      .catch((error) => {
        connectionPromise = null;
        console.error("MongoDB connection error:", error.message);
        throw error;
      });
  }

  await connectionPromise;

  return mongoose;
};
