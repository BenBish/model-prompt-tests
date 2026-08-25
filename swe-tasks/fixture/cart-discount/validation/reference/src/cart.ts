export type CartItem = {
  sku: string;
  priceCents: number;
  quantity: number;
};

export function totalCents(items: CartItem[], couponPercent?: number): number {
  if (couponPercent !== undefined && (!Number.isFinite(couponPercent) || couponPercent < 0 || couponPercent > 100)) {
    throw new Error("couponPercent must be a finite number from 0 to 100");
  }
  const subtotal = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  return Math.round(subtotal * (1 - (couponPercent ?? 0) / 100));
}

export function itemCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
