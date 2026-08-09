CREATE OR REPLACE FUNCTION "guard_sulandra_clinical_attachment_type"()
RETURNS trigger AS $$
DECLARE
  mime text := lower(COALESCE(NEW."mimeType",''));
  filename text := lower(COALESCE(NEW."originalFileName",''));
BEGIN
  IF mime IN (
    'text/html','application/xhtml+xml','image/svg+xml','application/javascript','text/javascript',
    'application/x-javascript','application/x-msdownload','application/x-msdos-program',
    'application/x-sh','application/x-shellscript','application/x-powershell','application/java-archive'
  ) THEN
    RAISE EXCEPTION 'This file type is not allowed in Sulandra clinical/referral document storage'
      USING ERRCODE='23514';
  END IF;

  IF filename ~ '\.(html?|xhtml|svg|js|mjs|cjs|exe|com|dll|bat|cmd|ps1|psm1|sh|bash|zsh|ksh|jar|msi|scr|hta|vbs|vbe|wsf|wsh|reg)$' THEN
    RAISE EXCEPTION 'This file extension is not allowed in Sulandra clinical/referral document storage'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "ClientIntakeAttachment_guard_type" ON "ClientIntakeAttachment";
CREATE TRIGGER "ClientIntakeAttachment_guard_type"
BEFORE INSERT OR UPDATE OF "mimeType","originalFileName" ON "ClientIntakeAttachment"
FOR EACH ROW EXECUTE FUNCTION "guard_sulandra_clinical_attachment_type"();

DROP TRIGGER IF EXISTS "NmtTransportOrderAttachment_guard_type" ON "NmtTransportOrderAttachment";
CREATE TRIGGER "NmtTransportOrderAttachment_guard_type"
BEFORE INSERT OR UPDATE OF "mimeType","originalFileName" ON "NmtTransportOrderAttachment"
FOR EACH ROW EXECUTE FUNCTION "guard_sulandra_clinical_attachment_type"();
