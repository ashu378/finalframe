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
      { src: '/showcase/comedy.webp', x: -2.2, y: 0, z: -0.8, ry: 0.42, rz: 0, color: 0x555555 },
      { src: '/showcase/cinema.webp', x: 0, y: 0, z: 0, ry: 0, rz: 0, color: 0xc6f432 },
      { src: '/showcase/ugc.webp', x: 2.2, y: 0, z: -0.8, ry: -0.42, rz: 0, color: 0x555555 },
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
        new THREE.BoxGeometry(2.2, 3.3, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x161618, metalness: 0.78, roughness: 0.24 }),
      );
      card.add(shell);

      const imageMaterial = new THREE.MeshBasicMaterial({ color: 0x222225 });
      const image = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 3.15), imageMaterial);
      image.position.z = 0.1;
      card.add(image);

      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(2.24, 3.34, 0.14)),
        new THREE.LineBasicMaterial({ color: data.color, transparent: true, opacity: 0.85 }),
      );
      card.add(edge);

      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 12, 12),
        new THREE.MeshBasicMaterial({ color: data.color, transparent: true, opacity: 0.95 }),
      );
      beacon.position.set(.97, 1.5, .16);
      card.add(beacon);

      textureLoader.load(data.src, (texture) => {
        if (disposed) { texture.dispose(); return; }
        textures.push(texture);
        const ratio = texture.image.width / texture.image.height;
        const targetRatio = 2.05 / 3.15;
        if (ratio > targetRatio) { texture.repeat.x = targetRatio / ratio; texture.offset.x = (1 - texture.repeat.x) / 2; }
        else { texture.repeat.y = ratio / targetRatio; texture.offset.y = (1 - texture.repeat.y) / 2; }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        imageMaterial.map = texture;
        imageMaterial.color.set(0xffffff);
        imageMaterial.needsUpdate = true;
      });

      stage.add(card);
      cards.push({ group: card, baseY: data.y, phase: index * 1.8, baseRy: data.ry });
    });

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      const isNarrow = width < 420;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.zoom = 1;
      camera.fov = 38;
      camera.position.z = isNarrow ? 7.2 : 7.8;
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
      const delta = Math.min(clock.getDelta(), .05);
      const follow = 1 - Math.exp(-5 * delta);
      const targetX = pointerTarget.current.x;
      const targetY = pointerTarget.current.y;
      camera.position.x += (targetX * 2.8 - camera.position.x) * follow;
      camera.position.y += (-targetY * .45 + .15 - camera.position.y) * follow;
      camera.lookAt(targetX * 1.1, 0, 0);
      stage.rotation.y += (targetX * -.12 - stage.rotation.y) * follow;
      cards.forEach(({ group, baseY, baseRy }) => {
        group.position.y += (baseY - targetY * .15 - group.position.y) * follow;
        group.rotation.y += (baseRy + targetX * .1 - group.rotation.y) * follow;
      });
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

      cards.forEach(({ group }) => group.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
          else object.material.dispose();
        }
      }));
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
          <span><strong>Your next scene starts here</strong><small>Three stories. One creative space.</small></span>
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
