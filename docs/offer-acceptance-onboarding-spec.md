# Offer acceptance and employee onboarding workflow

This workflow replaces immediate employee creation when an administrator selects **Hired**.

## State machine

1. `OFFER_PENDING` — administrator opens the offer wizard.
2. `OFFER_SENT` — offer terms and required disclosures are saved and emailed.
3. `OFFER_VIEWED` — applicant opens the secure offer link.
4. `OFFER_ACCEPTED` — applicant accepts the offer and electronically signs all required documents.
5. `DOCUMENTS_COMPLETE` — every required disclosure has been signed or uploaded.
6. `EMPLOYEE_CREATED` — the system creates the employee profile and credentials.
7. `HIRED` — onboarding is complete and the welcome email is sent.

The employee profile must never be created before `OFFER_ACCEPTED` and `DOCUMENTS_COMPLETE` are both true.

## Offer wizard fields

- Position title
- Department
- Supervisor
- Employment type
- Hourly pay or salary
- Shift
- Start date
- Orientation date
- Work location
- PTO eligibility
- Benefits eligibility
- Probationary period
- Bonus, if applicable
- Notes

## Required disclosure package

- Offer letter
- Form W-4
- Form I-9
- Direct deposit authorization
- Confidentiality agreement
- HIPAA acknowledgment
- Non-disclosure agreement
- Employee handbook acknowledgment
- Drug-free workplace policy
- Background-check authorization
- Emergency contact form
- Technology acceptable-use policy
- Photo release, optional
- Any role-specific compliance forms

## Offer email

The first email is an offer, not a welcome email. It states that Sulandra Community Living Services is pleased to offer the applicant the position they applied for and includes a secure link to review, sign, and submit the employment package.

## Welcome email

Only after the offer is accepted and all required documents are complete does the system create the employee profile and send the approved welcome email containing the employee username, temporary password, employee portal link, first-login instructions, onboarding checklist, supervisor information, start date, and orientation details.

## Username format

`first initial + full last name + @sulandrahealth.com`

Example: `Cassandra Ngobuh` becomes `cngobuh@sulandrahealth.com`.

Duplicate usernames append a number before the domain.
