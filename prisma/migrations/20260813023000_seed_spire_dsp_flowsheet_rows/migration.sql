-- Seed the 30 live DSP Daily Documentation rows used by /spire/master.html.
-- Additive and idempotent: existing rows and all existing flowsheet entries remain intact.

WITH organizations AS (
  SELECT DISTINCT "organizationId"
  FROM "SpirePatient"
  WHERE "organizationId" IS NOT NULL AND btrim("organizationId") <> ''
),
row_defs("groupName","name","dataType","unit","description","options","sortOrder") AS (
  VALUES
    ('Vitals & Blood Glucose','Temp (°F)','NUMBER','°F','Temperature in degrees Fahrenheit.','[]'::jsonb,100),
    ('Vitals & Blood Glucose','Temp Source','SELECT',NULL,'Temperature measurement source.','["Oral","Tympanic","Axillary","Temporal","Refused"]'::jsonb,101),
    ('Vitals & Blood Glucose','Pulse (bpm)','NUMBER','bpm','Pulse/heart rate.','[]'::jsonb,102),
    ('Vitals & Blood Glucose','Resp (breaths/min)','NUMBER','breaths/min','Respiratory rate.','[]'::jsonb,103),
    ('Vitals & Blood Glucose','BP (mmHg)','TEXT','mmHg','Blood pressure documented as systolic/diastolic.','[]'::jsonb,104),
    ('Vitals & Blood Glucose','Blood Glucose (mg/dL)','NUMBER','mg/dL','Blood glucose when ordered or required.','[]'::jsonb,105),

    ('ADLs & Personal Care Support','Bathing / Showering (Bathing Assistance)','SELECT',NULL,'Bathing/showering support delivered according to the ISP.','["Prompted","Independent","Partial Assist","Total Assist","Refused","Completed"]'::jsonb,106),
    ('ADLs & Personal Care Support','Dressing Assistance','SELECT',NULL,'Dressing support delivered according to the ISP.','["Independent","Prompting","Partial Assist","Total Assist","Refused","Completed"]'::jsonb,107),
    ('ADLs & Personal Care Support','Grooming & Oral Care','SELECT',NULL,'Grooming and oral-care support.','["Prompted","Independent","Partial Assist","Total Assist","Refused","Completed"]'::jsonb,108),
    ('ADLs & Personal Care Support','Toileting Support','SELECT',NULL,'Toileting support delivered according to the ISP.','["Independent","Prompting","Partial Assist","Total Assist","Refused","Completed"]'::jsonb,109),

    ('Medication Administration (eMAR)','Scheduled Meds Administered (AM)','SELECT',NULL,'Scheduled medication administration summary; detailed medication rights remain in eMAR.','["Given (8:00 AM)","Given (5:00 PM)","Held","Refused","Omitted"]'::jsonb,110),
    ('Medication Administration (eMAR)','Swallow & Prompt Supervision','SELECT',NULL,'Medication swallowing/prompt supervision.','["Completed","Supervised","Assisted","Refused"]'::jsonb,111),
    ('Medication Administration (eMAR)','PRN Medication Review','SELECT',NULL,'PRN medication review; medication administration remains linked to eMAR.','["None","Acetaminophen given","Refused"]'::jsonb,112),
    ('Medication Administration (eMAR)','Medication Refusals / Omissions','SELECT',NULL,'Medication refusal/omission summary.','["None","Refused","Omitted"]'::jsonb,113),

    ('Meal & Dysphagia Precautions','Diet Texture (Soft & Bite-Sized)','SELECT',NULL,'Verify ordered/ISP diet texture.','["Verified (Soft)","Modified","Refused"]'::jsonb,114),
    ('Meal & Dysphagia Precautions','Liquid Consistency (Thin Liquids)','SELECT',NULL,'Verify ordered/ISP liquid consistency.','["Verified (Thin)","Modified","Refused"]'::jsonb,115),
    ('Meal & Dysphagia Precautions','Upright Positioning (30 Min Post-Meal)','SELECT',NULL,'Post-meal positioning support.','["Maintained (30 min)","Not Maintained","Refused"]'::jsonb,116),
    ('Meal & Dysphagia Precautions','Pacing & Small Bites Supervision','SELECT',NULL,'Meal pacing/small-bite supervision.','["Completed","Supervised","Refused"]'::jsonb,117),

    ('Seizure & Neurological Check','Seizure Observation','SELECT',NULL,'Seizure observation and response.','["None","Generalized Tonic-Clonic","Focal","Rescue Med Given","Refused"]'::jsonb,118),
    ('Seizure & Neurological Check','Postictal Recovery Status','SELECT',NULL,'Postictal recovery observation when applicable.','["Baseline","Fatigued","Confused","Resting"]'::jsonb,119),
    ('Seizure & Neurological Check','Rescue Med Preparedness (Midazolam)','SELECT',NULL,'Rescue-medication readiness based on the active order/plan.','["Ready","Administered","Not Required"]'::jsonb,120),

    ('Behavioral & Elopement Support','Emotional Baseline / Mood','SELECT',NULL,'Person-centered emotional baseline/mood observation.','["Calm","Anxious","Agitated","Withdrawn","Cooperative"]'::jsonb,121),
    ('Behavioral & Elopement Support','Triggers / Antecedents Observed','SELECT',NULL,'Observed triggers/antecedents when applicable.','["None","Loud Noise","Routine Change","Rushed"]'::jsonb,122),
    ('Behavioral & Elopement Support','De-escalation / Proactive Support Used','SELECT',NULL,'Proactive or de-escalation support used.','["Not Needed","Calm Reassurance","Quiet Space Offered","Redirected"]'::jsonb,123),

    ('Bowel & Elimination Protocol','Bowel Movement Recorded','SELECT',NULL,'Bowel movement occurrence/characteristics.','["Yes (Normal)","Loose","Constipated","None","Refused"]'::jsonb,124),
    ('Bowel & Elimination Protocol','Fluid Intake Encouragement','SELECT',NULL,'Hydration support/encouragement.','["Encouraged","Offered & Consumed","Refused","Completed"]'::jsonb,125),

    ('Community Outings & Transport','Community Outing / Activity','SELECT',NULL,'Community participation/activity status.','["Completed","Rescheduled","Refused","N/A"]'::jsonb,126),
    ('Community Outings & Transport','Vehicle Seat Belt Secured','SELECT',NULL,'Vehicle safety-belt status when transportation occurs.','["Secured","Refused","N/A"]'::jsonb,127),

    ('ISP Goal Skill-Building','Independent Task Prompting','SELECT',NULL,'Skill-building prompt/support toward an active ISP outcome.','["Completed","Prompted","Assisted","Refused"]'::jsonb,128),
    ('ISP Goal Skill-Building','Money Management Support','SELECT',NULL,'Money-management skill support when included in the ISP.','["Reviewed","Assisted","Refused","N/A"]'::jsonb,129)
)
INSERT INTO "SpireFlowsheetRow"
  ("id","organizationId","name","groupName","dataType","unit","active","description","options","sortOrder","createdAt","updatedAt")
SELECT
  gen_random_uuid()::text,
  o."organizationId",
  d."name",
  d."groupName",
  d."dataType",
  d."unit",
  TRUE,
  d."description",
  d."options",
  d."sortOrder",
  NOW(),
  NOW()
FROM organizations o
CROSS JOIN row_defs d
WHERE NOT EXISTS (
  SELECT 1
  FROM "SpireFlowsheetRow" r
  WHERE r."organizationId" = o."organizationId"
    AND r."groupName" IS NOT DISTINCT FROM d."groupName"
    AND r."name" = d."name"
    AND r."active" = TRUE
);
