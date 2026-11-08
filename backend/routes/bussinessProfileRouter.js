import express from "express";
import upload from "../middleware/upload.js";

import {
  createBussinessProfile,
  getBussinessProfile,
  updateBussinessProfile
} from "../controllers/bussinessProfileController.js";

const bussinessProfileRouter = express.Router();

/* GET PROFILE */
bussinessProfileRouter.get("/me", getBussinessProfile);

/* CREATE PROFILE */
bussinessProfileRouter.post(
  "/",
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "stamp", maxCount: 1 },
    { name: "signature", maxCount: 1 }
  ]),
  createBussinessProfile
);

/* UPDATE PROFILE */
bussinessProfileRouter.put(
  "/:id",
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "stamp", maxCount: 1 },
    { name: "signature", maxCount: 1 }
  ]),
  updateBussinessProfile
);

export default bussinessProfileRouter;