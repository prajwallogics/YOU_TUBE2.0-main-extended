"use client";

import { useMemo, useRef, useState } from "react";
import {
  Copy,
  Download,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Send,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useUser } from "@/lib/AuthContext";
import { toast } from "sonner";

interface WatchPartyProps {
  videoId: string;
}

interface ChatMessage {
  id: number;
  sender: string;
  text: string;
}

export default function WatchParty({ videoId }: Readonly<WatchPartyProps>) {
  const { user } = useUser();
  const [isInCall, setIsInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [recordingUrl, setRecordingUrl] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/watch/${videoId}?party=${videoId}`;
  }, [videoId]);

  const participants = [
    user?.name || "Host",
    ...(isInCall ? ["Waiting for invited friends"] : []),
  ];

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    toast.success("Watch party invite copied.");
  };

  const sendMessage = () => {
    if (!message.trim()) return;
    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        sender: user?.name || "You",
        text: message.trim(),
      },
    ]);
    setMessage("");
  };

  const startScreenShare = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Screen sharing is not available in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      setScreenStream(stream);
      toast.success("Screen sharing started.");
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setScreenStream(null);
      });
    } catch (error) {
      toast.error("Screen sharing was cancelled.");
    }
  };

  const toggleRecording = () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      return;
    }

    if (!screenStream) {
      toast.error("Start screen sharing before recording.");
      return;
    }

    chunksRef.current = [];
    const recorder = new MediaRecorder(screenStream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      const recording = new Blob(chunksRef.current, { type: "video/webm" });
      setRecordingUrl(URL.createObjectURL(recording));
      toast.success("Recording is ready for the host.");
    };
    recorder.start();
    toast.success("Recording started.");
  };

  const leaveCall = () => {
    screenStream?.getTracks().forEach((track) => track.stop());
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
    setScreenStream(null);
    setIsInCall(false);
  };

  return (
    <section className="rounded-lg border bg-card p-4 text-card-foreground">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Watch party</h2>
          <p className="text-sm text-muted-foreground">
            Invite friends, chat, and watch together in real time.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={copyInvite}>
          <Copy className="h-4 w-4" />
          Invite
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setIsInCall(true)} disabled={isInCall}>
          <Video className="h-4 w-4" />
          Join call
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setIsMuted((current) => !current)}
          disabled={!isInCall}
        >
          {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {isMuted ? "Unmute" : "Mute"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setIsCameraOff((current) => !current)}
          disabled={!isInCall}
        >
          {isCameraOff ? (
            <VideoOff className="h-4 w-4" />
          ) : (
            <Video className="h-4 w-4" />
          )}
          {isCameraOff ? "Camera on" : "Camera off"}
        </Button>
        <Button size="sm" variant="outline" onClick={startScreenShare} disabled={!isInCall}>
          <MonitorUp className="h-4 w-4" />
          Share screen
        </Button>
        <Button size="sm" variant="outline" onClick={toggleRecording} disabled={!isInCall}>
          <Download className="h-4 w-4" />
          {recorderRef.current?.state === "recording" ? "Stop recording" : "Record"}
        </Button>
        <Button size="sm" variant="destructive" onClick={leaveCall} disabled={!isInCall}>
          <PhoneOff className="h-4 w-4" />
          Leave
        </Button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-h-40 rounded-md border bg-background p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Users className="h-4 w-4" />
            Party chat
          </div>
          <div className="max-h-44 space-y-2 overflow-y-auto text-sm">
            {messages.length === 0 ? (
              <p className="text-muted-foreground">No messages yet.</p>
            ) : (
              messages.map((chat) => (
                <p key={chat.id}>
                  <span className="font-medium">{chat.sender}: </span>
                  {chat.text}
                </p>
              ))
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <Input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && sendMessage()}
              placeholder="Message"
            />
            <Button size="icon" onClick={sendMessage}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="rounded-md border bg-background p-3 text-sm">
          <p className="font-medium">Participants</p>
          <div className="mt-2 space-y-2">
            {participants.map((participant) => (
              <div key={participant} className="rounded-md bg-muted px-2 py-1">
                {participant}
              </div>
            ))}
          </div>
          {screenStream && (
            <p className="mt-3 text-xs text-green-600">Screen sharing active</p>
          )}
          {recordingUrl && (
            <a
              href={recordingUrl}
              download={`watch-party-${videoId}.webm`}
              className="mt-3 inline-flex text-xs font-medium text-blue-600"
            >
              Download host recording
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
