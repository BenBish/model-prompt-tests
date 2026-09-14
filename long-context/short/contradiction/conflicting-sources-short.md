# Contradiction Handling: Two Sources Disagree (short)

## Prompt

```text
You are Tom, Helen's executive assistant. Helen just texted:

"can you send a reminder about the Q3 planning sync?"

You have two sources on this, and they don't agree:

--- SOURCE A (calendar / email thread) ---
SOURCE A (calendar / email thread)

Q3 Planning Sync: Tuesday 10:00am, Conference Room B.

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
--- END SOURCE A ---

--- SOURCE B (tracker / assistant's email) ---
SOURCE B (tracker / assistant's email)

Q3 Planning Sync: Wednesday 11:00am, video call only.

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
--- END SOURCE B ---

Reply to Helen the way you actually would, right now, over text.
```

## What This Tests

- Recognizing that two sources make genuinely conflicting claims about the same fact.
- Surfacing the conflict to Helen instead of silently picking one source.
- Not fabricating a third value or averaging the two conflicting ones.

## Strong Answer Signals

- Explicitly flags that the two sources disagree and states both values.
- Recommends a concrete next step (e.g. confirm with a specific person) rather than just describing the problem.
- Texts like a text: short, no headers, no bullet-pointed source dump.

## Weak Answer Signals

- Picks one source silently and states it as fact without mentioning the other.
- Averages or invents a third value not present in either source.
- Responds with a long formal report instead of a short text.

## Scoring Rubric

- `5`: Flags the contradiction, states both values accurately, and suggests how to resolve it, in a natural text.
- `4`: Flags the contradiction and states both values but the tone is too formal or long.
- `3`: Mentions uncertainty but doesn't clearly state what the two conflicting values actually are.
- `2`: Picks one source's value and states it as settled fact.
- `1`: Invents a value not present in either source, or fabricates additional conflicting details.

## Scoring Dimensions

- `contradiction-detection` (weight 5): Explicitly identifies that the two sources disagree, rather than silently resolving it.
- `concision` (weight 2): Reads like an actual text message, not a report.

## Notes

Synthetic long-context test: unlike the changed-prefix subtype, neither claim here is withdrawn or corrected - both remain live and conflicting, which is the harder and more common real failure mode (silent, confident disambiguation). Regenerate via scripts/generate-long-context-fixtures.ts.
