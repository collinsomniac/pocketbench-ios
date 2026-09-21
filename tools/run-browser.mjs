#!/usr/bin/env node
/* Optional Playwright driver: records real page-generated results only. */
import fs from 'node:fs/promises';
import path from 'node:path';
const argv=process.argv.slice(2);
const opt=(key,def)=>{const i=argv.indexOf('--'+key);return i>=0?argv[i+1]:def;};
const baseUrl=opt('url','http://127.0.0.1:8000/suite.html');
const preset=opt('preset','quick');
const output=path.resolve(opt('output','./artifacts/suite.json'));
const timeoutMs=Number(opt('timeout','180000'));
let chromium;
try{({chromium}=await import('playwright'));}catch{console.error('Missing optional dependency: npm install --no-save playwright && npx playwright install chromium');process.exit(2);}
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:420,height:850}});
 page.on('console',msg=>{if(msg.type()==='error')console.error('Console:',msg.text());});
 page.on('pageerror',err=>console.error('Page:',err.message));
 const url=new URL(baseUrl);url.searchParams.set('preset',preset);
 await page.goto(url.toString(),{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>{
  const s=window.__pocketSuite?.status;
  return s?.report?.status && s.report.status!=='running';
 },{timeout:timeoutMs});
 const result=await page.evaluate(()=>window.__pocketSuite.status.report);
 if(!result||!result.runs?.length)throw Error('No real browser results were produced');
 await fs.mkdir(path.dirname(output),{recursive:true});
 await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');
 console.log(`Saved ${result.runs.length} actual ${result.environment?.gpu?.adapterInfo?.vendor||'unknown'} browser runs: ${output}`);
 if(result.status!=='completed')process.exitCode=1;
}catch(error){console.error('Browser run failed:',error.message);process.exitCode=1;
}finally{await browser.close();}
