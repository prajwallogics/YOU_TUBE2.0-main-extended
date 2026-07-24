export type DownloadedVideo = {
  id: string;
  videotitle: string;
  filename?: string;
  filepath: string;
  videochanel?: string;
  downloadedAt: string;
};

const getStorageKey = (userId: string) => `yourtube-downloads:${userId}`;

export const getDownloadedVideos = (userId?: string): DownloadedVideo[] => {
  if (!userId || typeof window === "undefined") return [];

  try {
    const saved = JSON.parse(localStorage.getItem(getStorageKey(userId)) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

export const saveDownloadedVideo = (
  userId: string,
  video: Omit<DownloadedVideo, "downloadedAt">
) => {
  const downloads = getDownloadedVideos(userId);
  const withoutDuplicate = downloads.filter((item) => item.id !== video.id);
  const next = [{ ...video, downloadedAt: new Date().toISOString() }, ...withoutDuplicate];
  localStorage.setItem(getStorageKey(userId), JSON.stringify(next));
};

export const removeDownloadedVideo = (userId: string, videoId: string) => {
  const downloads = getDownloadedVideos(userId).filter((item) => item.id !== videoId);
  localStorage.setItem(getStorageKey(userId), JSON.stringify(downloads));
};
