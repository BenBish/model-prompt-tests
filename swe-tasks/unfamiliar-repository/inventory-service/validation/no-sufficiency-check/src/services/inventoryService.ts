import { getStock, saveStock } from "../repositories/inventoryRepository";
import { clampNonNegative } from "../utils/clamp";

export class InsufficientStockError extends Error {
  constructor(sku: string) {
    super(`insufficient available stock for ${sku}`);
  }
}

export function checkAvailability(sku: string): number {
  const record = getStock(sku);
  return record ? record.available : 0;
}

// Used by the restock route to directly increase on-hand stock after a shipment arrives.
export function restock(sku: string, amount: number): number {
  const record = getStock(sku) ?? { sku, available: 0, reserved: 0 };
  const updated = { ...record, available: clampNonNegative(record.available + amount) };
  saveStock(updated);
  return updated.available;
}

export function reserveStock(sku: string, amount: number): { available: number; reserved: number } {
  const record = getStock(sku) ?? { sku, available: 0, reserved: 0 };
  const updated = {
    sku,
    available: clampNonNegative(record.available - amount),
    reserved: record.reserved + amount,
  };
  saveStock(updated);
  return { available: updated.available, reserved: updated.reserved };
}
