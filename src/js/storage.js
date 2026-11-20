/* ---------- storage: talks to server.js. Settings and rates are saved whole; customers, invoices and inventory one record at a time,
   so two people working at once do not overwrite each other. Nothing is kept in the browser. ---------- */
let saved={},saveTimer=null,flushing=false,again=false,ready=false,serverSold=[];
const recMap=a=>{const m={};(a||[]).forEach(r=>{m[r.id]=JSON.stringify(r)});return m};
const snapRaw=(n,v)=>LISTS.includes(n)?recMap(v):JSON.stringify(v);
const sameSnap=(a,b)=>{if(typeof a==='string'||typeof b==='string')return a===b;const ka=Object.keys(a||{}),kb=Object.keys(b||{});return ka.length===kb.length&&ka.every(k=>a[k]===b[k])};
const writable=n=>!!ME&&!monitor&&can(n==='rates'?'settings':n,'edit');
const pendingSave=()=>!!saveTimer||flushing;
const storeQ=()=>monitor?'?store='+monitor.id:'';

function persist(){
  if(!ME||monitor)return;
  clearTimeout(saveTimer);setSync('Saving…');
  saveTimer=setTimeout(()=>{saveTimer=null;flush()},400);
}
async function flush(){
  if(flushing){again=true;return}
  flushing=true;
  try{
    for(const n of COLLECTIONS){
      if(!writable(n))continue;
      if(LISTS.includes(n)){
        const cur=recMap(S[n]),old=saved[n]||{};
        for(const id of Object.keys(cur))if(cur[id]!==old[id]){
          try{await api('PUT',`data/${n}/${id}`,S[n].find(r=>r.id===id))}catch(e){e.col=n;e.id=id;throw e}
          old[id]=cur[id]}
        for(const id of Object.keys(old))if(!(id in cur)){await api('DELETE',`data/${n}/${id}`);delete old[id]}
        saved[n]=old;
      }else{
        const cur=JSON.stringify(S[n]);
        if(cur!==saved[n]){await api('PUT','data/'+n,S[n]);saved[n]=cur}
      }
    }
    setSync('Saved');
  }catch(e){await saveFailed(e)}
  flushing=false;
  if(again){again=false;flush()}
}
/* someone else took the same invoice number or stock tag: pull in their records, then renumber ours */
async function saveFailed(e){
  if(!ME)return;
  if(e.status===409&&(e.message==='duplicate_no'||e.message==='duplicate_tag')){
    try{
      const r=await api('GET','data'+storeQ()),col=e.col;
      (r.data[col]||[]).forEach(rec=>{if(!S[col].some(x=>x.id===rec.id)){S[col].push(rec);(saved[col]=saved[col]||{})[rec.id]=JSON.stringify(rec)}});
      const mine=S[col].find(x=>x.id===e.id),byNo=col==='invoices'||col==='purchases';
      if(mine){const was=byNo?mine.no:mine.tag;
        if(col==='invoices')mine.no=nextInvoiceNo();else if(col==='purchases')mine.no=nextPurchaseNo();else mine.tag=nextTag(mine.metal);
        toast((byNo?'Number ':'Tag ')+was+' was just used by someone else. Saved as '+(byNo?mine.no:mine.tag)+'.')}
      persist();render();return;
    }catch(e2){}
  }
  if(e.status===409&&e.message==='duplicate_huid'){
    toast('That HUID is already on another piece, so the change was not saved.');
    try{await loadData();render()}catch(e3){}return;
  }
  if(e.status===403){toast('You do not have permission to save that change');try{await loadData();render()}catch(e3){}return}
  if(e.status===401)return;
  setSync('Could not save. Will try again.');
  clearTimeout(saveTimer);saveTimer=setTimeout(()=>{saveTimer=null;flush()},8000);
}

/* take what the server sent as the truth; re-save only if a migration reshaped it */
function adopt(remote){
  serverSold=remote.soldStock||[];
  saved={};COLLECTIONS.forEach(n=>{if(remote[n]!=null)saved[n]=snapRaw(n,remote[n])});
  S=normalize(remote)||defaults();
  if(COLLECTIONS.some(n=>writable(n)&&remote[n]!=null&&!sameSnap(snapRaw(n,S[n]),saved[n])))persist();
}
async function loadData(){const r=await api('GET','data'+storeQ());adopt(r.data);setSync('Up to date')}

/* pick up other people's changes while nothing is being typed */
let pollT=null;
const startPolling=()=>{stopPolling();pollT=setInterval(poll,20000)};
const stopPolling=()=>{clearInterval(pollT);pollT=null};
async function poll(){
  if(!ME||!ready||pendingSave()||draft||draftCust||draftStock||draftPur||draftSup||payOpen||(ME.role==='superadmin'&&!monitor))return;
  const ae=document.activeElement;if(ae&&/INPUT|TEXTAREA|SELECT/.test(ae.tagName)&&$('#view').contains(ae))return;
  try{
    const r=await api('GET','data'+storeQ());
    if(COLLECTIONS.some(n=>r.data[n]!=null&&!sameSnap(snapRaw(n,r.data[n]),saved[n]))||JSON.stringify(r.data.soldStock||[])!==JSON.stringify(serverSold)){adopt(r.data);render()}
  }catch(e){}
}
