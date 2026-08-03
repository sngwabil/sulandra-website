# Conditional offer acceptance and employee onboarding workflow

This workflow deliberately separates the employment offer from sensitive new-hire onboarding paperwork.

## State machine

1. `OFFER_PENDING` — Human Resources prepares the conditional offer.
2. `OFFER_SENT` — the offer terms are saved and emailed to the applicant.
3. `OFFER_VIEWED` — the applicant opens the secure offer link.
4. `OFFER_ACCEPTED` — the applicant agrees to the job terms and electronically signs the conditional offer.
5. `EMPLOYEE_CREATED` — Human Resources changes the applicant to **Hire** and creates the employee profile and credentials.
6. `ONBOARDING_PENDING` — the welcome email is sent and the employee portal displays the required onboarding package.
7. `DOCUMENTS_COMPLETE` — the employee completes and submits every required onboarding document.
8. `HIRED` — Human Resources verifies the required clearances and finalizes onboarding.

The applicant must not be asked for banking information, Social Security information, Form W-4 information, Form I-9 information, background-check details, or other sensitive onboarding data before accepting the conditional offer.

## Conditional offer letter

The offer letter contains only the employment terms and the parties' expectations, including:

- Position title and department
- Supervisor
- Employment classification
- Hourly rate or salary
- Expected schedule and shift
- Work location
- Anticipated start and orientation dates
- PTO and benefit eligibility
- Introductory or probationary period
- Role expectations and standards of conduct
- Company commitments and support
- At-will employment language where applicable
- Acknowledgment that the offer is conditional
- Electronic signature and acceptance date

By signing, the applicant agrees to the offered job terms and understands that employment is conditional upon satisfying all lawful pre-employment requirements, which may include identity and work-authorization verification, credential verification, reference checks, a background check, a drug test, exclusion-list checks, driving-record review when job-related, and any position-specific requirements.

Signing the offer does not ask the applicant to complete or submit the onboarding documents.

## Post-acceptance administrator workflow

After the signed offer is received:

1. The application status changes to `OFFER_ACCEPTED`.
2. Human Resources reviews the signed acceptance.
3. Human Resources selects **Hire**.
4. The system creates the employee profile and employee portal credentials.
5. The system assigns the onboarding package to the employee profile.
6. The system sends the welcome email with the portal link, username, temporary password, start information, and onboarding instructions.

## Employee portal onboarding package

The employee completes the following after the employee profile is created:

- Form W-4
- Form I-9 employee section and document-verification instructions
- Direct deposit authorization
- Emergency contact form
- Confidentiality agreement
- HIPAA privacy and security acknowledgment
- Non-disclosure agreement, when applicable
- Employee handbook acknowledgment
- Drug-free workplace policy acknowledgment and testing instructions
- Background-check disclosure and authorization
- Technology acceptable-use policy
- Photo release, when optional and applicable
- Credential, license, certification, and role-specific compliance uploads
- Any additional state, payer, DODD, Medicaid, or company-required forms

Sensitive forms must be completed inside the authenticated employee portal and not through the public offer link.

## Offer email

The first email is an employment offer, not a welcome email. It contains a secure link to review and sign only the conditional offer letter. It explains that onboarding instructions will be provided after acceptance and employee-profile creation.

## Welcome email

After Human Resources selects **Hire** and the employee profile is created, the system sends the welcome email containing:

- Employee username
- Temporary password
- Employee portal link
- First-login and password-change instructions
- Onboarding checklist
- Supervisor information
- Anticipated start date
- Orientation details
- Notice that employment remains conditional until all required screening, verification, and onboarding requirements are satisfactorily completed

## Username format

`first initial + full last name + @sulandrahealth.com`

Example: `Cassandra Ngobuh` becomes `cngobuh@sulandrahealth.com`.

Duplicate usernames append a number before the domain.
