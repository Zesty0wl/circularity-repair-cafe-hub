/**
 * Load CesiumJS in the browser.
 *
 * Cesium is loaded from a <script> tag rather than imported, and read off
 * `window.Cesium`. Its source upsets bundlers, and the prebuilt file is plain
 * compiled JavaScript the browser runs as it is. The runtime files are copied
 * out of node_modules into `static/cesium/` by
 * `apps/web/scripts/copy-cesium-assets.mjs`, and Cesium fetches its workers and
 * images from the address in `CESIUM_BASE_URL`.
 */

const BASE_URL = '/cesium/';
const SCRIPT_URL = `${BASE_URL}Cesium.js`;
const CSS_URL = `${BASE_URL}Widgets/widgets.css`;

let loading: Promise<any> | null = null;

export function loadCesium(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Cesium only runs in the browser'));
  }
  const existing = (window as any).Cesium;
  if (existing) return Promise.resolve(existing);
  if (loading) return loading;

  (window as any).CESIUM_BASE_URL = BASE_URL;

  if (!document.getElementById('cesium-widgets-css')) {
    const link = document.createElement('link');
    link.id = 'cesium-widgets-css';
    link.rel = 'stylesheet';
    link.href = CSS_URL;
    document.head.appendChild(link);
  }

  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const cesium = (window as any).Cesium;
      if (cesium) resolve(cesium);
      else reject(new Error('Cesium loaded but did not register itself'));
    };
    script.onerror = () => reject(new Error('Could not load Cesium'));
    document.head.appendChild(script);
  });

  return loading;
}
