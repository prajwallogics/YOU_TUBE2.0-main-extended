export function getVideoUrl(filepath?: string) {
  if (!filepath) {
    return "";
  }

  if (filepath.startsWith("http")) {
    return filepath;
  }

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL;
  const normalizedPath = filepath.replace(/\\/g, "/").replace(/^\/+/, "");

  if (normalizedPath.startsWith("uploads/")) {
    const mediaPath = encodeURI(normalizedPath);
    return backendUrl ? `${backendUrl}/${mediaPath}` : `/${mediaPath}`;
  }

  return filepath.startsWith("/") ? filepath : `/${normalizedPath}`;
}
