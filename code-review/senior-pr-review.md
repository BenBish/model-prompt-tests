# Senior PR Review

## Prompt

```text
Review this pull request as a senior engineer. Focus on correctness, edge cases, maintainability, and missing tests. Lead with findings ordered by severity. Do not rewrite everything unless necessary.

diff --git a/src/cart.ts b/src/cart.ts
index 1111111..2222222 100644
--- a/src/cart.ts
+++ b/src/cart.ts
@@ -1,11 +1,20 @@
 export type CartItem = {
   sku: string;
   priceCents: number;
   quantity: number;
 };

-export function totalCents(items: CartItem[]) {
-  return items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
+export function totalCents(items: CartItem[], couponPercent?: number) {
+  const subtotal = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
+  if (!couponPercent) return subtotal;
+  return subtotal - subtotal * couponPercent / 100;
 }

 export function itemCount(items: CartItem[]) {
   return items.reduce((sum, item) => sum + item.quantity, 0);
 }
```

## What This Tests

- Code-review stance rather than general explanation.
- Ability to spot money, validation, and type risks.
- Prioritization by severity.
- Test thinking.

## Strong Answer Signals

- Flags that totals may become fractional cents.
- Flags missing validation for negative, over-100, or non-finite coupon values.
- Notes `!couponPercent` treats `0` as no coupon but that may be acceptable if explicit.
- Suggests focused tests for rounding and invalid coupon inputs.

## Weak Answer Signals

- Merely summarizes the diff.
- Rewrites the whole module without review findings.
- Misses money precision and validation.
- Focuses on cosmetic style before correctness.

## Scoring Rubric

- `5`: Finds the important correctness risks, orders them well, and suggests targeted tests.
- `4`: Finds most issues with acceptable prioritization.
- `3`: Gives useful comments but misses a major edge case.
- `2`: Mostly generic review with little technical substance.
- `1`: Approves unsafe code or ignores the requested review format.

## Scoring Dimensions

- `correctness-risk-detection` (weight 3): Flags fractional cents and missing coupon validation (negative, over-100, non-finite).
- `prioritization` (weight 2): Leads with findings ordered by severity rather than a diff summary.
- `test-thinking` (weight 2): Suggests focused tests for rounding and invalid coupon inputs.

## Variants

- Easier: Ask for only the top three review findings.
- Harder: Add tax, shipping, and currency conversion.
- Different angle: Ask the model to propose a minimal patch after the review.

## Notes

This prompt tests whether a model behaves like a reviewer instead of an explainer.
