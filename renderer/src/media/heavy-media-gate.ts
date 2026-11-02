/** One admission gate for queued/running renders, probes and analysis. Node's
 * synchronous admission occurs before awaiting any work, closing the gap
 * between a render acknowledgement and its next-microtask execution. */
export class HeavyMediaGate {
  private owner?: symbol;
  constructor(private readonly renderBusy: () => boolean) {}
  get acceptsRender() { return this.owner === undefined; }
  tryAcquireMedia(): (() => void) | null {
    if (this.owner || this.renderBusy()) return null;
    const owner = Symbol('heavy-media'); this.owner = owner;
    return () => { if (this.owner === owner) this.owner = undefined; };
  }
}
