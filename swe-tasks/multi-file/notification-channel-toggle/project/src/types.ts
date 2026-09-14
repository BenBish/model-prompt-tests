export type Channel = "email" | "push";

export interface NotificationPreferences {
  channels: Channel[];
  quietHours: boolean;
}

export interface SendResult {
  channel: string;
  delivered: boolean;
}
