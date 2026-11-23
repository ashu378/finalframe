const assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),path=require('node:path'),ts=require('typescript');
function load(file,imports){const name=path.resolve(__dirname,'../..',file),m=new Module(name,module);m.filename=name;m.paths=Module._nodeModulePaths(path.dirname(name));m.require=x=>Object.hasOwn(imports,x)?imports[x]:require(x);m._compile(ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,name);return m.exports;}
const server=load('src/lib/review/media-server.ts',{'server-only':{},'../../../convex/reviewMediaContract':{}});
let differentFile=false,denied=false,calls=0,fetches=0;
const origin='https://download-fixture.convex.cloud',url=origin+'/api/storage/file';
const client={query:async(ref,args)=>{calls++;if(denied)throw Error('project access denied');if(ref==='assetMeta')return{storageId:'storage',name:'../Both episodes.mp4',byteSize:4,mimeType:'video/mp4'};if(ref==='assetUrl')return{storageId:differentFile?'another':'storage',url};return ref==='movie'?{downloadUrl:url,output:{byteSize:4}}:{downloadUrl:url,downloadSize:4,mimeType:'video/mp4'};}};
const route=load('src/app/api/download/[kind]/[id]/route.ts',{'@/lib/convex/server':{getAuthenticatedConvexClient:async()=>client},'@/lib/review/media-server':server,'../../../../../../convex/_generated/api':{api:{assetStorage:{getAssetContract:'assetMeta',resolveAuthorizedMedia:'assetUrl'},movieExports:{get:'movie'},reviewExport:{getExport:'export'}}}});
const before=global.fetch,env=process.env.NEXT_PUBLIC_CONVEX_URL;
(async()=>{try{
 process.env.NEXT_PUBLIC_CONVEX_URL=origin;
 global.fetch=async(address,init)=>{fetches++;assert.equal(String(address),url);assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(init.headers.Authorization,undefined);return new Response('abcd',{headers:{'Content-Length':'4','Content-Type':'video/mp4'}});};
 const request=(kind='export',method='GET')=>route[method](new Request('https://app.example/api/download/'+kind+'/test',{method}),{params:Promise.resolve({kind,id:'a'.repeat(32)})});
 for(const kind of ['export','movie']){const res=await request(kind);assert.equal(res.status,200);assert.equal(res.headers.get('Content-Disposition'),'attachment; filename="finalframe-export.mp4"');assert.match(res.headers.get('Cache-Control'),/no-store/);assert.equal(await res.text(),'abcd');}
 let res=await request('export','HEAD');assert.equal(res.status,200);assert.equal(res.headers.get('Content-Length'),'4');assert.equal(fetches,2);
 denied=true;res=await request();assert.equal(res.status,404);assert.equal(fetches,2);denied=false;
 const count=calls;assert.equal((await request('unknown')).status,404);assert.equal(calls,count);
 assert.equal((await server.serveAuthorizedDownload(new Request('https://app.example'),{url:'https://evil.example/api/storage/file',size:4,contentType:'video/mp4'})).status,404);assert.equal(fetches,2);
 const saved=await request('asset');assert.equal(saved.status,200);assert.equal(await saved.text(),'abcd');assert.equal(saved.headers.get('Content-Disposition'),'attachment; filename="Both episodes.mp4"');
 differentFile=true;assert.equal((await request('asset')).status,404);differentFile=false;
 denied=true;assert.equal((await request('asset')).status,404);assert.equal(fetches,3);
 console.log('PASS export/movie attachment headers, authenticated project denial, HEAD without bytes, invalid kind, untrusted origin denial; no paid calls');
 }finally{global.fetch=before;if(env===undefined)delete process.env.NEXT_PUBLIC_CONVEX_URL;else process.env.NEXT_PUBLIC_CONVEX_URL=env;}})().catch(e=>{console.error(e);process.exitCode=1;});
