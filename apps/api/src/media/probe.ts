export type VideoMetadata = {
  durationSeconds: number;
};

export class VideoProbeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoProbeError";
  }
}

export async function probeVideo(path: string, ffprobePath = process.env.FFPROBE_PATH ?? "ffprobe"): Promise<VideoMetadata> {
  const processHandle = Bun.spawn([
    ffprobePath,
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "json",
    path,
  ], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(processHandle.stdout).text(),
    new Response(processHandle.stderr).text(),
    processHandle.exited,
  ]);
  if (exitCode !== 0) throw new VideoProbeError(stderr.trim() || "The video container could not be read.");
  const parsed = JSON.parse(stdout) as { format?: { duration?: string } };
  const durationSeconds = Number(parsed.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new VideoProbeError("The video container does not expose a readable duration.");
  }
  return { durationSeconds };
}
