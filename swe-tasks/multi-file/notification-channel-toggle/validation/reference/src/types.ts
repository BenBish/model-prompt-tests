export type Channel = "email" | "push" | "sms";

export interface NotificationPreferences {
  channels: Channel[];
  quietHours: boolean;
}

export interface SendResult {
  channel: string;
  delivered: boolean;
}
