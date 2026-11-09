"""Redacted scan: tracked files, every reachable git blob, built client assets and public deployment assets.
Never prints matched values. Findings are candidates for review, not proof of credential validity.
"""
import subprocess, pathlib, re, json, hashlib, urllib.request, urllib.parse
root=pathlib.Path(__file__).resolve().parents[2]
patterns={
 'private-key':rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
 'google-service-account':rb'"type"\s*:\s*"service_account"',
 'github-token':rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b',
 'aws-access-key':rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
 'stripe-live-secret':rb'\bsk_live_[A-Za-z0-9]{20,}\b',
 'resend-secret':rb'\bre_[A-Za-z0-9]{25,}\b',
 'literal-secret':rb'''(?i)(?:CLOUDINARY_API_SECRET|APPS_SCRIPT_MAIL_SECRET|CRON_SECRET|MAIL_WEBHOOK_SECRET)[\"']?\s*[=:]\s*["']([A-Za-z0-9_\-]{24,})["']''',
}
findings=[];counts={};public_keys=set()
def scan(scope,path,data):
 counts[scope]=counts.get(scope,0)+1
 for key,pattern in patterns.items():
  for m in re.finditer(pattern,data):findings.append({'scope':scope,'path':path,'kind':key,'fingerprint':hashlib.sha256(m.group()).hexdigest()[:12]})
 for key in re.findall(rb'AIza[0-9A-Za-z_-]{35}',data):public_keys.add(hashlib.sha256(key).hexdigest()[:12])
for f in subprocess.check_output(['git','ls-files','-z'],cwd=root).split(b'\0'):
 if f:
  p=root/f.decode()
  if p.is_file():scan('tracked',f.decode(),p.read_bytes())
objects=subprocess.check_output(['git','rev-list','--objects','--all'],cwd=root).splitlines()
p=subprocess.Popen(['git','cat-file','--batch'],cwd=root,stdin=subprocess.PIPE,stdout=subprocess.PIPE)
for entry in objects:
 oid,_,path=entry.partition(b' ');p.stdin.write(oid+b'\n');p.stdin.flush();header=p.stdout.readline().split()
 if len(header)!=3:continue
 size=int(header[2]);data=p.stdout.read(size);p.stdout.read(1)
 if header[1]==b'blob':scan('history',path.decode(errors='replace') or oid.decode(),data)
p.stdin.close();p.wait()
for f in (root/'.next/static').rglob('*'):
 if f.is_file():scan('built-client',str(f.relative_to(root)),f.read_bytes())
origin='https://treatstory.vercel.app';deployment={'origin':origin,'requests':[]}
def get(url):
 req=urllib.request.Request(url,headers={'User-Agent':'TreatStory-authorized-security-audit/1.0'})
 try:
  with urllib.request.urlopen(req,timeout=30)as r:return r.status,dict(r.headers),r.read(8_000_000)
 except Exception as e:return getattr(e,'code',0),{},b''
status,headers,html=get(origin+'/');deployment['headers']={key:value for key,value in headers.items() if key.lower() in {'content-security-policy','x-content-type-options','x-frame-options','referrer-policy','permissions-policy','cache-control','content-type','server','strict-transport-security','x-powered-by'}};deployment['requests'].append({'path':'/','status':status});scan('production-public','/',html)
assets=list(dict.fromkeys(re.findall(rb'(?:src|href)="([^" ]+\.js(?:\?[^" ]*)?)"',html)))[:30]
for asset in assets:
 url=urllib.parse.urljoin(origin,asset.decode());parsed=urllib.parse.urlparse(url)
 if parsed.netloc!=urllib.parse.urlparse(origin).netloc:continue
 status,_,data=get(url);deployment['requests'].append({'path':parsed.path,'status':status});scan('production-public',parsed.path,data)
# One source-map probe and one accidental environment-file probe, read only.
for path in ([urllib.parse.urlparse(urllib.parse.urljoin(origin,assets[0].decode())).path+'.map']if assets else[])+['/.env']:
 status,_,_=get(origin+path);deployment['requests'].append({'path':path,'status':status})
report={'counts':counts,'candidateFindings':findings,'publicFirebaseKeyFingerprints':sorted(public_keys),'deployment':deployment,'limitations':['Heuristic pattern scan; not a guarantee of absence.','No access to deployment environment values, cloud IAM, API restrictions or published rules.','Historical matches include documentation/examples; review fingerprints and paths without printing values.']}
out=root/'docs/audits/secret-scan.json';out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'counts':counts,'candidates':len(findings),'report':str(out)}))
