import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const marker='IT_AGENT_RECENT_EDUCATION_CAMPAIGN_RESOLUTION_V1';
const routePath=path.join(root,'api','src','education-campaign-routes.ts');
const installerPath=path.join(root,'scripts','install-it-agent-training-workflow.mjs');
const workbenchPath=path.join(root,'api','src','it-agent-workbench-routes.ts');
const must=(condition,message)=>{if(!condition)throw new Error(`IT Agent recent education repair failed: ${message}`)};

let routes=await readFile(routePath,'utf8');
if(!routes.includes(marker)){
  const typeOld=`type AgentCampaignInput = {\n  organizationId: string;\n  userId: string;\n  conversationId: string;\n  campaignId?: string | null;\n};`;
  const typeNew=`type AgentCampaignInput = {\n  organizationId: string;\n  userId: string;\n  conversationId: string;\n  campaignId?: string | null;\n  campaignTitle?: string | null;\n};`;
  must(routes.includes(typeOld),'AgentCampaignInput anchor changed');
  routes=routes.replace(typeOld,typeNew);

  const currentOld=`async function currentCampaign(prisma: PrismaClient, input: AgentCampaignInput) {\n  const explicit = clean(input.campaignId, 160);\n  if (explicit) return campaignById(prisma, input.organizationId, explicit);\n  const rows = await prisma.$queryRawUnsafe<CampaignRow[]>(\n    \`SELECT * FROM "EducationCampaign"\n      WHERE "organizationId"=$1 AND "conversationId"=$2\n      ORDER BY CASE WHEN "status" IN ('DRAFT','READY_TO_SEND') THEN 0 WHEN "status"='ACTIVE' THEN 1 ELSE 2 END,\n               "updatedAt" DESC\n      LIMIT 1\`,\n    input.organizationId,\n    input.conversationId,\n  );\n  return rows[0] ?? null;\n}`;
  const currentNew=`/* ${marker}: an administrator may refer to a recently created campaign from another IT chat. */\nasync function currentCampaign(prisma: PrismaClient, input: AgentCampaignInput) {\n  const explicit = clean(input.campaignId, 160);\n  if (explicit) return campaignById(prisma, input.organizationId, explicit);\n\n  const requestedTitle = clean(input.campaignTitle, 300);\n  if (requestedTitle) {\n    const titleMatches = await prisma.$queryRawUnsafe<CampaignRow[]>(\n      \`SELECT * FROM "EducationCampaign"\n        WHERE "organizationId"=$1 AND LOWER("title") LIKE $2\n        ORDER BY CASE WHEN "status" IN ('DRAFT','READY_TO_SEND') THEN 0 WHEN "status"='ACTIVE' THEN 1 ELSE 2 END,\n                 "updatedAt" DESC\n        LIMIT 4\`,\n      input.organizationId,\n      \`%\${requestedTitle.toLowerCase()}%\`,\n    );\n    const exact = titleMatches.filter((row) => clean(row.title, 300).toLowerCase() === requestedTitle.toLowerCase());\n    if (exact.length === 1) return exact[0];\n    if (exact.length > 1 || titleMatches.length > 1) {\n      throw httpError(409, \`More than one education campaign matches “\${requestedTitle}”. Give me the exact campaign title before I assign or send anything.\`);\n    }\n    if (titleMatches.length === 1) return titleMatches[0];\n  }\n\n  const rows = await prisma.$queryRawUnsafe<CampaignRow[]>(\n    \`SELECT * FROM "EducationCampaign"\n      WHERE "organizationId"=$1 AND "conversationId"=$2\n      ORDER BY CASE WHEN "status" IN ('DRAFT','READY_TO_SEND') THEN 0 WHEN "status"='ACTIVE' THEN 1 ELSE 2 END,\n               "updatedAt" DESC\n      LIMIT 1\`,\n    input.organizationId,\n    input.conversationId,\n  );\n  if (rows[0]) return rows[0];\n\n  const openCampaigns = await prisma.$queryRawUnsafe<CampaignRow[]>(\n    \`SELECT * FROM "EducationCampaign"\n      WHERE "organizationId"=$1 AND "status" IN ('DRAFT','READY_TO_SEND')\n      ORDER BY "updatedAt" DESC\n      LIMIT 2\`,\n    input.organizationId,\n  );\n  if (openCampaigns.length === 1) return openCampaigns[0];\n  if (openCampaigns.length > 1) {\n    throw httpError(409, 'More than one open education campaign exists. Name the training you want to assign before I send anything.');\n  }\n  return null;\n}`;
  must(routes.includes(currentOld),'currentCampaign anchor changed');
  routes=routes.replace(currentOld,currentNew);

  const baseOld=`    campaignId: clean(input.payload.campaignId, 160) || null,\n  };`;
  const baseNew=`    campaignId: clean(input.payload.campaignId, 160) || null,\n    campaignTitle: clean(input.payload.campaignTitle, 300) || null,\n  };`;
  must(routes.includes(baseOld),'executeTrainingAgentAction base anchor changed');
  routes=routes.replace(baseOld,baseNew);
}
await writeFile(routePath,routes,'utf8');

const toolShapeOld="properties:{campaignId:{type:'string'}},required:['campaignId']";
const toolShapeNew="properties:{campaignId:{type:'string'},campaignTitle:{type:'string'}},required:['campaignId','campaignTitle']";
const instructionOld='Use get_training_status for completion counts or employee status.';
const instructionNew='Use get_training_status for completion counts or employee status. When the Administrator refers to a recently created education item from another chat, pass the spoken training name in campaignTitle (campaignId may be empty); never guess between multiple matching campaigns.';

let installer=await readFile(installerPath,'utf8');
if(!installer.includes(toolShapeNew)){
  const count=(installer.match(new RegExp(toolShapeOld.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))||[]).length;
  must(count>=3,'training campaign tool schemas changed');
  installer=installer.replaceAll(toolShapeOld,toolShapeNew);
}
if(installer.includes(instructionOld))installer=installer.replace(instructionOld,instructionNew);
else must(installer.includes('pass the spoken training name in campaignTitle'),'training reasoning instruction changed');
await writeFile(installerPath,installer,'utf8');

let workbench=await readFile(workbenchPath,'utf8');
if(workbench.includes("name:'send_training'")){
  if(!workbench.includes(toolShapeNew))workbench=workbench.replaceAll(toolShapeOld,toolShapeNew);
  if(workbench.includes(instructionOld))workbench=workbench.replace(instructionOld,instructionNew);
  must(workbench.includes(toolShapeNew),'live workbench campaignTitle tool contract missing');
  await writeFile(workbenchPath,workbench,'utf8');
}

must(routes.includes(marker),'route resolution marker missing');
must(routes.includes('campaignTitle: clean(input.payload.campaignTitle, 300) || null'),'campaignTitle execution mapping missing');
console.log('IT Agent recent education campaign repair installed: recent cross-chat campaigns resolve safely by title or a unique open campaign while preserving the existing runtime-incident boundary.');
