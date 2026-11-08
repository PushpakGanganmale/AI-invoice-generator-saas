import mongoose from "mongoose";

const bussinessProfileSchema = new mongoose.Schema(
  {
    owner: {
      type: String,
      required: true,
      index: true,
    },
    businessName: String,
    email: String,
    phone: String,
    address: String,
    gst: String,

    logoUrl: String,
    stampUrl: String,
    signatureUrl: String,

    signatureOwnerName: { type: String, default: "" },  // ✅ FIXED
    signatureOwnerTitle: { type: String, default: "" }, // ✅ FIXED
  },
  { timestamps: true }
);

const BussinessProfile =
  mongoose.models.BussinessProfile ||
  mongoose.model("BussinessProfile", bussinessProfileSchema);

export default BussinessProfile;