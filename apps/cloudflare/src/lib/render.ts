// =============================================================================
//  Drawing SVG as PNG, without sharp
//  ---------------------------------------------------------------------------
//  The sharing pictures and the home screen icons are drawn as SVG and turned
//  into PNG. The old Docker edition does that with sharp. Here it is resvg, the
//  same kind of renderer compiled to WebAssembly so it runs inside the Worker.
//
//  Drawing a picture takes far more CPU than a normal request, so nothing calls
//  this on every request: each picture is drawn once and kept in R2, the same
//  way the old Docker edition keeps them on disk.
//
//  A Worker has no system fonts, so the font the pictures are drawn in is
//  bundled: DejaVu Sans, the same font the old Docker image installs, cut down to
//  Latin letters to keep the Worker small. See assets/fonts.
// =============================================================================
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import dejaVuSans from '../assets/fonts/DejaVuSans-latin.ttf';
import dejaVuSansBold from '../assets/fonts/DejaVuSans-Bold-latin.ttf';

let ready: Promise<void> | null = null;

function init(): Promise<void> {
  ready ??= initWasm(resvgWasm).catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

const fonts = (): Uint8Array[] => [new Uint8Array(dejaVuSans), new Uint8Array(dejaVuSansBold)];

function renderer(svg: string): InstanceType<typeof Resvg> {
  return new Resvg(svg, {
    fitTo: { mode: 'original' },
    font: {
      fontBuffers: fonts(),
      defaultFontFamily: 'DejaVu Sans',
      sansSerifFamily: 'DejaVu Sans',
    },
  });
}

/** An SVG document as a PNG. */
export async function svgToPng(svg: string): Promise<Uint8Array> {
  await init();
  const resvg = renderer(svg);
  try {
    const image = resvg.render();
    try {
      return image.asPng();
    } finally {
      image.free();
    }
  } finally {
    resvg.free();
  }
}

/** An SVG document as raw RGBA pixels, for reading colours out of a picture. */
export async function svgToPixels(svg: string): Promise<{ width: number; height: number; pixels: Uint8Array }> {
  await init();
  const resvg = renderer(svg);
  try {
    const image = resvg.render();
    try {
      return { width: image.width, height: image.height, pixels: new Uint8Array(image.pixels) };
    } finally {
      image.free();
    }
  } finally {
    resvg.free();
  }
}

/** A picture's bytes as a data: URL, for drawing it inside an SVG. */
export function dataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
