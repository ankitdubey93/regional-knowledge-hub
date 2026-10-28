import { roundDiv } from '@chub/shared/utils/money';

export type StockEvent =
  | { kind: 'purchase'; qty: number; unitCostCents: number; label?: string }
  | { kind: 'sale'; qty: number; label?: string };

export interface StockStep {
  index: number;
  event: StockEvent;
  costOfSaleCents: number; // 0 for a purchase
  qtyOnHand: number;
  valueOnHandCents: number;
  detail: string;
}

export interface StockResult {
  steps: StockStep[];
  cogsCents: number;
  closingQty: number;
  closingValueCents: number;
}

export class InsufficientStockError extends Error {
  constructor(public readonly index: number, public readonly wanted: number, public readonly onHand: number) {
    super(`Event ${index + 1} sells ${wanted} but only ${onHand} are on hand`);
  }
}

function assertQty(e: StockEvent, i: number) {
  if (!Number.isInteger(e.qty) || e.qty <= 0) throw new RangeError(`Event ${i + 1}: quantity must be a positive whole number`);
}

/** FIFO: each sale consumes the oldest remaining purchase layers first. */
export function fifo(events: StockEvent[]): StockResult {
  const layers: { qty: number; unitCostCents: number }[] = [];
  const steps: StockStep[] = [];
  let cogs = 0;
  events.forEach((e, i) => {
    assertQty(e, i);
    let cost = 0;
    let detail: string;
    if (e.kind === 'purchase') {
      layers.push({ qty: e.qty, unitCostCents: e.unitCostCents });
      detail = `New layer: ${e.qty} @ ${(e.unitCostCents / 100).toFixed(2)}`;
    } else {
      const onHand = layers.reduce((a, l) => a + l.qty, 0);
      if (e.qty > onHand) throw new InsufficientStockError(i, e.qty, onHand);
      let remaining = e.qty;
      const parts: string[] = [];
      while (remaining > 0) {
        const layer = layers[0]!;
        const take = Math.min(remaining, layer.qty);
        cost += take * layer.unitCostCents;
        parts.push(`${take} @ ${(layer.unitCostCents / 100).toFixed(2)}`);
        layer.qty -= take;
        remaining -= take;
        if (layer.qty === 0) layers.shift();
      }
      cogs += cost;
      detail = `Consumed ${parts.join(' + ')}`;
    }
    steps.push({
      index: i,
      event: e,
      costOfSaleCents: cost,
      qtyOnHand: layers.reduce((a, l) => a + l.qty, 0),
      valueOnHandCents: layers.reduce((a, l) => a + l.qty * l.unitCostCents, 0),
      detail,
    });
  });
  const last = steps.at(-1);
  return { steps, cogsCents: cogs, closingQty: last?.qtyOnHand ?? 0, closingValueCents: last?.valueOnHandCents ?? 0 };
}

/**
 * Perpetual weighted average cost: the average is recomputed after every
 * purchase; a sale takes value x qty / qtyOnHand, rounded once, so the value
 * left on hand never drifts from the total cost actually paid.
 */
export function weightedAverage(events: StockEvent[]): StockResult {
  let qty = 0;
  let value = 0;
  let cogs = 0;
  const steps: StockStep[] = [];
  events.forEach((e, i) => {
    assertQty(e, i);
    let cost = 0;
    let detail: string;
    if (e.kind === 'purchase') {
      qty += e.qty;
      value += e.qty * e.unitCostCents;
      detail = `New average: ${(value / qty / 100).toFixed(4)} per unit`;
    } else {
      if (e.qty > qty) throw new InsufficientStockError(i, e.qty, qty);
      cost = e.qty === qty ? value : roundDiv(value * e.qty, qty);
      qty -= e.qty;
      value -= cost;
      cogs += cost;
      detail = `${e.qty} at the running average`;
    }
    steps.push({ index: i, event: e, costOfSaleCents: cost, qtyOnHand: qty, valueOnHandCents: value, detail });
  });
  return { steps, cogsCents: cogs, closingQty: qty, closingValueCents: value };
}
