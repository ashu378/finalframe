'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

type ScrollRevealRootProps = {
  selector?: string;
};

/** One-shot viewport motion must not mutate class/style attributes belonging
 * to streamed React children: they may still be waiting to hydrate. */
export function ScrollRevealRoot({ selector = '#main-content > *' }: ScrollRevealRootProps) {
  const pathname = usePathname();

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches || !('IntersectionObserver' in window)) return;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
    const animations = new Map<Element, Animation>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        animations.get(entry.target)?.play();
        observer.unobserve(entry.target);
      }
    }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });

    for (const [index, node] of nodes.entries()) {
      // An unsupported animation API leaves the original static content intact.
      if (typeof node.animate !== 'function') continue;
      const animation = node.animate([
        { opacity: 0, transform: 'translate3d(0, 36px, 0)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 800, delay: (index % 4) * 85, easing: 'cubic-bezier(.2,.75,.2,1)', fill: 'both' });
      animation.pause();
      animation.onfinish = () => { animation.cancel(); animations.delete(node); };
      animations.set(node, animation);
      observer.observe(node);
    }
    const stopMotion = () => {
      if (!media.matches) return;
      observer.disconnect();
      for (const animation of animations.values()) animation.cancel();
    };
    media.addEventListener?.('change', stopMotion);
    return () => {
      observer.disconnect();
      media.removeEventListener?.('change', stopMotion);
      for (const animation of animations.values()) animation.cancel();
    };
  }, [pathname, selector]);

  return null;
}
