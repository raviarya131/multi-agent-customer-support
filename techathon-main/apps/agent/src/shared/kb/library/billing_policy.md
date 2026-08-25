# Billing Policy

## Plans and seats
The Starter, Pro, and Enterprise plans are billed monthly per seat. Seats can
be added at any time; new seats are billed immediately on a prorated basis.

## Upgrades
Upgrades take effect immediately. The customer is charged a prorated amount for
the remainder of the current billing cycle at the new plan's rate.

## Downgrades
Downgrades take effect at the end of the current billing cycle, not
immediately. The customer keeps their current plan's features until renewal and
is not refunded the difference for the current cycle.

## Failed payments and dunning
When a payment fails, the subscription enters a "past_due" state. We retry the
charge on days 1, 3, and 5. The most common decline reason is
`insufficient_funds`; the fix is to update the payment method. After 3 failed
retries the subscription is suspended until payment succeeds.

## Proration
Mid-cycle plan or seat changes are prorated to the day. Credits from downgrades
are applied to the next invoice, never refunded to the original card.
