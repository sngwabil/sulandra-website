import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync=promisify(execFile);

await execFileAsync(process.execPath,['scripts/install-it-agent-xterm-emulator.mjs'],{cwd:process.cwd()});

const source=await readFile('assets/it-agent-real-terminal.js','utf8');
const match=source.match(/  const restartTerminal=async\(\)=>\{([\s\S]*?)\n  \};\n\n  const /);
assert(match,'restartTerminal implementation was not found');
const body=match[1];

assert(!body.includes('closeTerminal(old.id)'),'Restart shell must not use closeTerminal/removeLocalSession because that reindexes sibling tabs');
assert(body.includes('const index=sessions.indexOf(old);'),'Restart shell must capture the active tab index');
assert(body.includes('sessions.splice(index,1,replacement);'),'Restart shell must replace the active session in place');

const old={id:'session-old',cursor:91,output:'OLD',rawOutput:'OLD',alive:true,polling:false};
const peer={id:'session-peer',cursor:144,output:'PEER_HISTORY_SENTINEL',rawOutput:'PEER_RAW_SENTINEL',alive:true,polling:false};
const sessions=[old,peer];
let activeId=old.id;
let persisted=0;
let renderedTabs=0;
let renderedScreen=0;
let polled=0;
let workerErrors=0;
const calls=[];

const activeSession=()=>sessions.find(session=>session.id===activeId)||null;
const ensureWorkspace=async()=> 'workspace-dynamic';
const apiRequest=async(path,options={})=>{
  calls.push({path,method:options.method||'GET'});
  if(options.method==='POST'&&path.endsWith('/sessions'))return {sessionId:'session-restarted'};
  if(options.method==='DELETE'&&path.endsWith('/session-old'))return {};
  throw new Error(`Unexpected request ${options.method||'GET'} ${path}`);
};
const persistSessions=()=>{persisted+=1};
const renderTabs=()=>{renderedTabs+=1};
const renderScreen=()=>{renderedScreen+=1};
const xtermActive=()=>true;
const pollSession=async()=>{polled+=1};
const setWorkerState=()=>{workerErrors+=1};
const appendSystem=()=>{workerErrors+=1};
const createTerminal=async()=>{throw new Error('createTerminal fallback must not run when an active session exists')};
const terminalRoot={querySelector:()=>({focus(){}})};

const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const restart=new AsyncFunction(
  'activeSession','sessions','ensureWorkspace','apiRequest','activeIdRef','persistSessions','renderTabs','renderScreen','xtermActive','pollSession','terminalRoot','setWorkerState','appendSystem','createTerminal',
  `${body.replace(/activeId=replacement\.id;/,'activeIdRef.value=replacement.id;')}\nreturn activeIdRef.value;`
);
const activeIdRef={value:activeId};

await restart(activeSession,sessions,ensureWorkspace,apiRequest,activeIdRef,persistSessions,renderTabs,renderScreen,xtermActive,pollSession,terminalRoot,setWorkerState,appendSystem,createTerminal);
activeId=activeIdRef.value;

assert.equal(sessions.length,2,'Restart must keep the same number of terminal tabs');
assert.equal(sessions[0].id,'session-restarted','Restarted shell must occupy the same tab index');
assert.strictEqual(sessions[1],peer,'Sibling terminal object must be preserved, not recreated');
assert.equal(sessions[1].output,'PEER_HISTORY_SENTINEL','Sibling visible history must remain untouched');
assert.equal(sessions[1].rawOutput,'PEER_RAW_SENTINEL','Sibling raw PTY history must remain untouched');
assert.equal(sessions[1].cursor,144,'Sibling output cursor must remain untouched');
assert.equal(activeId,'session-restarted','Replacement session must remain the active tab');
assert.deepEqual(calls.map(call=>call.method),['POST','DELETE'],'Replacement must be created before the old active session is deleted');
assert.equal(persisted,1);
assert.equal(renderedTabs,1);
assert.equal(renderedScreen,1);
assert.equal(polled,0,'Connected xterm replacement should not invoke REST polling');
assert.equal(workerErrors,0);

console.log('Restart isolation regression passed: active tab replaced in place; sibling terminal identity, history, cursor, and ordering remain unchanged.');
