import {execFileSync, spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
const allowed=new Set(['.gitignore','.gitattributes','README.md','check-public.mjs',
  'build-pinned.ps1','build-pinned.sh','build-corrected.ps1','build-corrected.sh',
  'confidence.mjs','m3.test.mjs','persistent-client.mjs','persistent-worker.mjs']);
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
const paths=[...new Set(git(['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(Boolean))];
const issues=[];
const patterns=[
  ['private key',/-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/],
  ['GitHub credential',/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['cloud access key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['service token',/\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/],
  ['JWT credential',/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
  ['credential in URL',/https?:\/\/[^\s/@:]+:[^\s/@]+@/i],
  ['assigned credential',/(?:password|passwd|api[_-]?key|client[_-]?secret|access[_-]?token|authorization)\s*["']?\s*[:=]\s*["'](?:Bearer\s+)?[A-Za-z0-9_+/.=-]{16,}["']/i],
  ['purchased archive marker',/6max-nl\d+[a-z]*-\d+bb|postflop\.zip|oop[_]hands|ip[_]hands/i],
];
for(const path of paths){
  if(path.startsWith('benchmark/')&&!allowed.has(path.slice(10)))issues.push(`${path}: benchmark file outside reviewed allowlist`);
  if(/(?:^|\/)(?:\.env(?:\..*)?|\.netrc|\.npmrc)$/.test(path)&&!path.endsWith('/.env.example')&&path!=='.env.example')issues.push(`${path}: local credential filename`);
  if(/\.(?:pem|key|p12|pfx)$/i.test(path))issues.push(`${path}: key material filename`);
  let bytes;try{bytes=readFileSync(join(root,path));}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(bytes.includes(0))continue;
  const lines=bytes.toString('utf8').split(/\r?\n/);
  lines.forEach((line,i)=>{for(const [label,re] of patterns)if(re.test(line))issues.push(`${path}:${i+1}: ${label}`);});
}
const probes=['benchmark/private/sentinel.json','benchmark/results/sentinel.json',
  'benchmark/arbitrary-new-output.json','benchmark/private-fixture.toml',
  'benchmark/output.zip','benchmark/output.wasm','benchmark/browser-profile/Preferences',
  'benchmark/artifacts-m3/solver_wasm_bg.wasm','benchmark/build-m3/source.tar',
  'benchmark/README.local.md','benchmark/INTEGRATION_HANDOFF.md',
  'benchmark/M3_REPORT.md','benchmark/TURN_REPORT.md','benchmark/REPORT.md',
  'benchmark/PURCHASED_EV_AUDIT.json','benchmark/inspect-data.mjs',
  'benchmark/extract.mjs','benchmark/extract-m3.mjs','.env','.env.local','local.pem'];
const ignored=spawnSync('git',['check-ignore','--no-index','--stdin'],{cwd:root,encoding:'utf8',input:probes.join('\n')+'\n'});
if(ignored.error)throw ignored.error;
if(![0,1].includes(ignored.status))throw new Error('Ignore-rule verification failed');
const matched=new Set(ignored.stdout.trim().split(/\r?\n/));
for(const path of probes)if(!matched.has(path))issues.push(`${path}: private-path ignore probe failed`);
if(issues.length){console.error(issues.join('\n'));process.exitCode=1;}
else console.log(`PASS: ${paths.length} tracked/eligible files scanned; ${probes.length} private-path probes ignored. No matching credentials or purchased-data markers. Review staged contents separately before committing.`);
