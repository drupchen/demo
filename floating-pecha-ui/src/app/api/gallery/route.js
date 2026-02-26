import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export async function GET() {
  const publicDir = path.join(process.cwd(), 'public');
  const jpgDir = path.join(publicDir, 'data', 'world', 'gallery', 'jpg');
  const mp4Dir = path.join(publicDir, 'data', 'world', 'gallery', 'mp4');

  let media = [];
  let idCounter = 1;

  // Helper to format filenames into nice captions (e.g., "teaching_in_bhutan.jpg" -> "Teaching In Bhutan")
  const formatCaption = (filename) => {
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
    return nameWithoutExt
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  };

  // Helper to safely read a directory
  const readDirSafe = (dir, type, subfolder) => {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        // Ignore hidden files like .DS_Store
        if (file.startsWith('.')) return;

        media.push({
          id: idCounter++,
          type: type,
          src: `/data/world/gallery/${subfolder}/${file}`,
          caption: formatCaption(file)
        });
      });
    }
  };

  // Read both folders
  readDirSafe(jpgDir, 'image', 'jpg');
  readDirSafe(mp4Dir, 'video', 'mp4');

  // Shuffle the array randomly
  const shuffledMedia = media.sort(() => Math.random() - 0.5);

  return NextResponse.json(shuffledMedia);
}