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
      // Unrecognized event types are expected as the provider adds new ones over time;
      // ignore rather than fail so the provider doesn't get an error response and retry forever.
      break;
  }
}
