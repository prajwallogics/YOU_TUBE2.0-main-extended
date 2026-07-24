import video from "../Modals/video.js";
import history from "../Modals/history.js";
import mongoose from "mongoose";

const isDatabaseConnected = () => mongoose.connection.readyState === 1;

export const handlehistory = async (req, res) => {
  const { userId } = req.body;
  const { videoId } = req.params;

  if (!isDatabaseConnected()) {
    return res.status(503).json({ message: "Database is not connected" });
  }

  if (
    !mongoose.Types.ObjectId.isValid(userId) ||
    !mongoose.Types.ObjectId.isValid(videoId)
  ) {
    return res.status(400).json({ message: "Invalid user or video id" });
  }

  try {
    await history.create({ viewer: userId, videoid: videoId });
    await video.findByIdAndUpdate(videoId, { $inc: { views: 1 } });
    return res.status(200).json({ history: true });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
export const handleview = async (req, res) => {
  const { videoId } = req.params;

  if (!isDatabaseConnected()) {
    return res.status(503).json({ message: "Database is not connected" });
  }

  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    return res.status(400).json({ message: "Invalid video id" });
  }

  try {
    await video.findByIdAndUpdate(videoId, { $inc: { views: 1 } });
    return res.status(200).json({ viewed: true });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
export const getallhistoryVideo = async (req, res) => {
  const { userId } = req.params;

  if (!isDatabaseConnected()) {
    return res.status(503).json({ message: "Database is not connected" });
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  try {
    const historyvideo = await history
      .find({ viewer: userId })
      .populate({
        path: "videoid",
        model: "videofiles",
      })
      .exec();
    return res.status(200).json(historyvideo);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
