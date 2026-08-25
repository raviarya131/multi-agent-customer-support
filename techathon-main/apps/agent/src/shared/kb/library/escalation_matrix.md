# Escalation Matrix

## When to escalate to a human
Escalate immediately, regardless of topic, when the message involves any of the
following high-risk signals.

## Legal and compliance
Mentions of lawyers, lawsuits, chargebacks, regulators, GDPR/CCPA complaints, or
threats of legal action go to the Legal queue.

## Security
Reports of account compromise, unauthorized access, data breaches, or leaked
credentials go to the Security queue with high priority.

## Financial risk
Disputed charges above $500, repeated refund demands, or chargeback threats go
to the Billing Escalations queue.

## Order and delivery risk
Lost or stuck parcels, repeated failed deliveries, or orders delayed well beyond
their revised ETA go to Order Operations to open a carrier investigation.

## Customer sentiment
Explicit threats to cancel, churn language from high-value accounts, or abusive
/distressed messages go to a senior support agent.

## Routing by domain
- technical → Engineering On-call
- billing → Billing Lead (Billing Escalations for disputes/chargebacks)
- policy → Policy & Compliance (Legal for legal threats)
- orders → Order Operations
- products → Merchandising

## Severity guidance
- high: security, legal, data loss, or high-value account churn risk.
- medium: repeated unresolved issues, financial disputes under $500, or seriously delayed/lost orders.
- low: general frustration with a known workaround.

## What to include in a handoff
Always include the trace id, the customer's account id, a one-line summary, and
the detected risk category so the human can act without re-asking.
