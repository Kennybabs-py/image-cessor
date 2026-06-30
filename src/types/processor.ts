import type { Redis, RedisOptions } from "ioredis";

export interface ImageProcessorOptions {
  redis: RedisOptions | Redis;
  queue?: {
    name?: string;
    defaultJobOptions?: Record<string, any>;
  };
  sharp?: {
    width?: number;
    quality?: number;
    effort?: number;
    [key: string]: any;
  };
  processing?: {
    width?: number;
    quality?: number;
    effort?: number;
    format?: "avif" | "webp";
    [key: string]: any;
  };
  fetch?: {
    timeoutMs?: number;
    maxSizeBytes?: number;
    headers?: Record<string, string>;
  };

  /** Optional Redis caching for processed results */
  cache?: {
    enabled?: boolean; // default: false
    ttlSeconds?: number; // default: 7 days
    keyPrefix?: string; // default: "cessor:result"
  };
}

export interface ProcessResult {
  status: "done" | "pending" | "failed";
  dataUrl?: string;
  sizeKB?: string;
  width?: number;
  height?: number;
  format?: string;
  jobId?: string;
  error?: string;
}

export interface JobData {
  url?: string;
  bufferBase64?: string;
  processing?: ImageProcessorOptions["processing"];
  fetch?: ImageProcessorOptions["fetch"];
}

export interface JobResult {
  dataUrl: string;
  sizeKB: string;
  width?: number;
  height?: number;
  format: string;
}

export type SandboxMode = boolean | "auto";
