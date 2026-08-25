# Storefront Troubleshooting Guide

## Checkout fails / server error at checkout
If a customer reports checkout failing, erroring, or the page not loading — even
when they do not quote an error code — the most common cause is
`ERR_CHECKOUT_5XX`, a transient error in the checkout service. The fix is to
refresh the page, clear the cart cache (remove and re-add the item), and retry;
if it persists across attempts, escalate with the trace id. No order is placed
and no card is charged until the customer sees an order-confirmation screen.

## Payment page won't load or keeps spinning
`ERR_PAYMENT_GATEWAY` means the payment session expired before submission. The
fix is to refresh the checkout, disable ad/script blockers for the site, and
retry. A failed payment attempt never places an order — the customer can safely
try again.

## Cart not updating / quantity wrong
`ERR_CART_SYNC` indicates a stale browser session: the cart shows old items or
quantities. The fix is to refresh the page or sign out and back in. This is
display-only and does not affect any placed order.

## App crashes on account or billing pages
If the app crashes or closes when opening **My Account**, **Billing**, or
**Invoices** (without a quoted error code), the most common cause is a stale
session or corrupted local cache. The fix is:
1. Sign out completely, close the browser tab, and sign back in.
2. Clear the site cache/cookies for the store domain, then retry.
3. Try an incognito/private window to rule out extensions.
4. If it still crashes, note whether it happens on mobile or desktop and share
   any error message shown before the crash — escalate to engineering if it
   persists after cache clear.

These account-page crashes are read-only — they do not change billing, charge
cards, or cancel subscriptions.

## When to escalate
If an error code is not in this runbook, or the recommended fix does not resolve
the issue, escalate to engineering with the trace id.

## Data safety
Errors on the storefront, cart, or checkout pages are read-only — they do not
place orders, charge cards, or change a customer's account. Reassure customers
that nothing was ordered or charged unless they received an order confirmation.
