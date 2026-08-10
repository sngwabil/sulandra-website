import { test, expect } from '@playwright/test';

const employee={id:'emp-1',userId:'emp-1',displayName:'Sulpitius Ndeh Gwabil',email:'admin@sulandrahealth.com',role:'ADMINISTRATOR',jobTitle:'Enterprise Owner',department:'Executive'};

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('sulandra:employee:access-token','test-token'));
  await page.route('https://sulandra-website-production-5fc4.up.railway.app/api/session',route=>route.fulfill({json:{data:{displayName:'Sulpitius Ndeh Gwabil',email:'admin@sulandrahealth.com',role:'ADMINISTRATOR'}}}));
  await page.route('https://sulandra-website-production-5fc4.up.railway.app/api/admin/employees',route=>route.fulfill({json:{data:{employees:[employee]}}}));
  await page.route('https://sulandra-website-production-5fc4.up.railway.app/api/admin/employee360/enterprise-gap-dashboard',route=>route.fulfill({json:{data:{metrics:{blockedAssignments:0,failedCommunications:0},assignments:[],corrections:[],signoffs:[],communications:[],security:[],audit:[]}}}));
  await page.route(/https:\/\/sulandra-website-production-5fc4\.up\.railway\.app\/api\/admin\/employee360\/secure-files\?employeeId=.*/,route=>route.fulfill({json:{data:[{id:'doc-1',employeeId:'emp-1',fileName:'RN License.pdf',category:'LICENSE',version:1,encryption:'SSE-KMS',malwareStatus:'CLEAN',retentionUntil:null,legalHold:false}]}}));
});

test('renders the first-class Employee 360 workspace and opens a profile',async({page})=>{
  await page.goto('/employee360.html');
  await expect(page.getByRole('heading',{name:'Employee 360 Enterprise Workspace'})).toBeVisible();
  await expect(page.getByRole('button',{name:/Sulpitius Ndeh Gwabil/})).toBeVisible();
  await page.getByRole('button',{name:/Sulpitius Ndeh Gwabil/}).click();
  await expect(page.getByRole('heading',{name:'Sulpitius Ndeh Gwabil'})).toBeVisible();
  await expect(page.locator('#employeeMeta')).toContainText('Enterprise Owner');
  await page.locator('#tabs button[data-tab="files"]').click();
  await expect(page.getByText('RN License.pdf')).toBeVisible();
  await expect(page.getByText('SSE-KMS')).toBeVisible();
  await expect(page.getByText('CLEAN')).toBeVisible();
});

test('supports mobile navigation without blanking the employee workspace',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/employee360.html');
  await page.getByRole('button',{name:/Sulpitius Ndeh Gwabil/}).click();
  await expect(page.locator('#workspace')).toBeVisible();
  await page.locator('#tabs button[data-tab="onboarding"]').click();
  await expect(page.getByPlaceholder('Applicant/application ID')).toBeVisible();
  await page.locator('#tabs button[data-tab="security"]').click();
  await expect(page.locator('#tab-security')).toBeVisible();
});
