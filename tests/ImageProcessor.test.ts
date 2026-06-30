import { describe, it, expect, beforeEach, vi } from "vitest";
import { ImageProcessor } from "../src/lib/ImageProcessor";

// ============================================
// MOCKS
// ============================================

const mockGetJob = vi.fn().mockResolvedValue(null);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockQueueAdd = vi.fn().mockResolvedValue(undefined);
const mockSet = vi.fn().mockResolvedValue("OK");
const mockDel = vi.fn().mockResolvedValue(1);

// Mock ioredis
vi.mock("ioredis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ioredis")>();

  return {
    ...actual,
    Redis: vi.fn().mockImplementation(() => ({
      get: vi.fn(),
      set: mockSet,
      del: mockDel,
      quit: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    })),
  };
});

// Mock bullmq

vi.mock("bullmq", async (importOriginal) => {
  const actual = await importOriginal<typeof import("bullmq")>();

  return {
    ...actual, // Keep all original exports (including UnrecoverableError)
    Queue: vi.fn().mockImplementation(() => ({
      add: mockQueueAdd,
      getJob: mockGetJob,
      close: mockClose,
    })),
    Worker: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      close: mockClose,
    })),
  };
});

// ============================================
// TESTS
// ============================================

describe("ImageProcessor (Mocked)", () => {
  let processor: ImageProcessor;

  beforeEach(() => {
    vi.clearAllMocks();

    processor = new ImageProcessor({
      redis: { host: "localhost", port: 6379 },
      processing: { width: 800, quality: 75 },
      cache: {
        enabled: true,
        ttlSeconds: 3600,
        keyPrefix: "cessor:test",
      },
    });
  });

  it("should create an instance successfully", () => {
    expect(processor).toBeDefined();
  });

  it('should return "pending" status when adding a new job', async () => {
    // Simulate that no existing job exists
    mockGetJob.mockResolvedValue(null);

    const result = await processor.process({
      url: "https://example.com/image.jpg",
    });

    expect(result.status).toBe("pending");
    expect(result.jobId).toBeDefined();
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
  });

  it('should return "done" status if job already completed', async () => {
    mockGetJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue("completed"),
      returnvalue: {
        dataUrl: "data:image/avif;base64,abc123",
        sizeKB: "45.2",
      },
    });

    const result = await processor.process({
      url: "https://example.com/image.jpg",
    });

    expect(result.status).toBe("done");
    expect(result.dataUrl).toBe("data:image/avif;base64,abc123");
  });

  it('should return "pending" if job is still processing', async () => {
    mockGetJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue("active"),
    });

    const result = await processor.process({
      url: "https://example.com/image.jpg",
    });

    expect(result.status).toBe("pending");
  });

  it("should return cached result if available", async () => {
    const cachedData = {
      dataUrl: "data:image/avif;base64,cached123",
      sizeKB: "42.1",
    };

    // Mock cache hit
    const { Redis } = await import("ioredis");
    const mockRedis = (Redis as any).mock.results[0].value;
    mockRedis.get.mockResolvedValue(JSON.stringify(cachedData));

    const result = await processor.process({
      url: "https://example.com/photo.jpg",
    });

    expect(result.status).toBe("done");
    expect(result.dataUrl).toBe(cachedData.dataUrl);
    expect(mockQueueAdd).not.toHaveBeenCalled(); // No new job enqueued
  });

  it("should start worker in non-sandboxed mode", async () => {
    await processor.startWorker({ sandbox: false });

    const { Worker } = await import("bullmq");
    expect(Worker).toHaveBeenCalled();
  });

  it("should store result in cache on job completion", async () => {
    await processor.startWorker({ sandbox: false });

    const job = {
      id: "job123",
      returnvalue: { dataUrl: "data:image/avif;base64,xyz", sizeKB: "55.3" },
    };

    // Simulate a completed job by directly testing the caching logic if exposed,
    // or rely on the fact that the listener is attached.
    const completedHandlers = (processor as any).worker?.on.mock.calls
      .filter((call: any) => call[0] === "completed")
      .map((call: any) => call[1]);

    for (const handler of completedHandlers || []) {
      await handler(job);
    }

    expect(mockSet).toHaveBeenCalledWith(
      expect.stringContaining("job123"),
      expect.stringContaining("dataUrl"),
      "EX",
      expect.any(Number),
    );
  });

  it("should clear cache on unrecoverable error", async () => {
    await processor.startWorker({ sandbox: false });

    const job = { id: "job456" };
    const error = new (
      await import("../src/types/errors")
    ).UnrecoverableImageError("Invalid image");

    // Simulate a failed job by directly testing the caching logic if exposed,
    // or rely on the fact that the listener is attached.
    const failedHandlers = (processor as any).worker?.on.mock.calls
      .filter((call: any) => call[0] === "failed")
      .map((call: any) => call[1]);

    for (const handler of failedHandlers || []) {
      await handler(job, error);
    }

    expect(mockDel).toHaveBeenCalledWith("cessor:test:job456");
  });

  it("should close gracefully", async () => {
    await processor.close();
    // No error thrown = success
  });
});
