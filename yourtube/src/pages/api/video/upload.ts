// Example for src/pages/api/video/upload.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    // This is where your server-side logic would handle the file.
    // For pure frontend testing, we just send back a fake success response:
    return res.status(200).json({ 
      success: true, 
      message: "Video uploaded successfully (mocked)!",
      videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4" // Dummy video link
    });
  }
  res.status(405).json({ message: 'Method not allowed' });
}