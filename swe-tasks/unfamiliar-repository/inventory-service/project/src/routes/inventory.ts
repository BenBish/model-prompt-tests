import { checkAvailability, restock } from "../services/inventoryService";

export function handleRestock(sku: string, amount: number) {
  const available = restock(sku, amount);
  return { sku, available };
}

export function handleAvailability(sku: string) {
  return { sku, available: checkAvailability(sku) };
}
