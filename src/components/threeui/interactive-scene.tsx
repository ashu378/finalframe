'use client';

import Image from 'next/image';
import { MousePointer2, Smartphone, Sparkles, ArrowLeft, ArrowRight } from 'lucide-react';
import * as THREE from 'three';
import { CSSProperties, PointerEvent, useCallback, useEffect, useRef, useState } from 'react';

type Tilt = { x: number; y: number };

const frames = [
  { src: '/showcase/comedy.webp', label: 'A cartoon comedy', className: 'ff-reel-card--left' },
  { src: '/showcase/cinema.webp', label: 'A cinematic scene', className: 'ff-reel-card--center' },
  { src: '/showcase/ugc.webp', label: 'A product story', className: 'ff-reel-card--right' },
];

export function InteractiveShowcase() {
  const [view, setView] = useState(0);
  const [tilt, setTilt] = useState<Tilt>({ x: 0, y: 0 });
  const [isInteracting, setIsInteracting] = useState(false);
  const [webglReady, setWebglReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerTarget = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch {
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.15, 9.2);

    const stage = new THREE.Group();
    stage.rotation.order = 'YXZ';
    scene.add(stage);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x0b0b0c, 1.5));
    const cobaltLight = new THREE.PointLight(0xc6f432, 8, 16, 2);
    cobaltLight.position.set(-4, 3, 5);
    scene.add(cobaltLight);
    const amberLight = new THREE.PointLight(0xffffff, 7, 14, 2);
    amberLight.position.set(4, -1, 4);
    scene.add(amberLight);

    const cardData = [
      { src: '/showcase/comedy.webp', x: -2.55, y: 0.05, z: -0.1, ry: -0.22, rz: -0.08, color: 0xc6f432 },
      { src: '/showcase/cinema.webp', x: 0, y: 0.35, z: 0.9, ry: 0, rz: 0, color: 0xffffff },
      { src: '/showcase/ugc.webp', x: 2.55, y: 0.05, z: -0.1, ry: 0.22, rz: 0.08, color: 0xc6f432 },
    ];
    const cards: { group: THREE.Group; baseY: number; phase: number; baseRy: number }[] = [];
    let disposed = false;
    const textures: THREE.Texture[] = [];
    const textureLoader = new THREE.TextureLoader();

    cardData.forEach((data, index) => {
      const card = new THREE.Group();
      card.position.set(data.x, data.y, data.z);
      card.rotation.set(0, data.ry, data.rz);
      card.scale.setScalar(index === 1 ? 1.08 : 0.92);

      const shell = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 2.1, 0.16),
        new THREE.MeshStandardMaterial({ color: 0x161618, metalness: 0.78, roughness: 0.24 }),
      );
      card.add(shell);

      const imageMaterial = new THREE.MeshBasicMaterial({ color: 0x222225 });
      const image = new THREE.Mesh(new THREE.PlaneGeometry(2.95, 1.85), imageMaterial);
      image.position.z = 0.1;
      card.add(image);

      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(3.25, 2.15, 0.18)),
        new THREE.LineBasicMaterial({ color: data.color, transparent: true, opacity: 0.85 }),
      );
      card.add(edge);

      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 12, 12),
        new THREE.MeshBasicMaterial({ color: data.color, transparent: true, opacity: 0.95 }),
      );
      beacon.position.set(1.48, .93, .16);
      card.add(beacon);

      textureLoader.load(data.src, (texture) => {
        if (disposed) { texture.dispose(); return; }
        textures.push(texture);
        const ratio = texture.image.width / texture.image.height;
        if (ratio > 2.95 / 1.85) image.scale.y = (2.95 / ratio) / 1.85;
        else image.scale.x = (1.85 * ratio) / 2.95;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        imageMaterial.map = texture;
        imageMaterial.color.set(0xffffff);
        imageMaterial.needsUpdate = true;
      });

      stage.add(card);
      cards.push({ group: card, baseY: data.y, phase: index * 1.8, baseRy: data.ry });
    });

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.75, 0.018, 10, 180),
      new THREE.MeshBasicMaterial({ color: 0xc6f432, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending }),
    );
    ring.rotation.set(1.2, 0.2, 0.1);
    ring.position.z = -1.35;
    stage.add(ring);

    const ringWarm = new THREE.Mesh(
      new THREE.TorusGeometry(3.25, 0.012, 10, 160),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending }),
    );
    ringWarm.rotation.set(1.2, -0.35, 0.8);
    ringWarm.position.z = -1.15;
    stage.add(ringWarm);

    const particlePositions = new Float32Array(240 * 3);
    for (let index = 0; index < particlePositions.length; index += 3) {
      particlePositions[index] = (Math.random() - 0.5) * 11;
      particlePositions[index + 1] = (Math.random() - 0.5) * 7;
      particlePositions[index + 2] = (Math.random() - 0.5) * 5 - 1;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.026, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }),
    );
    scene.add(particles);

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      const isNarrow = width < 420;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.zoom = isNarrow ? 1.7 : 1.4;
      camera.fov = isNarrow ? 48 : 34;
      camera.position.z = isNarrow ? 9 : 9.2;
      camera.updateProjectionMatrix();
      stage.scale.setScalar(isNarrow ? .9 : 1);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    setWebglReady(true);

    let visible = true;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      if (!visible || document.hidden || media.matches) { frame = 0; return; }
      const elapsed = clock.getElapsedTime();
      const targetX = pointerTarget.current.x;
      const targetY = pointerTarget.current.y;
      camera.position.x += (targetX * 0.52 - camera.position.x) * 0.045;
      camera.position.y += (-targetY * 0.3 + 0.15 - camera.position.y) * 0.045;
      camera.lookAt(0, 0.15, 0);
      stage.rotation.y += ((targetX * 0.18 + Math.sin(elapsed * 0.22) * 0.035) - stage.rotation.y) * 0.04;
      stage.rotation.x += ((targetY * -0.12 + Math.cos(elapsed * 0.2) * 0.018) - stage.rotation.x) * 0.04;
      cards.forEach(({ group, baseY, phase, baseRy }) => {
        group.position.y = baseY + Math.sin(elapsed * 0.8 + phase) * 0.09;
        group.rotation.y = baseRy + targetX * 0.16 + Math.sin(elapsed * 0.45 + phase) * 0.018;
        group.rotation.x = targetY * -0.08 + Math.cos(elapsed * 0.5 + phase) * 0.012;
      });
      ring.rotation.z += 0.0018;
      ringWarm.rotation.z -= 0.0022;
      particles.rotation.y = elapsed * 0.018 + targetX * 0.06;
      particles.rotation.x = targetY * -0.04;
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(animate);
    };
    const resume = () => { if (visible && !document.hidden && !media.matches && !frame) animate(); };
    const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume(); });
    visibilityObserver.observe(host);
    document.addEventListener('visibilitychange', resume);
    const motionChange = () => { if (media.matches) { window.cancelAnimationFrame(frame); frame = 0; setWebglReady(false); } else { setWebglReady(true); resume(); } };
    media.addEventListener('change', motionChange);
    animate();

    return () => {
      disposed = true;
      visibilityObserver.disconnect();
      document.removeEventListener('visibilitychange', resume);
      media.removeEventListener('change', motionChange);
      textures.forEach(texture => texture.dispose());
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.dispose();
      particleGeometry.dispose();
      (particles.material as THREE.Material).dispose();
      cards.forEach(({ group }) => group.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
          else object.material.dispose();
        }
      }));
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
      ringWarm.geometry.dispose();
      (ringWarm.material as THREE.Material).dispose();
      setWebglReady(false);
    };
  }, []);

  const updateTilt = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
    const y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2));
    setTilt({ x, y });
    pointerTarget.current = { x, y };
    setIsInteracting(true);
  }, []);

  const resetTilt = useCallback(() => {
    setTilt({ x: 0, y: 0 });
    pointerTarget.current = { x: 0, y: 0 };
    setIsInteracting(false);
    setView(0);
  }, []);

  const turn = (direction: number) => {
    const next = Math.max(-1, Math.min(1, view + direction));
    setView(next); setTilt({ x: next * .75, y: 0 });
    pointerTarget.current = { x: next * .75, y: 0 };
  };
  const style = {
    '--reel-x': tilt.x,
    '--reel-y': tilt.y,
  } as CSSProperties;

  return (
    <div className="ff-showcase-wrapper">
    <div
      className={`ff-interactive-reel ${isInteracting ? 'is-interacting' : ''}`}
      data-webgl={webglReady ? 'enabled' : 'fallback'}
      style={style}
      onPointerMove={updateTilt}
      onPointerLeave={resetTilt}
      onPointerUp={resetTilt}
      onPointerCancel={resetTilt}
      role="group"
      aria-label="Interactive 3D storyboard preview. Move your pointer or finger across the frames."
    >
      <div className="ff-reel-glow" aria-hidden="true" />
      <canvas ref={canvasRef} className="ff-reel-canvas" aria-hidden="true" />
      <div className="ff-reel-stage">
        {frames.map((frame) => (
          <div key={frame.src} className={`ff-reel-card ${frame.className}`}>
            <div className="ff-reel-card__image">
              <Image src={frame.src} alt={frame.label} fill sizes="(max-width: 768px) 70vw, 28vw" />
              <div className="ff-reel-card__shine" aria-hidden="true" />
            </div>
            <div className="ff-reel-card__meta">
              <span>{frame.label}</span>
              <span className="ff-reel-card__dot" />
            </div>
          </div>
        ))}
        <div className="ff-reel-status">
          <span className="grid size-8 place-items-center rounded-lg bg-accent/15 text-accent"><Sparkles className="size-4" /></span>
          <span><strong>A world in the making</strong><small>Move across the scenes</small></span>
        </div>
      </div>
      <div className="ff-reel-hint">
        <MousePointer2 className="size-4" />
        <span className="hidden sm:inline">Move to explore</span>
        <span className="sm:hidden"><Smartphone className="mr-1 inline size-3.5" />Touch to explore</span>
      </div>
    </div>
    <div className="ff-turn-controls mt-6 flex items-center justify-center gap-3" aria-label="Scene viewing controls">
      <button type="button" onClick={() => turn(-1)} disabled={view === -1} className="grid size-11 place-items-center rounded-full border border-border bg-card disabled:opacity-40" aria-label="Turn scenes left"><ArrowLeft className="size-4" /></button>
      <span className="text-xs text-muted-foreground">Move, touch or use the arrows</span>
      <button type="button" onClick={() => turn(1)} disabled={view === 1} className="grid size-11 place-items-center rounded-full border border-border bg-card disabled:opacity-40" aria-label="Turn scenes right"><ArrowRight className="size-4" /></button>
    </div></div>
  );
}
