import { PhotoQualityStatus, PhotoType } from '../types';

export interface QualityGateResult {
  status: PhotoQualityStatus;
  isAcceptable: boolean;
  reason?: string;
  advice?: string;
  metrics: {
    brightness: number; // 0 - 255
    glarePercentage: number;
    laplacianVariance: number;
    width: number;
    height: number;
  };
}

/**
 * In-browser Image Quality Gate using HTML Canvas to inspect brightness, glare, blur, and aspect ratio.
 */
export async function evaluateImageQuality(
  imageElementOrBlob: HTMLImageElement | Blob,
  photoType: PhotoType
): Promise<QualityGateResult> {
  let img: HTMLImageElement;

  if (imageElementOrBlob instanceof Blob) {
    img = new Image();
    const url = URL.createObjectURL(imageElementOrBlob);
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
  } else {
    img = imageElementOrBlob;
  }

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  // Render to small offscreen canvas for fast pixel inspection
  const sampleW = 200;
  const sampleH = Math.max(1, Math.round((height / width) * sampleW));
  const canvas = document.createElement('canvas');
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return {
      status: 'GOOD',
      isAcceptable: true,
      metrics: { brightness: 128, glarePercentage: 0, laplacianVariance: 500, width, height },
    };
  }

  ctx.drawImage(img, 0, 0, sampleW, sampleH);
  const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
  const data = imgData.data;

  let totalLuminance = 0;
  let glarePixels = 0;
  const totalPixels = sampleW * sampleH;
  const gray: number[] = new Array(totalPixels);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Standard relative luminance
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    totalLuminance += lum;
    gray[i / 4] = lum;

    // Glare: highly blown out white highlights
    if (r > 248 && g > 248 && b > 248) {
      glarePixels++;
    }
  }

  const avgBrightness = Math.round(totalLuminance / totalPixels);
  const glarePercentage = Math.round((glarePixels / totalPixels) * 100);

  // Compute variance of Laplacian on grayscale grid for blur detection
  let laplacianSum = 0;
  let laplacianSqSum = 0;
  let edgeCount = 0;

  for (let y = 1; y < sampleH - 1; y++) {
    for (let x = 1; x < sampleW - 1; x++) {
      const idx = y * sampleW + x;
      // 4-neighbor Laplacian kernel
      const lap =
        gray[idx - 1] +
        gray[idx + 1] +
        gray[idx - sampleW] +
        gray[idx + sampleW] -
        4 * gray[idx];
      laplacianSum += lap;
      laplacianSqSum += lap * lap;
      edgeCount++;
    }
  }

  const laplacianVariance = edgeCount > 0 ? (laplacianSqSum / edgeCount) - Math.pow(laplacianSum / edgeCount, 2) : 500;

  const metrics = {
    brightness: avgBrightness,
    glarePercentage,
    laplacianVariance,
    width,
    height,
  };

  // 1. Resolution Check
  if (width < 320 || height < 320) {
    return {
      status: 'INCOMPLETE_VIEW',
      isAcceptable: false,
      reason: 'Resolution too low for AI verification.',
      advice: 'Move closer and use high resolution capture.',
      metrics,
    };
  }

  // 2. Too Dark Check (Luminance < 35)
  if (avgBrightness < 35) {
    return {
      status: 'TOO_DARK',
      isAcceptable: false,
      reason: 'This photo is too dark to inspect potential damage or markings.',
      advice: 'Turn on warehouse dock light or phone flash and retake.',
      metrics,
    };
  }

  // 3. Overexposed Check (Luminance > 230)
  if (avgBrightness > 230) {
    return {
      status: 'OVEREXPOSED',
      isAcceptable: false,
      reason: 'Photo is washed out / overexposed.',
      advice: 'Avoid direct high-intensity light and retake.',
      metrics,
    };
  }

  // 4. Glare Check (Glare pixels > 12% on label)
  if (photoType === 'BARCODE_LABEL' && glarePercentage > 12) {
    return {
      status: 'GLARE',
      isAcceptable: false,
      reason: 'Barcode/label has strong light reflection/glare.',
      advice: 'Barcode has glare. Tilt the carton slightly and retake.',
      metrics,
    };
  }

  // 5. Blur Check (Laplacian Variance < 45 on high resolution image)
  if (laplacianVariance < 45) {
    return {
      status: 'BLURRY',
      isAcceptable: false,
      reason: 'Image is blurry with low edge sharpness.',
      advice: 'Hold camera steady and focus on the carton surface.',
      metrics,
    };
  }

  return {
    status: 'GOOD',
    isAcceptable: true,
    metrics,
  };
}
