import sharp from "sharp";
import { Job } from "bullmq";
import {
  UnrecoverableImageError,
  ImageFetchError,
  ImageConversionError,
} from "../types/errors";
import type { JobData, JobResult } from "../types/processor";

export default async function imageProcessor(
  job: Job<JobData>,
): Promise<JobResult> {
  const {
    url,
    bufferBase64,
    processing = {},
    fetch: fetchOpts = {},
  } = job.data;

  try {
    let inputBuffer: Buffer;

    if (url) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        fetchOpts.timeoutMs ?? 15000,
      );

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new ImageFetchError(`Failed to fetch: ${res.status}`, res.status);
      }
      inputBuffer = Buffer.from(await res.arrayBuffer());
    } else if (bufferBase64) {
      inputBuffer = Buffer.from(bufferBase64, "base64");
    } else {
      throw new UnrecoverableImageError("No image source provided");
    }

    const format = processing.format ?? "avif";

    if (format === "avif") {
      const output = await sharp(inputBuffer)
        .resize({ width: processing.width ?? 1280, withoutEnlargement: true })
        .avif({
          quality: processing.quality ?? 75,
          effort: processing.effort ?? 4,
        })
        .toBuffer();

      const meta = await sharp(output).metadata();

      return {
        dataUrl: `data:image/avif;base64,${output.toString("base64")}`,
        sizeKB: (output.byteLength / 1024).toFixed(1),
        width: meta.width,
        height: meta.height,
        format: "avif",
      };
    }

    throw new ImageConversionError(`Format ${format} not supported yet`);
  } catch (err: any) {
    if (err instanceof UnrecoverableImageError || err.statusCode === 404) {
      throw new UnrecoverableImageError(err.message);
    }
    throw err;
  }
}
