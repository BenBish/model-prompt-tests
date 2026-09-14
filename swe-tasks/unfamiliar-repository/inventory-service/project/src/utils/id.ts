let counter = 0;

export function nextOrderId(): string {
  counter += 1;
  return `order-${counter}`;
}
