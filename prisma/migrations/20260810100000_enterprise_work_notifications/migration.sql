CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "EnterpriseWorkNotification" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "assignedUserId" text,
  "audienceRoles" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "module" text NOT NULL,
  "resourceType" text NOT NULL,
  "resourceId" text NOT NULL,
  "eventKey" text NOT NULL,
  "title" text NOT NULL,
  "message" text,
  "priority" text NOT NULL DEFAULT 'ROUTINE',
  "status" text NOT NULL DEFAULT 'OPEN',
  "actionPath" text,
  "dueAt" timestamptz,
  "readAt" timestamptz,
  "readByUserId" text,
  "completedAt" timestamptz,
  "completedByUserId" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "EnterpriseWorkNotification_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "EnterpriseWorkNotification_priority_check" CHECK ("priority" IN ('ROUTINE','HIGH','URGENT','CRITICAL')),
  CONSTRAINT "EnterpriseWorkNotification_status_check" CHECK ("status" IN ('OPEN','READ','COMPLETED','DISMISSED')),
  CONSTRAINT "EnterpriseWorkNotification_event_key" UNIQUE ("organizationId","legalEntityId","resourceType","resourceId","eventKey","assignedUserId")
);
CREATE INDEX IF NOT EXISTS "EnterpriseWorkNotification_user_idx" ON "EnterpriseWorkNotification"("organizationId","legalEntityId","assignedUserId","status","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EnterpriseWorkNotification_role_idx" ON "EnterpriseWorkNotification" USING gin ("audienceRoles");
CREATE INDEX IF NOT EXISTS "EnterpriseWorkNotification_module_idx" ON "EnterpriseWorkNotification"("organizationId","legalEntityId","module","status","createdAt" DESC);

CREATE OR REPLACE FUNCTION "upsert_enterprise_work_notification"(
  p_org text,p_entity text,p_user text,p_roles jsonb,p_module text,p_type text,p_resource text,p_event text,
  p_title text,p_message text,p_priority text,p_action text,p_due timestamptz,p_metadata jsonb
) RETURNS void AS $$
BEGIN
  INSERT INTO "EnterpriseWorkNotification"(
    "id","organizationId","legalEntityId","assignedUserId","audienceRoles","module","resourceType","resourceId","eventKey","title","message","priority","status","actionPath","dueAt","metadata","createdAt","updatedAt"
  ) VALUES(
    gen_random_uuid()::text,p_org,p_entity,p_user,COALESCE(p_roles,'[]'::jsonb),p_module,p_type,p_resource,p_event,p_title,p_message,COALESCE(p_priority,'ROUTINE'),'OPEN',p_action,p_due,COALESCE(p_metadata,'{}'::jsonb),now(),now()
  ) ON CONFLICT ("organizationId","legalEntityId","resourceType","resourceId","eventKey","assignedUserId")
  DO UPDATE SET "title"=EXCLUDED."title","message"=EXCLUDED."message","priority"=EXCLUDED."priority","status"='OPEN',"actionPath"=EXCLUDED."actionPath","dueAt"=EXCLUDED."dueAt","metadata"=EXCLUDED."metadata","readAt"=NULL,"readByUserId"=NULL,"completedAt"=NULL,"completedByUserId"=NULL,"updatedAt"=now();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "notify_scls_task_change"() RETURNS trigger AS $$
BEGIN
  IF NEW."assignedUserId" IS NOT NULL AND NEW."status" IN ('OPEN','IN_PROGRESS') THEN
    PERFORM "upsert_enterprise_work_notification"(NEW."organizationId",NEW."legalEntityId",NEW."assignedUserId",'[]'::jsonb,'SCLS','SpireClinicalTask',NEW."id",'ASSIGNMENT',NEW."title",NEW."instructions",CASE NEW."priority" WHEN 'URGENT' THEN 'URGENT' WHEN 'HIGH' THEN 'HIGH' ELSE 'ROUTINE' END,concat('/scls-tasks.html'),NEW."dueAt",jsonb_build_object('homeId',NEW."homeId",'clientId',NEW."clientId",'taskType',NEW."taskType"));
  END IF;
  IF NEW."status" IN ('COMPLETED','CANCELLED') THEN
    UPDATE "EnterpriseWorkNotification" SET "status"='COMPLETED',"completedAt"=now(),"updatedAt"=now()
    WHERE "organizationId"=NEW."organizationId" AND "legalEntityId"=NEW."legalEntityId" AND "resourceType"='SpireClinicalTask' AND "resourceId"=NEW."id" AND "status" IN ('OPEN','READ');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "SpireClinicalTask_work_notification" ON "SpireClinicalTask";
CREATE TRIGGER "SpireClinicalTask_work_notification" AFTER INSERT OR UPDATE OF "assignedUserId","status","dueAt","priority","title" ON "SpireClinicalTask" FOR EACH ROW EXECUTE FUNCTION "notify_scls_task_change"();

CREATE OR REPLACE FUNCTION "notify_client_intake_review"() RETURNS trigger AS $$
BEGIN
  IF NEW."status"='SUBMITTED' AND (TG_OP='INSERT' OR OLD."status" IS DISTINCT FROM NEW."status") THEN
    PERFORM "upsert_enterprise_work_notification"(NEW."organizationId",NEW."legalEntityId",NULL,'["ADMINISTRATOR","PROGRAM_MANAGER","RN","DELEGATING_NURSE","CEO","DOO"]'::jsonb,'CLIENT_INTAKE','ClientIntakeCase',NEW."id",'SUBMITTED_FOR_REVIEW',concat('Client Intake review: ',COALESCE(NEW."prospectPreferredName",NEW."prospectFirstName",'Client'),' ',COALESCE(NEW."prospectLastName",'')),'A completed intake packet is waiting for clinical/program review.','HIGH',concat('/client-intake.html?caseId=',NEW."id"),NULL,jsonb_build_object('serviceType',NEW."serviceType",'programCode',NEW."programCode"));
  END IF;
  IF NEW."status" IN ('APPROVED','REJECTED','CLOSED','WITHDRAWN') THEN
    UPDATE "EnterpriseWorkNotification" SET "status"='COMPLETED',"completedAt"=now(),"updatedAt"=now() WHERE "organizationId"=NEW."organizationId" AND "legalEntityId"=NEW."legalEntityId" AND "resourceType"='ClientIntakeCase' AND "resourceId"=NEW."id" AND "status" IN ('OPEN','READ');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "ClientIntakeCase_work_notification" ON "ClientIntakeCase";
CREATE TRIGGER "ClientIntakeCase_work_notification" AFTER INSERT OR UPDATE OF "status" ON "ClientIntakeCase" FOR EACH ROW EXECUTE FUNCTION "notify_client_intake_review"();

CREATE OR REPLACE FUNCTION "notify_home_health_referral"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" IN ('RECEIVED','REVIEW_REQUIRED','INTAKE_CREATED') THEN
    PERFORM "upsert_enterprise_work_notification"(NEW."organizationId",NEW."legalEntityId",NULL,'["ADMINISTRATOR","PROGRAM_MANAGER","RN","DELEGATING_NURSE","SCHEDULER","CEO","DOO"]'::jsonb,'HOME_HEALTH','HomeHealthReferral',NEW."id",'REFERRAL_REVIEW',concat('Home Health referral: ',NEW."patientFirstName",' ',NEW."patientLastName"),concat('Referral ',NEW."referralNumber",' is ',replace(NEW."status",'_',' '),'.'),CASE NEW."priority" WHEN 'URGENT' THEN 'URGENT' WHEN 'HIGH' THEN 'HIGH' ELSE 'ROUTINE' END,'/home-health-referrals.html',NEW."requestedStartOfCareDate"::timestamptz,jsonb_build_object('referralNumber',NEW."referralNumber",'sourceId',NEW."sourceId",'mode',NEW."mode"));
  END IF;
  IF NEW."status" IN ('ACCEPTED','DECLINED','CANCELLED') THEN
    UPDATE "EnterpriseWorkNotification" SET "status"='COMPLETED',"completedAt"=now(),"updatedAt"=now() WHERE "organizationId"=NEW."organizationId" AND "legalEntityId"=NEW."legalEntityId" AND "resourceType"='HomeHealthReferral' AND "resourceId"=NEW."id" AND "status" IN ('OPEN','READ');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "HomeHealthReferral_work_notification" ON "HomeHealthReferral";
CREATE TRIGGER "HomeHealthReferral_work_notification" AFTER INSERT OR UPDATE OF "status","priority","requestedStartOfCareDate" ON "HomeHealthReferral" FOR EACH ROW EXECUTE FUNCTION "notify_home_health_referral"();

CREATE OR REPLACE FUNCTION "notify_home_health_visit"() RETURNS trigger AS $$
BEGIN
  IF NEW."assignedUserId" IS NOT NULL AND NEW."status" IN ('SCHEDULED','CONFIRMED','IN_PROGRESS') THEN
    PERFORM "upsert_enterprise_work_notification"(NEW."organizationId",NEW."legalEntityId",NEW."assignedUserId",'[]'::jsonb,'HOME_HEALTH','HomeHealthVisit',NEW."id",'ASSIGNMENT',concat('Home Health ',NEW."discipline",' visit'),concat('Visit ',NEW."visitType",' is assigned to you.'),'HIGH','/home-health-visits.html',NEW."scheduledStart",jsonb_build_object('episodeId',NEW."episodeId",'patientId',NEW."patientId",'discipline',NEW."discipline"));
  END IF;
  IF NEW."status" IN ('COMPLETED','MISSED','CANCELLED') THEN
    UPDATE "EnterpriseWorkNotification" SET "status"='COMPLETED',"completedAt"=now(),"updatedAt"=now() WHERE "organizationId"=NEW."organizationId" AND "legalEntityId"=NEW."legalEntityId" AND "resourceType"='HomeHealthVisit' AND "resourceId"=NEW."id" AND "status" IN ('OPEN','READ');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "HomeHealthVisit_work_notification" ON "HomeHealthVisit";
CREATE TRIGGER "HomeHealthVisit_work_notification" AFTER INSERT OR UPDATE OF "assignedUserId","status","scheduledStart" ON "HomeHealthVisit" FOR EACH ROW EXECUTE FUNCTION "notify_home_health_visit"();

CREATE OR REPLACE FUNCTION "notify_workforce_time_correction"() RETURNS trigger AS $$
BEGIN
  IF NEW."status"='PENDING' THEN
    PERFORM "upsert_enterprise_work_notification"(NEW."organizationId",NEW."legalEntityId",NULL,'["ADMINISTRATOR","PROGRAM_MANAGER","HR_MANAGER","BILLING_SPECIALIST","CEO","DOO"]'::jsonb,'WORKFORCE','EmployeeTimeCorrection',NEW."id",'REVIEW',concat('Time correction: ',NEW."userId"),concat(replace(NEW."correctionKind",'_',' '),' requires review.'),'ROUTINE','/workforce-admin.html#corrections',NULL,jsonb_build_object('employeeUserId',NEW."userId"));
  ELSE
    UPDATE "EnterpriseWorkNotification" SET "status"='COMPLETED',"completedAt"=now(),"updatedAt"=now() WHERE "organizationId"=NEW."organizationId" AND "legalEntityId"=NEW."legalEntityId" AND "resourceType"='EmployeeTimeCorrection' AND "resourceId"=NEW."id" AND "status" IN ('OPEN','READ');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "EmployeeTimeCorrection_work_notification" ON "EmployeeTimeCorrection";
CREATE TRIGGER "EmployeeTimeCorrection_work_notification" AFTER INSERT OR UPDATE OF "status" ON "EmployeeTimeCorrection" FOR EACH ROW EXECUTE FUNCTION "notify_workforce_time_correction"();

CREATE OR REPLACE FUNCTION "notify_employee_document_review"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" IN ('SUBMITTED','CHANGES_REQUESTED') THEN
    PERFORM "upsert_enterprise_work_notification"(NEW."organizationId",NEW."legalEntityId",NULL,'["ADMINISTRATOR","PROGRAM_MANAGER","HR_MANAGER","CEO","DOO"]'::jsonb,'WORKFORCE','EmployeeDocumentSubmission',NEW."id",'REVIEW',concat('Employee document: ',NEW."userId"),concat(replace(NEW."documentType",'_',' '),' is waiting for review.'),'ROUTINE','/workforce-admin.html#documents',NEW."expirationDate"::timestamptz,jsonb_build_object('employeeUserId',NEW."userId",'documentType',NEW."documentType"));
  ELSE
    UPDATE "EnterpriseWorkNotification" SET "status"='COMPLETED',"completedAt"=now(),"updatedAt"=now() WHERE "organizationId"=NEW."organizationId" AND "legalEntityId"=NEW."legalEntityId" AND "resourceType"='EmployeeDocumentSubmission' AND "resourceId"=NEW."id" AND "status" IN ('OPEN','READ');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "EmployeeDocumentSubmission_work_notification" ON "EmployeeDocumentSubmission";
CREATE TRIGGER "EmployeeDocumentSubmission_work_notification" AFTER INSERT OR UPDATE OF "status","expirationDate" ON "EmployeeDocumentSubmission" FOR EACH ROW EXECUTE FUNCTION "notify_employee_document_review"();
