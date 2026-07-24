import express from "express";
import {
  cancelpremiumplan,
  createpremiumorder,
  getpremiumplans,
  login,
  sendpremiuminvoice,
  trackdownload,
  updatetheme,
  updatepremiumplan,
  updateprofile,
  verifyloginotp,
  verifypremiumpayment,
} from "../controllers/auth.js";
const routes = express.Router();

routes.post("/login", login);
routes.post("/login/:id/otp", verifyloginotp);
routes.patch("/update/:id", updateprofile);
routes.patch("/theme/:id", updatetheme);
routes.get("/premium/plans", getpremiumplans);
routes.post("/premium/:id/order", createpremiumorder);
routes.post("/premium/:id/verify", verifypremiumpayment);
routes.post("/premium/:id/invoice", sendpremiuminvoice);
routes.patch("/premium/:id", updatepremiumplan);
routes.patch("/premium/:id/cancel", cancelpremiumplan);
routes.post("/download/:id", trackdownload);
export default routes;
