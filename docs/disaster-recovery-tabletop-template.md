# Sulandra Health Disaster Recovery Tabletop / Restore Drill Record

## Drill or incident identification

- **Record ID:**
- **Date:**
- **Environment:**
- **Database/service:**
- **Scenario:**
- **Declared start time (UTC):**
- **Recovery point selected:**
- **Backup/PITR identifier:**

## Participants

| Name | Role | Responsibility during drill/incident |
| --- | --- | --- |
|  |  |  |
|  |  |  |

## Recovery objectives

- **Approved RPO:**
- **Measured/estimated data-loss window:**
- **Approved RTO:**
- **Measured recovery duration:**
- **RPO met?** Yes / No
- **RTO met?** Yes / No

## Timeline

| Time (UTC) | Event / decision | Evidence or reference |
| --- | --- | --- |
|  | Incident/drill declared |  |
|  | Recovery point selected |  |
|  | Restore started |  |
|  | Restore completed |  |
|  | Database validation completed |  |
|  | Application validation completed |  |
|  | Recovery accepted / rejected |  |

## Validation results

### Database

- [ ] Backup integrity verified
- [ ] Restore completed without error
- [ ] Required migrations/schema present
- [ ] Required platform tables present
- [ ] Sentinel/known record restored
- [ ] Audit/security evidence present

### Application

- [ ] API starts
- [ ] `/health` succeeds
- [ ] Authentication flow works
- [ ] Admin workspace works
- [ ] SPIRE patient workspace works
- [ ] Client Intake → SPIRE admission regression works

## Gaps identified

| Gap | Severity | Risk / impact | Evidence |
| --- | --- | --- | --- |
|  |  |  |  |

## Corrective actions

| Corrective action | Owner | Due date | Status | Verification evidence |
| --- | --- | --- | --- | --- |
|  |  |  | Open |  |

## Final assessment

- **Restore accepted?** Yes / No
- **Production acceptance gate affected?** Yes / No
- **Remediation plan required?** Yes / No
- **Approver:**
- **Approval date:**
- **Notes:**
