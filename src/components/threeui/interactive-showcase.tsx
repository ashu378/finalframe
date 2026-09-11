'use client';

import Image from 'next/image';
import { MousePointer2, Smartphone, Sparkles } from 'lucide-react';
import * as THREE from 'three';
import { CSSProperties, PointerEvent, useCallback, useEffect, useRef, useState } from 'react';

type Tilt = { x: number; y: number };

const frames = [
  { src: '/images/generated/finalframe-3d-blueprint.webp', label: 'Build the blueprint', className: 'ff-reel-card--left' },
  { src: '/images/generated/finalframe-3d-studio.webp', label: 'Shape the scene', className: 'ff-reel-card--center' },
  { src: '/images/generated/finalframe-3d-review.webp', label: 'Review the final frame', className: 'ff-reel-card--right' },
];

export function InteractiveShowcase() {
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

    scene.add(new THREE.HemisphereLight(0xaac5ff, 0x080b12, 1.5));
    const cobaltLight = new THREE.PointLight(0x86a7ff, 8, 16, 2);
    cobaltLight.position.set(-4, 3, 5);
    scene.add(cobaltLight);
    const amberLight = new THREE.PointLight(0xffc766, 7, 14, 2);
    amberLight.position.set(4, -1, 4);
    scene.add(amberLight);

    const cardData = [
      { src: '/images/generated/finalframe-3d-blueprint.webp', x: -2.55, y: 0.05, z: -0.1, ry: -0.22, rz: -0.08, color: 0x86a7ff },
      { src: '/images/generated/finalframe-3d-studio.webp', x: 0, y: 0.35, z: 0.9, ry: 0, rz: 0, color: 0xffc766 },
      { src: '/images/generated/finalframe-3d-review.webp', x: 2.55, y: 0.05, z: -0.1, ry: 0.22, rz: 0.08, color: 0x9be3c3 },
    ];
    const cards: { group: THREE.Group; baseY: number; phase: number; baseRy: number }[] = [];
    const textureLoader = new THREE.TextureLoader();

    cardData.forEach((data, index) => {
      const card = new THREE.Group();
      card.position.set(data.x, data.y, data.z);
      card.rotation.set(0, data.ry, data.rz);
      card.scale.setScalar(index === 1 ? 1.08 : 0.92);

      const shell = new THREE.Mesh(
        new THREE.BoxGeometry(2.45, 2.45, 0.16),
        new THREE.MeshStandardMaterial({ color: 0x111822, metalness: 0.78, roughness: 0.24 }),
      );
      card.add(shell);

      const imageMaterial = new THREE.MeshBasicMaterial({ color: 0x24334a });
      const image = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), imageMaterial);
      image.position.z = 0.1;
      card.add(image);

      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(2.5, 2.5, 0.18)),
        new THREE.LineBasicMaterial({ color: data.color, transparent: true, opacity: 0.85 }),
      );
      card.add(edge);

      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 12, 12),
        new THREE.MeshBasicMaterial({ color: data.color, transparent: true, opacity: 0.95 }),
      );
      beacon.position.set(1.16, 1.16, 0.16);
      card.add(beacon);

      textureLoader.load(data.src, (texture) => {
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
      new THREE.MeshBasicMaterial({ color: 0x86a7ff, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending }),
    );
    ring.rotation.set(1.2, 0.2, 0.1);
    ring.position.z = -1.35;
    stage.add(ring);

    const ringWarm = new THREE.Mesh(
      new THREE.TorusGeometry(3.25, 0.012, 10, 160),
      new THREE.MeshBasicMaterial({ color: 0xffc766, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending }),
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
      new THREE.PointsMaterial({ color: 0xaac5ff, size: 0.026, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }),
    );
    scene.add(particles);

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      const isNarrow = width < 640;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = isNarrow ? 44 : 34;
      camera.position.z = isNarrow ? 12.8 : 9.2;
      camera.updateProjectionMatrix();
      stage.scale.setScalar(isNarrow ? Math.max(0.58, Math.min(0.72, width / 560)) : 1);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    setWebglReady(true);

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
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
    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.dispose();
      particleGeometry.dispose();
      (particles.material as THREE.Material).dispose();
      cards.forEach(({ group }) => group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
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
  }, []);

  const style = {
    '--reel-x': tilt.x,
    '--reel-y': tilt.y,
  } as CSSProperties;

  return (
    <div
      className={`ff-interactive-reel ${isInteracting ? 'is-interacting' : ''}`}
      data-webgl={webglReady ? 'enabled' : 'fallback'}
      style={style}
      onPointerMove={updateTilt}
      onPointerLeave={resetTilt}
      onPointerUp={resetTilt}
      onPointerCancel={resetTilt}
      role="img"
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
          <span><strong>Plan in motion</strong><small>Drag across the story</small></span>
        </div>
      </div>
      <div className="ff-reel-hint">
        <MousePointer2 className="size-4" />
        <span className="hidden sm:inline">Move to explore</span>
        <span className="sm:hidden"><Smartphone className="mr-1 inline size-3.5" />Touch to explore</span>
      </div>
    </div>
  );
}
