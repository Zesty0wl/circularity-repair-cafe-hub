<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { loadCesium } from '$lib/cesium';
  import {
    buildClusterIndex,
    groupsInView,
    zoomForView,
    type CafeGroup,
    type CafeIndex,
    type NetworkCafe,
  } from '$lib/repairCafeNetwork';

  export let cafes: NetworkCafe[] = [];
  /** This cafe's own entry, drawn larger and never folded into a group. */
  export let ours: NetworkCafe | null = null;
  /** The cafe the page has selected. */
  export let selected: NetworkCafe | null = null;
  /** True once the globe is drawn, so the page can drop its placeholder. */
  export let loaded = false;

  const dispatch = createEventDispatcher<{ select: NetworkCafe }>();

  // Fixed colours rather than the cafe's brand palette. The map underneath is
  // dark, and a cafe that picks a dark brand colour would have pins nobody
  // could see.
  const PIN = '#f4a91b';
  const MINE = '#ffffff';

  /** One dark map, drawn from OpenStreetMap, at every zoom level.
   *  Using a single source is what keeps the globe looking like one thing as
   *  you move in and out, instead of changing character halfway. */
  const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
  const TILE_SUBDOMAINS = ['a', 'b', 'c', 'd'];
  const TILE_CREDIT = '&copy; OpenStreetMap contributors &copy; CARTO';

  /** Camera heights, in metres above the ground. */
  const HOME_HEIGHT = 14_000_000;
  const CAFE_HEIGHT = 60_000;
  const MIN_HEIGHT = 800;
  const MAX_HEIGHT = 30_000_000;

  /** Cafe names appear once the camera is within this distance, in metres. */
  const NAME_VISIBLE_WITHIN = 900_000;

  /**
   * Markers sit this far above the ground, in metres.
   *
   * They are drawn with the depth test left on, so the planet hides the ones
   * round the back instead of letting you see through it. Sitting a little
   * proud of the surface stops a marker and the ground fighting over which is
   * in front, which shows up as flicker. The camera always looks straight down,
   * so the lift never pulls a pin away from its spot.
   */
  const MARKER_HEIGHT = 500;

  let container: HTMLDivElement;
  let Cesium: any = null;
  let viewer: any = null;
  let cafeSource: any = null;
  let oursSource: any = null;
  let clickHandler: any = null;
  let spinFrame: number | null = null;
  let spinning = false;
  let failed = false;
  /** Entities by cafe, so a selection can restyle just the one pin. */
  const entityFor = new Map<NetworkCafe, any>();
  let highlighted: any = null;
  let index: CafeIndex | null = null;
  /** The zoom the markers were last built for, so we only rebuild on a change. */
  let builtZoom = -1;
  let rebuildQueued = false;

  function sameCafe(a: NetworkCafe | null, b: NetworkCafe | null): boolean {
    if (!a || !b) return false;
    return a.slug === b.slug && a.name === b.name;
  }

  /**
   * A group bubble is drawn as a small picture, because that is what Cesium
   * wants for a marker. One is painted per size of group and kept for reuse.
   * Each is drawn at twice its final size and shown at half, so it stays sharp
   * on a high-resolution screen.
   */
  const BUBBLE_SCALE = 0.5;

  const bubbleCache = new Map<number, string>();
  function bubbleImage(size: number): string {
    const cached = bubbleCache.get(size);
    if (cached) return cached;

    const drawn = size / BUBBLE_SCALE;
    const canvas = document.createElement('canvas');
    canvas.width = drawn;
    canvas.height = drawn;
    const ctx = canvas.getContext('2d')!;
    const middle = drawn / 2;

    ctx.beginPath();
    ctx.arc(middle, middle, middle - 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(244, 169, 27, 0.94)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.stroke();

    const url = canvas.toDataURL('image/png');
    bubbleCache.set(size, url);
    return url;
  }

  /** Point the camera at a cafe. */
  export function flyTo(cafe: NetworkCafe, height = CAFE_HEIGHT): void {
    if (!viewer || !Cesium) return;
    stopSpin();
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(cafe.lng, cafe.lat, height),
      duration: 1.4,
    });
  }

  /** Pull back to the opening view. */
  export function resetView(): void {
    if (!viewer || !Cesium) return;
    const home = ours ?? cafes[0];
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        home?.lng ?? 5,
        home?.lat ?? 25,
        HOME_HEIGHT,
      ),
      duration: 1.4,
    });
  }

  // ── Gentle rotation until someone takes hold of the globe ────────────────
  function startSpin(): void {
    if (spinning || !viewer || !Cesium) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;
    spinning = true;
    const step = () => {
      if (!spinning || !viewer) return;
      viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.0009);
      spinFrame = requestAnimationFrame(step);
    };
    spinFrame = requestAnimationFrame(step);
  }

  function stopSpin(): void {
    spinning = false;
    if (spinFrame !== null) cancelAnimationFrame(spinFrame);
    spinFrame = null;
  }

  /** Build one pin, and its name for when the camera is close enough. */
  function addCafe(source: any, cafe: NetworkCafe, isOurs: boolean): void {
    const colour = Cesium.Color.fromCssColorString(isOurs ? MINE : PIN);
    const entity = source.entities.add({
      position: Cesium.Cartesian3.fromDegrees(cafe.lng, cafe.lat, MARKER_HEIGHT),
      point: {
        pixelSize: isOurs ? 15 : 8,
        color: colour,
        outlineColor: Cesium.Color.fromCssColorString('#1b1206').withAlpha(0.85),
        outlineWidth: isOurs ? 3 : 1.5,
      },
      label: {
        text: cafe.name,
        font: '600 13px "Hanken Grotesk Variable", system-ui, sans-serif',
        fillColor: Cesium.Color.fromCssColorString(isOurs ? '#ffffff' : '#ffd591'),
        outlineColor: Cesium.Color.BLACK.withAlpha(0.9),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, isOurs ? -22 : -16),
        // Names only appear once you are close enough to read them. Cesium
        // hides the rest for us, so there is no list of names to manage.
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
          0,
          isOurs ? NAME_VISIBLE_WITHIN * 4 : NAME_VISIBLE_WITHIN,
        ),
      },
    });
    entity.__cafe = cafe;
    entityFor.set(cafe, entity);
  }

  /** One group, drawn as a numbered bubble that zooms in when clicked. */
  function addGroup(group: CafeGroup): void {
    const size = Math.round(Math.min(34, 22 + 8 * Math.log10(group.count)) / 2) * 2;
    const entity = cafeSource.entities.add({
      position: Cesium.Cartesian3.fromDegrees(group.lng, group.lat, MARKER_HEIGHT),
      billboard: {
        image: bubbleImage(size),
        scale: BUBBLE_SCALE,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      },
      label: {
        text: String(group.count),
        font: '700 13px "Hanken Grotesk Variable", system-ui, sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#2b1a02'),
        style: Cesium.LabelStyle.FILL,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
      },
    });
    entity.__group = group;
  }

  /**
   * Work out what the camera can see, and give the globe only that.
   *
   * Cesium is only ever handed the markers in view, at the level of grouping
   * that suits the current zoom. That is what keeps it fast enough to keep
   * fetching sharper map tiles as you move around.
   */
  function rebuildMarkers(): void {
    if (!viewer || !Cesium || !index) return;

    const camera = viewer.camera;
    const cartographic = camera.positionCartographic;
    const height = cartographic.height;
    const lat = Cesium.Math.toDegrees(cartographic.latitude);

    // How much ground one screen pixel covers, from the camera's own frustum.
    const canvasHeight = viewer.scene.canvas.clientHeight || 600;
    const fovy = camera.frustum.fovy ?? Math.PI / 3;
    const metresPerPixel = (2 * height * Math.tan(fovy / 2)) / canvasHeight;
    const zoom = Math.round(zoomForView(metresPerPixel, lat));

    // Only what is on screen, falling back to the whole world when the globe
    // is small enough that Cesium cannot work out a rectangle.
    const rect = camera.computeViewRectangle();
    const bbox: [number, number, number, number] = rect
      ? [
          Cesium.Math.toDegrees(rect.west),
          Cesium.Math.toDegrees(rect.south),
          Cesium.Math.toDegrees(rect.east),
          Cesium.Math.toDegrees(rect.north),
        ]
      : [-180, -90, 180, 90];
    // A rectangle that wraps the date line comes back inside out.
    if (bbox[0] > bbox[2]) {
      bbox[0] = -180;
      bbox[2] = 180;
    }

    const { groups, singles } = groupsInView(index, bbox, zoom);

    entityFor.clear();
    highlighted = null;
    cafeSource.entities.removeAll();

    for (const group of groups) addGroup(group);
    for (const cafe of singles) addCafe(cafeSource, cafe, false);

    builtZoom = zoom;
    applySelection();
  }

  /** Rebuild everything. Called when the directory or our own cafe changes. */
  function buildEntities(): void {
    if (!viewer || !Cesium) return;
    // Our own cafe is left out of the grouping and kept in a layer of its own,
    // so it can never disappear inside a numbered circle.
    index = buildClusterIndex(ours ? cafes.filter((c) => c.slug !== ours.slug) : cafes);

    oursSource.entities.removeAll();
    if (ours) addCafe(oursSource, ours, true);

    builtZoom = -1;
    rebuildMarkers();
  }

  /** Make the selected pin stand out, and put the previous one back. */
  function applySelection(): void {
    if (!viewer || !Cesium) return;
    if (highlighted) {
      const cafe: NetworkCafe = highlighted.__cafe;
      const isOurs = Boolean(ours && cafe.slug === ours.slug);
      highlighted.point.pixelSize = isOurs ? 15 : 8;
      highlighted.point.color = Cesium.Color.fromCssColorString(isOurs ? MINE : PIN);
      highlighted = null;
    }
    if (!selected) return;
    for (const [cafe, entity] of entityFor) {
      if (!sameCafe(cafe, selected)) continue;
      entity.point.pixelSize = 17;
      entity.point.color = Cesium.Color.fromCssColorString(MINE);
      highlighted = entity;
      break;
    }
  }

  onMount(async () => {
    try {
      Cesium = await loadCesium();
    } catch {
      failed = true;
      return;
    }
    if (!container) return;

    // We use our own map tiles and no terrain, so Cesium's own service is not
    // involved. Blanking the token stops it warning about a missing one.
    Cesium.Ion.defaultAccessToken = '';

    viewer = new Cesium.Viewer(container, {
      // None of Cesium's own controls: the page provides what it needs.
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      navigationHelpButton: false,
      navigationInstructionsInitiallyVisible: false,
      baseLayer: Cesium.ImageryLayer.fromProviderAsync(
        Promise.resolve(
          new Cesium.UrlTemplateImageryProvider({
            url: TILE_URL,
            subdomains: TILE_SUBDOMAINS,
            maximumLevel: 18,
            credit: TILE_CREDIT,
          }),
        ),
      ),
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      // Cesium works out which map tiles it needs while it draws a frame. Only
      // drawing on demand saves work, but it also stops that: the moment the
      // camera settles the frames stop, so the next level of detail is never
      // asked for and a close-up view stays blank. Drawing every frame keeps
      // the map filling in as you move.
      requestRenderMode: false,
    });

    // The dark map is drawn to sit behind bright overlays, so on its own it is
    // almost black and the town names are hard to pick out. Lifting it here
    // keeps the same map at every zoom, and readable at all of them.
    const baseLayer = viewer.imageryLayers.get(0);
    if (baseLayer) {
      baseLayer.brightness = 1.9;
      baseLayer.contrast = 1.15;
      baseLayer.gamma = 1.1;
    }

    const scene = viewer.scene;
    // The tiles are almost black, so the globe underneath them should be too.
    // Otherwise every tile appears out of a pale background as it loads.
    scene.globe.baseColor = Cesium.Color.fromCssColorString('#05100e');
    // The glow Cesium normally lays over the ground is built for daylight
    // satellite imagery. Over a dark map it just washes everything pale blue,
    // so only the halo around the edge of the planet is kept.
    scene.globe.showGroundAtmosphere = false;
    scene.skyAtmosphere.show = true;
    scene.fog.enabled = false;
    scene.globe.enableLighting = false;
    scene.backgroundColor = Cesium.Color.TRANSPARENT;

    const controller = scene.screenSpaceCameraController;
    controller.minimumZoomDistance = MIN_HEIGHT;
    controller.maximumZoomDistance = MAX_HEIGHT;
    controller.enableTilt = false;

    // ── Grouping ─────────────────────────────────────────────────────────
    // Cesium groups pins that land close together on screen, and hides the
    // pins inside a group. That also keeps the names tidy: a name can only
    // show for a pin that is standing on its own.
    // Grouping is worked out before Cesium sees anything, so its own
    // clustering stays off.
    cafeSource = new Cesium.CustomDataSource('cafes');
    cafeSource.clustering.enabled = false;
    oursSource = new Cesium.CustomDataSource('ours');
    oursSource.clustering.enabled = false;

    await viewer.dataSources.add(cafeSource);
    await viewer.dataSources.add(oursSource);

    buildEntities();

    // ── What happens on a click ──────────────────────────────────────────
    clickHandler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    clickHandler.setInputAction((movement: any) => {
      const picked = scene.pick(movement.position);
      if (!Cesium.defined(picked)) return;
      const id = picked.id;
      const group: CafeGroup | undefined = id?.__group;
      if (group && index) {
        // Supercluster knows the exact zoom this group comes apart at. Go a
        // little past it, so one click always makes progress.
        stopSpin();
        const target = index.getClusterExpansionZoom(group.id) + 0.4;
        // Each zoom level halves how much ground the view covers.
        const height = Math.max(
          MIN_HEIGHT,
          viewer.camera.positionCartographic.height / 2 ** (target - builtZoom),
        );
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(group.lng, group.lat, height),
          duration: 1.2,
        });
        return;
      }
      const cafe: NetworkCafe | undefined = id?.__cafe;
      if (cafe) dispatch('select', cafe);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Any handling of the globe stops it turning on its own.
    container.addEventListener('pointerdown', stopSpin);
    container.addEventListener('wheel', stopSpin, { passive: true });

    // Regroup as the camera moves. `changed` fires once the view has moved a
    // fair way, rather than on every frame, and the work is put off to the next
    // idle moment so a drag never stutters.
    viewer.camera.percentageChanged = 0.3;
    const queueRebuild = () => {
      if (rebuildQueued) return;
      rebuildQueued = true;
      requestAnimationFrame(() => {
        rebuildQueued = false;
        rebuildMarkers();
      });
    };
    viewer.camera.changed.addEventListener(queueRebuild);
    viewer.camera.moveEnd.addEventListener(queueRebuild);

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        ours?.lng ?? cafes[0]?.lng ?? 5,
        ours?.lat ?? cafes[0]?.lat ?? 25,
        HOME_HEIGHT,
      ),
    });

    loaded = true;
    startSpin();
  });

  // Redraw the pins when the page hands over different data.
  $: if (viewer && Cesium) {
    cafes;
    ours;
    buildEntities();
  }

  // Restyle when the page changes what is selected.
  $: if (viewer && Cesium) {
    selected;
    applySelection();
  }

  onDestroy(() => {
    stopSpin();
    container?.removeEventListener('pointerdown', stopSpin);
    container?.removeEventListener('wheel', stopSpin);
    clickHandler?.destroy?.();
    clickHandler = null;
    // Release the WebGL context. Without this, moving between pages leaks one
    // each time and the browser drops the oldest.
    viewer?.destroy?.();
    viewer = null;
  });
</script>

<div
  class="globe-stage"
  bind:this={container}
  role="img"
  aria-label="A globe showing Repair Cafes around the world. The same cafes are listed beside it."
></div>

{#if failed}
  <p class="globe-fallback">
    The globe could not load in this browser. You can still search the list below.
  </p>
{/if}

<style>
  .globe-stage {
    width: 100%;
    height: 100%;
    cursor: grab;
  }
  .globe-stage:active {
    cursor: grabbing;
  }

  .globe-fallback {
    position: absolute;
    inset: auto 1rem 1rem;
    text-align: center;
    color: rgb(226 232 240);
    font-size: 0.875rem;
  }

  /* Cesium builds its own markup inside the container, so these have to be
     global. The map credit has to stay visible: OpenStreetMap and CARTO both
     ask for it. */
  :global(.globe-stage .cesium-viewer-bottom) {
    right: 0.6rem;
    bottom: 0.4rem;
    left: auto;
    text-align: right;
  }
  :global(.globe-stage .cesium-credit-text),
  :global(.globe-stage .cesium-credit-lightbox),
  :global(.globe-stage .cesium-widget-credits a) {
    color: rgba(255, 255, 255, 0.55);
    font-size: 10px;
  }
  :global(.globe-stage .cesium-widget-credits a:hover) {
    color: rgba(255, 255, 255, 0.9);
  }
  /* Cesium draws its own focus ring around the canvas. */
  :global(.globe-stage .cesium-widget canvas) {
    outline: none;
  }
</style>
