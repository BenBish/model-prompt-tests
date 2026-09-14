import { parseEvent } from "./paymentGateway";
import { markFailed, markPaid, markRefunded } from "./orderService";

export function handleWebhook(rawBody: string): void {
  const event = parseEvent(rawBody);
  switch (event.type) {
    case "payment.succeeded":
      markPaid(event.orderId);
      break;
    case "payment.failed":
      markFailed(event.orderId);
      break;
    case "payment.refunded":
      markRefunded(event.orderId);
      break;
    default:
      throw new Error(`unhandled gateway event type: ${event.type}`);
  }
}
