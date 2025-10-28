import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Checks if ffmpeg is available in the system
 */
export async function checkFfmpegAvailability(): Promise<boolean> {
  try {
    await execAsync("ffmpeg -version");
    return true;
  } catch {
    return false;
  }
}

/**
 * Optimizes a video using ffmpeg
 * Converts the video to H.264/AAC format with optimized settings
 */
export async function optimizeVideo(
  inputBuffer: Buffer,
  options: {
    debug?: boolean;
  } = {}
): Promise<Buffer> {
  const { debug = false } = options;

  // Check ffmpeg availability
  const ffmpegAvailable = await checkFfmpegAvailability();
  if (!ffmpegAvailable) {
    throw new Error(
      "ffmpeg is not available. Please install ffmpeg to use video optimization.\n" +
      "Install instructions:\n" +
      "  - macOS: brew install ffmpeg\n" +
      "  - Ubuntu/Debian: sudo apt-get install ffmpeg\n" +
      "  - Windows: winget install --id=Gyan.FFmpeg -e"
    );
  }

  // Create temporary file paths
  const fs = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { randomBytes } = await import("node:crypto");

  const tempId = randomBytes(16).toString("hex");
  const tempDir = tmpdir();
  const inputPath = join(tempDir, `notiondown-input-${tempId}`);
  const outputPath = join(tempDir, `notiondown-output-${tempId}.mp4`);

  try {
    // Write input buffer to temporary file
    await fs.promises.writeFile(inputPath, inputBuffer);

    // Run ffmpeg to optimize the video
    // -i: input file
    // -c:v libx264: use H.264 codec for video
    // -preset medium: balance between encoding speed and compression
    // -crf 23: constant rate factor (quality, 23 is good balance)
    // -c:a aac: use AAC codec for audio
    // -b:a 128k: audio bitrate
    // -movflags +faststart: optimize for web streaming
    // -y: overwrite output file
    const ffmpegCommand = `ffmpeg -i "${inputPath}" -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k -movflags +faststart -y "${outputPath}"`;

    if (debug) {
      console.log(`notiondown: video: running ffmpeg command: ${ffmpegCommand}`);
    }

    const { stderr } = await execAsync(ffmpegCommand);

    if (stderr) {
      console.log(`notiondown: video: ffmpeg stderr: ${stderr}`);
    }

    // Read optimized video
    const optimizedBuffer = await fs.promises.readFile(outputPath);

    if (debug) {
      console.log(
        `notiondown: video: optimized ${inputBuffer.length} bytes -> ${optimizedBuffer.length} bytes ` +
        `(${Math.floor((optimizedBuffer.length / inputBuffer.length) * 100)}%)`
      );
    }

    return optimizedBuffer;
  } finally {
    // Clean up temporary files
    try {
      await fs.promises.unlink(inputPath).catch(() => {});
      await fs.promises.unlink(outputPath).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Checks if a file is a video based on its extension
 */
export function isVideoFile(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop();
  const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v', 'mpg', 'mpeg'];
  return videoExtensions.includes(ext || '');
}

/**
 * Checks if a video file should be optimized based on the format list
 * @param filename - The video filename
 * @param formats - List of formats to optimize, "all" to optimize all formats, or undefined to skip optimization
 * @returns true if the video should be optimized
 */
export function shouldOptimizeVideo(
  filename: string,
  formats: string[] | "all" | undefined
): boolean {
  if (!formats) {
    return false;
  }

  if (formats === "all") {
    return true;
  }

  const ext = filename.toLowerCase().split('.').pop();
  return formats.includes(ext || '');
}
