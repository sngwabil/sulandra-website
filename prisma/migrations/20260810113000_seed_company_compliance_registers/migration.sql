-- Seed a practical compliance register for every Sulandra legal entity. These are
-- workflow records, not assertions that a license/provider approval is already held.
-- They begin in PENDING_VERIFICATION unless the requirement is an internal review.

WITH seed(code,category,requirement_name,authority,lead_days,folder_hint,notes) AS (
  VALUES
  ('SCLS','LICENSE','Ohio DODD Provider Certification / Renewal','Ohio Department of Developmental Disabilities',120,'Licenses & Registrations','Verify current provider certification scope, effective dates, expiration/renewal requirements, and service categories.'),
  ('SCLS','MEDICAID_PROVIDER','Ohio Medicaid Provider Enrollment / Revalidation','Ohio Department of Medicaid',120,'DODD & Medicaid','Track Medicaid enrollment/revalidation, provider identifiers and approval correspondence.'),
  ('SCLS','INSURANCE','General & Professional Liability Insurance','Insurance Carrier / Broker',60,'Insurance','Track required liability coverages, policy limits, endorsements and renewal certificates.'),
  ('SCLS','INSURANCE','Workers Compensation Coverage','Ohio Bureau of Workers Compensation',60,'Insurance','Track active workers compensation coverage and renewal/true-up requirements.'),
  ('SCLS','SCLS_DODD','DODD Compliance Review / Provider Documentation Readiness','Ohio DODD',90,'DODD & Medicaid','Maintain provider records, service documentation, incident, medication and personnel files in audit-ready condition.'),
  ('SCLS','FACILITY_HOME','Residential Home Safety / Fire / Emergency Review','Local / State Requirements',45,'Service Homes','Track required inspections, drills, emergency plans and home-specific corrective actions.'),
  ('SCLS','POLICY_REVIEW','SCLS Policy & Procedure Annual Review','Sulandra Health',45,'Policies & Procedures','Annual review of SCLS clinical, client-rights, incident, medication, staffing and emergency policies.'),
  ('SCLS','CERTIFICATION','Medication Administration / Delegation Program Oversight','Ohio DODD / Nursing Oversight',45,'DODD & Medicaid','Verify employee medication qualifications, nursing delegation and competency oversight remain current.'),

  ('HOME_HEALTH','LICENSE','Ohio Home Health Agency License / Operating Authority','Ohio Department of Health / Applicable Authority',150,'Licenses & Registrations','Track the license/operating authority required for the agency’s actual service model before operational referrals are accepted.'),
  ('HOME_HEALTH','MEDICAID_PROVIDER','Ohio Medicaid Home Health Provider Enrollment / Revalidation','Ohio Department of Medicaid',150,'Payers & Authorizations','Track payer enrollment, revalidation, provider identifiers and approval correspondence.'),
  ('HOME_HEALTH','MEDICAID_PROVIDER','Medicare Certification / Enrollment, If Applicable','CMS / Medicare Administrative Contractor',180,'Payers & Authorizations','Track Medicare enrollment/certification requirements only when applicable to the company’s approved business model.'),
  ('HOME_HEALTH','INSURANCE','Home Health Professional & General Liability Insurance','Insurance Carrier / Broker',60,'Insurance','Track policy limits, endorsements and annual renewal.'),
  ('HOME_HEALTH','HOME_HEALTH','Clinical Supervisor / Administrator Qualification Verification','Applicable Home Health Requirements',45,'Licenses & Registrations','Verify leadership and clinical supervision qualifications remain current and documented.'),
  ('HOME_HEALTH','HOME_HEALTH','Plan of Care / Certification / Recertification Compliance Review','Sulandra Home Health',30,'Clinical Operations','Audit active episodes for current plans of care, physician/provider orders, certification periods and required signatures.'),
  ('HOME_HEALTH','POLICY_REVIEW','Home Health Policy & Procedure Annual Review','Sulandra Health',45,'Policies & Procedures','Annual review of clinical, infection prevention, emergency, patient-rights, quality and personnel policies.'),
  ('HOME_HEALTH','ACCREDITATION','Accreditation / Survey Readiness, If Applicable','Accrediting Organization',120,'Compliance','Track accreditation or survey obligations applicable to the agency’s operating model.'),

  ('NMT','MEDICAID_PROVIDER','Ohio Medicaid / Transportation Provider Enrollment or Revalidation','Ohio Department of Medicaid / Applicable Payer',150,'Licenses & Registrations','Track provider enrollment, revalidation and payer-specific transportation approvals.'),
  ('NMT','INSURANCE','Commercial Auto Insurance','Insurance Carrier / Broker',60,'Insurance','Track fleet auto liability, covered vehicles/drivers, policy limits and renewal certificates.'),
  ('NMT','INSURANCE','General Liability Insurance','Insurance Carrier / Broker',60,'Insurance','Track general liability coverage and annual renewal.'),
  ('NMT','FLEET_VEHICLE','Vehicle Registration / Plate Renewal Program','Ohio BMV',60,'Fleet & Vehicles','Track every operating vehicle registration and renewal evidence.'),
  ('NMT','FLEET_VEHICLE','Vehicle Inspection / Preventive Maintenance Compliance','Sulandra NMT / Applicable Authority',30,'Fleet & Vehicles','Track inspection, preventive maintenance, accessibility/lift and safety-equipment requirements by vehicle.'),
  ('NMT','DRIVER_COMPLIANCE','Driver License / MVR / Qualification Review Program','Ohio BMV / Sulandra NMT',45,'Driver Compliance','Track driver licenses, MVR reviews, qualifications, training and restrictions.'),
  ('NMT','DRIVER_COMPLIANCE','Driver Background / Exclusion / Required Screening Review','Applicable Payer / Regulatory Requirements',45,'Driver Compliance','Track required background, exclusion and payer screening for drivers.'),
  ('NMT','POLICY_REVIEW','NMT Policy & Procedure Annual Review','Sulandra Health',45,'Policies & Procedures','Annual review of dispatch, rider safety, wheelchair securement, vehicle, driver, privacy and emergency policies.'),

  ('SULANDRA_HEALTH','CORPORATE','Ohio Business Registration / Corporate Good Standing','Ohio Secretary of State',90,'Corporate','Track corporate registration and evidence of good standing.'),
  ('SULANDRA_HEALTH','INSURANCE','Enterprise Cyber / Privacy Liability Coverage','Insurance Carrier / Broker',60,'Insurance','Track cyber/privacy coverage for enterprise systems, PHI/PII and business operations.'),
  ('SULANDRA_HEALTH','INSURANCE','Enterprise General Liability / Umbrella Coverage','Insurance Carrier / Broker',60,'Insurance','Track holding-company enterprise coverage and umbrella/excess policies.'),
  ('SULANDRA_HEALTH','TAX','Federal / State Tax Registration and Annual Filing Review','IRS / Ohio Department of Taxation',45,'Corporate','Track recurring tax registrations, filing confirmations and responsible-party review.'),
  ('SULANDRA_HEALTH','CONTRACT','Business Associate / Data Processing Agreement Review Program','Sulandra Health',60,'Contracts','Track BAAs, privacy/data processing contracts and annual review of active vendors handling protected information.'),
  ('SULANDRA_HEALTH','POLICY_REVIEW','Enterprise Privacy / Security / Records Policy Annual Review','Sulandra Health',45,'Policies & Procedures','Annual enterprise review of HIPAA/privacy, information security, retention, access control and incident-response policies.'),
  ('SULANDRA_HEALTH','POLICY_REVIEW','Enterprise HR / Employee Handbook Annual Review','Sulandra Health',45,'Policies & Procedures','Annual review of workforce, conduct, leave, safety and employment policies.'),
  ('SULANDRA_HEALTH','CONTRACT','Critical Vendor / Insurance / Service Agreement Review','Sulandra Health',60,'Contracts','Track renewal and termination dates for critical enterprise vendors and services.')
)
INSERT INTO "CompanyComplianceItem"(
  "id","organizationId","legalEntityId","category","requirementName","authority","status","renewalLeadDays",
  "documentFolderHint","notes","createdByUserId","metadata"
)
SELECT gen_random_uuid()::text,le."organizationId",le."id",seed.category,seed.requirement_name,seed.authority,
  'PENDING_VERIFICATION',seed.lead_days,seed.folder_hint,seed.notes,'SYSTEM:COMPLIANCE_SEED',
  jsonb_build_object('seededRequirement',true,'legalEntityCode',le."code")
FROM seed
JOIN "LegalEntity" le ON le."code"=seed.code
WHERE NOT EXISTS(
  SELECT 1 FROM "CompanyComplianceItem" existing
  WHERE existing."organizationId"=le."organizationId" AND existing."legalEntityId"=le."id"
    AND lower(existing."requirementName")=lower(seed.requirement_name)
);
