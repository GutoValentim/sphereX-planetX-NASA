import { useEffect, useRef } from 'react';
import type { SkyFrame } from './skySphereRenderer';
import styles from './SkyDust.module.css';

/** Few particles on purpose: the effect should feel like dust, not snow, and stay cheap. */
const PARTICLES_PER_MEGAPIXEL = 55;
const MAX_PARTICLES = 90;
/** Fraction of the camera motion the dust follows (scaled by each particle's depth). */
const INERTIA_FOLLOW = 0.55;
/** How long the dust keeps drifting after the camera stops (seconds). */
const INERTIA_TIME = 0.9;

interface Particle {
  x: number;
  y: number;
  /** Slow own drift, px/s. */
  dx: number;
  dy: number;
  /** Velocity from camera motion, px/s; decays over INERTIA_TIME. */
  vx: number;
  vy: number;
  depth: number;
  radius: number;
  alpha: number;
  phase: number;
  speed: number;
}

interface SkyDustProps {
  /** Registers a callback run after every sky redraw; returns the unsubscribe function. */
  subscribeFrame: (listener: (frame: SkyFrame) => void) => () => void;
  /** Dust drifts with inertia when the camera moves. */
  inertia: boolean;
}

function makeSprite(): HTMLCanvasElement {
  const size = 32;
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const context = sprite.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.25, 'rgba(235,242,255,0.55)');
    gradient.addColorStop(1, 'rgba(235,242,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return sprite;
}

function spawn(width: number, height: number): Particle {
  const angle = Math.random() * Math.PI * 2;
  const drift = 1.5 + Math.random() * 4;
  const depth = 0.35 + Math.random() * 0.65;
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    dx: Math.cos(angle) * drift,
    dy: Math.sin(angle) * drift,
    vx: 0,
    vy: 0,
    depth,
    radius: 1.2 + depth * 2.4,
    alpha: 0.12 + Math.random() * 0.35,
    phase: Math.random() * Math.PI * 2,
    speed: 0.2 + Math.random() * 0.6,
  };
}

/**
 * Faint floating dust over the sky sphere. Each particle drifts slowly on its own; when the
 * camera pans or zooms, particles are pushed along and coast to a stop, like inertia.
 */
function SkyDust({ subscribeFrame, inertia }: SkyDustProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return undefined;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const sprite = makeSprite();
    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let frameId = 0;
    let last = performance.now();
    let previousView: SkyFrame['view'] | null = null;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.min(MAX_PARTICLES, Math.round(((width * height) / 1_000_000) * PARTICLES_PER_MEGAPIXEL) + 12);
      particles = particles.slice(0, count);
      while (particles.length < count) particles.push(spawn(width, height));
    };

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);
      for (const particle of particles) {
        const twinkle = 0.75 + 0.25 * Math.sin(time * 0.001 * particle.speed + particle.phase);
        const size = particle.radius * 2;
        context.globalAlpha = particle.alpha * twinkle;
        context.drawImage(sprite, particle.x - particle.radius, particle.y - particle.radius, size, size);
      }
      context.globalAlpha = 1;
    };

    const tick = (time: number) => {
      const dt = Math.min(0.05, (time - last) / 1000);
      last = time;
      const decay = Math.exp(-dt / INERTIA_TIME);
      const margin = 8;
      for (const particle of particles) {
        particle.x += (particle.dx + particle.vx) * dt;
        particle.y += (particle.dy + particle.vy) * dt;
        particle.vx *= decay;
        particle.vy *= decay;
        // Wrap around the edges so the field stays evenly filled.
        if (particle.x < -margin) particle.x += width + 2 * margin;
        else if (particle.x > width + margin) particle.x -= width + 2 * margin;
        if (particle.y < -margin) particle.y += height + 2 * margin;
        else if (particle.y > height + margin) particle.y -= height + 2 * margin;
      }
      draw(time);
      frameId = window.requestAnimationFrame(tick);
    };

    // Camera motion → impulse. Total displacement ≈ motion × follow × depth, spread over INERTIA_TIME.
    const onFrame = (frame: SkyFrame) => {
      const view = frame.view;
      const before = previousView;
      previousView = view;
      if (!inertia || reduceMotion || !before || height === 0) return;
      const radiansPerPixel = view.fov / height;
      const shiftX = -(view.yaw - before.yaw) / radiansPerPixel;
      const shiftY = (view.pitch - before.pitch) / radiansPerPixel;
      const zoom = before.fov / view.fov - 1;
      if (Math.abs(shiftX) > width || Math.abs(shiftY) > height) return;
      const gain = INERTIA_FOLLOW / INERTIA_TIME;
      for (const particle of particles) {
        const radialX = (particle.x - width / 2) * zoom;
        const radialY = (particle.y - height / 2) * zoom;
        particle.vx += (shiftX + radialX) * particle.depth * gain;
        particle.vy += (shiftY + radialY) * particle.depth * gain;
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const unsubscribe = subscribeFrame(onFrame);
    if (reduceMotion) draw(performance.now());
    else frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      unsubscribe();
    };
  }, [subscribeFrame, inertia]);

  return <canvas ref={canvasRef} className={styles.dust} aria-hidden="true" />;
}

export default SkyDust;
