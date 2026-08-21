import type { ToolSpec } from "../providers/types";

/**
 * Declarative tool-calling fidelity cases for the Hermes tool probe. Each case is scored
 * deterministically (no judge) against a wire-protocol expectation, not prose quality — this is
 * the gate that answers "can this model reliably drive tools at all," which the SWE scoreboard
 * showed is the dominant failure mode for local candidates, not reasoning quality.
 *
 * Negative cases (shouldNotCall: true) are as important as positive ones: an EA agent that
 * calls a tool on every message is as broken as one that never calls one. At least three of
 * these are negative by design.
 */

const SET_REMINDER: ToolSpec = {
  type: "function",
  function: {
    name: "set_reminder",
    description: "Sets a reminder for the user at a specific time.",
    parameters: {
      type: "object",
      properties: {
        time: { type: "string", description: "ISO 8601 or natural-language time" },
        message: { type: "string", description: "What to be reminded of" },
      },
      required: ["time", "message"],
    },
  },
};

const SEND_MESSAGE: ToolSpec = {
  type: "function",
  function: {
    name: "send_message",
    description: "Sends a message to a named recipient.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient name" },
        text: { type: "string", description: "Message body" },
      },
      required: ["to", "text"],
    },
  },
};

const CREATE_CALENDAR_EVENT: ToolSpec = {
  type: "function",
  function: {
    name: "create_calendar_event",
    description: "Creates a calendar event.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        start_time: { type: "string", description: "ISO 8601 or natural-language start time" },
        attendees: { type: "array", items: { type: "string" } },
      },
      required: ["title", "start_time"],
    },
  },
};

const LIST_CALENDAR_EVENTS: ToolSpec = {
  type: "function",
  function: {
    name: "list_calendar_events",
    description: "Lists calendar events for a given date.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "ISO 8601 date or natural-language date" },
      },
      required: ["date"],
    },
  },
};

const SEARCH_WEB: ToolSpec = {
  type: "function",
  function: {
    name: "search_web",
    description: "Searches the web for current information.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
};

export interface ToolProbeExpectation {
  /** True when the correct behavior is to NOT call any tool. */
  shouldNotCall?: boolean;
  /** Required when shouldNotCall is not set: the one correct tool name. */
  toolName?: string;
  /** Argument keys that must be present (and non-empty) in the parsed arguments object. */
  requiredArgs?: string[];
}

export interface ToolProbeCase {
  id: string;
  description: string;
  userMessage: string;
  tools: ToolSpec[];
  expect: ToolProbeExpectation;
}

export const TOOL_PROBE_CASES: ToolProbeCase[] = [
  {
    id: "set-reminder-basic",
    description: "Clear, unambiguous reminder request with one obviously correct tool.",
    userMessage: "Remind me to call the dentist next Tuesday at 9am.",
    tools: [SET_REMINDER, SEND_MESSAGE, CREATE_CALENDAR_EVENT],
    expect: { toolName: "set_reminder", requiredArgs: ["time", "message"] },
  },
  {
    id: "create-calendar-event-basic",
    description: "Clear scheduling request naming a time and an attendee.",
    userMessage: "Schedule a meeting with Alex for Thursday at 2pm.",
    tools: [CREATE_CALENDAR_EVENT, SEND_MESSAGE, SEARCH_WEB],
    expect: { toolName: "create_calendar_event", requiredArgs: ["title", "start_time"] },
  },
  {
    id: "send-message-basic",
    description: "Explicit instruction to relay a message to a named person.",
    userMessage: "Tell Alex the meeting is confirmed for Thursday.",
    tools: [SEND_MESSAGE, CREATE_CALENDAR_EVENT, SET_REMINDER],
    expect: { toolName: "send_message", requiredArgs: ["to", "text"] },
  },
  {
    id: "search-web-basic",
    description: "A question that requires current information the model can't know.",
    userMessage: "What's the weather in Austin right now?",
    tools: [SEARCH_WEB, SEND_MESSAGE, SET_REMINDER],
    expect: { toolName: "search_web", requiredArgs: ["query"] },
  },
  {
    id: "list-vs-search-temptation",
    description: "Tests whether the model picks the specific tool over the tempting generic one.",
    userMessage: "What's on my calendar for tomorrow?",
    tools: [LIST_CALENDAR_EVENTS, SEARCH_WEB, SEND_MESSAGE],
    expect: { toolName: "list_calendar_events", requiredArgs: ["date"] },
  },
  {
    id: "negative-ambiguous-request",
    description: "Vague request with no concrete target — correct behavior is to ask, not to guess a tool call.",
    userMessage: "Can you sort out the offsite thing we talked about?",
    tools: [CREATE_CALENDAR_EVENT, SEND_MESSAGE, SEARCH_WEB, SET_REMINDER],
    expect: { shouldNotCall: true },
  },
  {
    id: "negative-direct-answer",
    description: "A question answerable directly from the model's own knowledge — no tool needed.",
    userMessage: "What's 15% of 80?",
    tools: [CREATE_CALENDAR_EVENT, SEARCH_WEB, SET_REMINDER],
    expect: { shouldNotCall: true },
  },
  {
    id: "negative-ambiguous-recipient",
    description: "Send-message request with an unresolvable recipient — correct behavior is to ask who, not guess.",
    userMessage: "Email that guy about the thing we discussed.",
    tools: [SEND_MESSAGE, CREATE_CALENDAR_EVENT, SEARCH_WEB],
    expect: { shouldNotCall: true },
  },
  {
    id: "reminder-full-args",
    description: "Tests that both required arguments are populated, not just that the right tool fired.",
    userMessage: "Set a reminder for 3pm tomorrow to prep the board deck.",
    tools: [SET_REMINDER, CREATE_CALENDAR_EVENT, SEND_MESSAGE],
    expect: { toolName: "set_reminder", requiredArgs: ["time", "message"] },
  },
  {
    id: "event-with-attendee",
    description: "Scheduling request that should populate attendees, not just title/time.",
    userMessage: "Book 30 minutes with Priya on Friday morning to review the roadmap doc.",
    tools: [CREATE_CALENDAR_EVENT, SEND_MESSAGE, SET_REMINDER],
    expect: { toolName: "create_calendar_event", requiredArgs: ["title", "start_time"] },
  },
];
