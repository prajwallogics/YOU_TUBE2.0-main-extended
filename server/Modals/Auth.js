import mongoose from "mongoose";
const userschema = mongoose.Schema({
  email: { type: String, required: true },
  name: { type: String },
  channelname: { type: String },
  description: { type: String },
  image: { type: String },
  premiumPlan: {
    type: String,
    enum: ["free", "bronze", "silver", "gold"],
    default: "free",
  },
  themePreference: {
    type: String,
    enum: ["light", "dark"],
    default: "dark",
  },
  lastLoginContext: {
    city: { type: String },
    state: { type: String },
    region: { type: String },
    timezone: { type: String },
    deviceId: { type: String },
    userAgent: { type: String },
    loggedInAt: { type: Date },
  },
  trustedLoginContexts: [
    {
      city: { type: String },
      state: { type: String },
      region: { type: String },
      timezone: { type: String },
      deviceId: { type: String },
      userAgent: { type: String },
      verifiedAt: { type: Date, default: Date.now },
    },
  ],
  pendingOtp: {
    codeHash: { type: String },
    expiresAt: { type: Date },
    loginContext: {
      city: { type: String },
      state: { type: String },
      region: { type: String },
      timezone: { type: String },
      deviceId: { type: String },
      userAgent: { type: String },
    },
  },
  downloadCount: { type: Number, default: 0 },
  downloadLimitResetAt: { type: Date, default: Date.now },
  lastPayment: {
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    plan: { type: String },
    amount: { type: Number },
    paidAt: { type: Date },
  },
  joinedon: { type: Date, default: Date.now },
});

export default mongoose.model("user", userschema);
