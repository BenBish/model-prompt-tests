import type { Channel, NotificationPreferences } from "./types";

const ALLOWED_CHANNELS: Channel[] = ["email", "push", "sms"];

export function normalizePreferences(input: {
  channels: string[];
  quietHours?: boolean;
}): NotificationPreferences {
  const channels = input.channels.filter((c): c is Channel =>
    (ALLOWED_CHANNELS as string[]).includes(c),
  );
  if (channels.length === 0) {
    throw new Error("at least one valid channel is required");
  }
  return { channels, quietHours: input.quietHours ?? false };
}
