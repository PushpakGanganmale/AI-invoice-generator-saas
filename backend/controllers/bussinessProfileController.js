import BussinessProfile from "../models/bussinessProfileModel.js";

/* CREATE PROFILE */
export const createBussinessProfile = async (req, res) => {
  try {
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const existing = await BussinessProfile.findOne({ owner: userId });

    if (existing) {
      return res.status(400).json({ success: false, message: "Business profile already exists" });
    }

    const logo = req.files?.logo?.[0]?.filename || null;
    const stamp = req.files?.stamp?.[0]?.filename || null;
    const signature = req.files?.signature?.[0]?.filename || null;

    const profile = await BussinessProfile.create({
      owner: userId,
      businessName: req.body.businessName,
      email: req.body.email,
      phone: req.body.phone,
      address: req.body.address,
      gst: req.body.gst,
      logoUrl: logo,
      stampUrl: stamp,
      signatureUrl: signature,
      signatureOwnerName: req.body.signatureOwnerName || "",  // ✅ FIXED
      signatureOwnerTitle: req.body.signatureOwnerTitle || "", // ✅ FIXED
    });

    res.status(201).json({ success: true, data: profile });

  } catch (err) {
    console.error("CREATE PROFILE ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* UPDATE PROFILE */
export const updateBussinessProfile = async (req, res) => {
  try {
    const userId = req.auth?.userId;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const updateData = {
      businessName: req.body.businessName,
      email: req.body.email,
      phone: req.body.phone,
      address: req.body.address,
      gst: req.body.gst,
      signatureOwnerName: req.body.signatureOwnerName || "",  // ✅ FIXED
      signatureOwnerTitle: req.body.signatureOwnerTitle || "", // ✅ FIXED
    };

    if (req.files?.logo?.[0]) updateData.logoUrl = req.files.logo[0].filename;
    if (req.files?.stamp?.[0]) updateData.stampUrl = req.files.stamp[0].filename;
    if (req.files?.signature?.[0]) updateData.signatureUrl = req.files.signature[0].filename;

    const updated = await BussinessProfile.findOneAndUpdate(
      { _id: id, owner: userId },
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "Profile not found" });
    }

    res.json({ success: true, data: updated });

  } catch (err) {
    console.error("UPDATE PROFILE ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* GET PROFILE */
export const getBussinessProfile = async (req, res) => {
  try {
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const profile = await BussinessProfile.findOne({ owner: userId });

    res.json({ success: true, data: profile });

  } catch (err) {
    console.error("GET PROFILE ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};