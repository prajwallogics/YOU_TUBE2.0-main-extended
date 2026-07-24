"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Copy, Download, Mic, MicOff, MonitorUp, PhoneOff, Send, Users, Video, VideoOff } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useUser } from "@/lib/AuthContext";
import { toast } from "sonner";

interface WatchPartyProps { videoId: string }
interface ChatMessage { id: string; sender: string; text: string }
interface Participant { id: string; name: string }
type Signal = RTCSessionDescriptionInit | { candidate: RTCIceCandidateInit };
const rtcConfig: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const getBackendUrl = () => process.env.NEXT_PUBLIC_BACKEND_URL || window.location.origin;

export default function WatchPartyLive({ videoId }: Readonly<WatchPartyProps>) {
  const { user } = useUser();
  const [partyId, setPartyId] = useState(""); const [isInCall, setIsInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false); const [isCameraOff, setIsCameraOff] = useState(false);
  const [message, setMessage] = useState(""); const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]); const [screenStream, setScreenStream] = useState<MediaStream | null>(null); const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [recordingUrl, setRecordingUrl] = useState(""); const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null); const screenStreamRef = useRef<MediaStream | null>(null); const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const recorderRef = useRef<MediaRecorder | null>(null); const chunksRef = useRef<Blob[]>([]);
  useEffect(() => { const id = new URLSearchParams(window.location.search).get("party"); if (id && /^[a-zA-Z0-9_-]{8,80}$/.test(id)) setPartyId(id); }, []);
  useEffect(() => { screenStreamRef.current = screenStream; }, [screenStream]);
  const inviteUrl = useMemo(() => partyId ? `${window.location.origin}/watch/${encodeURIComponent(videoId)}?party=${encodeURIComponent(partyId)}` : "", [partyId, videoId]);
  const closePeer = useCallback((id: string) => { peersRef.current.get(id)?.close(); peersRef.current.delete(id); setRemoteStreams((current) => { const next = { ...current }; delete next[id]; return next; }); }, []);
  const createPeer = useCallback((peerId: string, stream: MediaStream) => {
    closePeer(peerId); const peer = new RTCPeerConnection(rtcConfig); peersRef.current.set(peerId, peer);
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.onicecandidate = ({ candidate }) => { if (candidate) socketRef.current?.emit("party:signal", { to: peerId, signal: { candidate: candidate.toJSON() } }); };
    peer.ontrack = ({ streams }) => { if (streams[0]) setRemoteStreams((current) => ({ ...current, [peerId]: streams[0] })); };
    return peer;
  }, [closePeer]);
  const sendOffer = useCallback(async (peerId: string) => { const stream = localStreamRef.current; if (!stream) return; const peer = createPeer(peerId, stream); const offer = await peer.createOffer(); await peer.setLocalDescription(offer); socketRef.current?.emit("party:signal", { to: peerId, signal: offer }); }, [createPeer]);
  const leaveCall = useCallback(() => { peersRef.current.forEach((peer) => peer.close()); peersRef.current.clear(); socketRef.current?.disconnect(); socketRef.current = null; localStreamRef.current?.getTracks().forEach((track) => track.stop()); localStreamRef.current = null; screenStreamRef.current?.getTracks().forEach((track) => track.stop()); if (recorderRef.current?.state === "recording") recorderRef.current.stop(); setScreenStream(null); setParticipants([]); setIsInCall(false); }, []);
  useEffect(() => () => leaveCall(), [leaveCall]);
  const ensureParty = () => { const id = partyId || crypto.randomUUID().replace(/-/g, ""); if (!partyId) { setPartyId(id); window.history.replaceState(null, "", `/watch/${encodeURIComponent(videoId)}?party=${id}`); } return id; };
  const joinCall = async () => {
    const nextPartyId = ensureParty();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); localStreamRef.current = stream;
      const socket = io(getBackendUrl(), { transports: ["websocket", "polling"] }); socketRef.current = socket;
      const participant = { id: user?._id || crypto.randomUUID(), name: user?.name || "Guest" };
      socket.on("connect", () => socket.emit("party:join", { partyId: nextPartyId, participant }));
      socket.on("party:participants", (peers: Participant[]) => setParticipants([participant, ...peers]));
      socket.on("party:participant-joined", (peer: Participant) => { setParticipants((current) => current.some((item) => item.id === peer.id) ? current : [...current, peer]); void sendOffer(peer.id); });
      socket.on("party:participant-left", (peerId: string) => { closePeer(peerId); setParticipants((current) => current.filter((participant) => participant.id !== peerId)); });
      socket.on("party:message", (chat: ChatMessage) => setMessages((current) => [...current, chat]));
      socket.on("party:signal", async ({ from, signal }: { from: string; signal: Signal }) => { try { let peer = peersRef.current.get(from); if ("candidate" in signal) { if (peer) await peer.addIceCandidate(signal.candidate); return; } if (signal.type === "offer") { peer = createPeer(from, stream); await peer.setRemoteDescription(signal); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); socket.emit("party:signal", { to: from, signal: answer }); } else if (signal.type === "answer" && peer) await peer.setRemoteDescription(signal); } catch (error) { console.error("Watch-party connection error", error); toast.error("Could not connect one party participant."); } });
      setIsInCall(true);
    } catch (error) { console.error(error); toast.error("Camera and microphone permission is required to join the call."); }
  };
  const copyInvite = async () => { const url = inviteUrl || `${window.location.origin}/watch/${encodeURIComponent(videoId)}?party=${ensureParty()}`; try { await navigator.clipboard.writeText(url); toast.success("Watch-party invite copied."); } catch { toast.error("Could not copy the invite. Copy the address from your browser."); } };
  const sendMessage = () => { if (!message.trim() || !socketRef.current) return; socketRef.current.emit("party:message", { text: message }); setMessage(""); };
  const startScreenShare = async () => { try { const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); setScreenStream(stream); stream.getVideoTracks()[0]?.addEventListener("ended", () => setScreenStream(null)); for (const [peerId, peer] of peersRef.current) { stream.getTracks().forEach((track) => peer.addTrack(track, stream)); const offer = await peer.createOffer(); await peer.setLocalDescription(offer); socketRef.current?.emit("party:signal", { to: peerId, signal: offer }); } toast.success("Screen sharing started."); } catch { toast.error("Screen sharing was cancelled."); } };
  const toggleRecording = () => { if (recorderRef.current?.state === "recording") { recorderRef.current.stop(); return; } if (!screenStream) { toast.error("Start screen sharing before recording."); return; } chunksRef.current = []; const recorder = new MediaRecorder(screenStream); recorderRef.current = recorder; recorder.ondataavailable = ({ data }) => data.size && chunksRef.current.push(data); recorder.onstop = () => { setRecordingUrl(URL.createObjectURL(new Blob(chunksRef.current, { type: "video/webm" }))); toast.success("Recording is ready to download."); }; recorder.start(); };
  const toggleMuted = () => { localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = isMuted; }); setIsMuted((current) => !current); };
  const toggleCamera = () => { localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = isCameraOff; }); setIsCameraOff((current) => !current); };
  return <section className="rounded-lg border bg-card p-4 text-card-foreground"><div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Watch party</h2><p className="text-sm text-muted-foreground">Invite friends, chat, and call together in real time.</p></div><Button size="sm" variant="outline" onClick={copyInvite}><Copy className="h-4 w-4" />Invite</Button></div><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" onClick={joinCall} disabled={isInCall}><Video className="h-4 w-4" />{partyId ? "Join party" : "Start party"}</Button><Button size="sm" variant="outline" onClick={toggleMuted} disabled={!isInCall}>{isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}{isMuted ? "Unmute" : "Mute"}</Button><Button size="sm" variant="outline" onClick={toggleCamera} disabled={!isInCall}>{isCameraOff ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}{isCameraOff ? "Camera on" : "Camera off"}</Button><Button size="sm" variant="outline" onClick={startScreenShare} disabled={!isInCall}><MonitorUp className="h-4 w-4" />Share screen</Button><Button size="sm" variant="outline" onClick={toggleRecording} disabled={!isInCall}><Download className="h-4 w-4" />{recorderRef.current?.state === "recording" ? "Stop recording" : "Record"}</Button><Button size="sm" variant="destructive" onClick={leaveCall} disabled={!isInCall}><PhoneOff className="h-4 w-4" />Leave</Button></div>{partyId && <p className="mt-3 text-xs text-muted-foreground">Party link ready. Send it to friends, then they can select Join party.</p>}{Object.entries(remoteStreams).length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2">{Object.entries(remoteStreams).map(([id, stream]) => <video key={id} autoPlay playsInline className="aspect-video w-full rounded-md bg-black" ref={(node) => { if (node) node.srcObject = stream; }} />)}</div>}<div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]"><div className="min-h-40 rounded-md border bg-background p-3"><div className="mb-3 flex items-center gap-2 text-sm font-medium"><Users className="h-4 w-4" />Party chat</div><div className="max-h-44 space-y-2 overflow-y-auto text-sm">{messages.length === 0 ? <p className="text-muted-foreground">{isInCall ? "No messages yet." : "Join the party to chat."}</p> : messages.map((chat) => <p key={chat.id}><span className="font-medium">{chat.sender}: </span>{chat.text}</p>)}</div><div className="mt-3 flex gap-2"><Input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendMessage()} placeholder="Message" disabled={!isInCall} /><Button size="icon" onClick={sendMessage} disabled={!isInCall}><Send className="h-4 w-4" /></Button></div></div><div className="rounded-md border bg-background p-3 text-sm"><p className="font-medium">Participants ({participants.length})</p><div className="mt-2 space-y-2">{participants.length ? participants.map((participant) => <div key={participant.id} className="rounded-md bg-muted px-2 py-1">{participant.name}</div>) : <p className="text-muted-foreground">Nobody has joined.</p>}</div>{screenStream && <p className="mt-3 text-xs text-green-600">Screen sharing active</p>}{recordingUrl && <a href={recordingUrl} download={`watch-party-${videoId}.webm`} className="mt-3 inline-flex text-xs font-medium text-blue-600">Download recording</a>}</div></div></section>;
}
