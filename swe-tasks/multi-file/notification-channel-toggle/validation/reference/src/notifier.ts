import type { NotificationPreferences, SendResult } from "./types";

function sendEmail(message: string): boolean {
  return message.length > 0;
}

function sendPush(message: string): boolean {
  return message.length > 0;
}

function sendSms(message: string): boolean {
  return message.length > 0;
}

export function dispatch(prefs: NotificationPreferences, message: string): SendResult[] {
  return prefs.channels.map((channel) => {
    if (channel === "email") return { channel, delivered: sendEmail(message) };
    if (channel === "push") return { channel, delivered: sendPush(message) };
    if (channel === "sms") return { channel, delivered: sendSms(message) };
    throw new Error(`unsupported channel: ${channel}`);
  });
}
