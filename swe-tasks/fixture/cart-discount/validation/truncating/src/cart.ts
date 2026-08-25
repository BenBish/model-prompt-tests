export type CartItem = {
  sku: string;
  priceCents: number;
  quantity: number;
};

export function totalCents(items: CartItem[], couponPercent = 0): number {
  const subtotal = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  return Math.floor(subtotal * (1 - couponPercent / 100));
}

export function itemCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
