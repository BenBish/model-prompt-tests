import type { StockRecord } from "../types";

const store = new Map<string, StockRecord>();

export function seed(records: StockRecord[]): void {
  store.clear();
  for (const r of records) store.set(r.sku, { ...r });
}

export function getStock(sku: string): StockRecord | undefined {
  return store.get(sku);
}

export function saveStock(record: StockRecord): void {
  store.set(record.sku, record);
}
