/* Pure configuration, validation, and statistics. No WebGPU required. */
export const SUITE_VERSION = '2.0.0';
export const PARTICLE_COUNTS = [8192,16384,32768,65536,131072,262144,524288,1048576];
export const PRESETS = {
  quick: {warmupMs:650,durationMs:2200,repeats:1,workloads:[
    {name:'control-65k-2-render',count:65536,steps:2,render:true,scale:1},
    {name:'compute-262k-8',count:262144,steps:8,render:false,scale:1}
  ]},
  balanced: {warmupMs:850,durationMs:3000,repeats:2,workloads:[
    {name:'control-65k-2-render',count:65536,steps:2,render:true,scale:1},
    {name:'compute-262k-8',count:262144,steps:8,render:false,scale:1},
    {name:'render-262k-8',count:262144,steps:8,render:true,scale:1}
  ]},
  extended: {warmupMs:1200,durationMs:4500,repeats:2,workloads:[
    {name:'one-step-control',count:65536,steps:1,render:false,scale:1},
    {name:'compute-262k-8',count:262144,steps:8,render:false,scale:1},
    {name:'render-262k-8',count:262144,steps:8,render:true,scale:1},
    {name:'compute-524k-16',count:524288,steps:16,render:false,scale:1}
  ]}
};
export function validatePlan(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Plan must be an object');
  const warmupMs = bounded(raw.warmupMs,250,10000,'warmupMs');
  const durationMs = bounded(raw.durationMs,1000,30000,'durationMs');
  const repeats = bounded(raw.repeats,1,3,'repeats',true);
  if (!Array.isArray(raw.workloads) || !raw.workloads.length || raw.workloads.length > 12) throw Error('Provide 1–12 workloads');
  const workloads = raw.workloads.map((w,i)=>{
    if (!w || typeof w!=='object' || Array.isArray(w)) throw Error(`Invalid workload ${i+1}`);
    const count = Number(w.count);
    if (!PARTICLE_COUNTS.includes(count)) throw Error(`Unsupported particle count in workload ${i+1}`);
    const steps = bounded(w.steps,1,16,`workload ${i+1} steps`,true);
    const scale = bounded(w.scale,0.5,2,`workload ${i+1} scale`);
    if (typeof w.render!=='boolean') throw Error(`workload ${i+1} render must be true/false`);
    const name = String(w.name ?? `workload-${i+1}`);
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) throw Error(`Invalid workload name: ${name}`);
    return {name,count,steps,render:w.render,scale};
  });
  if (new Set(workloads.map(w=>w.name)).size !== workloads.length) throw Error('Workload names must be unique');
  if (workloads.length*repeats*2>48) throw Error('Maximum of 48 runs per suite');
  return {warmupMs,durationMs,repeats,workloads};
}
function bounded(input,min,max,label,integer=false){
  const n=Number(input);
  if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))throw Error(`${label}: expected ${integer?'integer ':'number '}${min}–${max}`);
  return n;
}
export function expandPlan(plan){
  const out=[];
  for(const workload of plan.workloads){
    const order=plan.repeats===1?['baseline','fused'] : plan.repeats===2?['baseline','fused','fused','baseline'] : ['baseline','fused','fused','baseline','baseline','fused'];
    for(const [i,kernel] of order.entries())out.push({...workload,kernel,sequence:i+1,runId:`${workload.name}-${i+1}-${kernel}`,warmupMs:plan.warmupMs,durationMs:plan.durationMs});
  }
  return out;
}
export function summarize(values){
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!sorted.length)return {n:0,median:null,p10:null,p90:null,p95:null,min:null,max:null,mean:null,sd:null};
  const n=sorted.length,mean=sorted.reduce((a,b)=>a+b,0)/n;
  const pct=q=>{const k=(n-1)*q,lo=Math.floor(k),hi=Math.ceil(k);return sorted[lo]+(sorted[hi]-sorted[lo])*(k-lo);};
  return {n,median:pct(.5),p10:pct(.1),p90:pct(.9),p95:pct(.95),min:sorted[0],max:sorted[n-1],mean,sd:Math.sqrt(sorted.reduce((s,v)=>s+(v-mean)**2,0)/n)};
}
export function comparisons(runs){
  const groups=new Map();
  for(const r of runs){
    if(r.status!=='completed')continue;
    const key=r.config.name;
    if(!groups.has(key))groups.set(key, {baseline:[],fused:[]});
    groups.get(key)[r.config.kernel].push(r);
  }
  return [...groups].map(([workload,g])=>{
    const b=summarize(g.baseline.map(r=>r.metrics.gpuComputeMs.median));
    const f=summarize(g.fused.map(r=>r.metrics.gpuComputeMs.median));
    return {workload,baselineRuns:g.baseline.length,fusedRuns:g.fused.length,
      baselineComputeMedianMs:b.median,fusedComputeMedianMs:f.median,
      fusedRelativeChangePercent:b.median>0&&f.median!=null?100*(f.median/b.median-1):null,
      note:'Descriptive paired-session medians only; not an uncertainty interval, significance test, or verified speedup.'};
  });
}