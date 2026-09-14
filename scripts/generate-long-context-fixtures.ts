#!/usr/bin/env bun
// Generates the hermes/long-context/{depth}/{subtype}/*.md fixtures for BSH-382.
// Re-run with `bun scripts/generate-long-context-fixtures.ts` after editing this file to
// regenerate all 20 fixtures (e.g. to add a depth band or subtype, or rebalance filler length).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");

type Depth = "short" | "8k" | "32k" | "64k";
const DEPTH_TOKENS: Record<Depth, number> = {
  short: 2048,
  "8k": 8192,
  "32k": 32768,
  "64k": 65536,
};
// Standard rule-of-thumb for English prose (roughly what cl100k/Qwen-family tokenizers average
// on this kind of text). This is an approximation, not a measurement: it hasn't been checked
// against the actual production tokenizer(s) (Qwen/GLM), so treat the four depth bands as
// close-but-not-exact. Before relying on these fixtures for precise depth-boundary comparisons,
// spot-check real token counts with the target tokenizer and adjust this constant if needed.
const CHARS_PER_TOKEN = 4;
const DEPTHS: Depth[] = ["short", "8k", "32k", "64k"];

function targetChars(depth: Depth): number {
  return DEPTH_TOKENS[depth] * CHARS_PER_TOKEN;
}

// A pool of unrelated, Cascade Robotics-themed filler paragraphs used to pad documents out to a
// target length. Cycling through this with a per-file seed offset keeps files from being
// byte-identical while staying deterministic (no external randomness).
const FILLER_PARAGRAPHS: string[] = [
  "Facilities sent a reminder that the third-floor kitchen coffee machine will be serviced Tuesday morning; the second-floor machine remains available throughout.",
  "The Denver satellite office reported their guest wifi credentials rotate monthly and the new password is posted on the lobby whiteboard, not emailed out for security reasons.",
  "IT rolled out a mandatory laptop OS update this week; anyone who defers it past Friday will be prompted again on next login and cannot defer a second time.",
  "The quarterly all-hands recording from last Thursday is now posted to the internal video portal under Company Updates, running just under forty minutes.",
  "Recruiting flagged that the backend engineering req has been open for six weeks and asked hiring managers to review the current candidate pipeline by end of week.",
  "The parking garage on 5th will be closed for resurfacing next weekend; employees are asked to use the overflow lot two blocks north during that window.",
  "Legal circulated an updated NDA template for use with prospective vendors; the previous version should no longer be sent starting this month.",
  "The design team's new component library ships with updated spacing tokens; teams migrating existing screens have a two-sprint grace period before the old tokens are removed.",
  "Finance's month-end close moved up by one business day this quarter to accommodate the new audit timeline, so expense reports are now due the 27th instead of the 28th.",
  "The office plant service swaps out anything looking unwell every other Wednesday; if a desk plant is struggling, tagging facilities gets it replaced at the next visit.",
  "A minor incident on the staging environment last night was traced to a stale feature flag and resolved before it reached production; a short postmortem is being drafted.",
  "The company newsletter this month features a profile of the customer success team and their new onboarding checklist for enterprise accounts.",
  "Building security asked that visitor badges be returned to the front desk rather than taken home, since the badge stock has been running low this quarter.",
  "The engineering blog published a short writeup on the recent database migration, noting it completed with under two minutes of read-only downtime.",
  "Snack restocking day moved from Mondays to Wednesdays after a vendor scheduling change; the pantry may run a little light on Tuesday afternoons as a result.",
  "The internal mentorship program is accepting new mentor sign-ups through the end of the month via the people-ops portal.",
  "A new expense category for co-working day passes was added to the finance system for employees who occasionally work from a shared space while traveling.",
  "The product team's roadmap review deck from last week's sync is available in the shared drive under Q3 Planning, alongside the raw survey data it references.",
  "Someone in the Slack #office-plants channel is looking to rehome a large pothos before their desk move next month, first come first served.",
  "The security team ran a routine phishing simulation this week; anyone who clicked the test link received an automated follow-up with a two-minute refresher video.",
  "The building's HVAC contractor is doing preventive maintenance on the east wing this weekend, so that side may run slightly warmer on Monday morning.",
  "A short survey about the new expense tool went out to everyone who submitted a report last month; responses are open for another week.",
  "The onboarding buddy program matched a new cohort of hires this week; buddies received a short checklist of first-week touchpoints to cover.",
  "Someone left a laptop charger in Conference Room C after last week's planning session; it's currently at the front desk lost and found.",
];

function padParagraphs(target: number, seedOffset: number): string {
  const parts: string[] = [];
  let length = 0;
  let i = seedOffset;
  while (length < target) {
    const p = FILLER_PARAGRAPHS[i % FILLER_PARAGRAPHS.length]!;
    parts.push(p);
    length += p.length + 2;
    i++;
  }
  return parts.join("\n\n");
}

// A pool of short, unrelated exchange pairs used to pad transcript-style (growing-prefix /
// changed-prefix) documents with plausible back-and-forth that carries no information the final
// question depends on.
const FILLER_TURNS: Array<{ helen: string; assistant: string }> = [
  { helen: "Can you push my 3pm to 3:30 tomorrow?", assistant: "Done - moved to 3:30, the other attendee already confirmed." },
  { helen: "Did the Peterson contract get signed yet?", assistant: "Not yet, it's sitting with their legal team as of this morning." },
  { helen: "Remind me to call the accountant this week.", assistant: "Added a reminder for Thursday at 10am." },
  { helen: "Order more of the good coffee for the office.", assistant: "Reordered the usual 5lb bag, arriving Wednesday." },
  { helen: "Who's covering the Friday standup while I'm out?", assistant: "Marcus said he'd run it, I let him know the agenda topics." },
  { helen: "Can you find me a flight back Sunday evening instead of Monday morning?", assistant: "Found one at 6:40pm Sunday, same fare class, want me to switch it?" },
  { helen: "Send the quarterly numbers to the board list once Priya signs off.", assistant: "Will do, I'll hold it until her approval comes through." },
  { helen: "What time zone is the Singapore call in again?", assistant: "SGT, which puts it at 9am your time on Tuesday." },
  { helen: "Cancel the dentist reminder, I already rescheduled directly with them.", assistant: "Cancelled." },
  { helen: "Can you loop in facilities about the broken blinds in my office?", assistant: "Sent, they said someone will look at it Thursday." },
  { helen: "Did anyone RSVP no for the offsite yet?", assistant: "Two so far, both citing travel conflicts, I can send you the names." },
  { helen: "Grab me a standing desk for the new hire starting Monday.", assistant: "Requisitioned one, should arrive by Friday." },
  { helen: "What's on my calendar for Wednesday afternoon?", assistant: "Just the 2pm product sync, otherwise open after lunch." },
  { helen: "Can you thank the vendor team for the quick turnaround on the samples?", assistant: "Sent a short note, they said the next batch ships Monday." },
  { helen: "I need the printer on 4 looked at, it's jamming again.", assistant: "Filed a ticket, IT said they'd get to it today." },
  { helen: "Can you check if the conference room booking overlapped with someone else's?", assistant: "It didn't, you're the only one on the calendar for that slot." },
];

function padTurns(target: number, seedOffset: number): string {
  const parts: string[] = [];
  let length = 0;
  let i = seedOffset;
  while (length < target) {
    const t = FILLER_TURNS[i % FILLER_TURNS.length]!;
    const block = `Helen: ${t.helen}\nYou: ${t.assistant}`;
    parts.push(block);
    length += block.length + 2;
    i++;
  }
  return parts.join("\n\n");
}

interface Fixture {
  depth: Depth;
  subtype: "cold" | "growing-prefix" | "changed-prefix" | "multi-source" | "contradiction";
  slug: string;
  title: string;
  promptText: string;
  whatThisTests: string[];
  strongSignals: string[];
  weakSignals: string[];
  rubric: Array<{ score: number; description: string }>;
  dimensions: Array<{ id: string; weight: number; description: string }>;
  notes?: string;
}

function renderFixture(f: Fixture): string {
  const rubricLines = f.rubric
    .sort((a, b) => b.score - a.score)
    .map((r) => `- \`${r.score}\`: ${r.description}`)
    .join("\n");
  const dimensionLines = f.dimensions
    .map((d) => `- \`${d.id}\` (weight ${d.weight}): ${d.description}`)
    .join("\n");
  const bullets = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

  return `# ${f.title}

## Prompt

\`\`\`text
${f.promptText.trim()}
\`\`\`

## What This Tests

${bullets(f.whatThisTests)}

## Strong Answer Signals

${bullets(f.strongSignals)}

## Weak Answer Signals

${bullets(f.weakSignals)}

## Scoring Rubric

${rubricLines}

## Scoring Dimensions

${dimensionLines}
${f.notes ? `\n## Notes\n\n${f.notes.trim()}\n` : ""}`;
}

// ---------------------------------------------------------------------------
// cold: a single long document delivered with no prior conversation, containing exactly one
// fact the model must locate to answer a specific question.
// ---------------------------------------------------------------------------
const COLD_SECTIONS: Record<Depth, { sections: number; threshold: string; approver: string }> = {
  short: { sections: 1, threshold: "$500", approver: "your direct manager" },
  "8k": { sections: 3, threshold: "$1,200", approver: "Finance Director Renee Okafor" },
  "32k": { sections: 6, threshold: "$4,500", approver: "the VP of Finance, David Choi" },
  "64k": { sections: 10, threshold: "$9,000", approver: "both the VP of Finance and the CFO" },
};

function coldFixture(depth: Depth): Fixture {
  const { sections, threshold, approver } = COLD_SECTIONS[depth];
  const target = targetChars(depth);
  const perSection = Math.floor(target / sections);
  const sectionNames = [
    "Travel Booking",
    "Ground Transportation",
    "Lodging",
    "Meals & Per Diem",
    "Client Entertainment",
    "Conference & Training Expenses",
    "Equipment Purchases",
    "Vendor Reimbursements",
    "International Travel",
    "Emergency Expenses",
  ];
  const needleSection = Math.min(sections - 1, Math.floor(sections * 0.6));
  const body: string[] = [];
  for (let i = 0; i < sections; i++) {
    body.push(`### ${i + 1}. ${sectionNames[i % sectionNames.length]}`);
    if (i === needleSection) {
      body.push(
        `Any single reimbursement request in this category exceeding ${threshold} requires co-sign approval from ${approver} before it can be processed. Requests at or under that amount only need the requester's manager to approve.`,
      );
    }
    body.push(padParagraphs(perSection, i * 7 + sections));
  }
  const doc = body.join("\n\n");

  return {
    depth,
    subtype: "cold",
    slug: `expense-policy-${depth}`,
    title: `Cold Document Read: Expense Policy (${depth})`,
    promptText: `You are Tom, Helen's executive assistant. Helen just forwarded you the full current company expense policy with no other context, and texted:

"Can you check something for me - what's the approval threshold for reimbursements before it needs sign-off above my level, and who signs off on it?"

Here is the document she forwarded:

---
${doc}
---

Answer Helen's question using only what's in the document above.`,
    whatThisTests: [
      "Locating a single specific fact inside a long, mostly-irrelevant cold document.",
      "Not fabricating a threshold or approver that isn't actually stated in the document.",
      "Answering concisely rather than summarizing the whole policy back to Helen.",
    ],
    strongSignals: [
      `States the correct threshold (${threshold}) and the correct approver (${approver}) from the document.`,
      "Answers directly without re-explaining unrelated sections of the policy.",
      "Doesn't pad the answer with disclaimers about not having read the whole thing.",
    ],
    weakSignals: [
      "States a threshold or approver not found in the document (hallucinated or from a different section).",
      "Summarizes multiple unrelated sections instead of answering the specific question.",
      "Claims the information isn't in the document when it is.",
    ],
    rubric: [
      { score: 5, description: `Correct threshold and correct approver, stated concisely and confidently.` },
      { score: 4, description: "Correct threshold and approver but with unnecessary extra summary." },
      { score: 3, description: "Gets one of threshold or approver right but not both." },
      { score: 2, description: "Vague or hedged answer that doesn't commit to the actual figure." },
      { score: 1, description: "Fabricates a threshold or approver not present in the document." },
    ],
    dimensions: [
      { id: "recall-accuracy", weight: 5, description: "Finds and states the exact threshold and approver from the document." },
      { id: "concision", weight: 2, description: "Answers the specific question without restating unrelated sections." },
    ],
    notes:
      "This is a synthetic long-context stress test: the padding paragraphs are deliberately generic filler unrelated to the question, and the needle fact appears exactly once. Regenerate via scripts/generate-long-context-fixtures.ts.",
  };
}

// ---------------------------------------------------------------------------
// growing-prefix: a long simulated session where an early instruction must still be honored
// after many unrelated turns have accumulated.
// ---------------------------------------------------------------------------
const GROWING_SCENARIOS: Record<Depth, { rule: string; task: string }> = {
  short: {
    rule: "Whenever you draft anything going to an investor, always BCC our lawyer, Priya Patel (priya@cascaderobotics.example), no exceptions.",
    task: "draft a short email to our investor Marcus Webb letting him know the Series B data room is now open",
  },
  "8k": {
    rule: "For the rest of this quarter, every external vendor invoice over $2,000 needs to be forwarded to Renee in Finance before I approve it - don't approve anything yourself even if it looks routine.",
    task: "handle a $3,400 invoice that just came in from our design vendor, Fieldstone Studio",
  },
  "32k": {
    rule: "From now on, anything with the word 'confidential' in the subject line should go straight to my personal inbox, not the shared team inbox, even if it's addressed to the team.",
    task: "an email just came in addressed to the team with the subject 'Confidential: Q4 restructuring notes' - handle it",
  },
  "64k": {
    rule: "Starting today, I never want same-day meeting requests auto-accepted, even from the leadership team - always check with me first, no exceptions, regardless of who it's from.",
    task: "our CTO just sent a same-day meeting request for 4pm today - handle it",
  },
};

function growingPrefixFixture(depth: Depth): Fixture {
  const { rule, task } = GROWING_SCENARIOS[depth];
  const target = targetChars(depth);
  const opening = `Helen: ${rule}\nYou: Got it, I'll make that the standing rule going forward.`;
  const remaining = target - opening.length;
  const filler = padTurns(remaining, DEPTHS.indexOf(depth) * 11 + 3);
  const transcript = `${opening}\n\n${filler}\n\nHelen: Okay, one more thing - ${task}.`;

  return {
    depth,
    subtype: "growing-prefix",
    slug: `standing-rule-${depth}`,
    title: `Growing Prefix: Standing Rule Retention (${depth})`,
    promptText: `You are Tom, Helen's executive assistant, mid-way through a long running text conversation with her that has already covered a lot of unrelated ground today. Here is the full conversation so far:

---
${transcript}
---

Respond to Helen's final message.`,
    whatThisTests: [
      "Retaining an instruction stated early in a long session after many unrelated turns.",
      "Applying that standing rule to a new, unrelated request at the end without being reminded.",
      "Not needing the rule repeated to follow it.",
    ],
    strongSignals: [
      "Follows the standing rule from early in the conversation without being told again.",
      "Explicitly acknowledges applying the rule (so Helen can see it wasn't forgotten), without being asked to.",
      "Handles the final request naturally, matching the conversation's tone.",
    ],
    weakSignals: [
      "Ignores the standing rule and handles the final request as if it were never stated.",
      "Asks Helen to repeat the rule instead of recalling it.",
      "Applies the rule incorrectly (e.g. to the wrong recipient or in the wrong direction).",
    ],
    rubric: [
      { score: 5, description: "Correctly and explicitly applies the early standing rule to the final request." },
      { score: 4, description: "Applies the rule correctly but doesn't make it obvious it was applied." },
      { score: 3, description: "Handles the final request reasonably but misses the standing rule entirely." },
      { score: 2, description: "Half-applies the rule (e.g. gets the direction or recipient wrong)." },
      { score: 1, description: "Contradicts the standing rule outright." },
    ],
    dimensions: [
      { id: "instruction-retention", weight: 5, description: "The rule from early in the transcript is still honored at the end." },
      { id: "task-execution", weight: 3, description: "The final request itself is still handled competently, not just the rule check." },
    ],
    notes:
      "Synthetic long-context retention test: the filler turns are unrelated logistics exchanges that carry no information relevant to the final question. Regenerate via scripts/generate-long-context-fixtures.ts.",
  };
}

// ---------------------------------------------------------------------------
// changed-prefix: an early fact is explicitly corrected later in the same context; the answer
// must reflect the update, not the stale value.
// ---------------------------------------------------------------------------
const CHANGED_SCENARIOS: Record<Depth, { initial: string; update: string; question: string }> = {
  short: {
    initial: "The team offsite is booked at the Bellwood Hotel downtown, March 12-13.",
    update: "Change of plans - the Bellwood fell through due to a booking conflict on their end. We're now doing the offsite at the Meridian Conference Center instead, same dates.",
    question: "can you draft the calendar invite update for the offsite with the venue info",
  },
  "8k": {
    initial: "The Q3 board deck should go out to the full board list, all nine members.",
    update: "Actually, hold off on sending the Q3 deck to the full board - two members are recusing themselves from this vote, so it should only go to the other seven. I'll tell you which two to drop in a second... okay, drop David Reyes and Angela Kim, send to everyone else.",
    question: "the Q3 deck is ready - who should it actually go to",
  },
  "32k": {
    initial: "Our new hire's start date is confirmed for the 1st of next month.",
    update: "Small update on the new hire - their start date moved. Immigration paperwork is taking longer than expected, so it's now pushed to the 15th instead of the 1st.",
    question: "IT is asking when to have the new hire's laptop ready by",
  },
  "64k": {
    initial: "The vendor contract renewal rate for next year is locked in at $18,000/year, same as this year.",
    update: "One correction on the vendor contract - they came back and said the renewal rate is actually going up to $21,500/year, not staying flat like we discussed. I haven't signed anything yet.",
    question: "Finance is asking what number to put in next year's budget for this vendor contract",
  },
};

function changedPrefixFixture(depth: Depth): Fixture {
  const { initial, update, question } = CHANGED_SCENARIOS[depth];
  const target = targetChars(depth);
  const opening = `Helen: ${initial}\nYou: Noted, thanks for the update.`;
  const correction = `Helen: ${update}\nYou: Got it, updated on my end.`;
  const fillerBudget = target - opening.length - correction.length;
  const firstHalf = padTurns(Math.floor(fillerBudget * 0.5), DEPTHS.indexOf(depth) * 5 + 1);
  const secondHalf = padTurns(Math.ceil(fillerBudget * 0.5), DEPTHS.indexOf(depth) * 5 + 9);
  const transcript = `${opening}\n\n${firstHalf}\n\n${correction}\n\n${secondHalf}\n\nHelen: ${question}?`;

  return {
    depth,
    subtype: "changed-prefix",
    slug: `superseded-fact-${depth}`,
    title: `Changed Prefix: Superseded Fact (${depth})`,
    promptText: `You are Tom, Helen's executive assistant, mid-way through a long running text conversation with her. Here is the full conversation so far - note that one fact stated early on is later corrected:

---
${transcript}
---

Respond to Helen's final message.`,
    whatThisTests: [
      "Using the most recently stated version of a fact when an earlier statement was explicitly corrected.",
      "Not reverting to stale information just because it appeared first or was stated more simply.",
      "Recognizing a correction stated in passing, not just ones flagged as corrections.",
    ],
    strongSignals: [
      "Answers using the corrected/updated value, not the original one.",
      "Implicitly or explicitly shows awareness that the value changed (e.g. doesn't need re-confirming).",
      "Doesn't ask Helen to repeat information that was already given twice in the transcript.",
    ],
    weakSignals: [
      "Answers using the stale, original value from earlier in the conversation.",
      "Mixes the two values together inconsistently.",
      "Asks Helen which value is correct instead of using the one she already confirmed.",
    ],
    rubric: [
      { score: 5, description: "Uses the corrected value confidently and correctly." },
      { score: 4, description: "Uses the corrected value but hedges unnecessarily." },
      { score: 3, description: "Asks Helen to clarify instead of using the already-stated correction." },
      { score: 2, description: "Blends the original and corrected values inconsistently." },
      { score: 1, description: "Uses the stale original value as if the correction never happened." },
    ],
    dimensions: [
      { id: "recency-correctness", weight: 5, description: "The final answer reflects the corrected fact, not the superseded one." },
      { id: "confidence-calibration", weight: 2, description: "States the corrected value without unnecessary re-confirmation." },
    ],
    notes:
      "Synthetic long-context test for using the latest of two conflicting same-source statements (a correction), as distinct from the contradiction subtype where two different sources disagree and neither is withdrawn. Regenerate via scripts/generate-long-context-fixtures.ts.",
  };
}

// ---------------------------------------------------------------------------
// multi-source: several distinct documents/sources, each contributing a fact the answer must
// combine.
// ---------------------------------------------------------------------------
const MULTI_SOURCE_SCENARIOS: Record<
  Depth,
  { policyWindow: string; helenBusy: string; vendorBusy: string; goodSlot: string }
> = {
  short: {
    policyWindow: "External vendor calls may only be scheduled between 9am and 5pm local time.",
    helenBusy: "Thursday 9:00-10:00am: internal standup",
    vendorBusy: "Thursday 8:00-9:30am: their team retro (their local time, same timezone as us)",
    goodSlot: "10:00am-11:00am Thursday",
  },
  "8k": {
    policyWindow: "External vendor calls may only be scheduled Monday-Thursday, between 9am and 4pm local time - no external calls on Fridays.",
    helenBusy: "Thursday 1:00-3:00pm: board prep block (do not schedule over)",
    vendorBusy: "Thursday 9:00-11:00am: their internal sprint review",
    goodSlot: "11:00am-12:00pm or 3:00pm-4:00pm Thursday",
  },
  "32k": {
    policyWindow: "External vendor calls may only be scheduled between 10am and 3pm local time, and never within 30 minutes of another external call already on the calendar.",
    helenBusy: "Thursday 10:00-10:30am: external call with a different vendor (Fieldstone Studio); 1:00-2:00pm: internal review",
    vendorBusy: "Thursday 11:00am-12:30pm: unavailable, travel",
    goodSlot: "2:00pm-3:00pm Thursday (respecting the 30-minute buffer after the 10:30am call and staying inside the policy window)",
  },
  "64k": {
    policyWindow: "External vendor calls may only be scheduled between 9am and 5pm local time, must not overlap any block marked 'do not schedule over', and must leave at least a 15-minute buffer after any other external call.",
    helenBusy: "Thursday 9:00-9:45am: external call with counsel (do not schedule over); 12:00-1:00pm: lunch with the board chair (do not schedule over)",
    vendorBusy: "Thursday 10:00-11:00am: unavailable; 2:00-2:30pm: unavailable",
    goodSlot: "11:15am-12:00pm Thursday (after the 15-minute buffer past the 9:45am external call ends, and clear of every other block)",
  },
};

function multiSourceFixture(depth: Depth): Fixture {
  const { policyWindow, helenBusy, vendorBusy, goodSlot } = MULTI_SOURCE_SCENARIOS[depth];
  const target = targetChars(depth);
  const perSource = Math.floor(target / 3);

  const policyDoc = `MEETING SCHEDULING POLICY (excerpt)\n\n${policyWindow}\n\n${padParagraphs(perSource, DEPTHS.indexOf(depth) * 3 + 1)}`;
  const helenCalendar = `HELEN'S CALENDAR EXPORT - THURSDAY\n\n${helenBusy}\n\n${padParagraphs(perSource, DEPTHS.indexOf(depth) * 3 + 2)}`;
  const vendorCalendar = `VENDOR AVAILABILITY (forwarded by their assistant) - THURSDAY\n\n${vendorBusy}\n\n${padParagraphs(perSource, DEPTHS.indexOf(depth) * 3 + 3)}`;

  return {
    depth,
    subtype: "multi-source",
    slug: `schedule-a-call-${depth}`,
    title: `Multi-Source Synthesis: Scheduling Across Three Sources (${depth})`,
    promptText: `You are Tom, Helen's executive assistant. Helen just texted:

"Can you find a time Thursday for a call with the vendor? Check my calendar, their availability, and make sure it's within our scheduling policy."

Here are the three sources you have:

--- SOURCE 1: SCHEDULING POLICY ---
${policyDoc}
--- END SOURCE 1 ---

--- SOURCE 2: HELEN'S CALENDAR ---
${helenCalendar}
--- END SOURCE 2 ---

--- SOURCE 3: VENDOR AVAILABILITY ---
${vendorCalendar}
--- END SOURCE 3 ---

Reply to Helen with a specific proposed time, or explain why none exists.`,
    whatThisTests: [
      "Combining constraints from three separate documents rather than answering from just one.",
      "Correctly applying a policy constraint (time window, buffers) on top of two calendars.",
      "Proposing a genuinely valid slot, not one that violates any of the three sources.",
    ],
    strongSignals: [
      `Proposes a slot consistent with all three sources (the intended answer is ${goodSlot}).`,
      "Explicitly checks the proposed slot against the policy's specific constraint, not just both calendars.",
      "Texts like a text: a direct proposed time, not a re-statement of all three documents.",
    ],
    weakSignals: [
      "Proposes a slot that conflicts with one of the three sources (a busy block or the policy window/buffer).",
      "Only checks two of the three sources and ignores the third.",
      "Dumps all the calendar and policy detail back at Helen instead of proposing a specific time.",
    ],
    rubric: [
      { score: 5, description: "Proposes a slot valid against all three sources, stated concisely." },
      { score: 4, description: "Proposes a valid slot but explanation is longer than needed." },
      { score: 3, description: "Proposes a slot that satisfies two of the three sources but misses one constraint." },
      { score: 2, description: "Proposes a slot that only satisfies one source." },
      { score: 1, description: "Proposes a slot that violates a hard conflict or the policy entirely." },
    ],
    dimensions: [
      { id: "cross-source-synthesis", weight: 5, description: "The proposed slot is checked against all three sources, not a subset." },
      { id: "concision", weight: 2, description: "Replies with a specific proposed time rather than restating every source." },
    ],
    notes:
      "Synthetic long-context test: each source is individually padded with unrelated filler so the relevant constraint in each must be located independently before being combined. Regenerate via scripts/generate-long-context-fixtures.ts.",
  };
}

// ---------------------------------------------------------------------------
// contradiction: two sources directly disagree about the same fact; neither is withdrawn.
// ---------------------------------------------------------------------------
const CONTRADICTION_SCENARIOS: Record<Depth, { claimA: string; claimB: string; ask: string }> = {
  short: {
    claimA: "Q3 Planning Sync: Tuesday 10:00am, Conference Room B.",
    claimB: "Q3 Planning Sync: Wednesday 11:00am, video call only.",
    ask: "can you send a reminder about the Q3 planning sync",
  },
  "8k": {
    claimA: "Vendor renewal call: confirmed for $18,000/year, per the email thread with their sales rep.",
    claimB: "Vendor renewal call: confirmed for $21,500/year, per the signed term sheet attached to the deal folder.",
    ask: "can you confirm the vendor renewal amount for the announcement email",
  },
  "32k": {
    claimA: "New hire start date: March 1st, per the offer letter sent to the candidate.",
    claimB: "New hire start date: March 15th, per the HR onboarding tracker.",
    ask: "IT needs the new hire's start date to provision their laptop",
  },
  "64k": {
    claimA: "Board meeting location: our downtown office, 4th floor boardroom, per the calendar invite.",
    claimB: "Board meeting location: the Meridian Conference Center, per the board chair's assistant's email.",
    ask: "can you send the board members directions for the meeting",
  },
};

function contradictionFixture(depth: Depth): Fixture {
  const { claimA, claimB, ask } = CONTRADICTION_SCENARIOS[depth];
  const target = targetChars(depth);
  const sourceALabel = "SOURCE A (calendar / email thread)";
  const sourceBLabel = "SOURCE B (tracker / assistant's email)";
  const perSource = Math.floor((target - claimA.length - claimB.length - 200) / 2);

  const sourceA = `${sourceALabel}\n\n${claimA}\n\n${padParagraphs(perSource, DEPTHS.indexOf(depth) * 9 + 4)}`;
  const sourceB = `${sourceBLabel}\n\n${claimB}\n\n${padParagraphs(perSource, DEPTHS.indexOf(depth) * 9 + 13)}`;

  return {
    depth,
    subtype: "contradiction",
    slug: `conflicting-sources-${depth}`,
    title: `Contradiction Handling: Two Sources Disagree (${depth})`,
    promptText: `You are Tom, Helen's executive assistant. Helen just texted:

"${ask}?"

You have two sources on this, and they don't agree:

--- ${sourceALabel} ---
${sourceA}
--- END SOURCE A ---

--- ${sourceBLabel} ---
${sourceB}
--- END SOURCE B ---

Reply to Helen the way you actually would, right now, over text.`,
    whatThisTests: [
      "Recognizing that two sources make genuinely conflicting claims about the same fact.",
      "Surfacing the conflict to Helen instead of silently picking one source.",
      "Not fabricating a third value or averaging the two conflicting ones.",
    ],
    strongSignals: [
      "Explicitly flags that the two sources disagree and states both values.",
      "Recommends a concrete next step (e.g. confirm with a specific person) rather than just describing the problem.",
      "Texts like a text: short, no headers, no bullet-pointed source dump.",
    ],
    weakSignals: [
      "Picks one source silently and states it as fact without mentioning the other.",
      "Averages or invents a third value not present in either source.",
      "Responds with a long formal report instead of a short text.",
    ],
    rubric: [
      { score: 5, description: "Flags the contradiction, states both values accurately, and suggests how to resolve it, in a natural text." },
      { score: 4, description: "Flags the contradiction and states both values but the tone is too formal or long." },
      { score: 3, description: "Mentions uncertainty but doesn't clearly state what the two conflicting values actually are." },
      { score: 2, description: "Picks one source's value and states it as settled fact." },
      { score: 1, description: "Invents a value not present in either source, or fabricates additional conflicting details." },
    ],
    dimensions: [
      { id: "contradiction-detection", weight: 5, description: "Explicitly identifies that the two sources disagree, rather than silently resolving it." },
      { id: "concision", weight: 2, description: "Reads like an actual text message, not a report." },
    ],
    notes:
      "Synthetic long-context test: unlike the changed-prefix subtype, neither claim here is withdrawn or corrected - both remain live and conflicting, which is the harder and more common real failure mode (silent, confident disambiguation). Regenerate via scripts/generate-long-context-fixtures.ts.",
  };
}

function main() {
  const fixtures: Fixture[] = [];
  for (const depth of DEPTHS) {
    fixtures.push(coldFixture(depth));
    fixtures.push(growingPrefixFixture(depth));
    fixtures.push(changedPrefixFixture(depth));
    fixtures.push(multiSourceFixture(depth));
    fixtures.push(contradictionFixture(depth));
  }

  for (const f of fixtures) {
    const dir = join(REPO_ROOT, "long-context", f.depth, f.subtype);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${f.slug}.md`);
    const rendered = renderFixture(f);
    writeFileSync(path, rendered);
    const estimatedTokens = Math.round(rendered.length / CHARS_PER_TOKEN);
    console.log(
      `wrote ${path.replace(REPO_ROOT + "/", "")} (${rendered.length} chars, ~${estimatedTokens} tokens vs ${DEPTH_TOKENS[f.depth]} target - estimate only, see CHARS_PER_TOKEN caveat above)`,
    );
  }
}

main();
