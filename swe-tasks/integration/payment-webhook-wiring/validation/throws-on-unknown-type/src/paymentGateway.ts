export type GatewayEventType = "payment.succeeded" | "payment.failed" | "payment.refunded" | string;

export interface GatewayEvent {
  type: GatewayEventType;
  orderId: string;
}

/** Existing, already-tested client for the payment provider. Do not modify. */
export function parseEvent(rawBody: string): GatewayEvent {
  const parsed = JSON.parse(rawBody);
  if (typeof parsed?.type !== "string" || typeof parsed?.data?.orderId !== "string") {
    throw new Error("malformed gateway payload");
  }
  return { type: parsed.type, orderId: parsed.data.orderId };
}
