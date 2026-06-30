import { UnrecoverableError } from "bullmq";

export class ImageProcessorError extends Error {
  constructor(
    message: string,
    public code = "IMAGE_PROCESSOR_ERROR",
  ) {
    super(message);
    this.name = "ImageProcessorError";
  }
}

export class ImageFetchError extends ImageProcessorError {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message, "IMAGE_FETCH_ERROR");
    this.name = "ImageFetchError";
  }
}

export class ImageConversionError extends ImageProcessorError {
  constructor(message: string) {
    super(message, "IMAGE_CONVERSION_ERROR");
    this.name = "ImageConversionError";
  }
}

export class UnrecoverableImageError extends UnrecoverableError {
  constructor(message: string) {
    super(message);
    this.name = "UnrecoverableImageError";
  }
}
