import {
  galacticVectorToEquatorial,
  galacticVectorToLongitudeLatitude,
  worldDirectionToGalactic,
  type Vec3,
} from '../../utils/galacticCoordinates';

export interface SkySelection {
  raDeg: number;
  decDeg: number;
  galacticLongitude: number;
  galacticLatitude: number;
}

export interface SkyMarker {
  x: number;
  y: number;
  visible: boolean;
}

export interface SkyFrame {
  galacticLongitude: number;
  galacticLatitude: number;
  fovDeg: number;
  marker: SkyMarker | null;
  /** Camera state in radians, so overlays can follow (or react to) the motion. */
  view: { yaw: number; pitch: number; fov: number };
}

export interface FlyToOptions {
  /** Where the target lands, as a fraction of the canvas size from its center (−0.1 = left/up). */
  offset?: { x: number; y: number };
  /** Final field of view in degrees (never zooms out). */
  fovDeg?: number;
  durationMs?: number;
  onDone?: () => void;
}

interface SkySphereHandlers {
  onSelect: (selection: SkySelection | null) => void;
  onFrame: (frame: SkyFrame) => void;
  onReady: () => void;
  onError: () => void;
}

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

// Camera direction → galactic (l, b) → Mollweide → texture UV.
// The camera sits at the center, so the map is seen from inside the sphere.
const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec3 uF, uR, uU;
uniform float uFocal;
uniform vec4 uEllipse;
uniform float uGrid;
uniform float uDotted;
const float PI = 3.14159265359;

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  vec3 dir = normalize(uF * uFocal + uR * p.x + uU * p.y);

  float lat = asin(clamp(dir.y, -1.0, 1.0));
  float lon = atan(-dir.z, dir.x);

  float target = PI * sin(lat);
  float t = 2.0 * lat;
  for (int i = 0; i < 12; i++) {
    t -= (t + sin(t) - target) / max(1.0 + cos(t), 1e-5);
  }
  float theta = 0.5 * t;
  float xn = (lon / PI) * cos(theta);
  float yn = sin(theta);

  vec2 uv = vec2(uEllipse.x - xn * uEllipse.z, uEllipse.y - yn * uEllipse.w);
  vec3 col = texture2D(uTex, uv).rgb;

  if (uGrid > 0.5) {
    float lonDeg = degrees(lon), latDeg = degrees(lat);
    float px = degrees(2.0 / (uFocal * uRes.y));
    float w = px * mix(0.8, 1.1, uDotted);
    float gLon = abs(fract(lonDeg / 30.0 + 0.5) - 0.5) * 30.0;
    float gLat = abs(fract(latDeg / 30.0 + 0.5) - 0.5) * 30.0;
    // Dotted mode: meridians are cut along latitude, parallels along longitude (~6 px period).
    float alongMeridian = mix(1.0, step(fract(latDeg / (px * 6.0)), 0.4), uDotted);
    float alongParallel = mix(1.0, step(fract(lonDeg * cos(lat) / (px * 6.0)), 0.4), uDotted);
    float line = max(step(gLon * cos(lat), w) * alongMeridian, step(gLat, w) * alongParallel);
    float alongEquator = mix(1.0, step(fract(lonDeg * cos(lat) / (px * 12.0)), 0.55), uDotted);
    float eq = step(abs(latDeg), w * 1.5) * alongEquator;
    // Dots cover less area than solid lines, so they are drawn stronger to read the same.
    col = mix(col, vec3(0.45, 0.8, 1.0), line * mix(0.35, 0.75, uDotted));
    col = mix(col, vec3(1.0, 0.85, 0.3), eq * mix(0.6, 0.9, uDotted));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const DEG_TO_RAD = Math.PI / 180;

export interface CameraView {
  yaw: number;
  pitch: number;
  fov: number;
}

/** Camera view from the readout's galactic values (degrees): longitude is −yaw, latitude is the pitch. */
export function galacticView(longitudeDeg: number, latitudeDeg: number, fovDeg: number): CameraView {
  return { yaw: -longitudeDeg * DEG_TO_RAD, pitch: latitudeDeg * DEG_TO_RAD, fov: fovDeg * DEG_TO_RAD };
}

/** Home view (default start and "Recenter"): galactic lon 301.29°, lat −15.98°, FOV 72°. */
export const HOME_VIEW = galacticView(301.29, -15.98, 72);

const MIN_FOV = (2 * Math.PI) / 180;
const MAX_FOV = (120 * Math.PI) / 180;
const PITCH_LIMIT = Math.PI / 2 - 0.001;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Starts moving at once and settles gently. */
export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

interface Ellipse {
  cx: number;
  cy: number;
  a: number;
  b: number;
}

/** Finds the Mollweide ellipse by the first bright pixel on the central row and column. */
function detectEllipse(image: HTMLImageElement): Ellipse {
  const probe = document.createElement('canvas');
  probe.width = image.naturalWidth;
  probe.height = image.naturalHeight;
  const context = probe.getContext('2d', { willReadFrequently: true });
  if (!context) return { cx: 0.5, cy: 0.5, a: 0.5, b: 0.5 };
  context.drawImage(image, 0, 0);
  const width = probe.width;
  const height = probe.height;
  const row = context.getImageData(0, height >> 1, width, 1).data;
  const column = context.getImageData(width >> 1, 0, 1, height).data;
  const luminance = (data: Uint8ClampedArray, index: number) =>
    (data[index * 4] + data[index * 4 + 1] + data[index * 4 + 2]) / 3;
  const firstBright = (data: Uint8ClampedArray, count: number, reverse: boolean) => {
    for (let step = 0; step < count; step += 1) {
      const index = reverse ? count - 1 - step : step;
      if (luminance(data, index) > 50) return index;
    }
    return reverse ? count - 1 : 0;
  };
  const x0 = firstBright(row, width, false);
  const x1 = firstBright(row, width, true);
  const y0 = firstBright(column, height, false);
  const y1 = firstBright(column, height, true);
  const inset = Math.max(3, width / 600);
  return {
    cx: (x0 + x1) / 2 / width,
    cy: (y0 + y1) / 2 / height,
    a: ((x1 - x0) / 2 - inset) / width,
    b: ((y1 - y0) / 2 - inset) / height,
  };
}

/**
 * Renders an all-sky Mollweide map from inside a sphere and turns clicks into ICRS coordinates.
 * Interaction math matches prototypes/sky-sphere.
 */
export class SkySphereRenderer {
  private readonly gl: WebGLRenderingContext;
  private readonly handlers: SkySphereHandlers;
  private readonly uniforms: {
    res: WebGLUniformLocation | null;
    front: WebGLUniformLocation | null;
    right: WebGLUniformLocation | null;
    up: WebGLUniformLocation | null;
    focal: WebGLUniformLocation | null;
    ellipse: WebGLUniformLocation | null;
    grid: WebGLUniformLocation | null;
    dotted: WebGLUniformLocation | null;
  };

  private readonly view = { ...HOME_VIEW };
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private target: Vec3 | null = null;
  private pinchDistance = 0;
  private tap: { x: number; y: number } | null = null;
  private gridOn = false;
  private gridDotted = false;
  private ready = false;
  private disposed = false;
  private pending = false;
  private frameId = 0;
  private loadToken = 0;
  private flightId = 0;
  private interacted = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    handlers: SkySphereHandlers,
    initialView: CameraView = HOME_VIEW,
  ) {
    Object.assign(this.view, initialView);
    const gl = canvas.getContext('webgl', { antialias: false });
    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;
    this.handlers = handlers;
    this.uniforms = this.createProgram();
    this.attachInteraction();
    this.requestDraw();
  }

  load(url: string): void {
    const token = (this.loadToken += 1);
    const image = new Image();
    image.onload = () => {
      if (this.disposed || token !== this.loadToken) return;
      const ellipse = detectEllipse(image);
      const { gl } = this;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
      gl.uniform4f(this.uniforms.ellipse, ellipse.cx, ellipse.cy, ellipse.a, ellipse.b);
      this.ready = true;
      this.handlers.onReady();
      this.requestDraw();
    };
    image.onerror = () => {
      if (this.disposed || token !== this.loadToken) return;
      this.handlers.onError();
    };
    image.src = url;
  }

  setGrid(enabled: boolean, dotted = this.gridDotted): void {
    this.gridOn = enabled;
    this.gridDotted = dotted;
    this.requestDraw();
  }

  /** Animates back to the start view. */
  resetView(): void {
    this.animateTo(HOME_VIEW, 1200);
  }

  clearSelection(): void {
    this.target = null;
    this.handlers.onSelect(null);
    this.requestDraw();
  }

  pan(dxPx: number, dyPx: number): void {
    const radiansPerPixel = this.view.fov / this.canvas.clientHeight;
    this.view.yaw -= dxPx * radiansPerPixel;
    this.view.pitch = clamp(this.view.pitch + dyPx * radiansPerPixel, -PITCH_LIMIT, PITCH_LIMIT);
    this.requestDraw();
  }

  zoomBy(factor: number): void {
    this.zoom(factor, this.canvas.clientWidth / 2, this.canvas.clientHeight / 2);
  }

  resize(): void {
    this.requestDraw();
  }

  /** Draws immediately so overlays can be placed before the browser paints. */
  renderNow(): void {
    if (this.disposed) return;
    this.pending = false;
    window.cancelAnimationFrame(this.frameId);
    this.draw();
  }

  dispose(): void {
    this.disposed = true;
    window.cancelAnimationFrame(this.frameId);
    this.cancelFlight();
    this.detachInteraction();
  }

  /** Screen position (CSS px) of a world direction in the current view. */
  project(world: Vec3): SkyMarker {
    const { front, right, up } = this.basis();
    return this.projectWith(world, front, right, up);
  }

  /** Animates the camera to a world direction, placing it at `offset` from the center. */
  flyTo(world: Vec3, options: FlyToOptions = {}): void {
    this.cancelFlight();
    const { offset = { x: 0, y: 0 }, durationMs = 1400, onDone } = options;
    const finalFov = clamp(Math.min(this.view.fov, ((options.fovDeg ?? 30) * Math.PI) / 180), MIN_FOV, MAX_FOV);
    const end = this.solveView(world, finalFov, offset);
    this.animateTo({ ...end, fov: finalFov }, durationMs, onDone);
  }

  /** True once the user has dragged, zoomed or used the keyboard on the sky. */
  get hasInteracted(): boolean {
    return this.interacted;
  }

  /** Eased camera move (shortest way around in yaw, log-scale zoom). User input cancels it. */
  animateTo(
    end: { yaw: number; pitch: number; fov: number },
    durationMs: number,
    onDone?: () => void,
    easing: (t: number) => number = easeInOutCubic,
  ): void {
    this.cancelFlight();
    const start = { ...this.view };
    const deltaYaw = wrapAngle(end.yaw - start.yaw);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const duration = reduceMotion ? 0 : durationMs;
    const startedAt = performance.now();

    const step = (now: number) => {
      if (this.disposed) return;
      const t = duration ? Math.min(1, (now - startedAt) / duration) : 1;
      const k = easing(t);
      this.view.yaw = start.yaw + deltaYaw * k;
      this.view.pitch = start.pitch + (end.pitch - start.pitch) * k;
      this.view.fov = Math.exp(Math.log(start.fov) + (Math.log(end.fov) - Math.log(start.fov)) * k);
      this.renderNow();
      if (t < 1) {
        this.flightId = window.requestAnimationFrame(step);
      } else {
        this.flightId = 0;
        onDone?.();
      }
    };
    this.flightId = window.requestAnimationFrame(step);
  }

  private cancelFlight(): void {
    if (this.flightId) window.cancelAnimationFrame(this.flightId);
    this.flightId = 0;
  }

  /** Yaw/pitch that put `world` at the requested screen offset with the given field of view. */
  private solveView(world: Vec3, fov: number, offset: { x: number; y: number }) {
    const saved = { ...this.view };
    this.view.fov = fov;
    this.view.yaw = Math.atan2(world[2], world[0]);
    this.view.pitch = clamp(Math.asin(clamp(world[1], -1, 1)), -PITCH_LIMIT, PITCH_LIMIT);
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const goalX = width / 2 + offset.x * width;
    const goalY = height / 2 + offset.y * height;
    // A few correction steps: pan by the remaining screen error until the target sits on the goal.
    for (let iteration = 0; iteration < 4; iteration += 1) {
      const at = this.project(world);
      if (!at.visible && iteration > 0) break;
      const radiansPerPixel = this.view.fov / Math.max(1, height);
      this.view.yaw -= ((goalX - at.x) * radiansPerPixel) / Math.max(0.2, Math.cos(this.view.pitch));
      this.view.pitch = clamp(this.view.pitch + (goalY - at.y) * radiansPerPixel, -PITCH_LIMIT, PITCH_LIMIT);
    }
    const result = { yaw: this.view.yaw, pitch: this.view.pitch };
    Object.assign(this.view, saved);
    return result;
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    this.interacted = true;
    this.cancelFlight();
    this.canvas.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.offsetX, y: event.offsetY });
    this.tap = this.pointers.size === 1 ? { x: event.offsetX, y: event.offsetY } : null;
    this.canvas.dataset.dragging = 'true';
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.offsetX, y: event.offsetY };
    if (this.tap && Math.hypot(current.x - this.tap.x, current.y - this.tap.y) > 5) this.tap = null;

    if (this.pointers.size === 1) {
      const radiansPerPixel = this.view.fov / this.canvas.clientHeight;
      this.view.yaw -= (current.x - previous.x) * radiansPerPixel;
      this.view.pitch = clamp(
        this.view.pitch + (current.y - previous.y) * radiansPerPixel,
        -PITCH_LIMIT,
        PITCH_LIMIT,
      );
    } else if (this.pointers.size === 2) {
      this.pointers.set(event.pointerId, current);
      const [a, b] = [...this.pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDistance) this.zoom(this.pinchDistance / distance, (a.x + b.x) / 2, (a.y + b.y) / 2);
      this.pinchDistance = distance;
    }

    this.pointers.set(event.pointerId, current);
    this.requestDraw();
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    if (this.tap && this.pointers.size === 1) this.selectAt(event.offsetX, event.offsetY);
    this.tap = null;
    this.releasePointer(event.pointerId);
  };

  private readonly onPointerCancel = (event: PointerEvent) => {
    this.tap = null;
    this.releasePointer(event.pointerId);
  };

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.interacted = true;
    this.cancelFlight();
    this.zoom(Math.exp(event.deltaY * 0.001), event.offsetX, event.offsetY);
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    const step = this.canvas.clientHeight * 0.08;
    if (event.key === 'ArrowLeft') this.pan(-step, 0);
    else if (event.key === 'ArrowRight') this.pan(step, 0);
    else if (event.key === 'ArrowUp') this.pan(0, -step);
    else if (event.key === 'ArrowDown') this.pan(0, step);
    else if (event.key === '+' || event.key === '=') this.zoomBy(0.9);
    else if (event.key === '-' || event.key === '_') this.zoomBy(1.1);
    else return;
    this.interacted = true;
    this.cancelFlight();
    event.preventDefault();
  };

  private attachInteraction(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('keydown', this.onKeyDown);
  }

  private detachInteraction(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('keydown', this.onKeyDown);
  }

  private releasePointer(pointerId: number): void {
    this.pointers.delete(pointerId);
    this.pinchDistance = 0;
    if (this.pointers.size === 0) delete this.canvas.dataset.dragging;
  }

  private selectAt(x: number, y: number): void {
    this.target = this.screenToWorld(x, y);
    const galactic = worldDirectionToGalactic(this.target);
    const equatorial = galacticVectorToEquatorial(galactic);
    const { longitude, latitude } = galacticVectorToLongitudeLatitude(galactic);
    this.handlers.onSelect({
      raDeg: equatorial.raDeg,
      decDeg: equatorial.decDeg,
      galacticLongitude: longitude,
      galacticLatitude: latitude,
    });
    this.requestDraw();
  }

  private screenToWorld(x: number, y: number): Vec3 {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const px = (2 * x - width) / height;
    const py = (height - 2 * y) / height;
    const { front, right, up } = this.basis();
    const focal = 1 / Math.tan(this.view.fov / 2);
    const direction = [0, 1, 2].map((axis) => front[axis] * focal + right[axis] * px + up[axis] * py) as Vec3;
    const length = Math.hypot(...direction);
    return direction.map((value) => value / length) as Vec3;
  }

  private zoom(factor: number, x: number, y: number): void {
    const anchor = this.screenToWorld(x, y);
    this.view.fov = clamp(this.view.fov * factor, MIN_FOV, MAX_FOV);
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const now = this.screenToWorld(x, y);
      this.view.yaw += Math.atan2(anchor[2], anchor[0]) - Math.atan2(now[2], now[0]);
      this.view.pitch = clamp(
        this.view.pitch + Math.asin(anchor[1]) - Math.asin(now[1]),
        -PITCH_LIMIT,
        PITCH_LIMIT,
      );
    }
    this.requestDraw();
  }

  private basis(): { front: Vec3; right: Vec3; up: Vec3 } {
    const cosYaw = Math.cos(this.view.yaw);
    const sinYaw = Math.sin(this.view.yaw);
    const cosPitch = Math.cos(this.view.pitch);
    const sinPitch = Math.sin(this.view.pitch);
    const front: Vec3 = [cosPitch * cosYaw, sinPitch, cosPitch * sinYaw];
    const right: Vec3 = [-sinYaw, 0, cosYaw];
    const up: Vec3 = [
      right[1] * front[2] - right[2] * front[1],
      right[2] * front[0] - right[0] * front[2],
      right[0] * front[1] - right[1] * front[0],
    ];
    return { front, right, up };
  }

  private requestDraw(): void {
    if (this.pending || this.disposed) return;
    this.pending = true;
    this.frameId = window.requestAnimationFrame(() => this.draw());
  }

  private draw(): void {
    this.pending = false;
    if (this.disposed) return;
    const { canvas, gl } = this;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(canvas.clientWidth * pixelRatio);
    const height = Math.round(canvas.clientHeight * pixelRatio);
    if (width === 0 || height === 0) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    const { front, right, up } = this.basis();

    if (this.ready) {
      gl.uniform2f(this.uniforms.res, width, height);
      gl.uniform3fv(this.uniforms.front, front);
      gl.uniform3fv(this.uniforms.right, right);
      gl.uniform3fv(this.uniforms.up, up);
      gl.uniform1f(this.uniforms.focal, 1 / Math.tan(this.view.fov / 2));
      gl.uniform1f(this.uniforms.grid, this.gridOn ? 1 : 0);
      gl.uniform1f(this.uniforms.dotted, this.gridDotted ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    let longitude = Math.atan2(-front[2], front[0]) * (180 / Math.PI);
    if (longitude < 0) longitude += 360;
    this.handlers.onFrame({
      galacticLongitude: longitude,
      galacticLatitude: Math.asin(front[1]) * (180 / Math.PI),
      fovDeg: this.view.fov * (180 / Math.PI),
      marker: this.target ? this.markerPosition(front, right, up) : null,
      view: { ...this.view },
    });
  }

  private markerPosition(front: Vec3, right: Vec3, up: Vec3): SkyMarker {
    const target = this.target;
    if (!target) return { x: 0, y: 0, visible: false };
    return this.projectWith(target, front, right, up);
  }

  private projectWith(target: Vec3, front: Vec3, right: Vec3, up: Vec3): SkyMarker {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const depth = dot(target, front);
    const focal = 1 / Math.tan(this.view.fov / 2);
    const x = (dot(target, right) * focal * height) / depth / 2 + width / 2;
    const y = height / 2 - (dot(target, up) * focal * height) / depth / 2;
    return {
      x,
      y,
      visible: depth > 0 && x > -30 && x < width + 30 && y > -30 && y < height + 30,
    };
  }

  private createProgram(): SkySphereRenderer['uniforms'] {
    const { gl } = this;
    const program = gl.createProgram();
    if (!program) throw new Error('Could not create the sky program');
    gl.attachShader(program, this.compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, this.compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Could not link the sky program');
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, 'uTex'), 0);

    return {
      res: gl.getUniformLocation(program, 'uRes'),
      front: gl.getUniformLocation(program, 'uF'),
      right: gl.getUniformLocation(program, 'uR'),
      up: gl.getUniformLocation(program, 'uU'),
      focal: gl.getUniformLocation(program, 'uFocal'),
      ellipse: gl.getUniformLocation(program, 'uEllipse'),
      grid: gl.getUniformLocation(program, 'uGrid'),
      dotted: gl.getUniformLocation(program, 'uDotted'),
    };
  }

  private compile(type: number, source: string): WebGLShader {
    const { gl } = this;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Could not create a sky shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || 'Could not compile a sky shader');
    }
    return shader;
  }
}
