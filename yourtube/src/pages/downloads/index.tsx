import { Button } from "@/components/ui/button";
import { getDownloadedVideos, removeDownloadedVideo, type DownloadedVideo } from "@/lib/downloads";
import { getVideoUrl } from "@/lib/videoUrl";
import { useUser } from "@/lib/AuthContext";
import { Download, FolderDown, Play, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const DownloadsPage = () => {
  const { user } = useUser();
  const [downloads, setDownloads] = useState<DownloadedVideo[]>([]);

  useEffect(() => {
    setDownloads(getDownloadedVideos(user?._id));
  }, [user?._id]);

  const removeDownload = (videoId: string) => {
    if (!user?._id) return;
    removeDownloadedVideo(user._id, videoId);
    setDownloads(getDownloadedVideos(user._id));
  };

  if (!user) {
    return (
      <main className="flex-1 p-8">
        <h1 className="text-2xl font-semibold">Downloads</h1>
        <p className="mt-2 text-muted-foreground">Sign in to see your downloaded videos.</p>
      </main>
    );
  }

  return (
    <main className="flex-1 p-6 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 flex items-center gap-3">
          <div className="rounded-full bg-red-100 p-3 text-red-600 dark:bg-red-950">
            <FolderDown className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Downloads</h1>
            <p className="text-sm text-muted-foreground">Videos saved from this account on this device.</p>
          </div>
        </div>

        {downloads.length === 0 ? (
          <section className="rounded-xl border border-dashed p-12 text-center">
            <Download className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-medium">No downloaded videos yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">Download a video to watch it later from here.</p>
            <Button asChild className="mt-5"><Link href="/">Browse videos</Link></Button>
          </section>
        ) : (
          <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {downloads.map((video) => (
              <article key={video.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <video className="aspect-video w-full bg-black" controls preload="metadata">
                  <source src={getVideoUrl(video.filepath)} type="video/mp4" />
                </video>
                <div className="p-4">
                  <h2 className="line-clamp-2 font-semibold">{video.videotitle}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{video.videochanel || "YourTube"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Downloaded {new Date(video.downloadedAt).toLocaleDateString()}</p>
                  <div className="mt-4 flex gap-2">
                    <Button asChild size="sm" className="flex-1"><Link href={`/watch/${video.id}`}><Play className="h-4 w-4" />Watch</Link></Button>
                    <Button variant="outline" size="icon" onClick={() => removeDownload(video.id)} aria-label={`Remove ${video.videotitle} from downloads`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
};

export default DownloadsPage;
