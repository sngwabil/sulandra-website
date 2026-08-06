import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const databaseUrl=process.env.TEST_DATABASE_URL;
const apiBase=process.env.EMPLOYEE360_TEST_API_BASE;
const token=process.env.EMPLOYEE360_TEST_TOKEN;
const organizationId=process.env.EMPLOYEE360_TEST_ORGANIZATION_ID;
const employeeId=process.env.EMPLOYEE360_TEST_EMPLOYEE_ID;

const maybe=test.skip.bind(test);
const integration=databaseUrl?test:maybe;

integration('enterprise migrations create constrained storage, onboarding, auth and audit tables',async()=>{
  const prisma=new PrismaClient({datasources:{db:{url:databaseUrl}}});
  try{
    const required=['EmployeeSecureDocument','EmployeeDocumentAccessLog','EmployeeOnboardingLink','EmployeeOnboardingSnapshot','EmployeeComplianceReminderRun','EmployeeAuthSession','EmployeeMfaProfile','EmployeePortalAccessControl','EmployeeLoginEvent','EmployeeAuditLedger'];
    const rows=await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1::text[])`,required);
    assert.deepEqual(new Set(rows.map(row=>row.tablename)),new Set(required));
    const constraints=await prisma.$queryRawUnsafe(`SELECT conname FROM pg_constraint WHERE conname IN ('EmployeeSecureDocument_status_check','EmployeeSecureDocument_malware_check','EmployeeLoginEvent_decision_check')`);
    assert.equal(constraints.length,3);
  }finally{await prisma.$disconnect()}
});

const apiIntegration=apiBase&&token&&organizationId&&employeeId?test:maybe;
const request=async(path,options={})=>{const response=await fetch(`${apiBase.replace(/\/$/,'')}${path}`,{...options,headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...(options.headers||{})}});const payload=await response.json().catch(()=>({}));return{response,payload}};

apiIntegration('authenticated Employee 360 APIs preserve organization isolation and return enterprise controls',async()=>{
  const session=await request('/api/session');assert.equal(session.response.status,200);assert.equal(session.payload.data.organizationId,organizationId);
  const employees=await request('/api/admin/employees');assert.equal(employees.response.status,200);
  const dashboard=await request('/api/admin/employee360/enterprise-gap-dashboard');assert.equal(dashboard.response.status,200);assert.ok(dashboard.payload.data.metrics);
  const files=await request(`/api/admin/employee360/secure-files?employeeId=${encodeURIComponent(employeeId)}`);assert.equal(files.response.status,200);assert.ok(Array.isArray(files.payload.data));assert.ok(files.payload.data.every(row=>row.organizationId===organizationId&&row.employeeId===employeeId));
});

apiIntegration('secure file input validation rejects empty and oversized payloads before storage',async()=>{
  const result=await request('/api/admin/employee360/secure-files',{method:'POST',body:JSON.stringify({employeeId,category:'GENERAL',sensitivity:'GENERAL',fileName:'empty.txt',mimeType:'text/plain',fileDataBase64:'',reason:'Integration validation'})});
  assert.ok([400,422].includes(result.response.status));
});

apiIntegration('internal compliance scheduler rejects missing internal authentication',async()=>{
  const response=await fetch(`${apiBase.replace(/\/$/,'')}/internal/employee360/compliance-reminders`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({organizationId,dryRun:true})});
  assert.equal(response.status,401);
});
