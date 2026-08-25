'use client';

import { useState } from 'react';
import { DesktopCanvas } from '@/components/production-canvas/desktop-canvas';
import { MobileGraphList } from '@/components/production-canvas/mobile-graph-list';
import type { ProductionGraphEdge, ProductionGraphNode } from '@/lib/production-graph/contracts';

export function CanvasSurface({ nodes, edges }: { nodes: ProductionGraphNode[]; edges: ProductionGraphEdge[] }) {
  const [selectedNode, setSelectedNode] = useState<ProductionGraphNode | null>(null);
  const onSelect = (node: ProductionGraphNode) => setSelectedNode(node);

  return <div className="space-y-3">
    <div className="hidden lg:block"><DesktopCanvas nodes={nodes} edges={edges} onSelect={onSelect} /></div>
    <div className="lg:hidden"><MobileGraphList nodes={nodes} edges={edges} onSelect={onSelect} /></div>
    <p className="sr-only" aria-live="polite">{selectedNode ? `Selected ${selectedNode.label}. ${selectedNode.detail ?? ''}` : 'No production step selected.'}</p>
  </div>;
}
