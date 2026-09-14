# Cold Document Read: Expense Policy (short)

## Prompt

```text
You are Tom, Helen's executive assistant. Helen just forwarded you the full current company expense policy with no other context, and texted:

"Can you check something for me - what's the approval threshold for reimbursements before it needs sign-off above my level, and who signs off on it?"

Here is the document she forwarded:

---
### 1. Travel Booking

Any single reimbursement request in this category exceeding $500 requires co-sign approval from your direct manager before it can be processed. Requests at or under that amount only need the requester's manager to approve.

The Denver satellite office reported their guest wifi credentials rotate monthly and the new password is posted on the lobby whiteboard, not emailed out for security reasons.

IT rolled out a mandatory laptop OS update this week; anyone who defers it past Friday will be prompted again on next login and cannot defer a second time.

The quarterly all-hands recording from last Thursday is now posted to the internal video portal under Company Updates, running just under forty minutes.

Recruiting flagged that the backend engineering req has been open for six weeks and asked hiring managers to review the current candidate pipeline by end of week.

The parking garage on 5th will be closed for resurfacing next weekend; employees are asked to use the overflow lot two blocks north during that window.

Legal circulated an updated NDA template for use with prospective vendors; the previous version should no longer be sent starting this month.

The design team's new component library ships with updated spacing tokens; teams migrating existing screens have a two-sprint grace period before the old tokens are removed.

Finance's month-end close moved up by one business day this quarter to accommodate the new audit timeline, so expense reports are now due the 27th instead of the 28th.

The office plant service swaps out anything looking unwell every other Wednesday; if a desk plant is struggling, tagging facilities gets it replaced at the next visit.

A minor incident on the staging environment last night was traced to a stale feature flag and resolved before it reached production; a short postmortem is being drafted.

The company newsletter this month features a profile of the customer success team and their new onboarding checklist for enterprise accounts.

Building security asked that visitor badges be returned to the front desk rather than taken home, since the badge stock has been running low this quarter.

The engineering blog published a short writeup on the recent database migration, noting it completed with under two minutes of read-only downtime.

Snack restocking day moved from Mondays to Wednesdays after a vendor scheduling change; the pantry may run a little light on Tuesday afternoons as a result.

The internal mentorship program is accepting new mentor sign-ups through the end of the month via the people-ops portal.

A new expense category for co-working day passes was added to the finance system for employees who occasionally work from a shared space while traveling.

The product team's roadmap review deck from last week's sync is available in the shared drive under Q3 Planning, alongside the raw survey data it references.

Someone in the Slack #office-plants channel is looking to rehome a large pothos before their desk move next month, first come first served.

The security team ran a routine phishing simulation this week; anyone who clicked the test link received an automated follow-up with a two-minute refresher video.

The building's HVAC contractor is doing preventive maintenance on the east wing this weekend, so that side may run slightly warmer on Monday morning.

A short survey about the new expense tool went out to everyone who submitted a report last month; responses are open for another week.

The onboarding buddy program matched a new cohort of hires this week; buddies received a short checklist of first-week touchpoints to cover.

Someone left a laptop charger in Conference Room C after last week's planning session; it's currently at the front desk lost and found.

Facilities sent a reminder that the third-floor kitchen coffee machine will be serviced Tuesday morning; the second-floor machine remains available throughout.

The Denver satellite office reported their guest wifi credentials rotate monthly and the new password is posted on the lobby whiteboard, not emailed out for security reasons.

IT rolled out a mandatory laptop OS update this week; anyone who defers it past Friday will be prompted again on next login and cannot defer a second time.

The quarterly all-hands recording from last Thursday is now posted to the internal video portal under Company Updates, running just under forty minutes.

Recruiting flagged that the backend engineering req has been open for six weeks and asked hiring managers to review the current candidate pipeline by end of week.

The parking garage on 5th will be closed for resurfacing next weekend; employees are asked to use the overflow lot two blocks north during that window.

Legal circulated an updated NDA template for use with prospective vendors; the previous version should no longer be sent starting this month.

The design team's new component library ships with updated spacing tokens; teams migrating existing screens have a two-sprint grace period before the old tokens are removed.

Finance's month-end close moved up by one business day this quarter to accommodate the new audit timeline, so expense reports are now due the 27th instead of the 28th.

The office plant service swaps out anything looking unwell every other Wednesday; if a desk plant is struggling, tagging facilities gets it replaced at the next visit.

A minor incident on the staging environment last night was traced to a stale feature flag and resolved before it reached production; a short postmortem is being drafted.

The company newsletter this month features a profile of the customer success team and their new onboarding checklist for enterprise accounts.

Building security asked that visitor badges be returned to the front desk rather than taken home, since the badge stock has been running low this quarter.

The engineering blog published a short writeup on the recent database migration, noting it completed with under two minutes of read-only downtime.

Snack restocking day moved from Mondays to Wednesdays after a vendor scheduling change; the pantry may run a little light on Tuesday afternoons as a result.

The internal mentorship program is accepting new mentor sign-ups through the end of the month via the people-ops portal.

A new expense category for co-working day passes was added to the finance system for employees who occasionally work from a shared space while traveling.

The product team's roadmap review deck from last week's sync is available in the shared drive under Q3 Planning, alongside the raw survey data it references.

Someone in the Slack #office-plants channel is looking to rehome a large pothos before their desk move next month, first come first served.

The security team ran a routine phishing simulation this week; anyone who clicked the test link received an automated follow-up with a two-minute refresher video.

The building's HVAC contractor is doing preventive maintenance on the east wing this weekend, so that side may run slightly warmer on Monday morning.

A short survey about the new expense tool went out to everyone who submitted a report last month; responses are open for another week.

The onboarding buddy program matched a new cohort of hires this week; buddies received a short checklist of first-week touchpoints to cover.

Someone left a laptop charger in Conference Room C after last week's planning session; it's currently at the front desk lost and found.

Facilities sent a reminder that the third-floor kitchen coffee machine will be serviced Tuesday morning; the second-floor machine remains available throughout.

The Denver satellite office reported their guest wifi credentials rotate monthly and the new password is posted on the lobby whiteboard, not emailed out for security reasons.

IT rolled out a mandatory laptop OS update this week; anyone who defers it past Friday will be prompted again on next login and cannot defer a second time.

The quarterly all-hands recording from last Thursday is now posted to the internal video portal under Company Updates, running just under forty minutes.

Recruiting flagged that the backend engineering req has been open for six weeks and asked hiring managers to review the current candidate pipeline by end of week.

The parking garage on 5th will be closed for resurfacing next weekend; employees are asked to use the overflow lot two blocks north during that window.
---

Answer Helen's question using only what's in the document above.
```

## What This Tests

- Locating a single specific fact inside a long, mostly-irrelevant cold document.
- Not fabricating a threshold or approver that isn't actually stated in the document.
- Answering concisely rather than summarizing the whole policy back to Helen.

## Strong Answer Signals

- States the correct threshold ($500) and the correct approver (your direct manager) from the document.
- Answers directly without re-explaining unrelated sections of the policy.
- Doesn't pad the answer with disclaimers about not having read the whole thing.

## Weak Answer Signals

- States a threshold or approver not found in the document (hallucinated or from a different section).
- Summarizes multiple unrelated sections instead of answering the specific question.
- Claims the information isn't in the document when it is.

## Scoring Rubric

- `5`: Correct threshold and correct approver, stated concisely and confidently.
- `4`: Correct threshold and approver but with unnecessary extra summary.
- `3`: Gets one of threshold or approver right but not both.
- `2`: Vague or hedged answer that doesn't commit to the actual figure.
- `1`: Fabricates a threshold or approver not present in the document.

## Scoring Dimensions

- `recall-accuracy` (weight 5): Finds and states the exact threshold and approver from the document.
- `concision` (weight 2): Answers the specific question without restating unrelated sections.

## Notes

This is a synthetic long-context stress test: the padding paragraphs are deliberately generic filler unrelated to the question, and the needle fact appears exactly once. Regenerate via scripts/generate-long-context-fixtures.ts.
