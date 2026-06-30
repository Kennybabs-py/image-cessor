# image-cessor (An Image Processor)

A robust, Redis + BullMQ powered image processing library with sandboxed workers. Compresses large image into avif lightweight format losslessly. Designed to be extensible for multiple formats (AVIF, WebP, etc). Other formats coming soon.

## Features

- Sandboxed workers (recommended for Sharp)
- Automatic retries with exponential backoff + jitter
- Smart stalled job handling
- TypeScript first
- Works great with Next.js, Express, or any Node.js app

## Installation

```bash
npm install cessor bullmq ioredis sharp
```

## Quick start

```ts
import { ImageProcessor } from "cessor";

const processor = new ImageProcessor({
  redis: { url: process.env.REDIS_URL },
  processing: { width: 1280, quality: 75 },
});

// Start workers (sandboxed by default in production)
await processor.startWorker({ concurrency: 2 });

// Process an image
const result = await processor.process({
  url: "https://example.com/photo.jpg",
});

if (result.status === "done") {
  console.log(result.dataUrl);
}
```

## Caching

cessor can optionally cache processed image results in Redis to avoid re-processing the same image.

### Enable caching

```tsx
const processor = new ImageProcessor({
  redis: { url: process.env.REDIS_URL! },
  cache: {
    enabled: true,
    ttlSeconds: 7 * 24 * 3600, // 7 days (default)
    keyPrefix: "cessor:result", // optional
  },
});
```

### How It Works

- On first request → image is processed and result is cached.
- Subsequent requests for the same URL → result is returned instantly from cache.
- Cache is automatically updated when a job completes successfully.
- Cache is cleared for unrecoverable failures.

### Manual Cache Invalidation

```tsx
// Invalidate by URL
await processor.invalidateCache("https://example.com/photo.jpg");

// Or by job ID
await processor.invalidateCache("img:abc123...");
```

### Full Example Usage

```tsx
// With caching enabled
const processor = new ImageProcessor({
  redis: { url: process.env.REDIS_URL! },
  cache: { enabled: true, ttlSeconds: 86400 }, // 24 hours
});

const result = await processor.process({
  url: "https://example.com/photo.jpg",
});

// Later - force reprocessing
await processor.invalidateCache("https://example.com/photo.jpg");
const freshResult = await processor.process({
  url: "https://example.com/photo.jpg",
});
```

This is useful when the original source image has changed.

## Documentation

See the full documentation in the GitHub Wiki or check the examples folder.

## Versioning

This project uses Semantic Versioning. We use Changesets for versioning and changelog generation.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) first.

## License

MIT © Kehinde Babalola
