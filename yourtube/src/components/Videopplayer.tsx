"use client";

import { useEffect, useRef, useState } from "react";
import { getVideoUrl } from "@/lib/videoUrl";
import {
  Expand,
  Loader2,
  Pause,
  Play,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "./ui/button";
import { useUser } from "@/lib/AuthContext";

interface VideoPlayerProps {
  video: {
    _id: string;
    videotitle: string;
    filepath: string;
  };
  nextVideo?: {
    _id: string;
    videotitle: string;
  };
  onNextVideo?: () => void;
}

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
};

export default function VideoPlayer({
  video,
  nextVideo,
  onNextVideo,
}: Readonly<VideoPlayerProps>) {
  const { user } = useUser();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [adSecondsLeft, setAdSecondsLeft] = useState(5);
  const [isAdVisible, setIsAdVisible] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState<"-10" | "+10" | null>(null);
  const showsAds = !user || user.premiumPlan === "free";

  useEffect(() => {
    setAdSecondsLeft(5);
    setIsAdVisible(showsAds);
  }, [video._id, showsAds]);

  useEffect(() => {
    if (!isAdVisible || adSecondsLeft === 0) return;
    const timer = window.setTimeout(() => setAdSecondsLeft((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [adSecondsLeft, isAdVisible]);

  useEffect(() => {
    const currentVideo = videoRef.current;
    if (!currentVideo) return;
    currentVideo.volume = volume;
  }, [volume]);

  const togglePlay = async () => {
    const currentVideo = videoRef.current;
    if (!currentVideo) return;

    if (currentVideo.paused) {
      await currentVideo.play();
    } else {
      currentVideo.pause();
    }
  };

  const seekBy = (seconds: number) => {
    const currentVideo = videoRef.current;
    if (!currentVideo) return;
    const nextTime = Math.max(currentVideo.currentTime + seconds, 0);
    currentVideo.currentTime = Number.isFinite(currentVideo.duration)
      ? Math.min(nextTime, currentVideo.duration)
      : nextTime;
    setSeekFeedback(seconds > 0 ? "+10" : "-10");
    window.setTimeout(() => setSeekFeedback(null), 700);
  };

  useEffect(() => {
    const handleKeyboardSeek = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName || "");

      if (isTyping) return;

      if (event.code === "Space") {
        // Holding Space generates repeat events; toggle only once per press.
        if (event.repeat) return;
        event.preventDefault();
        void togglePlay();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekBy(-10);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        seekBy(10);
      }
    };

    window.addEventListener("keydown", handleKeyboardSeek);
    return () => window.removeEventListener("keydown", handleKeyboardSeek);
  }, []);

  const handleSeek = (value: string) => {
    const currentVideo = videoRef.current;
    if (!currentVideo) return;
    currentVideo.currentTime = Number(value);
  };

  const toggleMute = () => {
    const currentVideo = videoRef.current;
    if (!currentVideo) return;
    currentVideo.muted = !currentVideo.muted;
    setIsMuted(currentVideo.muted);
  };

  const enterFullscreen = async () => {
    if (containerRef.current?.requestFullscreen) {
      await containerRef.current.requestFullscreen();
    }
  };

  return (
    <div
      ref={containerRef}
      className="group relative aspect-video overflow-hidden rounded-lg bg-black text-white"
    >
      <video
        ref={videoRef}
        className="h-full w-full"
        poster={`/placeholder.svg?height=480&width=854`}
        onClick={togglePlay}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsLoading(true)}
        onCanPlay={() => setIsLoading(false)}
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration || 0);
          setIsLoading(false);
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      >
        <source src={getVideoUrl(video?.filepath)} type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}

      {seekFeedback && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="rounded-full bg-black/70 px-4 py-2 text-lg font-semibold">{seekFeedback}</span>
        </div>
      )}

      {isAdVisible && (
        <div className="absolute inset-0 z-20 flex flex-col justify-between bg-gradient-to-br from-slate-950 via-slate-800 to-red-950 p-5 text-white">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-white/70">
            <span>Advertisement</span>
            <span>Free plan</span>
          </div>
          <div className="max-w-md">
            <p className="text-sm font-medium text-red-300">YourTube Premium</p>
            <h2 className="mt-2 text-2xl font-semibold">Watch without interruptions.</h2>
            <p className="mt-2 text-sm text-white/75">Bronze, Silver, and Gold plans include ad-free viewing.</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-white/70">Your video will start after this ad.</span>
            <Button
              size="sm"
              variant="secondary"
              disabled={adSecondsLeft > 0}
              onClick={() => setIsAdVisible(false)}
            >
              {adSecondsLeft > 0 ? `Skip in ${adSecondsLeft}s` : "Skip ad"}
            </Button>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-3 pt-12 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
        <input
          aria-label="Seek video"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={(event) => handleSeek(event.target.value)}
          className="mb-3 h-1 w-full accent-red-600"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={togglePlay}
            className="text-white"
            title="Play/pause (Space)"
          >
            {isPlaying ? <Pause /> : <Play />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => seekBy(-10)}
            className="text-white"
            title="Back 10 seconds (Left Arrow)"
          >
            -10
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => seekBy(10)}
            className="text-white"
            title="Forward 10 seconds (Right Arrow)"
          >
            +10
          </Button>

          <div className="flex min-w-32 items-center gap-2">
            <Button size="icon" variant="ghost" onClick={toggleMute} className="text-white">
              {isMuted || volume === 0 ? <VolumeX /> : <Volume2 />}
            </Button>
            <input
              aria-label="Volume"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(event) => {
                const nextVolume = Number(event.target.value);
                setVolume(nextVolume);
                setIsMuted(nextVolume === 0);
                if (videoRef.current) {
                  videoRef.current.muted = nextVolume === 0;
                }
              }}
              className="w-20 accent-red-600"
            />
          </div>

          <span className="text-sm tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {nextVideo && onNextVideo && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onNextVideo}
                className="max-w-44 truncate text-white"
                title={nextVideo.videotitle}
              >
                <SkipForward />
                Next
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={enterFullscreen}
              className="text-white"
            >
              <Expand />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
