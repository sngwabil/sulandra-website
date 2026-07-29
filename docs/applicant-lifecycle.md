# Applicant lifecycle

The Careers workflow uses the existing Sulandra public site, the Careers API, the applicant portal, and the Administration portal. Pre-hire applicant accounts are intentionally separate from employee/S.P.I.R.E. accounts.

## Role routing

| Opening role | Public intake | Required document categories | Assessment |
| --- | --- | --- | --- |
| DSP / aide | `applydsp.html` | Application PDF, resume, CPR, driver license | DSP test scored automatically |
| LPN | `applylpn.html?role=LPN` | Application PDF, resume, CPR, LPN license | None |
| RN | `applylpn.html?role=RN` | Application PDF, resume, CPR, RN license | None |
| Delegating nurse | `applylpn.html?role=DELEGATING_NURSE` | Application PDF, resume, CPR, RN license | None |
| HR, executive, and other roles | `applygeneral.html` | Application PDF, resume, cover letter, references | None |

Each successful application receives a reference number, a separate applicant-portal account, and an automatically generated application PDF stored in the Application document category.

## Applicant status workflow

Supported statuses are:

- Received
- Reviewing
- Documents needed
- Interview
- Offer pending
- Hired
- Not selected
- Withdrawn
- Terminated
- Position filled

Every transition is written to status history. Notes can be internal or visible to the applicant. An administrator can request a document, approve or reject an uploaded document, and download the original file. The applicant can view status history and upload requested documents through `applicant-portal.html`.

## Administration UI integration

`careers-admin-workflow.js` is a scoped, dependency-free controller for the existing applicant-folder area. It does not change global layout or replace the Administration design. The Administration SPA should load it and mount it only when an applicant folder is opened:

```html
<script src="https://www.sulandrahealth.com/careers-admin-workflow.js"></script>
<div id="applicant-workflow"></div>
<script>
  SulandraCareersWorkflow.mount({
    root: "#applicant-workflow",
    apiBase: "https://sulandra-website-production.up.railway.app",
    applicationId: selectedApplication.id,
    getToken: () => existingSulandraAuth.getAccessToken(),
    onUpdated: () => refreshCareersApplications()
  });
</script>
```

Use the Administration SPA's existing authenticated token provider; never hard-code or put an administrator token in HTML.

## Production notification variables

Email delivery uses Microsoft Graph and sends from `admin@sulandrahealth.com`. These variables must be configured in the Railway API service:

| Variable | Purpose |
| --- | --- |
| `MICROSOFT_TENANT_ID` | Microsoft 365 tenant ID |
| `MICROSOFT_CLIENT_ID` | Entra application/client ID |
| `MICROSOFT_CLIENT_SECRET` | Entra application secret |
| `CAREERS_EMAIL_FROM` | Set to `admin@sulandrahealth.com` |
| `APPLICANT_PORTAL_URL` | Applicant sign-in URL, such as `https://www.sulandrahealth.com/applicant-portal.html` |
| `APPLICANT_TOKEN_SECRET` | Dedicated random secret for applicant tokens; do not reuse an email password |

The Entra application needs application permission to send mail and administrator consent for Microsoft Graph `Mail.Send`. The mailbox must exist and be licensed or otherwise allowed to send.

SMS delivery is optional and uses Twilio:

| Variable | Purpose |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | SMS-capable sender number |

When the selected channel is not configured, the notification remains queued in the application message history rather than exposing credentials or silently claiming delivery.

## Applicant confirmation message

The initial confirmation includes:

- the application reference number;
- the applicant portal link;
- the generated username;
- a one-time temporary password;
- a reminder to change the password after first sign-in;
- instructions to monitor status and contact HR with the reference number.

Application status changes and document requests use the same preferred communication channel.

## Relevant API routes

Public applicant routes:

- `POST /public/careers/applications`
- `POST /public/careers/applicant/login`
- `GET /public/careers/applicant/me`
- `POST /public/careers/applicant/change-password`
- `POST /public/careers/applicant/documents`

Authenticated Administration routes:

- `GET /api/admin/applications`
- `GET /api/admin/applications/:id/folder`
- `PATCH /api/admin/applications/:id/status`
- `POST /api/admin/applications/:id/request-document`
- `PATCH /api/admin/applications/:id/documents/:documentId`
- `GET /api/admin/applications/:id/documents/:documentId/download`
