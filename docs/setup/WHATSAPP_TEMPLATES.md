# WhatsApp Business Message Templates

Draft templates for Meta WhatsApp Cloud API submission (Task 6). All four are **Utility/Transactional** category — WhatsApp Business template rules prohibit promotional language in transactional templates (no discounts, no marketing calls-to-action, no urgency-manufacturing language); category mismatch is the most common cause of rejection.

Placeholder variables use WhatsApp's numbered-parameter convention (`{{1}}`, `{{2}}`, ...) at submission time; the mapping to named fields is documented per template so the sending code stays readable.

---

## 1. Payment reminder — Friendly

**Category:** Utility
**Name:** `payment_reminder_friendly`

> Hi {{1}}, just a friendly reminder that invoice {{2}} for {{3}} is due on {{4}}. You can pay here: {{5}}. Thanks for your business!

| Param | Field |
|---|---|
| `{{1}}` | `party_name` |
| `{{2}}` | `invoice_number` |
| `{{3}}` | `amount` |
| `{{4}}` | `due_date` |
| `{{5}}` | `payment_link` |

---

## 2. Payment reminder — Professional

**Category:** Utility
**Name:** `payment_reminder_professional`

> Dear {{1}}, this is a reminder that payment of {{3}} for invoice {{2}} is due on {{4}}. Please make payment at your earliest convenience: {{5}}. Contact us with any questions.

| Param | Field |
|---|---|
| `{{1}}` | `party_name` |
| `{{2}}` | `invoice_number` |
| `{{3}}` | `amount` |
| `{{4}}` | `due_date` |
| `{{5}}` | `payment_link` |

---

## 3. Payment reminder — Firm

**Category:** Utility
**Name:** `payment_reminder_firm`

> {{1}}, invoice {{2}} for {{3}} was due on {{4}} and remains unpaid. Please settle this promptly to avoid further action: {{5}}.

| Param | Field |
|---|---|
| `{{1}}` | `party_name` |
| `{{2}}` | `invoice_number` |
| `{{3}}` | `amount` |
| `{{4}}` | `due_date` |
| `{{5}}` | `payment_link` |

---

## 4. Payment received — Thank you

**Category:** Utility
**Name:** `payment_received_thankyou`

> Hi {{1}}, we've received your payment of {{3}} for invoice {{2}}. Thank you for your business!

| Param | Field |
|---|---|
| `{{1}}` | `party_name` |
| `{{2}}` | `invoice_number` |
| `{{3}}` | `amount` |

---

## Submission notes

- Submit all four together under the WhatsApp Business Manager → Message Templates flow.
- Each template's body text above is the exact text to submit (with `{{n}}` placeholders); do not add emoji or exclamation-heavy language beyond what's shown — Meta's automated review is stricter on templates that read as promotional.
- If any template is rejected, the most common fix is toning down urgency language ("remains unpaid... avoid further action" in the Firm variant is the one most likely to need adjustment — soften if rejected, e.g. "kindly settle this at your earliest convenience").
- Record submission date and approval status per template in `docs/setup/PROVISIONING.md`.
