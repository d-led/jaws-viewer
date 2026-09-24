import {
  ACESFilmicToneMapping,
  Box3,
  type BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  type Texture,
  Timer,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { WELD_FRACTION, type CurvatureKind } from "../domain/curvature";
import { separationOffsets, type Bounds } from "../domain/explode";
import type { Matrix4Entries } from "../domain/matrix4";
import {
  DEFAULT_SMOOTHING,
  clampSmoothing,
  clampUnit,
  type CameraView,
  type LayerSurface,
} from "../domain/view-settings";
import { errorMessage } from "../support/errors";
import {
  DEFAULT_DIRECTION,
  GRID_EXTENT_MM,
  framingFor,
  gridPlacementFor,
  poseFor,
  resizeFor,
  visibleBoundsOf,
  zoomLimitsFor,
  type ViewSize,
} from "./camera-framing";
import { appearanceOf } from "./layer-appearance";
import { layerPlacement } from "./layer-placement";
import {
  applySurfaceReply,
  showOwnColour,
  type SurfaceLayer,
  type SurfaceMaterial,
} from "./layer-surface";
import {
  createSurfacePainter,
  replyFor,
  type PaintRequest,
  type SurfaceEvent,
  type SurfacePainter,
} from "./surface-painter";
import { installTwoFingerScroll } from "./two-finger-scroll";
import {
  STATS_INTERVAL_SECONDS,
  createStatsWindow,
  visibleTrianglesOf,
  type DrawnContent,
} from "./viewport-stats";
import type {
  AddLayerOutcome,
  LayerSpec,
  StandardView,
  SurfaceProgress,
  Viewport,
  ViewportOptions,
} from "./viewport";

const BACKGROUND_COLOUR = 0x11151c;

const GRID_DIVISIONS = 40;
const GRID_COLOUR_LINES = 0x2b3340;
const GRID_COLOUR_AXIS = 0x3d4a5c;

const SURFACE_ROUGHNESS = 0.5;

/**
 * A layer as this viewport keeps it: what it is drawn with, and where it sits.
 *
 * How a surface is shown on it is `layer-surface`'s business, which is what the rest of these
 * fields are declared for.
 */
interface RenderedLayer extends SurfaceLayer {
  /** The layer's own colour, kept while a curvature ramp is the thing on screen. */
  colour: string;
  readonly triangles: number;
  readonly bounds: Bounds;
  /** Distance along the occlusal axis at full separation, taken from the scan geometry. */
  separationOffset: number;
  /** The user's visibility setting; `isolate` overlays on top of it. */
  visible: boolean;
  opacity: number;
  transform: Matrix4Entries | null;
}

/**
 * Renders the bundle with three.js: one mesh per scan, orbit/pan/zoom input, and an
 * environment map so the surfaces read clearly without a studio setup.
 */
class ThreeViewport implements Viewport {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly grid: GridHelper;
  private readonly roomEnvironment: RoomEnvironment;
  private readonly environment: Texture;
  private readonly content = new Group();
  private readonly layers = new Map<string, RenderedLayer>();
  private readonly resizeObserver: ResizeObserver;
  private readonly loader = new STLLoader();
  private readonly timer = new Timer();
  private readonly options: ViewportOptions;
  private readonly painter: SurfacePainter = createSurfacePainter();
  private readonly stats = createStatsWindow(STATS_INTERVAL_SECONDS);

  private isolatedId: string | null = null;
  private separationFactor = 0;
  private lastSize: ViewSize | null = null;

  constructor(canvas: HTMLCanvasElement, options: ViewportOptions = {}) {
    this.options = options;
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = ACESFilmicToneMapping;

    this.camera = new PerspectiveCamera(45, 1, 0.1, 10_000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.copy(DEFAULT_DIRECTION).multiplyScalar(200);

    this.scene.background = new Color(BACKGROUND_COLOUR);
    this.scene.add(this.content);
    this.addLights();

    this.roomEnvironment = new RoomEnvironment();
    this.environment = new PMREMGenerator(this.renderer).fromScene(
      this.roomEnvironment,
      0.04,
    ).texture;
    this.scene.environment = this.environment;

    this.grid = new GridHelper(
      GRID_EXTENT_MM,
      GRID_DIVISIONS,
      GRID_COLOUR_AXIS,
      GRID_COLOUR_LINES,
    );
    this.grid.rotation.x = Math.PI / 2; // the helper is built in XZ; scans are XY
    this.scene.add(this.grid);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    // Mouse: drag orbits, wheel zooms, right-drag pans.
    // Touch: one finger orbits and nothing else, so a drag never scrolls as well; two fingers
    // scroll the page. OrbitControls would otherwise set `touch-action: none` and claim both.
    this.controls.addEventListener("end", this.handleCameraSettled);
    canvas.style.touchAction = "none";
    installTwoFingerScroll(canvas, {
      setPanning: (enabled) => {
        this.controls.enablePan = enabled;
      },
    });

    // The timer is deliberately not connected to the Page Visibility API: nothing here is
    // animated against wall-clock time, and that API reports a zero delta whenever the tab
    // is in the background, which would stall the readout instead of just slowing it.
    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(canvas);
    this.handleResize();

    // Curvature is measured off the main thread; what comes back is turned into colours here.
    this.painter.onEvent(this.handleSurface);

    this.renderer.setAnimationLoop(this.render);
  }

  addLayer(spec: LayerSpec): AddLayerOutcome {
    let layer: RenderedLayer;
    try {
      layer = this.createLayer(spec);
    } catch (error) {
      return { ok: false, reason: errorMessage(error) };
    }

    this.layers.set(layer.id, layer);
    this.content.add(layer.mesh);
    this.refreshSeparation();
    return { ok: true };
  }

  private createLayer(spec: LayerSpec): RenderedLayer {
    const geometry = this.loader.parse(spec.stl);
    // Scanner exports often carry unusable facet normals, so shading is derived from
    // the triangles themselves.
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();

    const material = new MeshStandardMaterial({
      color: new Color(spec.colour),
      roughness: SURFACE_ROUGHNESS,
      metalness: 0,
      side: DoubleSide,
    });

    // White on its own, because the ramp that arrives in the vertex colours is the reading.
    const measuredMaterial = new MeshBasicMaterial({
      vertexColors: true,
      // The ramp was chosen by what it looks like on a screen, and a tone curve would print it as
      // something else again.
      toneMapped: false,
      side: DoubleSide,
    });

    const mesh: Mesh<BufferGeometry, SurfaceMaterial> = new Mesh(
      geometry,
      material,
    );
    mesh.name = spec.label;
    // Placement is composed by hand, so three must not overwrite it each frame.
    mesh.matrixAutoUpdate = false;

    return {
      id: spec.id,
      label: spec.label,
      colour: spec.colour,
      mesh,
      geometry,
      material,
      measuredMaterial,
      triangles: triangleCountOf(geometry),
      bounds: boundsOf(geometry),
      separationOffset: 0,
      visible: true,
      opacity: 1,
      transform: null,
      surface: "colour",
      smoothing: DEFAULT_SMOOTHING,
      measured: false,
    };
  }

  clearLayers(): void {
    for (const layer of this.layers.values()) {
      this.content.remove(layer.mesh);
      layer.geometry.dispose();
      layer.material.dispose();
      layer.measuredMaterial.dispose();
    }
    this.layers.clear();
    this.isolatedId = null;

    // Whatever the thread was measuring was measured from meshes that no longer exist, and a new
    // bundle's layers can reuse the same ids, so its work is stopped rather than inherited.
    this.painter.discard();
  }

  setLayerVisible(id: string, visible: boolean): void {
    const layer = this.layerFor(id);
    layer.visible = visible;
    this.applyLayerState(layer);
  }

  setLayerOpacity(id: string, opacity: number): void {
    const layer = this.layerFor(id);
    layer.opacity = clampUnit(opacity);
    this.applyLayerState(layer);
  }

  setLayerColour(id: string, colour: string): void {
    const layer = this.layerFor(id);
    layer.colour = colour;
    // The map is shown through its own material, so this is ready for whenever the layer's own
    // colour is back on screen.
    layer.material.color.set(colour);
  }

  setLayerTransform(id: string, transform: Matrix4Entries | null): void {
    const layer = this.layerFor(id);
    layer.transform = transform;
    this.applyPlacement(layer);
  }

  setLayerSurface(id: string, surface: LayerSurface): void {
    const layer = this.layerFor(id);
    if (layer.surface === surface) return;

    layer.surface = surface;
    this.refreshSurface(layer);
  }

  setLayerSmoothing(id: string, smoothing: number): void {
    const layer = this.layerFor(id);
    const passes = clampSmoothing(smoothing);
    if (layer.smoothing === passes) return;

    layer.smoothing = passes;
    this.refreshSurface(layer);
  }

  /**
   * Spreads the layers apart, and pulls the camera back with them when they open.
   *
   * Being asked for the separation the layers already have is not a request to reframe: every
   * settings change comes through here, so reframing on each one would throw away a zoom or a pan
   * as soon as the user touched anything — switching the surface, moving an opacity slider,
   * soloing a layer.
   */
  setSeparation(factor: number): void {
    const wanted = clampUnit(factor);
    if (wanted === this.separationFactor) return;

    this.separationFactor = wanted;
    for (const layer of this.layers.values()) {
      this.applyPlacement(layer);
    }
    this.pullBackToFit();
  }

  isolate(id: string | null): void {
    this.isolatedId = id;
    for (const layer of this.layers.values()) {
      this.applyLayerState(layer);
    }
  }

  fitAll(): void {
    const box = this.contentBounds();
    if (box === null) return;

    this.frame(box, this.currentDirection());
    this.syncGrid(box);
  }

  fitLayer(id: string): void {
    this.frame(
      new Box3().setFromObject(this.layerFor(id).mesh),
      this.currentDirection(),
    );
  }

  setView(view: StandardView): void {
    const pose = poseFor(view);
    this.camera.up.copy(pose.up);

    const box = this.contentBounds();
    if (box !== null) this.frame(box, pose.direction);
  }

  setGridVisible(visible: boolean): void {
    this.grid.visible = visible;
  }

  getCamera(): CameraView {
    const { x, y, z } = this.camera.position;
    const { x: tx, y: ty, z: tz } = this.controls.target;
    return { position: [x, y, z], target: [tx, ty, tz] };
  }

  setCamera(view: CameraView): void {
    this.camera.position.set(...view.position);
    this.controls.target.set(...view.target);

    const box = this.contentBounds();
    if (box !== null) this.limitZoom(box);
    this.controls.update();
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.timer.dispose();
    this.resizeObserver.disconnect();
    this.controls.removeEventListener("end", this.handleCameraSettled);
    this.clearLayers();
    this.painter.dispose();
    this.grid.geometry.dispose();
    this.grid.material.dispose();
    this.roomEnvironment.dispose();
    this.environment.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }

  private addLights(): void {
    this.scene.add(new HemisphereLight(0xffffff, 0x22303f, 1.6));

    const key = new DirectionalLight(0xffffff, 1.8);
    key.position.set(60, -90, 120);
    this.scene.add(key);

    const fill = new DirectionalLight(0xffffff, 0.7);
    fill.position.set(-90, 60, -60);
    this.scene.add(fill);
  }

  private layerFor(id: string): RenderedLayer {
    const layer = this.layers.get(id);
    if (layer === undefined)
      throw new Error(`No layer with id "${id}" has been added.`);
    return layer;
  }

  /**
   * Recomputes how far each layer travels, because separation depends on the whole set: a
   * layer added later changes what "the middle" means for the ones already there.
   */
  private refreshSeparation(): void {
    const offsets = separationOffsets(
      [...this.layers.values()].map((layer) => ({
        id: layer.id,
        bounds: layer.bounds,
      })),
    );

    for (const layer of this.layers.values()) {
      layer.separationOffset = offsets.get(layer.id) ?? 0;
      this.applyPlacement(layer);
    }
  }

  private applyPlacement(layer: RenderedLayer): void {
    layer.mesh.matrix.copy(
      layerPlacement(
        layer.transform,
        layer.separationOffset * this.separationFactor,
      ),
    );
    layer.mesh.matrixWorldNeedsUpdate = true;
  }

  /** Folds the user's settings and any isolated layer into what the renderer sees. */
  private applyLayerState(layer: RenderedLayer): void {
    const look = appearanceOf(layer, this.isolatedId);
    layer.mesh.visible = look.visible;

    for (const material of [layer.material, layer.measuredMaterial]) {
      material.opacity = layer.opacity;
      material.transparent = look.transparent;
      material.depthWrite = look.depthWrite;
    }
  }

  /**
   * Asks for the layer's corners to be coloured by its surface, or puts its own colour back.
   *
   * The geometry goes to the thread the first time and is kept there, so changing the scalar — and
   * switching back to plain colour — costs no measuring at all. The measurement is deliberately
   * not thrown away when colour is shown again: a jaw is big enough that letting it go would turn
   * every toggle into a wait.
   */
  private refreshSurface(layer: RenderedLayer): void {
    if (layer.surface === "colour") return showOwnColour(layer);

    this.paint(layer, layer.surface);
  }

  private paint(layer: RenderedLayer, surface: CurvatureKind): void {
    const first = !layer.measured;
    layer.measured = true;
    this.painter.paint({
      id: layer.id,
      surface,
      smoothing: layer.smoothing,
      ...this.geometryFor(layer, first),
    });
  }

  /** The geometry, on the one request that hands it over, and nothing on the ones that do not. */
  private geometryFor(
    layer: RenderedLayer,
    first: boolean,
  ): Pick<PaintRequest, "geometry"> {
    if (!first) return {};

    return {
      geometry: {
        positions: cornersOf(layer.geometry),
        tolerance: toleranceOf(layer.bounds),
      },
    };
  }

  /** The box around what is on screen, which is what the camera is framed on. */
  private contentBounds(): Box3 | null {
    return visibleBoundsOf(this.content.children);
  }

  /**
   * Pulls back to keep all of the assembly in view, without moving the grid.
   *
   * Opening it makes the assembly taller, so this is what a separation change ends with.
   */
  private pullBackToFit(): void {
    const box = this.contentBounds();
    if (box === null) return;

    this.frame(box, this.currentDirection());
  }

  private frame(box: Box3, direction: Vector3): void {
    const framing = framingFor({
      bounds: box,
      fov: this.camera.fov,
      aspect: this.camera.aspect,
      direction,
    });

    this.camera.position.copy(framing.position);
    this.camera.near = framing.near;
    this.camera.far = framing.far;
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(framing.target);
    this.controls.minDistance = framing.minDistance;
    this.controls.maxDistance = framing.maxDistance;
    this.controls.update();
  }

  private limitZoom(box: Box3): void {
    const limits = zoomLimitsFor(box);
    this.controls.minDistance = limits.minDistance;
    this.controls.maxDistance = limits.maxDistance;
  }

  private syncGrid(box: Box3): void {
    const placement = gridPlacementFor(box);
    this.grid.scale.setScalar(placement.scale);
    this.grid.position.copy(placement.position);
  }

  private currentDirection(): Vector3 {
    const direction = this.camera.position.clone().sub(this.controls.target);
    return direction.lengthSq() === 0
      ? DEFAULT_DIRECTION.clone()
      : direction.normalize();
  }

  private readonly handleResize = (): void => {
    const size = resizeFor({
      width: this.renderer.domElement.clientWidth,
      height: this.renderer.domElement.clientHeight,
      previous: this.lastSize,
    });
    if (size === null) return;

    this.lastSize = size;
    this.renderer.setSize(size.width, size.height, false);
    this.camera.aspect = size.aspect;
    this.camera.updateProjectionMatrix();
  };

  private readonly handleCameraSettled = (): void => {
    this.options.onCameraSettled?.();
  };

  /**
   * Takes the colours the thread measured, or gives up on them.
   *
   * A reply can arrive for a scalar the user has already moved on from; what to do about that is
   * `replyFor`'s decision, and all that is left here is telling the renderer about it.
   */
  private readonly handleSurface = (event: SurfaceEvent): void => {
    const layer = this.layers.get(event.id);
    if (layer === undefined) return;

    applySurfaceReply(layer, replyFor(event, layer), this.tell);
  };

  /** Says how a layer's surfacing is going, when there is anyone to say it to. */
  private readonly tell = (progress: SurfaceProgress): void => {
    this.options.onSurface?.(progress);
  };

  private readonly render = (timestamp: number): void => {
    this.timer.update(timestamp);
    const elapsed = this.timer.getDelta();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.reportStats(elapsed);
  };

  private reportStats(elapsed: number): void {
    const stats = this.stats.add(elapsed, () => this.drawnContent());
    if (stats !== null) this.options.onStats?.(stats);
  }

  /** What a reading says about the work, read only on the frames a reading is due. */
  private drawnContent(): DrawnContent {
    return {
      visibleTriangles: visibleTrianglesOf(this.layers.values()),
      drawCalls: this.renderer.info.render.calls,
    };
  }
}

export function createViewport(
  canvas: HTMLCanvasElement,
  options: ViewportOptions = {},
): Viewport {
  return new ThreeViewport(canvas, options);
}

function triangleCountOf(geometry: BufferGeometry): number {
  const positions = geometry.attributes["position"];
  return positions === undefined ? 0 : Math.floor(positions.count / 3);
}

function boundsOf(geometry: BufferGeometry): Bounds {
  const box = geometry.boundingBox;
  if (box === null) return { min: [0, 0, 0], max: [0, 0, 0] };

  return {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
  };
}

/**
 * The mesh's corners as a flat array, which is what the curvature fit welds into a surface.
 *
 * Read through the attribute rather than off its array, so nothing has to be assumed about how
 * three is holding them — and copied, because the thread takes the buffer away with it.
 */
function cornersOf(geometry: BufferGeometry): Float32Array {
  const attribute = geometry.getAttribute("position");
  const corners = new Float32Array(attribute.count * 3);

  for (let corner = 0; corner < attribute.count; corner += 1) {
    corners[corner * 3] = attribute.getX(corner);
    corners[corner * 3 + 1] = attribute.getY(corner);
    corners[corner * 3 + 2] = attribute.getZ(corner);
  }
  return corners;
}

/** How far apart two corners can be and still have been the same point to the scanner. */
function toleranceOf(bounds: Bounds): number {
  const span = Math.hypot(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  );
  return span * WELD_FRACTION;
}
