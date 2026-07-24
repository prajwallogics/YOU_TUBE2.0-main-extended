import comment from "../Modals/comment.js";
import mongoose from "mongoose";

const blockedWords = [
  "fuck",
  "fucker",
  "fucking",
  "shit",
  "shitty",
  "bitch",
  "bitches",
  "asshole",
  "bastard",
  "damn",
  "dumb",
  "stupid",
  "idiot",
  "idiotic",
  "boli maga"
];

const leetMap = {
  "@": "a",
  4: "a",
  $: "s",
  5: "s",
  0: "o",
  1: "i",
  "!": "i",
  3: "e",
  7: "t",
  "+": "t",
};

const normalizeCommentText = (text = "") =>
  text
    .toLowerCase()
    .replace(/[@4$501!3+7]/g, (char) => leetMap[char] || char)
    .replace(/(.)\1{2,}/g, "$1$1")
    .replace(/[^a-z]/g, "");

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const containsBlockedLanguage = (text = "") => {
  const normalizedText = normalizeCommentText(text);

  return blockedWords.some((word) => {
    const normalizedWord = normalizeCommentText(word);
    const directMatch = new RegExp(`\\b${escapeRegex(word)}\\b`, "i").test(text);

    return directMatch || normalizedText.includes(normalizedWord);
  });
};

export const postcomment = async (req, res) => {
  const commentdata = req.body;
  if (containsBlockedLanguage(commentdata.commentbody)) {
    return res.status(400).json({
      message: "Please keep comments respectful before posting.",
    });
  }

  const postcomment = new comment(commentdata);
  try {
    await postcomment.save();
    return res.status(200).json({ comment: true });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
export const getallcomment = async (req, res) => {
  const { videoid } = req.params;
  try {
    const commentvideo = await comment.find({ videoid: videoid });
    return res.status(200).json(commentvideo);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
export const deletecomment = async (req, res) => {
  const { id: _id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(404).send("comment unavailable");
  }
  try {
    await comment.findByIdAndDelete(_id);
    return res.status(200).json({ comment: true });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const editcomment = async (req, res) => {
  const { id: _id } = req.params;
  const { commentbody } = req.body;
  if (containsBlockedLanguage(commentbody)) {
    return res.status(400).json({
      message: "Please keep comments respectful before saving.",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(404).send("comment unavailable");
  }
  try {
    const updatecomment = await comment.findByIdAndUpdate(_id, {
      $set: { commentbody: commentbody },
    });
    res.status(200).json(updatecomment);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const reactcomment = async (req, res) => {
  const { id: _id } = req.params;
  const { userId, action } = req.body;

  if (!mongoose.Types.ObjectId.isValid(_id) || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(404).send("comment unavailable");
  }

  if (!["like", "dislike"].includes(action)) {
    return res.status(400).json({ message: "Invalid reaction" });
  }

  try {
    const currentcomment = await comment.findById(_id);

    if (!currentcomment) {
      return res.status(404).send("comment unavailable");
    }

    const hasLiked = currentcomment.likes.some((id) => id.toString() === userId);
    const hasDisliked = currentcomment.dislikes.some((id) => id.toString() === userId);

    if (action === "like") {
      currentcomment.likes = hasLiked
        ? currentcomment.likes.filter((id) => id.toString() !== userId)
        : [...currentcomment.likes.filter((id) => id.toString() !== userId), userId];
      currentcomment.dislikes = hasDisliked
        ? currentcomment.dislikes.filter((id) => id.toString() !== userId)
        : currentcomment.dislikes;
    }

    if (action === "dislike") {
      currentcomment.dislikes = hasDisliked
        ? currentcomment.dislikes.filter((id) => id.toString() !== userId)
        : [...currentcomment.dislikes.filter((id) => id.toString() !== userId), userId];
      currentcomment.likes = hasLiked
        ? currentcomment.likes.filter((id) => id.toString() !== userId)
        : currentcomment.likes;
    }

    const updatedcomment = await currentcomment.save();
    return res.status(200).json(updatedcomment);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const reportcomment = async (req, res) => {
  const { id: _id } = req.params;
  const { userId, userreported, reason } = req.body;

  if (!mongoose.Types.ObjectId.isValid(_id) || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(404).send("comment unavailable");
  }

  if (!reason?.trim()) {
    return res.status(400).json({ message: "Report reason is required" });
  }

  if (containsBlockedLanguage(reason)) {
    return res.status(400).json({
      message: "Please keep reports respectful before posting.",
    });
  }

  try {
    const currentcomment = await comment.findById(_id);

    if (!currentcomment) {
      return res.status(404).send("comment unavailable");
    }

    if (currentcomment.userid.toString() === userId) {
      return res.status(403).json({ message: "You cannot report your own comment" });
    }

    const existingReportIndex = currentcomment.reports.findIndex(
      (report) => report.userid.toString() === userId
    );
    const reportdata = {
      userid: userId,
      userreported,
      reason: reason.trim(),
      reportedon: new Date(),
    };

    if (existingReportIndex >= 0) {
      currentcomment.reports[existingReportIndex] = reportdata;
    } else {
      currentcomment.reports.push(reportdata);
    }

    const updatedcomment = await currentcomment.save();
    return res.status(200).json(updatedcomment);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
