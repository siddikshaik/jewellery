/* ---------- money math: one home. Screen, PDF, WhatsApp text and analytics all call these. ---------- */
const rateFor=(inv,it)=>it.metal==='Silver'?num(inv.silverRate):num((inv.goldRates||{})[goldKey(it.purity)]);
const allGold=g=>Object.fromEntries(GK.map(k=>[k,g]));
const paidOf=inv=>(inv.payments||[]).reduce((a,p)=>a+num(p.amount),0);
function money(inv){const total=calc(inv).total,paid=paidOf(inv);return{total,paid,bal:Math.max(0,total-paid)}}
function statusOf(inv){const m=money(inv);if(m.total>0&&m.paid>=m.total-0.005)return'Paid';return m.paid>0?'Partial':'Unpaid'}
/* the printed invoice only says Paid or Unpaid; a part payment still shows Unpaid with Paid and Balance due beneath */
const docStatus=inv=>statusOf(inv)==='Paid'?'Paid':'Unpaid';
const pillCls=s=>s==='Paid'?'paid':s==='Partial'?'part':'due';
/* rates actually used by the items on an invoice: [label, rate] */
function usedRates(inv){const seen=new Set();inv.items.forEach(it=>seen.add(it.metal==='Silver'?'Silver':goldKey(it.purity)));
  const out=GK.filter(k=>seen.has(k)).map(k=>[k,num((inv.goldRates||{})[k])]);if(seen.has('Silver'))out.push(['Silver',num(inv.silverRate)]);return out}
/* One set of rules for invoices and purchases. Each item gives a rate; everything else is the same:
   net = gross - stones - beads, metal value = net x rate, making = net x % x rate, then charges, GST, rounding. */
function sheetMath(items,rateOf,charges,cg,sg){
  const rows=items.map(it=>{
    const rate=rateOf(it);
    const gross=num(it.gross),sw=num(it.stoneWt),bw=num(it.beadsWt);
    const net=gross-sw-bw;
    const value=Math.max(0,net)*rate;
    const pct=num(it.makingPct),mwt=Math.max(0,net)*pct/100,making=mwt*rate;
    const stone=num(it.stone),beads=num(it.beads);
    return{...it,rate,gross,sw,bw,net,value,pct,mwt,making,stone,beads,amount:value+making+stone+beads};
  });
  const sum=k=>rows.reduce((a,r)=>a+r[k],0);
  const t={gross:sum('gross'),sw:sum('sw'),bw:sum('bw'),net:sum('net'),metal:sum('value'),mwt:sum('mwt'),making:sum('making'),stone:sum('stone'),beads:sum('beads')};
  const extras=(charges||[]).filter(c=>num(c.amount)!==0||c.label).map(c=>({label:c.label||'Other charges',amount:num(c.amount)}));
  const sub=t.metal+t.making+t.stone+t.beads+extras.reduce((a,c)=>a+c.amount,0);
  const cgst=sub*num(cg)/100,sgst=sub*num(sg)/100;
  const raw=sub+cgst+sgst,total=Math.round(raw);
  return{rows,t,extras,sub,cgst,sgst,round:total-raw,total};
}
const calc=inv=>sheetMath(inv.items,it=>rateFor(inv,it),inv.charges,inv.cgst,inv.sgst);
/* purchases: each line carries its own buying rate; payments go out to the supplier */
const pcalc=p=>sheetMath(p.items,it=>num(it.rate),p.charges,p.cgst,p.sgst);
function pmoney(p){const total=pcalc(p).total,paid=paidOf(p);return{total,paid,bal:Math.max(0,total-paid)}}
function pstatusOf(p){const m=pmoney(p);if(m.total>0&&m.paid>=m.total-0.005)return'Paid';return m.paid>0?'Partial':'Unpaid'}
/* every charge as its own line */
function lines(inv,c){
  const out=[['Metal value ('+wt(c.t.net)+' g net)',c.t.metal],['Making charges ('+wt(c.t.mwt)+' g)',c.t.making],['Stone charges',c.t.stone],['Beads charges',c.t.beads]];
  c.extras.forEach(e=>out.push([e.label,e.amount]));
  return out;
}
function words(n){
  n=Math.round(n);if(n===0)return'Zero';
  const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const two=x=>x<20?a[x]:b[Math.floor(x/10)]+(x%10?' '+a[x%10]:'');
  const three=x=>(x>=100?a[Math.floor(x/100)]+' Hundred'+(x%100?' ':''):'')+(x%100?two(x%100):'');
  let o=[];const cr=Math.floor(n/1e7),lk=Math.floor(n/1e5)%100,th=Math.floor(n/1e3)%100,rest=n%1000;
  if(cr)o.push(three(cr)+' Crore');if(lk)o.push(two(lk)+' Lakh');if(th)o.push(two(th)+' Thousand');if(rest)o.push(three(rest));
  return o.join(' ');
}
/* BIS hallmark: purity grade mark and HUID (a 6-character code of capital letters and digits, one per article) */
const HALLMARK={'24K':'24K999','23K':'23K958','22K':'22K916','20K':'20K833','18K':'18K750','14K':'14K585','9K':'9K375','999 Fine':'999','925 Sterling':'925','800':'800'};
const hallmarkMark=(metal,purity)=>HALLMARK[purity]||String(purity||'');
const cleanHuid=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
const huidOk=h=>/^[A-Z0-9]{6}$/.test(h);
/* net weight of a stock item (derived, never stored) */
const stockNet=s=>Math.max(0,num(s.gross)-num(s.stoneWt)-num(s.beadsWt));
const wordsInr=n=>'Rupees '+words(n)+' Only';
