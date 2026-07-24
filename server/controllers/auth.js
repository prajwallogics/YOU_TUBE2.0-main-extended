import mongoose from "mongoose";
import crypto from "node:crypto";
import nodemailer from "nodemailer";
import users from "../Modals/Auth.js";

const PREMIUM_PLANS = {
  free: {
    name: "Free",
    price: 0,
    currency: "INR",
    dailyDownloads: 1,
    downloads: "1 download per day",
    quality: "Standard",
  },
  bronze: {
    name: "Bronze",
    price: 49,
    currency: "INR",
    dailyDownloads: 5,
    downloads: "5 downloads per day",
    quality: "Standard",
  },
  silver: {
    name: "Silver",
    price: 99,
    currency: "INR",
    dailyDownloads: 20,
    downloads: "20 downloads per day",
    quality: "HD",
  },
  gold: {
    name: "Gold",
    price: 199,
    currency: "INR",
    dailyDownloads: null,
    downloads: "Unlimited downloads",
    quality: "Best available upto 4k",
  },
};

const getNextDailyReset = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
};

const getIstLoginTheme = (date = new Date()) => {
  const istTime = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const hour = istTime.getHours();
  return hour >= 10 && hour < 12 ? "light" : "dark";
};

const normalizeLoginContext = (context = {}, req) => ({
  city: (context.city || "").trim(),
  state: (context.state || "").trim(),
  region: (context.region || context.country || "").trim(),
  timezone: (context.timezone || "").trim(),
  deviceId: (context.deviceId || "").trim(),
  userAgent: (context.userAgent || req.get("user-agent") || "").slice(0, 300),
});

const isNewLoginContext = (user, loginContext) => {
  if (!user.trustedLoginContexts?.length) {
    return false;
  }

  return !user.trustedLoginContexts.some((trusted) => {
    const sameDevice =
      loginContext.deviceId && trusted.deviceId === loginContext.deviceId;
    const sameCity =
      loginContext.city &&
      trusted.city?.toLowerCase() === loginContext.city.toLowerCase();
    const sameState =
      loginContext.state &&
      trusted.state?.toLowerCase() === loginContext.state.toLowerCase();

    return sameDevice && (!loginContext.city || sameCity) && (!loginContext.state || sameState);
  });
};

const hashOtp = (otp) => crypto.createHash("sha256").update(otp).digest("hex");

const createOtpChallenge = async (user, loginContext) => {
  const otp = crypto.randomInt(100000, 999999).toString();
  user.pendingOtp = {
    codeHash: hashOtp(otp),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    loginContext,
  };
  await user.save();

  console.log(`Login OTP for ${user.email}: ${otp}`);
  return otp;
};

const trustLoginContext = (user, loginContext) => {
  user.lastLoginContext = {
    ...loginContext,
    loggedInAt: new Date(),
  };

  if (loginContext.deviceId) {
    const alreadyTrusted = user.trustedLoginContexts?.some(
      (trusted) => trusted.deviceId === loginContext.deviceId
    );

    if (!alreadyTrusted) {
      user.trustedLoginContexts = [
        ...(user.trustedLoginContexts || []),
        {
          ...loginContext,
          verifiedAt: new Date(),
        },
      ].slice(-8);
    }
  }
};

const normalizeUserPlan = (user) => {
  if (!user.premiumPlan || PREMIUM_PLANS[user.premiumPlan]) {
    return false;
  }

  user.premiumPlan = user.premiumPlan === "platinum" ? "gold" : "free";
  return true;
};

const resetDownloadsIfNeeded = async (user) => {
  const now = new Date();
  let shouldSave = normalizeUserPlan(user);

  if (!user.downloadLimitResetAt || user.downloadLimitResetAt <= now) {
    user.downloadCount = 0;
    user.downloadLimitResetAt = getNextDailyReset();
    shouldSave = true;
  }

  if (shouldSave) {
    await user.save();
  }

  return user;
};

const isDatabaseConnected = () => mongoose.connection.readyState === 1;

const hasRazorpayPlaceholder = (value) =>
  !value || /replace_with|your_key|<|>/i.test(value);

const isRazorpayConfigured = () =>
  !hasRazorpayPlaceholder(process.env.RAZORPAY_KEY_ID) &&
  !hasRazorpayPlaceholder(process.env.RAZORPAY_KEY_SECRET);

const getPlan = (planId = "free") => PREMIUM_PLANS[planId] || PREMIUM_PLANS.free;

const isMailConfigured = () =>
  Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.MAIL_FROM
  );

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>'"]/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
      character
    ]
  );

const sendPaymentInvoice = async ({ user, plan, paymentId, orderId, amount, currency }) => {
  if (!isMailConfigured()) {
    console.warn("Payment invoice was not emailed: SMTP is not configured.");
    return false;
  }

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const paidAt = new Date();
  const formattedAmount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
  }).format(amount);

  await transport.sendMail({
    from: process.env.MAIL_FROM,
    to: user.email,
    subject: `YourTube payment confirmation — ${plan.name} plan`,
    text: `Hi ${user.name || "there"},\n\nYour payment of ${formattedAmount} for the YourTube ${plan.name} plan was successful.\n\nInvoice number: ${paymentId}\nOrder ID: ${orderId}\nPaid on: ${paidAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST\n\nThank you for choosing YourTube.`,
    html: `<main style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1f2937"><h1 style="color:#dc2626">YourTube</h1><h2>Payment confirmed</h2><p>Hi ${escapeHtml(user.name || "there")},</p><p>Thanks for choosing YourTube ${escapeHtml(plan.name)}. Your payment was successful.</p><table style="width:100%;border-collapse:collapse"><tr><td style="padding:10px;border:1px solid #e5e7eb">Plan</td><td style="padding:10px;border:1px solid #e5e7eb">${escapeHtml(plan.name)}</td></tr><tr><td style="padding:10px;border:1px solid #e5e7eb">Amount paid</td><td style="padding:10px;border:1px solid #e5e7eb">${escapeHtml(formattedAmount)}</td></tr><tr><td style="padding:10px;border:1px solid #e5e7eb">Invoice number</td><td style="padding:10px;border:1px solid #e5e7eb">${escapeHtml(paymentId)}</td></tr><tr><td style="padding:10px;border:1px solid #e5e7eb">Order ID</td><td style="padding:10px;border:1px solid #e5e7eb">${escapeHtml(orderId)}</td></tr></table><p style="margin-top:24px">Paid on ${escapeHtml(paidAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST.</p></main>`,
  });
  return true;
};

const createRazorpayOrder = async ({ amount, currency, receipt }) => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!isRazorpayConfigured()) {
    throw new Error(
      "Razorpay is not configured. Replace both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET placeholders in server/.env."
    );
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount,
      currency,
      receipt,
      payment_capture: 1,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.description || "Could not create Razorpay order");
  }

  return data;
};

const verifyRazorpaySignature = ({ orderId, paymentId, signature }) => {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!isRazorpayConfigured()) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  return expectedSignature === signature;
};

export const login = async (req, res) => {
  const { email, name, image, loginContext } = req.body;

  if (!isDatabaseConnected()) {
    return res.status(503).json({
      message:
        "Database is not connected. Check MongoDB Atlas network access and whitelist this machine IP.",
    });
  }

  try {
    const normalizedLoginContext = normalizeLoginContext(loginContext, req);
    const existingUser = await users.findOne({ email });

    if (!existingUser) {
      const newUser = await users.create({
        email,
        name,
        image,
        themePreference: getIstLoginTheme(),
        lastLoginContext: {
          ...normalizedLoginContext,
          loggedInAt: new Date(),
        },
        trustedLoginContexts: normalizedLoginContext.deviceId
          ? [{ ...normalizedLoginContext, verifiedAt: new Date() }]
          : [],
        downloadLimitResetAt: getNextDailyReset(),
      });
      return res.status(201).json({ result: newUser, requiresOtp: false });
    } else {
      const currentUser = await resetDownloadsIfNeeded(existingUser);
      currentUser.themePreference = currentUser.themePreference || getIstLoginTheme();

      if (isNewLoginContext(currentUser, normalizedLoginContext)) {
        const otp = await createOtpChallenge(currentUser, normalizedLoginContext);
        return res.status(202).json({
          requiresOtp: true,
          userId: currentUser._id,
          message:
            "OTP verification is required for this new city, state, or device.",
          ...(process.env.NODE_ENV !== "production" ? { devOtp: otp } : {}),
        });
      }

      trustLoginContext(currentUser, normalizedLoginContext);
      await currentUser.save();
      return res.status(200).json({ result: currentUser, requiresOtp: false });
    }
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const verifyloginotp = async (req, res) => {
  const { id: _id } = req.params;
  const { otp } = req.body;

  if (!isDatabaseConnected()) {
    return res.status(503).json({
      message:
        "Database is not connected. Check MongoDB Atlas network access and whitelist this machine IP.",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  try {
    const user = await users.findById(_id);
    if (!user || !user.pendingOtp?.codeHash) {
      return res.status(404).json({ message: "No OTP challenge found" });
    }

    if (!user.pendingOtp.expiresAt || user.pendingOtp.expiresAt < new Date()) {
      user.pendingOtp = undefined;
      await user.save();
      return res.status(400).json({ message: "OTP expired. Please sign in again." });
    }

    if (hashOtp(String(otp || "")) !== user.pendingOtp.codeHash) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    trustLoginContext(user, user.pendingOtp.loginContext || {});
    user.pendingOtp = undefined;
    await resetDownloadsIfNeeded(user);
    await user.save();

    return res.status(200).json({ result: user });
  } catch (error) {
    console.error("OTP verification error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const updatetheme = async (req, res) => {
  const { id: _id } = req.params;
  const { themePreference } = req.body;

  if (!isDatabaseConnected()) {
    return res.status(503).json({
      message:
        "Database is not connected. Check MongoDB Atlas network access and whitelist this machine IP.",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  if (!["light", "dark"].includes(themePreference)) {
    return res.status(400).json({ message: "Theme must be light or dark" });
  }

  try {
    const updatedUser = await users.findByIdAndUpdate(
      _id,
      { $set: { themePreference } },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User unavailable..." });
    }

    return res.status(200).json(updatedUser);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
export const updateprofile = async (req, res) => {
  const { id: _id } = req.params;
  const { channelname, description } = req.body;

  if (!isDatabaseConnected()) {
    return res.status(503).json({
      message:
        "Database is not connected. Check MongoDB Atlas network access and whitelist this machine IP.",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  try {
    const updatedata = await users.findByIdAndUpdate(
      _id,
      {
        $set: {
          channelname: channelname,
          description: description,
        },
      },
      { new: true }
    );

    if (!updatedata) {
      return res.status(404).json({ message: "User unavailable..." });
    }

    return res.status(201).json(updatedata);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const getpremiumplans = async (req, res) => {
  return res.status(200).json({
    plans: PREMIUM_PLANS,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || null,
    razorpayConfigured: isRazorpayConfigured(),
  });
};

export const updatepremiumplan = async (req, res) => {
  const { id: _id } = req.params;
  const { plan } = req.body;

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(404).json({ message: "User unavailable..." });
  }

  if (!plan || !PREMIUM_PLANS[plan] || plan === "free") {
    return res.status(400).json({ message: "Please select a valid premium plan" });
  }

  return res.status(400).json({
    message: "Paid plans must be activated through Razorpay payment.",
  });
};

export const createpremiumorder = async (req, res) => {
  const { id: _id } = req.params;
  const { plan } = req.body;

  if (!isDatabaseConnected()) {
    return res.status(503).json({
      message:
        "Database is not connected. Check MongoDB Atlas network access and whitelist this machine IP.",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(404).json({ message: "User unavailable..." });
  }

  if (!plan || !PREMIUM_PLANS[plan] || plan === "free") {
    return res.status(400).json({ message: "Please select a valid paid plan" });
  }

  if (!isRazorpayConfigured()) {
    return res.status(503).json({
      message:
        "Razorpay is not configured. Replace both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET placeholders in server/.env, then restart the backend.",
    });
  }

  try {
    const user = await users.findById(_id);
    if (!user) {
      return res.status(404).json({ message: "User unavailable..." });
    }

    const selectedPlan = PREMIUM_PLANS[plan];
    const order = await createRazorpayOrder({
      amount: selectedPlan.price * 100,
      currency: selectedPlan.currency,
      receipt: `${_id}_${plan}_${Date.now()}`.slice(0, 40),
    });

    return res.status(200).json({
      order,
      plan: selectedPlan,
      planId: plan,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      user: {
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: error.message || "Could not start Razorpay payment",
    });
  }
};

export const verifypremiumpayment = async (req, res) => {
  const { id: _id } = req.params;
  const {
    plan,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body;

  if (!isDatabaseConnected()) {
    return res.status(503).json({
      message:
        "Database is not connected. Check MongoDB Atlas network access and whitelist this machine IP.",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(404).json({ message: "User unavailable..." });
  }

  if (!plan || !PREMIUM_PLANS[plan] || plan === "free") {
    return res.status(400).json({ message: "Please select a valid paid plan" });
  }

  const isValidPayment = verifyRazorpaySignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  if (!isValidPayment) {
    return res.status(400).json({ message: "Payment verification failed" });
  }

  try {
    const selectedPlan = PREMIUM_PLANS[plan];
    const updatedUser = await users.findByIdAndUpdate(
      _id,
      {
        $set: {
          premiumPlan: plan,
          downloadCount: 0,
          downloadLimitResetAt: getNextDailyReset(),
          lastPayment: {
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            plan,
            amount: selectedPlan.price,
            paidAt: new Date(),
          },
        },
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User unavailable..." });
    }

    let invoiceEmailSent = false;
    try {
      invoiceEmailSent = await sendPaymentInvoice({
        user: updatedUser,
        plan: selectedPlan,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        amount: selectedPlan.price,
        currency: selectedPlan.currency,
      });
    } catch (error) {
      console.error("Could not send payment invoice:", error.message);
    }

    return res.status(200).json({ ...updatedUser.toObject(), invoiceEmailSent });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const sendpremiuminvoice = async (req, res) => {
  const { id: _id } = req.params;

  if (!isDatabaseConnected()) {
    return res.status(503).json({ message: "Database is not connected." });
  }

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  try {
    const user = await users.findById(_id);
    const payment = user?.lastPayment;
    if (!user || !payment?.razorpayPaymentId || !payment?.razorpayOrderId) {
      return res.status(404).json({ message: "No completed premium payment was found." });
    }

    if (!isMailConfigured()) {
      return res.status(503).json({
        message: "Invoice email is unavailable because SMTP is not configured on the server.",
      });
    }

    const invoiceSent = await sendPaymentInvoice({
      user,
      plan: getPlan(payment.plan),
      paymentId: payment.razorpayPaymentId,
      orderId: payment.razorpayOrderId,
      amount: payment.amount,
      currency: "INR",
    });

    return res.status(200).json({ invoiceSent });
  } catch (error) {
    console.error("Could not resend payment invoice:", error.message);
    return res.status(500).json({ message: "Could not send the invoice email." });
  }
};

export const cancelpremiumplan = async (req, res) => {
  const { id: _id } = req.params;

  if (!isDatabaseConnected()) {
    return res.status(503).json({
      message:
        "Database is not connected. Check MongoDB Atlas network access and whitelist this machine IP.",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(404).json({ message: "User unavailable..." });
  }

  try {
    const updatedUser = await users.findByIdAndUpdate(
      _id,
      {
        $set: {
          premiumPlan: "free",
          downloadCount: 0,
          downloadLimitResetAt: getNextDailyReset(),
        },
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User unavailable..." });
    }

    return res.status(200).json(updatedUser);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const trackdownload = async (req, res) => {
  const { id: _id } = req.params;

  if (!isDatabaseConnected()) {
    return res.status(503).json({
      message:
        "Database is not connected. Check MongoDB Atlas network access and whitelist this machine IP.",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(404).json({ message: "User unavailable..." });
  }

  try {
    const user = await users.findById(_id);
    if (!user) {
      return res.status(404).json({ message: "User unavailable..." });
    }

    await resetDownloadsIfNeeded(user);

    const currentPlan = getPlan(user.premiumPlan);

    if (currentPlan.dailyDownloads === null) {
      return res.status(200).json({
        allowed: true,
        user,
        remainingDownloads: "Unlimited",
        plan: currentPlan,
      });
    }

    if (user.downloadCount >= currentPlan.dailyDownloads) {
      return res.status(403).json({
        allowed: false,
        user,
        remainingDownloads: 0,
        plan: currentPlan,
        message: `${currentPlan.name} users can download ${currentPlan.dailyDownloads} video${
          currentPlan.dailyDownloads === 1 ? "" : "s"
        } per day. Upgrade for more download freedom.`,
      });
    }

    user.downloadCount += 1;
    await user.save();

    return res.status(200).json({
      allowed: true,
      user,
      remainingDownloads: Math.max(currentPlan.dailyDownloads - user.downloadCount, 0),
      plan: currentPlan,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
