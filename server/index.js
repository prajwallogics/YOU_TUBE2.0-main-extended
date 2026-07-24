import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import userroutes from "./routes/auth.js";
import videoroutes from "./routes/video.js";
import likeroutes from "./routes/like.js";
import watchlaterroutes from "./routes/watchlater.js";
import historyrroutes from "./routes/history.js";
import commentroutes from "./routes/comment.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { Server } from "socket.io";
dotenv.config();
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, methods: ["GET", "POST"] },
});
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "uploads");
let lastMongoError = null;
const DBURL = process.env.DB_URL;

const hasUsableMongoUrl = (url) =>
  Boolean(url) && !/[<>]/.test(url) && /^mongodb(\+srv)?:\/\//.test(url);

const getMongoHostSummary = () => {
  if (!DBURL) {
    return null;
  }

  return DBURL.replace(/^mongodb(\+srv)?:\/\//, "")
    .replace(/^[^@]+@/, "")
    .split("?")[0]
    .split("/")
    .filter(Boolean)[0];
};

const getMongoAdvice = () => {
  if (!DBURL) {
    return "DB_URL is missing in server/.env.";
  }

  if (!lastMongoError) {
    return null;
  }

  if (lastMongoError.includes("EACCES") || lastMongoError.includes("ETIMEDOUT")) {
    return "MongoDB Atlas is reachable only after this machine/network IP is allowed in Atlas Network Access, and outbound port 27017 is not blocked by firewall/VPN.";
  }

  if (lastMongoError.includes("Authentication failed")) {
    return "Check the MongoDB username/password in DB_URL. Special password characters must be URL encoded.";
  }

  if (/querySrv.*ECONNREFUSED|ENOTFOUND.*_mongodb\._tcp/i.test(lastMongoError)) {
    return "This network's DNS resolver is blocking Atlas SRV lookups. Switch the computer/network DNS to 1.1.1.1 or 8.8.8.8, disable VPN/proxy DNS filtering, then restart the backend. Atlas IP allow-listing cannot fix a blocked DNS lookup.";
  }

  if (/tls|ssl|certificate/i.test(lastMongoError)) {
    return "Atlas rejected the TLS connection. Use the mongodb+srv connection string from Atlas Connect, confirm the cluster is running, allow this machine's IP in Atlas Network Access, and disable any VPN/proxy that intercepts TLS.";
  }

  return "Check DB_URL, Atlas cluster status, and local network access.";
};
app.use(cors());
app.use(express.json({ limit: "30mb", extended: true }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));
app.use("/uploads", express.static(uploadsDir));
app.get("/", (req, res) => {
  res.send("You tube backend is working");
});
app.get("/health", (req, res) => {
  const mongoStates = ["disconnected", "connected", "connecting", "disconnecting"];
  res.status(200).json({
    backend: "running",
    mongodb: mongoStates[mongoose.connection.readyState] || "unknown",
    readyState: mongoose.connection.readyState,
    dbUrlConfigured: hasUsableMongoUrl(DBURL),
    mongoHost: getMongoHostSummary(),
    lastMongoError,
    advice: getMongoAdvice(),
  });
});
app.use(bodyParser.json());
app.use("/user", userroutes);
app.use("/video", videoroutes);
app.use("/like", likeroutes);
app.use("/watch", watchlaterroutes);
app.use("/history", historyrroutes);
app.use("/comment", commentroutes);
const PORT = process.env.PORT || 5000;

// Watch-party signalling and room state stay in memory. This keeps calls and
// chat live without persisting private media or messages in the database.
io.on("connection", (socket) => {
  socket.on("party:join", ({ partyId, participant }) => {
    if (!partyId || !participant?.id) return;
    const room = `party:${partyId}`;
    socket.join(room);
    socket.data.party = { room, participant };
    const peers = [...(io.sockets.adapter.rooms.get(room) || [])]
      .filter((id) => id !== socket.id)
      .map((id) => ({ ...io.sockets.sockets.get(id)?.data.party?.participant, id }))
      .filter((peer) => peer.id);
    socket.emit("party:participants", peers);
    socket.to(room).emit("party:participant-joined", { ...participant, id: socket.id });
  });

  socket.on("party:message", ({ text }) => {
    const party = socket.data.party;
    if (!party || !text?.trim()) return;
    io.to(party.room).emit("party:message", {
      id: `${socket.id}-${Date.now()}`,
      sender: party.participant.name,
      text: text.trim().slice(0, 1000),
    });
  });

  socket.on("party:signal", ({ to, signal }) => {
    if (to && signal) io.to(to).emit("party:signal", { from: socket.id, signal });
  });

  socket.on("disconnect", () => {
    const party = socket.data.party;
    if (party) socket.to(party.room).emit("party:participant-left", socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
});

if (!hasUsableMongoUrl(DBURL)) {
  lastMongoError = "DB_URL is missing or still contains a placeholder";
  console.error("MongoDB connection error:", lastMongoError);
} else {
  mongoose
    .connect(DBURL, {
      serverSelectionTimeoutMS: 10000,
    })
    .then(() => {
      lastMongoError = null;
      console.log("Mongodb connected");
    })
    .catch((error) => {
      lastMongoError = error.message;
      console.error("MongoDB connection error:", error.message);
    });
}

mongoose.connection.on("connected", () => {
  lastMongoError = null;
});

mongoose.connection.on("error", (error) => {
  lastMongoError = error.message;
  console.error("MongoDB connection error:", error.message);
});

mongoose.connection.on("disconnected", () => {
  if (!lastMongoError) {
    lastMongoError = "MongoDB disconnected";
  }
});
