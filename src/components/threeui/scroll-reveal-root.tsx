'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

type ScrollRevealRootProps = {
  selector?: string;
};

/**
 * Adds the same viewport choreography to a page without changing its layout
 * or interaction code. Each matching block reveals once, then stays visible.
 */
export function ScrollRevealRoot({ selector = '#main-content > *' }: ScrollRevealRootProps) {
  const pathname = usePathname();

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
    if (!nodes.length) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    nodes.forEach((node, index) => {
      node.classList.add('ff-scroll-reveal');
      node.style.setProperty('--reveal-delay', `${Math.min(index % 4, 3) * 85}ms`);
    });

    if (reduceMotion || !('IntersectionObserver' in window)) {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -10% 0px' },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [pathname, selector]);

  return null;
}
