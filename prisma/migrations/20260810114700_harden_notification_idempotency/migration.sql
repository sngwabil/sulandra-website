-- Remove any duplicate role-queue notifications that may have been produced while
-- assignedUserId was NULL (ordinary PostgreSQL UNIQUE constraints allow multiple NULLs).
DELETE FROM "EnterpriseWorkNotification" newer
USING "EnterpriseWorkNotification" keeper
WHERE newer."organizationId"=keeper."organizationId"
  AND newer."legalEntityId"=keeper."legalEntityId"
  AND newer."resourceType"=keeper."resourceType"
  AND newer."resourceId"=keeper."resourceId"
  AND newer."eventKey"=keeper."eventKey"
  AND newer."assignedUserId" IS NOT DISTINCT FROM keeper."assignedUserId"
  AND newer."createdAt">keeper."createdAt";

CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseWorkNotification_recipient_event_unique"
  ON "EnterpriseWorkNotification"(
    "organizationId","legalEntityId","resourceType","resourceId","eventKey",
    (COALESCE("assignedUserId",'__ROLE_QUEUE__'))
  );

CREATE OR REPLACE FUNCTION "upsert_enterprise_work_notification"(
  p_org text,p_entity text,p_user text,p_roles jsonb,p_module text,p_type text,p_resource text,p_event text,
  p_title text,p_message text,p_priority text,p_action text,p_due timestamptz,p_metadata jsonb
) RETURNS void AS $$
DECLARE existing_id text;
BEGIN
  SELECT "id" INTO existing_id
  FROM "EnterpriseWorkNotification"
  WHERE "organizationId"=p_org AND "legalEntityId"=p_entity AND "resourceType"=p_type
    AND "resourceId"=p_resource AND "eventKey"=p_event
    AND "assignedUserId" IS NOT DISTINCT FROM p_user
  LIMIT 1;

  IF existing_id IS NULL THEN
    INSERT INTO "EnterpriseWorkNotification"(
      "id","organizationId","legalEntityId","assignedUserId","audienceRoles","module","resourceType","resourceId","eventKey",
      "title","message","priority","status","actionPath","dueAt","metadata","createdAt","updatedAt"
    ) VALUES(
      gen_random_uuid()::text,p_org,p_entity,p_user,COALESCE(p_roles,'[]'::jsonb),p_module,p_type,p_resource,p_event,
      p_title,p_message,COALESCE(p_priority,'ROUTINE'),'OPEN',p_action,p_due,COALESCE(p_metadata,'{}'::jsonb),now(),now()
    );
  ELSE
    UPDATE "EnterpriseWorkNotification"
    SET "audienceRoles"=COALESCE(p_roles,'[]'::jsonb),"module"=p_module,"title"=p_title,"message"=p_message,
        "priority"=COALESCE(p_priority,'ROUTINE'),"status"='OPEN',"actionPath"=p_action,"dueAt"=p_due,
        "metadata"=COALESCE(p_metadata,'{}'::jsonb),"readAt"=NULL,"readByUserId"=NULL,
        "completedAt"=NULL,"completedByUserId"=NULL,"updatedAt"=now()
    WHERE "id"=existing_id;
  END IF;
END;
$$ LANGUAGE plpgsql;
