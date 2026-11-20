/* ---------- route: analytics ----------
   Tabs, each shown only to people who may see the data behind it:
     Sales (invoices)  ·  Purchases (purchases)  ·  Inventory (inventory)  ·  Profit & GST (invoices and purchases).
   Everything is computed from the records through calc(), pcalc() and the derived helpers; nothing here is stored. */
let period='all';
const PERIODS={all:'All time',month:'This month','3m':'Last 3 months',year:'This year'};
const analyticsTabs=()=>[
  can('invoices')&&['sales','Sales'],can('purchases')&&['purchases','Purchases'],can('inventory')&&['inventory','Inventory'],
  can('invoices')&&can('purchases')&&['profit','Profit & GST']].filter(Boolean);
ROUTES.analytics={
  html(p){
    const tabs=analyticsTabs();if(!tabs.length)return noAccessHTML();
    if(!tabs.some(t=>t[0]===p[0])){go('analytics/'+tabs[0][0]);return null}
    return analyticsHTML(p[0]);
  },
  bind(){const s=$('#per');if(s)s.onchange=e=>{period=e.target.value;render()}}
};

function monthKey(off){const n=new Date(),d=new Date(n.getFullYear(),n.getMonth()+off,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function inPeriod(x){const t=today(),ym=x.date.slice(0,7);
  if(period==='month')return ym===t.slice(0,7);
  if(period==='year')return x.date.slice(0,4)===t.slice(0,4);
  if(period==='3m')return ym>=monthKey(-2);
  return true}
const compact=n=>n>=1e7?+(n/1e7).toFixed(1)+'Cr':n>=1e5?+(n/1e5).toFixed(1)+'L':n>=1e3?+(n/1e3).toFixed(0)+'k':String(Math.round(n));
/* last six months of two series; a and b are lists of {date}, fa and fb give each record's amount */
function monthSeries(a,fa,b,fb){
  const out=[];for(let o=-5;o<=0;o++){const k=monthKey(o);out.push({k,label:new Date(+k.slice(0,4),+k.slice(5,7)-1,1).toLocaleString('en-IN',{month:'short'}),billed:0,paid:0})}
  a.forEach(x=>{const m=out.find(o=>o.k===x.date.slice(0,7));if(m)m.billed+=fa(x)});
  b.forEach(x=>{const m=out.find(o=>o.k===x.date.slice(0,7));if(m)m.paid+=fb(x)});
  return out;
}
function chartSVG(data,names=['billed','collected']){
  const W=560,H=230,l=46,r=8,t=14,b=30,pw=W-l-r,ph=H-t-b;
  const mx=Math.max(0,...data.map(d=>Math.max(d.billed,d.paid)));
  let step=1000;if(mx>0){const p=Math.pow(10,Math.floor(Math.log10(mx/4)));step=Math.ceil(mx/4/p)*p}
  const top=step*4,y=v=>t+ph-(v/top)*ph,gw=pw/data.length,bw=gw*.27;
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${names[0]} and ${names[1]} by month" style="width:100%;height:auto;display:block">`;
  for(let i=0;i<=4;i++){const v=step*i;s+=`<line x1="${l}" x2="${W-r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${l-6}" y="${y(v)+4}" text-anchor="end" font-size="11" fill="var(--muted)">${compact(v)}</text>`}
  data.forEach((d,i)=>{const cx=l+i*gw+gw/2;
    s+=`<rect x="${cx-bw-1.5}" y="${y(d.billed)}" width="${bw}" height="${t+ph-y(d.billed)}" rx="4" fill="var(--accent)"><title>${d.label} ${names[0]} ${inr(d.billed)}</title></rect>`;
    s+=`<rect x="${cx+1.5}" y="${y(d.paid)}" width="${bw}" height="${t+ph-y(d.paid)}" rx="4" fill="var(--good)"><title>${d.label} ${names[1]} ${inr(d.paid)}</title></rect>`;
    s+=`<text x="${cx}" y="${H-10}" text-anchor="middle" font-size="11" fill="var(--muted)">${d.label}</text>`});
  return s+'</svg>';
}
const chartPanel=(title,data,names,labels)=>`<div class="panel"><div class="bar" style="margin-bottom:10px"><h2 style="margin:0">${title}</h2><span class="row muted"><span class="dot" style="background:var(--accent)"></span>${labels[0]} <span class="dot" style="background:var(--good)"></span>${labels[1]}</span></div>${chartSVG(data,names)}</div>`;
const barRow=(l,v,mt)=>`<div><div class="row" style="justify-content:space-between"><span>${l}</span><span class="amt">${inr(v)} <span class="muted">${(v/mt*100).toFixed(1)}%</span></span></div><div class="hbar"><i style="width:${(v/mt*100).toFixed(1)}%"></i></div></div>`;
const tableOf=(heads,rows,empty)=>rows.length?`<div class="scroll"><table class="plain"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:`<div class="muted">${empty}</div>`;
const ageOf=date=>Math.floor((Date.now()-new Date(date+'T00:00:00').getTime())/864e5);
const pct=(a,b)=>b>0?(a/b*100).toFixed(1)+'%':'—';

function analyticsHTML(tab){
  const tabs=analyticsTabs();tab=tab||(tabs[0]&&tabs[0][0]);
  const body={sales:salesTab,purchases:purchasesTab,inventory:inventoryTab,profit:profitTab}[tab]();
  return`<header class="page"><div><h1>Analytics</h1><p class="sub">Sales, purchases and stock, from your own records.</p></div>
    <label style="flex-direction:row;align-items:center;gap:10px">Period<select id="per" style="width:auto">${Object.entries(PERIODS).map(([k,v])=>`<option value="${k}"${k===period?' selected':''}>${v}</option>`).join('')}</select></label></header>
  <nav class="seg tabs" aria-label="Analytics">${tabs.map(([k,l])=>`<a href="#/analytics/${k}" aria-current="${k===tab}">${l}</a>`).join('')}</nav>
  <div class="stack">${body}</div>`;
}

/* ----- sales ----- */
function salesTab(){
  const inv=S.invoices.filter(inPeriod),o=overall(inv);
  let metal=0,making=0,stone=0,beads=0,other=0,gst=0,gGold=0,gSil=0;const by={};
  inv.forEach(i=>{const c=calc(i);metal+=c.t.metal;making+=c.t.making;stone+=c.t.stone;beads+=c.t.beads;other+=c.extras.reduce((a,e)=>a+e.amount,0);gst+=c.cgst+c.sgst;
    c.rows.forEach(r=>{const k=r.metal+' '+r.purity;by[k]=by[k]||{k,net:0,val:0};by[k].net+=Math.max(0,r.net);by[k].val+=r.value;if(r.metal==='Silver')gSil+=Math.max(0,r.net);else gGold+=Math.max(0,r.net)})});
  const mix=[['Metal value',metal],['Making charges',making],['Stone charges',stone],['Beads charges',beads],['Other charges',other],['GST (Central + State)',gst]];
  const mt=mix.reduce((a,x)=>a+x[1],0)||1;
  const rows=Object.values(by).sort((a,b)=>b.val-a.val);
  /* outstanding by customer and ageing (all time) */
  const cust={},age=[0,0,0];
  S.invoices.forEach(i=>{const m=money(i);if(m.bal<=0.004)return;const c=custOf(i.customerId),k=c?c.id:'-';
    const e=cust[k]=cust[k]||{name:c?.name||'(customer removed)',bal:0,n:0,oldest:i.date};e.bal+=m.bal;e.n++;if(i.date<e.oldest)e.oldest=i.date;
    const days=ageOf(i.date);age[days<=30?0:days<=60?1:2]+=m.bal});
  const owing=Object.values(cust).sort((a,b)=>b.bal-a.bal);
  const mo=monthSeries(S.invoices,i=>money(i).total,S.invoices,i=>Math.min(money(i).paid,money(i).total));
  return`<div class="tiles">${tile('Billed',inr(o.billed),'',`${o.n} invoice${o.n===1?'':'s'}`)}${tile('Collected',inr(o.paid),'good')}${tile('Outstanding',inr(o.bal),o.bal>0?'bad':'')}${tile('Average invoice',inr(o.n?o.billed/o.n:0))}${tile('Gold sold',wt(gGold)+' g','','net weight')}${tile('Silver sold',wt(gSil)+' g','','net weight')}</div>
  ${chartPanel('Billed and collected, last 6 months',mo,['billed','collected'],['Billed','Collected'])}
  <div class="grid wide">
  <div class="panel"><h2>Where the money comes from</h2><div class="stack" style="gap:14px">${mix.map(([l,v])=>barRow(l,v,mt)).join('')}</div></div>
  <div class="panel"><h2>Sold by metal and purity</h2>${tableOf(['Item','Net weight','Metal value'],rows.map(r=>[esc(r.k),wt(r.net)+' g',inr(r.val)]),'No sales in this period.')}</div></div>
  <div class="panel stack" style="gap:16px"><h2 style="margin:0">Customers who owe you</h2>
    <div class="tiles">${tile('Up to 30 days',inr(age[0]))}${tile('31 to 60 days',inr(age[1]),age[1]>0?'warn':'')}${tile('Over 60 days',inr(age[2]),age[2]>0?'bad':'')}</div>
    ${owing.length?`<div class="list" style="box-shadow:inset 0 0 0 1px var(--line)">${owing.map(e=>`<div class="item"><div class="main"><b>${esc(e.name)}</b><span class="sub">${e.n} invoice${e.n===1?'':'s'} · oldest ${dmy(e.oldest)}</span></div><span class="amt dueamt">${inr(e.bal)}</span></div>`).join('')}</div>`:'<div class="empty" style="box-shadow:none;background:var(--surface-2)">Nothing outstanding. Every invoice is paid.</div>'}</div>`;
}

/* ----- purchases ----- */
function purchasesTab(){
  const list=S.purchases.filter(inPeriod),o=purchaseTotals(list);
  let metal=0,making=0,stone=0,beads=0,other=0,gst=0,gGold=0,gSil=0,pieces=0;const byM={},bySup={};
  list.forEach(p=>{const c=pcalc(p),m=pmoney(p);metal+=c.t.metal;making+=c.t.making;stone+=c.t.stone;beads+=c.t.beads;other+=c.extras.reduce((a,e)=>a+e.amount,0);gst+=c.cgst+c.sgst;
    c.rows.forEach(r=>{const k=r.metal+' '+r.purity,net=Math.max(0,r.net);const e=byM[k]=byM[k]||{k,net:0,val:0};e.net+=net;e.val+=r.value;if(r.metal==='Silver')gSil+=net;else gGold+=net;if(r.kind==='Piece')pieces++});
    const s=supplierOf(p.supplierId),key=s?s.id:'-',e=bySup[key]=bySup[key]||{name:s?.name||'(supplier removed)',n:0,total:0,bal:0};e.n++;e.total+=m.total;e.bal+=m.bal});
  const mix=[['Metal value',metal],['Making charges',making],['Stone charges',stone],['Beads charges',beads],['Other charges',other],['GST paid to suppliers',gst]];
  const mt=mix.reduce((a,x)=>a+x[1],0)||1;
  /* what you owe, all time, by age of the bill */
  const age=[0,0,0];S.purchases.forEach(p=>{const m=pmoney(p);if(m.bal<=0.004)return;const d=ageOf(p.date);age[d<=30?0:d<=60?1:2]+=m.bal});
  const sups=Object.values(bySup).sort((a,b)=>b.total-a.total);
  const mo=monthSeries(S.purchases,p=>pmoney(p).total,S.purchases,p=>Math.min(pmoney(p).paid,pmoney(p).total));
  const owed=S.suppliers.map(s=>({name:s.name,bal:S.purchases.filter(p=>p.supplierId===s.id).reduce((a,p)=>a+pmoney(p).bal,0)})).filter(x=>x.bal>0.004).sort((a,b)=>b.bal-a.bal);
  return`<div class="tiles">${tile('Purchased',inr(o.billed),'',`${o.n} bill${o.n===1?'':'s'}`)}${tile('Paid',inr(o.paid),'good')}${tile('To pay',inr(o.bal),o.bal>0?'bad':'')}${tile('Average bill',inr(o.n?o.billed/o.n:0))}${tile('Gold bought',wt(gGold)+' g','','net weight')}${tile('Silver bought',wt(gSil)+' g','','net weight')}</div>
  ${chartPanel('Purchased and paid, last 6 months',mo,['purchased','paid'],['Purchased','Paid'])}
  <div class="grid wide">
  <div class="panel"><h2>Where the money goes</h2><div class="stack" style="gap:14px">${mix.map(([l,v])=>barRow(l,v,mt)).join('')}</div></div>
  <div class="panel"><h2>Bought by metal and purity</h2>${tableOf(['Item','Net weight','Cost','Avg rate/g'],Object.values(byM).sort((a,b)=>b.val-a.val).map(r=>[esc(r.k),wt(r.net)+' g',inr(r.val),r.net>0?inr(r.val/r.net):'—']),'No purchases in this period.')}</div></div>
  <div class="panel"><h2>By supplier</h2>${tableOf(['Supplier','Bills','Purchased','To pay'],sups.map(s=>[esc(s.name),s.n,inr(s.total),s.bal>0.004?`<span class="dueamt">${inr(s.bal)}</span>`:inr(0)]),'No purchases in this period.')}</div>
  <div class="panel stack" style="gap:16px"><h2 style="margin:0">Suppliers you owe</h2>
    <div class="tiles">${tile('Up to 30 days',inr(age[0]))}${tile('31 to 60 days',inr(age[1]),age[1]>0?'warn':'')}${tile('Over 60 days',inr(age[2]),age[2]>0?'bad':'')}</div>
    ${owed.length?`<div class="list" style="box-shadow:inset 0 0 0 1px var(--line)">${owed.map(e=>`<div class="item"><div class="main"><b>${esc(e.name)}</b></div><span class="amt dueamt">${inr(e.bal)}</span></div>`).join('')}</div>`:'<div class="empty" style="box-shadow:none;background:var(--surface-2)">You owe nothing. Every bill is paid.</div>'}</div>`;
}

/* ----- inventory ----- */
function inventoryTab(){
  const all=S.inventory,inStock=all.filter(s=>!isSold(s.id));
  const sumNet=m=>inStock.filter(s=>s.metal===m).reduce((a,s)=>a+stockNet(s),0);
  const value=inStock.reduce((a,s)=>a+stockValue(s),0);
  const costed=can('purchases')?inStock.filter(s=>pieceCost(s)!=null):[];
  const costVal=costed.reduce((a,s)=>a+pieceCost(s),0);
  /* pieces sold in the period (from invoices) */
  const soldRows=can('invoices')?S.invoices.filter(inPeriod).flatMap(i=>calc(i).rows.filter(r=>r.stockId&&S.inventory.some(s=>s.id===r.stockId)).map(r=>({inv:i,row:r,piece:S.inventory.find(s=>s.id===r.stockId)}))):[];
  const gold=inStock.filter(s=>s.metal==='Gold'),withHuid=gold.filter(s=>s.huid),missing=gold.filter(s=>!s.huid);
  const group=(keyFn)=>{const g={};inStock.forEach(s=>{const k=keyFn(s),e=g[k]=g[k]||{k,n:0,net:0,val:0};e.n++;e.net+=stockNet(s);e.val+=stockValue(s)});return Object.values(g).sort((a,b)=>b.val-a.val)};
  const buckets=[['Up to 30 days',0,30],['31 to 90 days',31,90],['91 to 180 days',91,180],['Over 180 days',181,1e9]].map(([l,a,b])=>{
    const ps=inStock.filter(s=>{const d=ageOf(s.addedOn);return d>=a&&d<=b});return[l,ps.length,wt(ps.reduce((x,s)=>x+stockNet(s),0))+' g',inr(ps.reduce((x,s)=>x+stockValue(s),0))]});
  const oldest=[...inStock].sort((a,b)=>a.addedOn.localeCompare(b.addedOn)).slice(0,8);
  const soldBy2={};soldRows.forEach(x=>{const k=x.piece.category||'Other',e=soldBy2[k]=soldBy2[k]||{k,n:0,rev:0};e.n++;e.rev+=x.row.amount});
  const link=s=>`<a href="#/item/${encodeURIComponent(s.tag)}">${esc(s.tag)}</a>`;
  return`<div class="tiles">${tile('Pieces in stock',inStock.length,'',`of ${all.length} recorded`)}${tile('Gold in stock',wt(sumNet('Gold'))+' g','','net weight')}${tile('Silver in stock',wt(sumNet('Silver'))+' g','','net weight')}${tile('Stock value',inr(value),'',"metal at today's rates")}
    ${can('purchases')?tile('Stock at cost',inr(costVal),'',`${costed.length} of ${inStock.length} pieces have a cost`):''}
    ${can('invoices')?tile('Sold in period',soldRows.length,'',`sell-through ${pct(soldRows.length,soldRows.length+inStock.length)}`):''}</div>
  <div class="grid wide"><div class="panel"><h2>HUID coverage (gold in stock)</h2>
    <div class="row" style="justify-content:space-between"><span>${withHuid.length} of ${gold.length} have a HUID</span><span class="amt">${pct(withHuid.length,gold.length)}</span></div>
    <div class="hbar" style="margin-bottom:14px"><i style="width:${gold.length?(withHuid.length/gold.length*100).toFixed(1):0}%;background:var(--good)"></i></div>
    ${missing.length?`<div class="sub-h" style="margin-bottom:8px">Missing a HUID</div><div class="chips">${missing.slice(0,24).map(s=>`<a class="chip" href="#/item/${encodeURIComponent(s.tag)}">${esc(s.tag)}</a>`).join('')}${missing.length>24?`<span class="muted">+${missing.length-24} more</span>`:''}</div>`:'<div class="muted">Every gold piece in stock has a HUID.</div>'}</div>
  <div class="panel"><h2>How long pieces have been in stock</h2>${tableOf(['Age','Pieces','Net weight','Value'],buckets,'')}</div></div>
  <div class="grid wide"><div class="panel"><h2>In stock by category</h2>${tableOf(['Category','Pieces','Net weight','Value'],group(s=>s.category||'Other').map(r=>[esc(r.k),r.n,wt(r.net)+' g',inr(r.val)]),'No pieces in stock.')}</div>
  <div class="panel"><h2>In stock by metal and purity</h2>${tableOf(['Item','Pieces','Net weight','Value'],group(s=>s.metal+' '+s.purity).map(r=>[esc(r.k),r.n,wt(r.net)+' g',inr(r.val)]),'No pieces in stock.')}</div></div>
  <div class="grid wide"><div class="panel"><h2>Slowest to sell (oldest in stock)</h2>${tableOf(['Tag','Item','Days','Net'],oldest.map(s=>[link(s),esc(s.name||s.category),ageOf(s.addedOn),wt(stockNet(s))+' g']),'No pieces in stock.')}</div>
  ${can('invoices')?`<div class="panel"><h2>Sold by category (this period)</h2>${tableOf(['Category','Pieces','Sold for (before GST)'],Object.values(soldBy2).sort((a,b)=>b.rev-a.rev).map(r=>[esc(r.k),r.n,inr(r.rev)]),'No stock pieces were sold in this period.')}</div>`:''}</div>`;
}

/* ----- profit and GST (sales against purchases) ----- */
function profitTab(){
  const sInv=S.invoices.filter(inPeriod),pPur=S.purchases.filter(inPeriod);
  const sc=sInv.map(calc),pc=pPur.map(pcalc);
  const sales=sc.reduce((a,c)=>a+c.sub,0),buys=pc.reduce((a,c)=>a+c.sub,0);
  const outGst=sc.reduce((a,c)=>a+c.cgst+c.sgst,0),inGst=pc.reduce((a,c)=>a+c.cgst+c.sgst,0);
  const collected=overall(sInv).paid,paidOut=purchaseTotals(pPur).paid;
  /* margin only where both sides are known: a piece bought through Purchases and sold on an invoice */
  const linked=[];
  sInv.forEach((inv,i)=>sc[i].rows.forEach(r=>{
    const piece=r.stockId&&S.inventory.find(s=>s.id===r.stockId),cost=piece?pieceCost(piece):null;
    if(cost!=null)linked.push({inv,piece,rev:r.amount,cost,mg:r.amount-cost});
  }));
  const rev=linked.reduce((a,x)=>a+x.rev,0),cost=linked.reduce((a,x)=>a+x.cost,0),mg=rev-cost;
  const byCat={};linked.forEach(x=>{const k=x.piece.category||'Other',e=byCat[k]=byCat[k]||{k,n:0,rev:0,cost:0};e.n++;e.rev+=x.rev;e.cost+=x.cost});
  const pos=['Gold','Silver'].map(m=>{
    const bought=pc.reduce((a,c)=>a+c.rows.filter(r=>r.metal===m).reduce((x,r)=>x+Math.max(0,r.net),0),0);
    const sold=sc.reduce((a,c)=>a+c.rows.filter(r=>r.metal===m).reduce((x,r)=>x+Math.max(0,r.net),0),0);
    const held=S.inventory.filter(s=>s.metal===m&&!isSold(s.id)).reduce((a,s)=>a+stockNet(s),0);
    return[m,wt(bought)+' g',wt(sold)+' g',wt(held)+' g']});
  const mo=monthSeries(S.invoices,i=>calc(i).sub,S.purchases,p=>pcalc(p).sub);
  const mgCls=mg>=0?'good':'bad';
  return`<div class="tiles">${tile('Sales (before GST)',inr(sales),'',`${sInv.length} invoice${sInv.length===1?'':'s'}`)}${tile('Purchases (before GST)',inr(buys),'',`${pPur.length} bill${pPur.length===1?'':'s'}`)}
    ${tile('Margin on matched pieces',inr(mg),mgCls,`${linked.length} piece${linked.length===1?'':'s'} · ${pct(mg,rev)} of sales`)}
    ${tile('GST on sales',inr(outGst))}${tile('GST on purchases',inr(inGst))}${tile('GST to pay (estimate)',inr(outGst-inGst),outGst-inGst>0?'warn':'good',outGst-inGst<0?'credit carried forward':'sales GST minus purchase GST')}
    ${tile('Cash in',inr(collected),'good','collected from customers')}${tile('Cash out',inr(paidOut),'','paid to suppliers')}${tile('Net cash',inr(collected-paidOut),collected-paidOut>=0?'good':'bad')}</div>
  ${chartPanel('Sales and purchases (before GST), last 6 months',mo,['sales','purchases'],['Sales','Purchases'])}
  <div class="grid wide"><div class="panel"><h2>Margin by category</h2>${tableOf(['Category','Pieces','Sold for','Cost','Margin'],Object.values(byCat).sort((a,b)=>(b.rev-b.cost)-(a.rev-a.cost)).map(r=>[esc(r.k),r.n,inr(r.rev),inr(r.cost),`<b class="${r.rev-r.cost>=0?'':'dueamt'}">${inr(r.rev-r.cost)}</b> <span class="muted">${pct(r.rev-r.cost,r.rev)}</span>`]),'No sold piece has a known cost yet. Add pieces from a purchase bill and bill them from stock to see margins.')}</div>
  <div class="panel"><h2>Metal position (net grams)</h2>${tableOf(['Metal','Bought','Sold','In stock now'],pos,'')}<p class="set-note" style="margin-top:10px">Bought and sold are for the chosen period. In stock is today.</p></div></div>
  <div class="panel"><h2>Latest matched sales</h2>${tableOf(['Invoice','Piece','Sold for','Cost','Margin'],[...linked].sort((a,b)=>b.inv.date.localeCompare(a.inv.date)).slice(0,10).map(x=>[`<a href="#/invoices/${x.inv.id}">${esc(x.inv.no)}</a>`,esc(x.piece.tag+' · '+(x.piece.name||x.piece.category)),inr(x.rev),inr(x.cost),`<b class="${x.mg>=0?'':'dueamt'}">${inr(x.mg)}</b>`]),'Nothing to show yet.')}</div>
  <p class="set-note">Margin counts only pieces bought through Purchases and sold from stock, using the amount before GST on both sides. GST to pay is a simple sales-minus-purchases estimate for your own planning, not a return.</p>`;
}
