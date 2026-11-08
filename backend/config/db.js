
import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      return;
    }

    console.log("Connecting to MongoDB...");

    await mongoose.connect(process.env.MONGO_URI);

    console.log(`MongoDB Connected: ${mongoose.connection.host}`);
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    throw error;
  }
};
