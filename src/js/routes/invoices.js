/* ---------- route: invoices (list, editor, invoice page + payments) ---------- */
let statusFilter='all',qInv='',payOpen=null,lastMode=null,ratesOpen=false;
const payMode=()=>modes().includes(lastMode)?lastMode:modes()[0];
const sheetNames=()=>[...new Set([...S.settings.app.quickCharges,'Repair charges','Certification'])];

ROUTES.invoices={
  html(p){
    if(!p.length)return listHTML();
    if((p[0]==='new'||p[1]==='edit')&&!can('invoices','edit')){go(p[0]==='new'?'invoices':'invoices/'+p[0]);return null}
    if(p[0]==='new'){if(!draft&&!ready)return LOADING;if(!draft||!draft.isNew)draft=newInvoice();return editorHTML(draft)}
    const inv=S.invoices.find(i=>i.id===p[0]);
    if(!inv){if(!ready)return LOADING;go('invoices');return null}
    if(p[1]==='edit'){if(!draft&&!ready)return LOADING;if(!draft||draft.id!==inv.id)draft=clone(inv);return editorHTML(draft)}
    return detailHTML(inv);
  },
  bind(p){
    if(!p.length)return bindList();
    if(p[0]==='new'||p[1]==='edit')return bindEditor(draft);
    bindDetail(S.invoices.find(i=>i.id===p[0]));
  }
};

/* ----- list ----- */
function goldBar(g){return GK.filter(k=>num(g[k])>0).map(k=>`${k} <b class="g">${inr(num(g[k]))}</b>`).join(' · ')}
function rateBar(){const r=S.rates,p=[],gb=goldBar(r.gold);
  if(gb)p.push(`<span>Gold: ${gb}</span>`);if(num(r.silver)>0)p.push(`<span>Silver <b class="s">${inr(num(r.silver))}</b></span>`);
  return `<div class="ratebar"><span>Today's rates per gram</span>${p.join('')||'<span class="muted">Not set</span>'}<span class="muted">${r.date?'Updated '+dmy(r.date):''}</span>${can('settings','edit')?'<a class="btn sm" href="#/settings/rates">Change rates</a>':''}</div>`}
function overall(list){let billed=0,paid=0,bal=0,open=0;list.forEach(i=>{const m=money(i);billed+=m.total;paid+=Math.min(m.paid,m.total);bal+=m.bal;if(m.bal>0.004)open++});return{billed,paid,bal,open,n:list.length}}
const tile=(l,v,cls,sub)=>`<div class="tile ${cls||''}"><span>${l}</span><b>${v}</b>${sub?`<small>${sub}</small>`:''}</div>`;
function payFormHTML(inv){const m=money(inv),cur=payMode();
  return `<div class="grid"><label>Amount received (₹)<input id="pf_amt" type="number" min="0" step="any" inputmode="decimal" value="${m.bal.toFixed(2)}"></label>
  <label>Date<input id="pf_date" type="date" value="${today()}"></label>
  <label>Mode<select id="pf_mode">${modes().map(x=>`<option${x===cur?' selected':''}>${esc(x)}</option>`).join('')}</select></label>
  <label>Note<input id="pf_note" placeholder="Optional"></label></div>
  <div class="row" style="margin-top:14px"><button class="btn primary" id="pf_save">Record payment</button><button class="btn" id="pf_full">Mark fully paid (${inr(m.bal)})</button></div>`}
function bindPayForm(inv){
  const rec=a=>{const m=money(inv);a=num(a);
    if(a<=0)return toast('Enter the amount received');
    if(a>m.bal+0.005)return toast('That is more than the balance of '+inr(m.bal));
    lastMode=$('#pf_mode').value;
    inv.payments.push({id:uid(),date:$('#pf_date').value||today(),amount:+a.toFixed(2),mode:lastMode,note:$('#pf_note').value.trim()});
    persist();payOpen=null;render();toast(statusOf(inv)==='Paid'?'Marked as paid':'Payment recorded')};
  $('#pf_save').onclick=()=>rec($('#pf_amt').value);
  $('#pf_full').onclick=()=>rec(money(inv).bal);
}
function rowHTML(x){
  const i=x.i,c=custOf(i.customerId),m=money(i),open=m.bal>0.004;
  return `<div class="invwrap"><div class="item" data-id="${i.id}" role="link" tabindex="0">
    <div class="main"><b>${esc(i.no)} · ${esc(c?.name||'No customer')}</b><span class="sub">${dmy(i.date)} · ${i.items.length} item${i.items.length>1?'s':''}${m.paid>0&&open?' · Paid '+inr(m.paid):''}</span></div>
    <div class="row"><span class="pill ${pillCls(x.st)}">${x.st}</span><span class="amt">${inr(m.total)}</span>${open?`<span class="dueamt">Balance ${inr(m.bal)}</span>`:''}</div>
    ${open&&can('invoices','edit')?`<div class="row"><button class="btn sm" data-markpaid="${i.id}">Mark paid</button><button class="btn sm" data-pay="${i.id}">${payOpen===i.id?'Close':'Record payment'}</button></div>`:''}</div>
    ${payOpen===i.id?`<div class="payform">${payFormHTML(i)}</div>`:''}</div>`;
}
function listHTML(){
  const o=overall(S.invoices),q=qInv.toLowerCase();
  const all=S.invoices.map(i=>({i,st:statusOf(i)}));
  const cnt=k=>k==='all'?all.length:all.filter(x=>x.st===k).length;
  const list=all.filter(x=>(statusFilter==='all'||x.st===statusFilter)&&(!q||x.i.no.toLowerCase().includes(q)||(custOf(x.i.customerId)?.name||'').toLowerCase().includes(q)))
    .sort((a,b)=>b.i.date.localeCompare(a.i.date)||b.i.no.localeCompare(a.i.no));
  return `<header class="page"><div><h1>Invoices</h1><p class="sub">Bill customers and track what is still owed.</p></div>${can('invoices','edit')?'<button class="btn primary" id="newInv">New invoice</button>':''}</header>
  <div class="stack"><div class="tiles">${tile('Billed (all time)',inr(o.billed))}${tile('Collected',inr(o.paid),'good')}${tile('Outstanding balance',inr(o.bal),o.bal>0?'bad':'')}${tile('Invoices with balance',o.open,'',`of ${o.n}`)}</div>
  ${rateBar()}
  <div class="bar" style="margin:0"><div class="seg" id="stF">${['all','Unpaid','Partial','Paid'].map(k=>`<button data-s="${k}" aria-pressed="${statusFilter===k}">${k==='all'?'All':k} (${cnt(k)})</button>`).join('')}</div>
    <input id="q" type="search" placeholder="Search invoice or customer" value="${esc(qInv)}" style="width:240px"></div>
  <div class="list">${list.length?list.map(rowHTML).join(''):`<div class="empty">${S.invoices.length?'No invoices match this filter.':'No invoices yet. Choose New invoice to bill your first customer.'}</div>`}</div></div>`;
}
function bindList(){
  const nb=$('#newInv');if(nb)nb.onclick=()=>{draft=null;ratesOpen=false;go('invoices/new')};
  $('#stF').onclick=e=>{const b=e.target.closest('[data-s]');if(!b)return;statusFilter=b.dataset.s;render()};
  $('#q').oninput=e=>{qInv=e.target.value;const p=e.target.selectionStart;render();const q=$('#q');q.focus();q.setSelectionRange(p,p)};
  $$('.item[data-id]').forEach(el=>{el.onclick=()=>go('invoices/'+el.dataset.id);el.onkeydown=e=>{if(e.key==='Enter')go('invoices/'+el.dataset.id)}});
  $$('[data-markpaid]').forEach(b=>b.onclick=e=>{e.stopPropagation();
    const inv=S.invoices.find(i=>i.id===b.dataset.markpaid),m=money(inv),md=payMode();
    inv.payments.push({id:uid(),date:today(),amount:+m.bal.toFixed(2),mode:md,note:''});persist();payOpen=null;render();toast(inv.no+' marked as paid ('+md+')')});
  $$('[data-pay]').forEach(b=>b.onclick=e=>{e.stopPropagation();payOpen=payOpen===b.dataset.pay?null:b.dataset.pay;render()});
  if(payOpen){const inv=S.invoices.find(i=>i.id===payOpen);if(inv&&$('#pf_save'))bindPayForm(inv)}
}

/* ----- editor ----- */
function purityOpts(inv,it){
  if(it.metal==='Silver')return PURITY.Silver;
  return GK.filter(k=>num(S.rates.gold[k])>0||num((inv.goldRates||{})[k])>0||k===it.purity)}
/* copy a stock piece onto an invoice line (the HUID travels with it, so the invoice is a snapshot of what was sold) */
function applyStockToItem(it,st){
  Object.assign(it,{stockId:st.id,name:st.name,metal:st.metal,purity:st.purity,huid:st.huid||'',gross:st.gross,stoneWt:st.stoneWt,beadsWt:st.beadsWt,makingPct:st.makingPct,stone:st.stone,beads:st.beads});
}
/* pieces from Inventory that can still go on this invoice: not on another invoice, not already picked on another line of this one */
function stockChoices(inv,it){
  if(!can('inventory'))return[];
  const picked=new Set(inv.items.filter(x=>x!==it&&x.stockId).map(x=>x.stockId));
  return S.inventory.filter(s=>s.id===it.stockId||(!soldBy(s.id,inv.id)&&!picked.has(s.id)));
}
function itemHTML(inv,it,idx){
  const choices=stockChoices(inv,it);
  const opts=purityOpts(inv,it).map(p=>`<option${p===it.purity?' selected':''}>${p}</option>`).join('');
  const f=(k,l)=>`<label>${l}<input data-k="${k}" type="number" min="0" step="any" inputmode="decimal" value="${esc(it[k])}"></label>`;
  return `<div class="gem" data-i="${idx}"><div class="gem-h"><b>Item ${idx+1}</b><span class="row"><span class="amt" data-amt>₹0.00</span><button class="btn sm danger" data-rm>Remove</button></span></div>
    ${choices.length||it.stockId?`<label>Pick from stock<select data-stock>${'<option value="">Not from stock (type it in)</option>'+choices.map(s=>`<option value="${s.id}"${s.id===it.stockId?' selected':''}>${esc(s.tag)} · ${esc(s.name)} · ${esc(s.metal)} ${esc(s.purity)} · ${wt(stockNet(s))} g</option>`).join('')}</select></label>`:''}
    <div class="grid"><label style="grid-column:1/-1">Item name<input data-k="name" id="in${idx}" placeholder="e.g. Gold necklace" value="${esc(it.name)}"></label>
    <label>Metal<select data-k="metal"><option${it.metal==='Gold'?' selected':''}>Gold</option><option${it.metal==='Silver'?' selected':''}>Silver</option></select></label>
    <label>Purity<select data-k="purity">${opts}</select></label><label>Rate (₹/g)<input data-rate readonly value="0.00"></label>
    <label>HUID<input data-k="huid" maxlength="6" autocapitalize="characters" spellcheck="false" placeholder="6 letters or digits" value="${esc(it.huid||'')}"><small class="hint" data-huidhint hidden>Gold must carry a HUID before it is sold.</small></label></div>
    <div class="sub-h">Weights (grams)</div>
    <div class="grid">${f('gross','Gross weight')}${f('stoneWt','Stones weight')}${f('beadsWt','Beads weight')}<label>Net weight<input data-net readonly value="0.000"></label></div>
    <div class="sub-h">Making charges</div>
    <div class="grid">${f('makingPct','Making (% of net weight)')}<label>Making weight (g)<input data-mwt readonly value="0.000"></label><label>Making amount (₹)<input data-mamt readonly value="0.00"></label></div>
    <div class="sub-h">Other item charges (₹)</div>
    <div class="grid">${f('stone','Stone charges')}${f('beads','Beads charges')}</div></div>`;
}
function chargeRowHTML(c){return `<div class="crow" data-cid="${c.id}"><label>Charge name<input list="chargeNames" data-c="label" placeholder="e.g. Hallmark charges" value="${esc(c.label)}"></label>
  <label>Amount (₹)<input data-c="amount" type="number" min="0" step="any" inputmode="decimal" value="${esc(c.amount)}"></label><button class="btn sm danger" data-crm>Remove</button></div>`}
function editorHTML(inv){
  const used=usedRates(inv),open=ratesOpen||used.some(([,v])=>v<=0);
  return `<header class="page"><h1>${inv.isNew?'New invoice':'Edit '+esc(inv.no)}</h1><div class="row"><button class="btn" id="cancel">Cancel</button><button class="btn primary" id="save">Save invoice</button></div></header>
  <div class="stack">
  <div class="panel"><h2>Invoice</h2><div class="grid">
    <label>Invoice no.<input id="f_no" value="${esc(inv.no)}"></label>
    <label>Date<input id="f_date" type="date" value="${inv.date}"></label>
    <label>Customer<select id="f_cust"><option value="">Select customer</option>${S.customers.map(c=>`<option value="${c.id}"${c.id===inv.customerId?' selected':''}>${esc(c.name)}</option>`).join('')}${can('customers','edit')?'<option value="__new">+ Add new customer</option>':''}</select></label>
  </div></div>
  <div class="panel"><div class="bar" style="margin-bottom:14px"><h2 style="margin:0">Rates and tax</h2><button class="btn sm" id="rateEdit">${open?'Hide rate fields':'Change rates for this invoice'}</button></div>
    <div class="ratebar" style="margin-bottom:14px"><span>Rates for the items below:</span>${used.map(([k,v])=>`<span>${k} <b class="${k==='Silver'?'s':'g'}" data-rk="${k}">${v>0?inr(v)+'/g':'not set'}</b></span>`).join('')}<span class="muted">${inv.isNew?"from Today's rates":'saved with this invoice'}</span></div>
    <div class="grid">${open?used.map(([k])=>k==='Silver'?`<label>Silver (₹/g)<input id="f_sr" type="number" min="0" step="any" value="${inv.silverRate}"></label>`:`<label>Gold ${k} (₹/g)<input data-gr="${k}" type="number" min="0" step="any" value="${inv.goldRates[k]??''}"></label>`).join(''):''}
    <label>Central GST (%)<input id="f_cg" type="number" min="0" step="any" value="${inv.cgst}"></label>
    <label>State GST (%)<input id="f_sg" type="number" min="0" step="any" value="${inv.sgst}"></label></div></div>
  <div class="panel"><div class="bar" style="margin-bottom:14px"><h2 style="margin:0">Items</h2><button class="btn" id="addItem">Add item</button></div>
    <div class="stack" id="items" style="gap:16px">${inv.items.map((it,i)=>itemHTML(inv,it,i)).join('')}</div></div>
  <div class="panel"><h2>Other charges</h2><p class="muted" style="margin:0 0 14px">Add any extra charge on its own line, such as hallmark or courier. Each prints separately on the invoice.</p>
    <div class="stack" style="gap:14px"><div class="stack" id="charges" style="gap:12px">${inv.charges.map(chargeRowHTML).join('')}</div>
    <div class="chips"><span class="muted">Quick add:</span>${S.settings.app.quickCharges.map(n=>`<button class="chip" data-quick="${esc(n)}">${esc(n)}</button>`).join('')}<button class="chip" data-quick="">Other…</button></div></div>
    <datalist id="chargeNames">${sheetNames().map(n=>`<option value="${esc(n)}">`).join('')}</datalist></div>
  <div class="panel"><div class="grid wide"><label>Notes<textarea id="f_notes" placeholder="Optional, printed on the invoice">${esc(inv.notes)}</textarea></label>
    <div class="totals" id="totals"></div></div></div></div>`;
}
function totalsHTML(inv,c){
  return lines(inv,c).map(([l,a])=>`<div><span>${esc(l)}</span><span>${inr(a)}</span></div>`).join('')+
   `<div class="sep"><span>Subtotal</span><span>${inr(c.sub)}</span></div><div><span>Central GST ${num(inv.cgst)}%</span><span>${inr(c.cgst)}</span></div>
    <div><span>State GST ${num(inv.sgst)}%</span><span>${inr(c.sgst)}</span></div><div class="muted"><span>Round off</span><span>${c.round>=0?'+':'−'}${fmt(Math.abs(c.round))}</span></div>
    <div class="grand"><span>Total</span><span>${inr(c.total)}</span></div><div class="words">${wordsInr(c.total)}</div>`;
}
function refreshTotals(inv){
  const c=calc(inv);
  $$('.gem').forEach((g,i)=>{
    const r=c.rows[i],n=g.querySelector('[data-net]');
    n.value=wt(r.net);n.style.color=r.net<0?'var(--bad)':'';
    g.querySelector('[data-rate]').value=fmt(r.rate);
    g.querySelector('[data-mwt]').value=wt(r.mwt);
    g.querySelector('[data-mamt]').value=fmt(r.making);
    g.querySelector('[data-amt]').textContent=inr(r.amount);
    const hh=g.querySelector('[data-huidhint]');if(hh)hh.hidden=!(r.metal==='Gold'&&!r.huid);
  });
  $('#totals').innerHTML=totalsHTML(inv,c);
  usedRates(inv).forEach(([k,v])=>{const el=document.querySelector(`[data-rk="${k}"]`);if(el)el.textContent=v>0?inr(v)+'/g':'not set'});
}
function bindEditor(inv){
  refreshTotals(inv);
  const bind=(id,k)=>{const e=$(id);if(e)e.oninput=ev=>{inv[k]=ev.target.value;refreshTotals(inv)}};
  $('#f_no').oninput=e=>inv.no=e.target.value;
  $('#f_date').oninput=e=>inv.date=e.target.value;
  $('#f_notes').oninput=e=>inv.notes=e.target.value;
  bind('#f_sr','silverRate');bind('#f_cg','cgst');bind('#f_sg','sgst');
  $$('[data-gr]').forEach(e=>e.oninput=ev=>{inv.goldRates[e.dataset.gr]=ev.target.value;refreshTotals(inv)});
  $('#rateEdit').onclick=()=>{ratesOpen=!(ratesOpen||usedRates(inv).some(([,v])=>v<=0));render()};
  $('#f_cust').onchange=e=>{
    if(e.target.value==='__new'){draftCust={...newCustomer(),fromInvoice:true};return go('customers/new')}
    inv.customerId=e.target.value};
  /* take the rate for this item's purity from Today's rates when the invoice has none yet */
  const pullRate=it=>{
    if(it.metal==='Silver'){if(!num(inv.silverRate))inv.silverRate=S.rates.silver||''}
    else{const k=goldKey(it.purity);if(!num(inv.goldRates[k]))inv.goldRates[k]=S.rates.gold[k]||''}
  };
  $('#items').addEventListener('input',e=>{
    const g=e.target.closest('.gem');if(!g)return;
    const it=inv.items[+g.dataset.i];
    if(e.target.matches('[data-stock]')){
      const st=S.inventory.find(s=>s.id===e.target.value);
      if(!st){delete it.stockId}
      else{applyStockToItem(it,st);pullRate(it)}
      render();return}
    if(!e.target.dataset.k)return;
    if(e.target.dataset.k==='huid'){it.huid=cleanHuid(e.target.value);e.target.value=it.huid;refreshTotals(inv);return}
    it[e.target.dataset.k]=e.target.value;
    if(e.target.dataset.k==='metal'||e.target.dataset.k==='purity'){
      if(e.target.dataset.k==='metal')it.purity=it.metal==='Gold'?'22K':PURITY.Silver[1];
      pullRate(it);render();return}
    refreshTotals(inv);
  });
  $('#items').addEventListener('click',e=>{
    if(!e.target.matches('[data-rm]'))return;
    const i=+e.target.closest('.gem').dataset.i;
    if(inv.items.length>1){inv.items.splice(i,1);render()}else toast('An invoice needs at least one item');
  });
  $('#charges').addEventListener('input',e=>{
    const r=e.target.closest('[data-cid]');if(!r||!e.target.dataset.c)return;
    inv.charges.find(c=>c.id===r.dataset.cid)[e.target.dataset.c]=e.target.value;refreshTotals(inv);
  });
  $('#charges').addEventListener('click',e=>{
    if(!e.target.matches('[data-crm]'))return;
    inv.charges=inv.charges.filter(c=>c.id!==e.target.closest('[data-cid]').dataset.cid);render();
  });
  $$('[data-quick]').forEach(b=>b.onclick=()=>{
    inv.charges.push({id:uid(),label:b.dataset.quick,amount:''});render();
    const rows=$$('#charges [data-cid]');rows[rows.length-1].querySelector('[data-c=amount]').focus();
  });
  $('#addItem').onclick=()=>{inv.items.push(newItem());render();$('#in'+(inv.items.length-1))?.focus()};
  $('#cancel').onclick=()=>{const back=inv.isNew?'invoices':'invoices/'+inv.id;draft=null;go(back)};
  $('#save').onclick=()=>{
    if(!inv.customerId)return toast('Select a customer first');
    const c=calc(inv);
    if(c.rows.some(r=>r.net<0))return toast('Stones and beads weight cannot exceed gross weight');
    if(!c.rows.some(r=>r.net>0))return toast('Add the weight of at least one item');
    const usedNow=usedRates(inv);
    if(usedNow.some(([,v])=>v<=0))return toast('Set the rate for '+usedNow.filter(([,v])=>v<=0).map(x=>x[0]).join(', '));
    if(S.invoices.some(i=>i.no===inv.no&&i.id!==inv.id))return toast('That invoice number is already used');
    if(inv.items.some(it=>it.huid&&!huidOk(it.huid)))return toast('A HUID has exactly 6 letters or digits, for example AB12CD');
    if(S.settings.invoice.requireHuid&&inv.items.some(it=>it.metal==='Gold'&&num(it.gross)>0&&!it.huid))return toast('Every gold item needs a HUID before it can be billed');
    const rec={...inv};delete rec.isNew;
    rec.goldRates=Object.fromEntries(usedNow.filter(([k])=>k!=='Silver'));rec.silverRate=usedNow.some(([k])=>k==='Silver')?num(rec.silverRate):'';rec.cgst=num(rec.cgst);rec.sgst=num(rec.sgst);
    rec.charges=rec.charges.filter(x=>x.label||num(x.amount));
    const idx=S.invoices.findIndex(i=>i.id===rec.id);
    if(idx>=0)S.invoices[idx]=rec;else S.invoices.push(rec);
    persist();draft=null;go('invoices/'+rec.id);toast('Invoice saved');
  };
}

/* ----- invoice page: payments + paper sheet in the chosen template ----- */
function paymentsHTML(inv){
  const m=money(inv),st=statusOf(inv);
  return `<div class="panel stack" style="gap:18px"><div class="bar" style="margin:0"><h2 style="margin:0">Payments</h2><span class="pill ${pillCls(st)}">${st}</span></div>
  <div class="tiles">${tile('Invoice total',inr(m.total))}${tile('Received',inr(m.paid),'good')}${tile('Balance',inr(m.bal),m.bal>0.004?'bad':'')}</div>
  ${inv.payments.length?`<div class="list" style="box-shadow:inset 0 0 0 1px var(--line)">${inv.payments.map(p=>`<div class="item"><div class="main"><b>${inr(num(p.amount))}</b><span class="sub">${dmy(p.date)} · ${esc(p.mode)}${p.note?' · '+esc(p.note):''}</span></div>${can('invoices','edit')?`<button class="btn sm danger" data-rmpay="${p.id}">Remove</button>`:''}</div>`).join('')}</div>`:'<div class="muted">No payments recorded yet.</div>'}
  ${!can('invoices','edit')?'':m.bal>0.004?`<div><div class="sub-h" style="margin-bottom:10px">Record a payment</div>${payFormHTML(inv)}</div>`:'<div class="muted">Fully paid. Remove a payment above if it was entered by mistake.</div>'}</div>`;
}
function contactLines(o,esc2){return [[o.phone&&'Phone: '+o.phone,o.gstin&&'GSTIN: '+o.gstin],[o.email&&'Email: '+o.email,o.instagram&&'Instagram: @'+o.instagram]].map(a=>a.filter(Boolean).map(esc2).join(' · ')).filter(Boolean)}
function sheetHTML(inv){
  const c=calc(inv),cu=custOf(inv.customerId)||{name:'(customer removed)'},s=storeOf(),t=tplOf(inv),m=money(inv),st=docStatus(inv);
  const contact=[s.phone&&'Phone: '+esc(s.phone),s.gstin&&'GSTIN: '+esc(s.gstin)].filter(Boolean).join(' · ');
  const cc=contactLines(cu,esc);
  return `<div class="sheet t-${t}">
    <div class="head"><div class="brandrow">${s.logo?`<span class="logo-tile"><img src="${esc(s.logo)}" alt=""></span>`:''}<div><div class="store">${esc(s.name)}</div><div class="sm">${esc(s.address)}</div>${contact?`<div class="sm">${contact}</div>`:''}</div></div>
      <div class="tagbox"><div class="tag">Tax Invoice</div></div></div>
    <div class="meta"><div class="box"><h4>Bill to</h4><b>${esc(cu.name)}</b><div class="sm">${esc(cu.address||'')}</div>${cc.map(l=>`<div class="sm">${l}</div>`).join('')}</div>
      <div class="box"><h4>Invoice details</h4><div><b>${esc(inv.no)}</b> · ${dmy(inv.date)} · <span class="pill ${pillCls(st)}">${st}</span></div></div></div>
    <div class="scroll"><table><thead><tr><th>#</th><th>Item</th><th>Gross g</th><th>Stone g</th><th>Beads g</th><th>Net g</th><th>Rate/g</th><th>Metal value</th><th>Making (% of net)</th><th>Stone chg</th><th>Beads chg</th><th>Amount</th></tr></thead><tbody>
    ${c.rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name||r.metal)}<div class="sm">${esc(r.metal)} ${esc(r.purity)}</div>${r.huid?`<div class="sm huid-line">HUID ${esc(r.huid)}</div>`:''}</td><td>${wt(r.gross)}</td><td>${wt(r.sw)}</td><td>${wt(r.bw)}</td><td>${wt(r.net)}</td><td>${fmt(r.rate)}</td><td>${fmt(r.value)}</td><td>${fmt(r.making)}<div class="sm">${+r.pct.toFixed(3)}% · ${wt(r.mwt)} g</div></td><td>${fmt(r.stone)}</td><td>${fmt(r.beads)}</td><td><b>${fmt(r.amount)}</b></td></tr>`).join('')}</tbody>
    <tfoot><tr><td></td><td>Total</td><td>${wt(c.t.gross)}</td><td>${wt(c.t.sw)}</td><td>${wt(c.t.bw)}</td><td>${wt(c.t.net)}</td><td></td><td>${fmt(c.t.metal)}</td><td>${fmt(c.t.making)}</td><td>${fmt(c.t.stone)}</td><td>${fmt(c.t.beads)}</td><td></td></tr></tfoot></table></div>
    <div class="below"><div>${inv.notes?`<div class="box"><h4>Notes</h4><div class="sm">${esc(inv.notes)}</div></div>`:''}<div class="box" style="margin-top:12px"><h4>Amount in words</h4><div>${wordsInr(c.total)}</div></div></div>
      <div class="bd">${lines(inv,c).map(([l,a])=>`<div><span>${esc(l)}</span><span>${inr(a)}</span></div>`).join('')}
        <div class="sep"><span>Subtotal</span><span>${inr(c.sub)}</span></div><div><span>Central GST ${num(inv.cgst)}%</span><span>${inr(c.cgst)}</span></div>
        <div><span>State GST ${num(inv.sgst)}%</span><span>${inr(c.sgst)}</span></div><div><span>Round off</span><span>${c.round>=0?'+':'−'}${fmt(Math.abs(c.round))}</span></div>
        <div class="tot"><span>Total</span><span>${inr(c.total)}</span></div>
        ${m.paid>0?`<div><span>Paid</span><span>${inr(m.paid)}</span></div><div class="sep"><span>Balance due</span><span>${inr(m.bal)}</span></div>`:''}</div></div>
    <div class="foot"><div style="max-width:420px">${esc(s.terms)}</div><div class="sign">Authorised signatory</div></div></div>`;
}
function detailHTML(inv){
  const t=tplOf(inv),cu=custOf(inv.customerId);
  return `<header class="page"><div><a href="#/invoices" class="btn sm" style="margin-bottom:14px">‹ All invoices</a><h1>${esc(inv.no)}</h1><p class="sub">${esc(cu?.name||'No customer')} · ${dmy(inv.date)}</p></div>
    <div class="row">${can('invoices','edit')?'<button class="btn" id="edit">Edit</button>':''}<button class="btn" id="wa">Share on WhatsApp</button><button class="btn" id="copy">Copy summary</button><button class="btn primary" id="pdf">Download PDF</button></div></header>
  <div class="stack">${paymentsHTML(inv)}
  <div class="row"><span class="muted">Template</span><div class="seg" id="tpl">${Object.entries(TEMPLATES).map(([k,v])=>`<button data-t="${k}" aria-pressed="${k===t}">${v}</button>`).join('')}</div></div>
  ${sheetHTML(inv)}
  ${can('invoices','edit')?'<div class="row"><button class="btn danger sm" id="del">Delete invoice</button></div>':''}</div>`;
}
function summary(inv){
  const c=calc(inv),cu=custOf(inv.customerId)||{},s=storeOf(),m=money(inv);
  return `${s.name}\nInvoice ${inv.no} dated ${dmy(inv.date)}\nCustomer: ${cu.name||''}\n`+
    c.rows.map((r,i)=>`${i+1}. ${r.name||r.metal} (${r.purity}${r.huid?', HUID '+r.huid:''}) net ${wt(r.net)} g: Rs. ${fmt(r.amount)}`).join('\n')+'\n'+
    lines(inv,c).map(([l,a])=>`${l}: Rs. ${fmt(a)}`).join('\n')+
    `\nCentral GST ${num(inv.cgst)}%: Rs. ${fmt(c.cgst)}\nState GST ${num(inv.sgst)}%: Rs. ${fmt(c.sgst)}\nTotal: Rs. ${fmt(c.total)}`+
    (m.paid>0?`\nPaid: Rs. ${fmt(m.paid)}`:'')+(m.bal>0.004?`\nBalance due: Rs. ${fmt(m.bal)}`:'\nPaid in full')+`\nThank you for shopping with us.`;
}
function bindDetail(inv){
  const cu=custOf(inv.customerId);
  const eb=$('#edit');if(eb)eb.onclick=()=>{draft=clone(inv);ratesOpen=false;go('invoices/'+inv.id+'/edit')};
  $('#pdf').onclick=()=>makePDF(inv);
  $('#tpl').onclick=e=>{const b=e.target.closest('[data-t]');if(!b)return;inv.template=b.dataset.t;if(can('invoices','edit'))persist();render()};
  $('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(summary(inv));toast('Summary copied')}catch(e){toast('Copy is blocked here. Use WhatsApp instead.')}};
  $('#wa').onclick=()=>{
    const ph=(cu?.phone||'').replace(/\D/g,'');
    const full=ph.length===10?'91'+ph:ph;
    window.open('https://wa.me/'+full+'?text='+encodeURIComponent(summary(inv)+'\n\n(PDF attached separately)'),'_blank')||toast('Allow pop-ups to open WhatsApp');
  };
  if($('#pf_save'))bindPayForm(inv);
  $$('[data-rmpay]').forEach(b=>b.onclick=()=>{
    if(b.dataset.arm!=='1'){b.dataset.arm='1';b.textContent='Confirm';return}
    inv.payments=inv.payments.filter(p=>p.id!==b.dataset.rmpay);persist();render();toast('Payment removed')});
  let armed=false;
  const db=$('#del');if(db)db.onclick=e=>{if(!armed){armed=true;e.target.textContent='Click again to delete';return}
    S.invoices=S.invoices.filter(i=>i.id!==inv.id);persist();go('invoices');toast('Invoice deleted')};
}
