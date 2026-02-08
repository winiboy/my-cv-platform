'use client';

/**
 * Client-side image background removal and compositing utilities.
 *
 * Uses @imgly/background-removal (WASM-based, runs entirely in-browser)
 * and Canvas API for color compositing.
 */

/**
 * Removes the background from an image, producing a transparent PNG blob.
 *
 * Uses dynamic import to avoid SSR bundling issues since
 * @imgly/background-removal relies on browser-only WASM modules.
 */
export async function removeImageBackground(
  imageSource: string,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const { removeBackground } = await import('@imgly/background-removal');

  const resultBlob = await removeBackground(imageSource, {
    progress: onProgress
      ? (key: string, current: number, total: number) => {
          // Normalise progress to 0-1 range
          if (total > 0) {
            onProgress(current / total);
          }
        }
      : undefined,
  });

  return resultBlob;
}

/**
 * Composites a foreground image (typically with transparent background)
 * onto a solid-color canvas, returning a base64 data URL (PNG).
 */
export async function compositeWithBackground(
  foregroundBlob: Blob,
  backgroundColor: string
): Promise<string> {
  const image = await blobToImage(foregroundBlob);

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to obtain 2D canvas context');
  }

  // Fill with the desired background color
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw the foreground (transparent areas now show the background color)
  ctx.drawImage(image, 0, 0);

  return canvas.toDataURL('image/png');
}

/**
 * Converts a Blob to an HTMLImageElement via a temporary object URL.
 * Cleans up the object URL once the image has loaded.
 */
function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image from blob'));
    };

    img.src = url;
  });
}
