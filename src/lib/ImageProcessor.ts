import { ConnectionOptions, Queue, Worker, WorkerOptions } from "bullmq";
import { Redis } from "ioredis";
import { createHash } from "crypto";
import type {
  ImageProcessorOptions,
  ProcessResult,
  JobData,
} from "../types/processor";
import { UnrecoverableImageError } from "../types";

export class ImageProcessor {
  private queue: Queue;
  private worker?: Worker;
  private redis: Redis;
  private options: ImageProcessorOptions;
  private queueName: string;

  constructor(options: ImageProcessorOptions) {
    this.options = options;
    this.queueName = options.queue?.name ?? "image-processing";

    this.redis =
      options.redis instanceof Redis ? options.redis : new Redis(options.redis);

    this.queue = new Queue(this.queueName, {
      connection: this.redis as ConnectionOptions,
      defaultJobOptions: {
        attempts: 4,
        backoff: { type: "exponential", delay: 1500, jitter: 0.2 },

        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
        ...options.queue?.defaultJobOptions,
      },
    });
  }

  /**
   * Process an image URL (recommended)
   */
  async process(
    input: { url?: string; buffer?: Buffer },
    overrides: Partial<ImageProcessorOptions> = {},
  ): Promise<ProcessResult> {
    const cacheConfig = { ...this.options.cache, ...overrides.cache };
    const isCacheEnabled = cacheConfig.enabled === true;

    let jobId: string;
    let cacheKey: string | null = null;

    if (input.url) {
      jobId = this.generateJobId(input.url);
      cacheKey = isCacheEnabled
        ? `${cacheConfig.keyPrefix || "cessor:result"}:${jobId}`
        : null;
    } else if (input.buffer) {
      const base64 = input.buffer.toString("base64");
      jobId = this.generateJobId(base64.slice(0, 100));
      cacheKey = isCacheEnabled
        ? `${cacheConfig.keyPrefix || "cessor:result"}:${jobId}`
        : null;
    } else {
      throw new Error("Either url or buffer must be provided");
    }

    // === 1. Check Cache (if enabled) ===
    if (cacheKey) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        try {
          const data = JSON.parse(cached);
          return { status: "done", jobId, ...data };
        } catch (e) {
          // ignore corrupt cache
        }
      }
    }

    // === 2. Check if job already exists in queue ===
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === "completed" && existing.returnvalue) {
        // Cache the result for future requests
        if (cacheKey) {
          await this.redis.set(
            cacheKey,
            JSON.stringify(existing.returnvalue),
            "EX",
            cacheConfig.ttlSeconds ?? 7 * 24 * 3600,
          );
        }
        return { status: "done", jobId, ...existing.returnvalue };
      }
      if (["active", "waiting", "delayed"].includes(state)) {
        return { status: "pending", jobId };
      }
    }

    // === 3. Enqueue new job ===
    const jobData: JobData = input.url
      ? {
          url: input.url,
          processing: { ...this.options.processing, ...overrides.processing },
          fetch: { ...this.options.fetch, ...overrides.fetch },
        }
      : {
          bufferBase64: input.buffer!.toString("base64"),
          processing: { ...this.options.processing, ...overrides.processing },
        };

    await this.queue.add("process-image", jobData, { jobId });

    return { status: "pending", jobId };
  }

  async invalidateCache(urlOrJobId: string): Promise<void> {
    const jobId = urlOrJobId.includes("://")
      ? this.generateJobId(urlOrJobId)
      : urlOrJobId;

    const prefix = this.options.cache?.keyPrefix || "cessor:result";
    await this.redis.del(`${prefix}:${jobId}`);
  }

  /**
   * Process a raw Buffer (for direct uploads)
   */
  async processBuffer(
    buffer: Buffer,
    overrides: Partial<ImageProcessorOptions> = {},
  ): Promise<ProcessResult> {
    const bufferBase64 = buffer.toString("base64");
    const jobId = this.generateJobId(bufferBase64.slice(0, 64)); // hash first part

    await this.queue.add(
      "process-buffer",
      {
        bufferBase64,
        sharp: { ...this.options.sharp, ...overrides.sharp },
      },
      { jobId },
    );

    return { status: "pending", jobId };
  }

  /**
   * Start processing workers (supports both sandboxed and non-sandboxed)
   */
  async startWorker(
    options: {
      concurrency?: number;
      sandbox?: boolean | "auto";
      lockDuration?: number;
      maxStalledCount?: number;
      stalledInterval?: number;
    } = {},
  ) {
    const {
      concurrency = 2,
      sandbox = "auto",
      lockDuration = 120000,
      maxStalledCount = 2,
      stalledInterval = 30000,
    } = options;

    const useSandbox = this.resolveSandboxMode(sandbox);

    const workerOptions = {
      connection: this.redis,
      concurrency,
      lockDuration,
      maxStalledCount,
      stalledInterval,
    } as WorkerOptions;

    if (useSandbox) {
      // === SANDBOXED MODE (Recommended for Sharp) ===
      this.worker = new Worker(
        this.queueName,
        require.resolve("../processor/image-processor", {}),
        workerOptions,
      );
      // console.log("[ImageProcessor] Started SANDBOXED workers");
    } else {
      // === NON-SANDBOXED MODE ===
      const { default: processor } =
        await import("../processor/image-processor");
      this.worker = new Worker(this.queueName, processor, workerOptions);
      // console.log("[ImageProcessor] Started non-sandboxed workers");
    }

    this.attachWorkerEvents();
    this.setupCacheListeners();
    return this.worker;
  }

  private resolveSandboxMode(sandbox: boolean | "auto"): boolean {
    if (sandbox === true) return true;
    if (sandbox === false) return false;

    return this.shouldUseSandbox();
  }

  /**
   * Smart auto-detection for sandboxed mode
   */
  private shouldUseSandbox(): boolean {
    // Use sandbox in production or when Sharp is likely to block event loop
    if (process.env.NODE_ENV === "production") return true;

    // Use sandbox if running with PM2 or in containers (common in production)
    if (process.env.PM2_HOME || process.env.KUBERNETES_SERVICE_HOST)
      return true;

    // Default to non-sandbox in local development for easier debugging
    return false;
  }

  private attachWorkerEvents() {
    if (!this.worker) return;

    this.worker.on("completed", (job) => {
      console.log(`[ImageProcessor] Job ${job.id} completed`);
    });

    this.worker.on("failed", (job, err) => {
      console.error(`[ImageProcessor] Job ${job?.id} failed:`, err.message);
    });

    this.worker.on("stalled", (jobId) => {
      console.warn(
        `[ImageProcessor] Job ${jobId} stalled. Consider increasing lockDuration.`,
      );
    });
  }

  private setupCacheListeners() {
    const cacheConfig = this.options.cache;
    if (!cacheConfig?.enabled) return;

    const prefix = cacheConfig.keyPrefix || "cessor:result";
    const ttl = cacheConfig.ttlSeconds ?? 7 * 24 * 3600;

    this.worker?.on("completed", async (job) => {
      if (job.returnvalue) {
        const cacheKey = `${prefix}:${job.id}`;
        try {
          await this.redis.set(
            cacheKey,
            JSON.stringify(job.returnvalue),
            "EX",
            ttl,
          );
          // console.log(`[Cessor] Cached result for job ${job.id}`);
        } catch (err) {
          console.warn(`[Cessor] Failed to cache job ${job.id}:`, err);
        }
      }
    });

    // Optional: Clear cache on permanent failure
    this.worker?.on("failed", async (job, err) => {
      if (job && err instanceof UnrecoverableImageError) {
        const cacheKey = `${prefix}:${job.id}`;
        await this.redis.del(cacheKey).catch(() => {});
      }
    });
  }

  private generateJobId(input: string): string {
    const hash = createHash("sha256").update(input).digest("hex").slice(0, 24);
    return `img-${hash}`;
  }

  /**
   * Graceful shutdown
   */
  async close() {
    await this.worker?.close();
    await this.queue.close();
    if (!(this.options.redis instanceof Redis)) {
      await this.redis.quit();
    }
    console.log("[ImageProcessor] Closed gracefully");
  }
}
