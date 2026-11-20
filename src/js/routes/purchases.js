/* ---------- routes: purchases (bills from suppliers) and suppliers ----------
   A purchase bill has lines of two kinds: "Piece" (finished jewellery, can be added to Inventory with its HUID) and "Metal" (bullion, raw metal, old gold: weight x rate).
   What was spent, paid and still owed are derived (pcalc / pmoney). A piece created from a bill remembers the bill line, so its cost is derived too. */
let purFilter='all',qPur='',purPayOpen=null,qSup='';
const PUR_MODES=()=>modes();

ROUTES.purchases={
  html(p){
    if(!p.length)return purchasesHTML();
    if((p[0]==='new'||p[1]==='edit')&&!can('purchases','edit')){go(p[0]==='new'?'purchases':'purchases/'+p[0]);return null}
    if(p[0]==='new'){if(!draftPur&&!ready)return LOADING;if(!draftPur||!draftPur.isNew)draftPur=newPurchase();return purchaseEditorHTML(draftPur)}
    const pu=purchaseOf(p[0]);
    if(!pu){if(!ready)return LOADING;go('purchases');return null}
    if(p[1]==='edit'){if(!draftPur&&!ready)return LOADING;if(!draftPur||draftPur.id!==pu.id)draftPur=clone(pu);return purchaseEditorHTML(draftPur)}
    return purchaseDetailHTML(pu);
  },
  bind(p){
    if(!p.length)return bindPurchases();
    if(p[0]==='new'||p[1]==='edit')return bindPurchaseEditor(draftPur);
    bindPurchaseDetail(purchaseOf(p[0]));
  }
};
ROUTES.suppliers={
  html(p){
    if(!p.length)return suppliersHTML();
    if(!can('purchases','edit')){go('suppliers');return null}
    if(p[0]==='new'){if(!draftSup||!draftSup.isNew)draftSup=newSupplier();return supplierFormHTML(draftSup)}
    const s=supplierOf(p[0]);
    if(!s){if(!ready)return LOADING;go('suppliers');return null}
    if(!draftSup||draftSup.id!==s.id)draftSup={...s};
    return supplierFormHTML(draftSup);
  },
  bind(p){p.length?bindSupplierForm(draftSup):bindSuppliers()}
};
const purTabs=cur=>`<nav class="seg tabs" aria-label="Purchases"><a href="#/purchases" aria-current="${cur==='purchases'}">Purchase bills</a><a href="#/suppliers" aria-current="${cur==='suppliers'}">Suppliers</a></nav>`;
const pillOf=s=>`<span class="pill ${pillCls(s)}">${s}</span>`;

/* ----- list ----- */
function purchaseTotals(list){let billed=0,paid=0,bal=0,open=0;list.forEach(p=>{const m=pmoney(p);billed+=m.total;paid+=Math.min(m.paid,m.total);bal+=m.bal;if(m.bal>0.004)open++});return{billed,paid,bal,open,n:list.length}}
function purchasesHTML(){
  const o=purchaseTotals(S.purchases),q=qPur.toLowerCase(),edit=can('purchases','edit');
  const all=S.purchases.map(p=>({p,st:pstatusOf(p)}));
  const cnt=k=>k==='all'?all.length:all.filter(x=>x.st===k).length;
  const list=all.filter(x=>(purFilter==='all'||x.st===purFilter)&&(!q||x.p.no.toLowerCase().includes(q)||(x.p.billNo||'').toLowerCase().includes(q)||(supplierOf(x.p.supplierId)?.name||'').toLowerCase().includes(q)))
    .sort((a,b)=>b.p.date.localeCompare(a.p.date)||b.p.no.localeCompare(a.p.no));
  const row=x=>{const p=x.p,s=supplierOf(p.supplierId),m=pmoney(p),open=m.bal>0.004;
    return`<div class="item" data-id="${p.id}" role="link" tabindex="0"><div class="main"><b>${esc(p.no)} · ${esc(s?.name||'No supplier')}</b>
      <span class="sub">${dmy(p.date)} · ${p.items.length} line${p.items.length===1?'':'s'}${p.billNo?' · bill '+esc(p.billNo):''}${m.paid>0&&open?' · Paid '+inr(m.paid):''}</span></div>
      <div class="row">${pillOf(x.st)}<span class="amt">${inr(m.total)}</span>${open?`<span class="dueamt">To pay ${inr(m.bal)}</span>`:''}</div></div>`};
  return`<header class="page"><div><h1>Purchases</h1><p class="sub">What you buy from suppliers and what you still owe them.</p></div>${edit?'<button class="btn primary" id="newPur">New purchase</button>':''}</header>
  ${purTabs('purchases')}
  <div class="stack"><div class="tiles">${tile('Purchased (all time)',inr(o.billed),'',`${o.n} bill${o.n===1?'':'s'}`)}${tile('Paid',inr(o.paid),'good')}${tile('To pay suppliers',inr(o.bal),o.bal>0?'bad':'')}${tile('Bills with balance',o.open,'',`of ${o.n}`)}</div>
  <div class="bar" style="margin:0"><div class="seg" id="pF">${['all','Unpaid','Partial','Paid'].map(k=>`<button data-s="${k}" aria-pressed="${purFilter===k}">${k==='all'?'All':k} (${cnt(k)})</button>`).join('')}</div>
    <input id="q" type="search" placeholder="Search number, bill or supplier" value="${esc(qPur)}" style="width:240px"></div>
  <div class="list">${list.length?list.map(row).join(''):`<div class="empty">${S.purchases.length?'No purchases match this filter.':'No purchases yet.'+(edit?' Choose New purchase to record your first bill.':'')}</div>`}</div></div>`;
}
function bindPurchases(){
  const nb=$('#newPur');if(nb)nb.onclick=()=>{draftPur=null;go('purchases/new')};
  $('#pF').onclick=e=>{const b=e.target.closest('[data-s]');if(!b)return;purFilter=b.dataset.s;render()};
  $('#q').oninput=e=>{qPur=e.target.value;const p=e.target.selectionStart;render();const q=$('#q');q.focus();q.setSelectionRange(p,p)};
  $$('.item[data-id]').forEach(el=>{el.onclick=()=>go('purchases/'+el.dataset.id);el.onkeydown=e=>{if(e.key==='Enter')go('purchases/'+el.dataset.id)}});
}

/* ----- editor ----- */
const rateTodayFor=it=>it.metal==='Silver'?(S.rates.silver||''):(S.rates.gold[goldKey(it.purity)]||'');
function purItemHTML(p,it,idx){
  const piece=it.kind==='Piece',f=(k,l,ex='')=>`<label>${l}<input data-k="${k}" type="number" min="0" step="any" inputmode="decimal" value="${esc(it[k])}" ${ex}></label>`;
  const stock=it.stockId&&S.inventory.find(s=>s.id===it.stockId);
  return`<div class="gem" data-i="${idx}"><div class="gem-h"><b>${piece?'Piece':'Metal'} ${idx+1}</b><span class="row"><span class="amt" data-amt>₹0.00</span><button class="btn sm danger" data-rm>Remove</button></span></div>
    <div class="grid"><label style="grid-column:1/-1">${piece?'Item name':'Description'}<input data-k="name" id="in${idx}" placeholder="${piece?'e.g. Gold necklace, 22K':'e.g. 24K gold bar, old gold ornaments'}" value="${esc(it.name)}"></label>
    ${piece?`<label>Category<select data-k="category">${CATEGORIES.map(c=>`<option${c===it.category?' selected':''}>${c}</option>`).join('')}</select></label>`:''}
    <label>Metal<select data-k="metal"><option${it.metal==='Gold'?' selected':''}>Gold</option><option${it.metal==='Silver'?' selected':''}>Silver</option></select></label>
    <label>Purity<select data-k="purity">${PURITY[it.metal].map(x=>`<option${x===it.purity?' selected':''}>${x}</option>`).join('')}</select></label>
    ${piece?`<label>HUID (6 letters or digits)<input data-k="huid" maxlength="6" autocapitalize="characters" spellcheck="false" placeholder="e.g. AB12CD" value="${esc(it.huid)}"></label>`:''}</div>
    <div class="sub-h">Weights (grams)</div>
    <div class="grid">${f('gross',piece?'Gross weight':'Weight')}${piece?f('stoneWt','Stones weight')+f('beadsWt','Beads weight'):''}<label>Net weight<input data-net readonly value="0.000"></label></div>
    <div class="sub-h">Buying price</div>
    <div class="grid">${f('rate','Rate (₹ per gram)')}${piece?f('makingPct','Making (% of net weight)')+f('stone','Stone charges (₹)')+f('beads','Beads charges (₹)'):''}</div>
    ${piece?(stock?`<p class="set-note">In stock as <a href="#/item/${encodeURIComponent(stock.tag)}">${esc(stock.tag)}</a>. Edit the piece in Inventory to change what is in stock.</p>`
      :can('inventory','edit')?`<label class="check"><input type="checkbox" data-add${it.addStock?' checked':''}> Add to Inventory when I save this bill</label>`
      :'<p class="set-note">You do not have Inventory access, so this piece will not be added to stock.</p>'):''}</div>`;
}
function purchaseEditorHTML(p){
  return`<header class="page"><h1>${p.isNew?'New purchase':'Edit '+esc(p.no)}</h1><div class="row"><button class="btn" id="cancel">Cancel</button><button class="btn primary" id="save">Save purchase</button></div></header>
  <div class="stack">
  <div class="panel"><h2>Bill</h2><div class="grid">
    <label>Our number<input id="f_no" value="${esc(p.no)}"></label>
    <label>Supplier's bill no.<input id="f_bill" placeholder="Optional" value="${esc(p.billNo)}"></label>
    <label>Date<input id="f_date" type="date" value="${p.date}"></label>
    <label>Supplier<select id="f_sup"><option value="">Select supplier</option>${S.suppliers.map(s=>`<option value="${s.id}"${s.id===p.supplierId?' selected':''}>${esc(s.name)}</option>`).join('')}<option value="__new">+ Add new supplier</option></select></label>
    <label>Central GST (%)<input id="f_cg" type="number" min="0" step="any" value="${p.cgst}"></label>
    <label>State GST (%)<input id="f_sg" type="number" min="0" step="any" value="${p.sgst}"></label></div></div>
  <div class="panel"><div class="bar" style="margin-bottom:14px"><h2 style="margin:0">Items bought</h2><span class="row"><button class="btn" id="addPiece">Add piece</button><button class="btn" id="addMetal">Add metal</button></span></div>
    <div class="stack" id="items" style="gap:16px">${p.items.map((it,i)=>purItemHTML(p,it,i)).join('')}</div></div>
  <div class="panel"><h2>Other charges</h2><p class="muted" style="margin:0 0 14px">Hallmarking, freight, insurance and the like. Each is its own line.</p>
    <div class="stack" style="gap:14px"><div class="stack" id="charges" style="gap:12px">${p.charges.map(chargeRowHTML).join('')}</div>
    <div class="chips"><span class="muted">Quick add:</span>${['Hallmarking charges','Freight','Insurance'].map(n=>`<button class="chip" data-quick="${n}">${n}</button>`).join('')}<button class="chip" data-quick="">Other…</button></div></div>
    <datalist id="chargeNames">${['Hallmarking charges','Freight','Insurance','Packing charges'].map(n=>`<option value="${esc(n)}">`).join('')}</datalist></div>
  <div class="panel"><div class="grid wide"><label>Notes<textarea id="f_notes" placeholder="Optional">${esc(p.notes)}</textarea></label><div class="totals" id="totals"></div></div></div></div>`;
}
function refreshPurchase(p){
  const c=pcalc(p);
  $$('.gem').forEach((g,i)=>{const r=c.rows[i],n=g.querySelector('[data-net]');n.value=wt(r.net);n.style.color=r.net<0?'var(--bad)':'';g.querySelector('[data-amt]').textContent=inr(r.amount)});
  $('#totals').innerHTML=totalsHTML(p,c);
}
function bindPurchaseEditor(p){
  refreshPurchase(p);
  $('#f_no').oninput=e=>p.no=e.target.value;$('#f_bill').oninput=e=>p.billNo=e.target.value;$('#f_date').oninput=e=>p.date=e.target.value;$('#f_notes').oninput=e=>p.notes=e.target.value;
  $('#f_cg').oninput=e=>{p.cgst=e.target.value;refreshPurchase(p)};$('#f_sg').oninput=e=>{p.sgst=e.target.value;refreshPurchase(p)};
  $('#f_sup').onchange=e=>{
    if(e.target.value==='__new'){draftSup={...newSupplier(),fromPurchase:true};return go('suppliers/new')}
    p.supplierId=e.target.value};
  $('#items').addEventListener('input',e=>{
    const g=e.target.closest('.gem');if(!g)return;const it=p.items[+g.dataset.i];
    if(e.target.matches('[data-add]')){it.addStock=e.target.checked;return}
    const k=e.target.dataset.k;if(!k)return;
    if(k==='huid'){it.huid=cleanHuid(e.target.value);e.target.value=it.huid;return}
    it[k]=e.target.value;
    if(k==='metal'||k==='purity'){
      if(k==='metal')it.purity=it.metal==='Gold'?'22K':PURITY.Silver[1];
      it.rate=rateTodayFor(it);render();return}
    refreshPurchase(p);
  });
  $('#items').addEventListener('click',e=>{
    if(!e.target.matches('[data-rm]'))return;
    const i=+e.target.closest('.gem').dataset.i;
    if(p.items.length>1){p.items.splice(i,1);render()}else toast('A purchase needs at least one item');
  });
  $('#charges').addEventListener('input',e=>{const r=e.target.closest('[data-cid]');if(!r||!e.target.dataset.c)return;p.charges.find(c=>c.id===r.dataset.cid)[e.target.dataset.c]=e.target.value;refreshPurchase(p)});
  $('#charges').addEventListener('click',e=>{if(!e.target.matches('[data-crm]'))return;p.charges=p.charges.filter(c=>c.id!==e.target.closest('[data-cid]').dataset.cid);render()});
  $$('[data-quick]').forEach(b=>b.onclick=()=>{p.charges.push({id:uid(),label:b.dataset.quick,amount:''});render();const rows=$$('#charges [data-cid]');rows[rows.length-1].querySelector('[data-c=amount]').focus()});
  $('#addPiece').onclick=()=>{p.items.push(newPurchaseItem('Piece'));render();$('#in'+(p.items.length-1))?.focus()};
  $('#addMetal').onclick=()=>{const it=newPurchaseItem('Metal');it.addStock=false;p.items.push(it);render();$('#in'+(p.items.length-1))?.focus()};
  $('#cancel').onclick=()=>{const back=p.isNew?'purchases':'purchases/'+p.id;draftPur=null;go(back)};
  $('#save').onclick=()=>savePurchase(p);
}
function savePurchase(p){
  if(!p.supplierId)return toast('Select the supplier first');
  const c=pcalc(p);
  if(c.rows.some(r=>r.net<0))return toast('Stones and beads weight cannot exceed gross weight');
  if(!c.rows.some(r=>r.net>0))return toast('Add the weight of at least one item');
  if(c.rows.some(r=>r.net>0&&!(r.rate>0)))return toast('Enter the rate for every item you weighed');
  if(S.purchases.some(x=>x.no===p.no&&x.id!==p.id))return toast('That purchase number is already used');
  const piecesToStock=p.items.filter(it=>it.kind==='Piece'&&it.addStock&&!it.stockId&&can('inventory','edit')&&num(it.gross)>0);
  const used=new Set(S.inventory.map(s=>s.huid).filter(Boolean));
  for(const it of p.items){
    if(it.huid&&!huidOk(it.huid))return toast('A HUID has 6 letters or digits, for example AB12CD');
    if(it.huid&&piecesToStock.includes(it)&&used.has(it.huid))return toast('HUID '+it.huid+' is already on a piece in stock');
  }
  if(new Set(piecesToStock.map(it=>it.huid).filter(Boolean)).size<piecesToStock.filter(it=>it.huid).length)return toast('Two pieces on this bill have the same HUID');
  const rec=clone(p);delete rec.isNew;rec.cgst=num(rec.cgst);rec.sgst=num(rec.sgst);rec.charges=rec.charges.filter(x=>x.label||num(x.amount));
  /* each piece marked "add to inventory" becomes a stock piece that remembers its bill line */
  let added=0;
  rec.items.forEach(it=>{
    if(!piecesToStock.some(x=>x.id===it.id))return;
    const st={id:uid(),tag:nextTag(it.metal),name:it.name||it.category,category:it.category,metal:it.metal,purity:it.purity,gross:it.gross,stoneWt:it.stoneWt,beadsWt:it.beadsWt,
      makingPct:'',stone:'',beads:'',huid:it.huid||'',notes:'',addedOn:rec.date,purchaseId:rec.id,purchaseItemId:it.id};
    S.inventory.push(st);it.stockId=st.id;added++;
  });
  rec.items.forEach(it=>{delete it.addStock});
  const i=S.purchases.findIndex(x=>x.id===rec.id);if(i>=0)S.purchases[i]=rec;else S.purchases.push(rec);
  persist();draftPur=null;go('purchases/'+rec.id);toast(added?`Purchase saved. ${added} piece${added===1?'':'s'} added to stock.`:'Purchase saved');
}

/* ----- bill page ----- */
function ppayFormHTML(p){const m=pmoney(p);
  return`<div class="grid"><label>Amount paid (₹)<input id="pf_amt" type="number" min="0" step="any" inputmode="decimal" value="${m.bal.toFixed(2)}"></label>
  <label>Date<input id="pf_date" type="date" value="${today()}"></label>
  <label>Mode<select id="pf_mode">${PUR_MODES().map(x=>`<option>${esc(x)}</option>`).join('')}</select></label>
  <label>Note<input id="pf_note" placeholder="Optional"></label></div>
  <div class="row" style="margin-top:14px"><button class="btn primary" id="pf_save">Record payment</button><button class="btn" id="pf_full">Mark fully paid (${inr(m.bal)})</button></div>`}
function purchaseDetailHTML(p){
  const c=pcalc(p),m=pmoney(p),st=pstatusOf(p),s=supplierOf(p.supplierId),edit=can('purchases','edit');
  const stockLinks=p.items.filter(it=>it.stockId).map(it=>S.inventory.find(x=>x.id===it.stockId)).filter(Boolean);
  return`<header class="page"><div><a href="#/purchases" class="btn sm" style="margin-bottom:14px">‹ All purchases</a><h1>${esc(p.no)}</h1><p class="sub">${esc(s?.name||'No supplier')} · ${dmy(p.date)}${p.billNo?' · bill '+esc(p.billNo):''}</p></div>
    ${edit?'<div class="row"><button class="btn" id="edit">Edit</button></div>':''}</header>
  <div class="stack"><div class="panel stack" style="gap:18px"><div class="bar" style="margin:0"><h2 style="margin:0">Payments to supplier</h2>${pillOf(st)}</div>
    <div class="tiles">${tile('Bill total',inr(m.total))}${tile('Paid',inr(m.paid),'good')}${tile('To pay',inr(m.bal),m.bal>0.004?'bad':'')}</div>
    ${p.payments.length?`<div class="list" style="box-shadow:inset 0 0 0 1px var(--line)">${p.payments.map(x=>`<div class="item"><div class="main"><b>${inr(num(x.amount))}</b><span class="sub">${dmy(x.date)} · ${esc(x.mode)}${x.note?' · '+esc(x.note):''}</span></div>${edit?`<button class="btn sm danger" data-rmpay="${x.id}">Remove</button>`:''}</div>`).join('')}</div>`:'<div class="muted">No payments recorded yet.</div>'}
    ${edit?(m.bal>0.004?`<div><div class="sub-h" style="margin-bottom:10px">Record a payment</div>${ppayFormHTML(p)}</div>`:'<div class="muted">Fully paid.</div>'):''}</div>
  <div class="panel"><h2>Items</h2><div class="scroll"><table class="plain"><thead><tr><th>Item</th><th>HUID</th><th>Net g</th><th>Rate/g</th><th>Metal value</th><th>Making</th><th>Stone + beads</th><th>Amount</th></tr></thead><tbody>
    ${c.rows.map(r=>{const stc=r.stockId&&S.inventory.find(x=>x.id===r.stockId);return`<tr><td>${esc(r.name||r.metal)}<div class="muted" style="font-size:12px">${r.kind==='Metal'?'Metal':esc(r.category||'Piece')} · ${esc(r.metal)} ${esc(r.purity)}${stc?` · <a href="#/item/${encodeURIComponent(stc.tag)}">${esc(stc.tag)}</a>`:''}</div></td><td>${esc(r.huid||'—')}</td><td>${wt(r.net)}</td><td>${fmt(r.rate)}</td><td>${fmt(r.value)}</td><td>${fmt(r.making)}</td><td>${fmt(r.stone+r.beads)}</td><td><b>${fmt(r.amount)}</b></td></tr>`}).join('')}</tbody></table></div>
    <div class="totals" style="margin-top:18px">${totalsHTML(p,c)}</div>
    ${p.notes?`<p class="set-note" style="margin-top:14px">Notes: ${esc(p.notes)}</p>`:''}
    ${stockLinks.length?`<p class="set-note" style="margin-top:14px">Added to stock: ${stockLinks.map(x=>`<a href="#/item/${encodeURIComponent(x.tag)}">${esc(x.tag)}</a>`).join(', ')}</p>`:''}</div>
  ${edit?'<div class="row"><button class="btn danger sm" id="del">Delete purchase</button></div>':''}</div>`;
}
function bindPurchaseDetail(p){
  const eb=$('#edit');if(eb)eb.onclick=()=>{draftPur=clone(p);go('purchases/'+p.id+'/edit')};
  const rec=a=>{const m=pmoney(p);a=num(a);
    if(a<=0)return toast('Enter the amount paid');
    if(a>m.bal+0.005)return toast('That is more than the balance of '+inr(m.bal));
    p.payments.push({id:uid(),date:$('#pf_date').value||today(),amount:+a.toFixed(2),mode:$('#pf_mode').value,note:$('#pf_note').value.trim()});
    persist();render();toast(pstatusOf(p)==='Paid'?'Marked as paid':'Payment recorded')};
  if($('#pf_save')){$('#pf_save').onclick=()=>rec($('#pf_amt').value);$('#pf_full').onclick=()=>rec(pmoney(p).bal)}
  $$('[data-rmpay]').forEach(b=>b.onclick=()=>{
    if(b.dataset.arm!=='1'){b.dataset.arm='1';b.textContent='Confirm';return}
    p.payments=p.payments.filter(x=>x.id!==b.dataset.rmpay);persist();render();toast('Payment removed')});
  const db=$('#del');
  if(db){
    const made=S.inventory.filter(s=>s.purchaseId===p.id);
    if(made.length)db.textContent='Delete purchase and '+made.length+' piece'+(made.length===1?'':'s')+' it added';
    let armed=false;
    db.onclick=e=>{
      if(made.some(s=>isSold(s.id)))return toast('A piece from this bill is already sold, so it cannot be deleted');
      if(made.length&&!can('inventory','edit'))return toast('This bill added stock pieces. You need Inventory access to delete it.');
      if(!armed){armed=true;e.target.textContent='Click again to delete';return}
      if(made.length)S.inventory=S.inventory.filter(s=>s.purchaseId!==p.id);
      S.purchases=S.purchases.filter(x=>x.id!==p.id);persist();go('purchases');toast('Purchase deleted')};
  }
}

/* ----- suppliers ----- */
function suppliersHTML(){
  const q=qSup.toLowerCase(),edit=can('purchases','edit');
  const list=[...S.suppliers].sort((a,b)=>a.name.localeCompare(b.name)).filter(s=>!q||s.name.toLowerCase().includes(q)||(s.phone||'').includes(q)||(s.gstin||'').toLowerCase().includes(q));
  return`<header class="page"><div><h1>Suppliers</h1><p class="sub">${S.suppliers.length} saved</p></div>
    <div class="row"><input id="q" type="search" placeholder="Search name, phone, GSTIN" value="${esc(qSup)}" style="width:240px">${edit?'<button class="btn primary" id="newSup">New supplier</button>':''}</div></header>
  ${purTabs('suppliers')}
  <div class="list">${list.length?list.map(s=>{const mine=S.purchases.filter(p=>p.supplierId===s.id),owe=mine.reduce((a,p)=>a+pmoney(p).bal,0);
    return`<div class="item"><div class="main"><b>${esc(s.name)}</b><span class="sub">${esc(s.type||'')}${s.phone?' · '+esc(s.phone):''}${s.gstin?' · GSTIN '+esc(s.gstin):''}</span>
      <span class="sub">${mine.length} purchase${mine.length===1?'':'s'}${owe>0.004?` · <span class="dueamt">To pay ${inr(owe)}</span>`:''}</span></div>
      ${edit?`<div class="row"><button class="btn sm" data-edit="${s.id}">Edit</button><button class="btn sm danger" data-del="${s.id}">Delete</button></div>`:''}</div>`}).join(''):'<div class="empty">No suppliers yet.'+(edit?' Choose New supplier to add one.':'')+'</div>'}</div>`;
}
function bindSuppliers(){
  const nb=$('#newSup');if(nb)nb.onclick=()=>{draftSup=null;go('suppliers/new')};
  $('#q').oninput=e=>{qSup=e.target.value;const p=e.target.selectionStart;render();const q=$('#q');q.focus();q.setSelectionRange(p,p)};
  $$('[data-edit]').forEach(b=>b.onclick=()=>{draftSup=null;go('suppliers/'+b.dataset.edit)});
  $$('[data-del]').forEach(b=>b.onclick=()=>{
    if(S.purchases.some(p=>p.supplierId===b.dataset.del))return toast('This supplier has purchases, so it cannot be deleted');
    if(b.dataset.arm!=='1'){b.dataset.arm='1';b.textContent='Confirm';return}
    S.suppliers=S.suppliers.filter(s=>s.id!==b.dataset.del);persist();render();toast('Supplier deleted')});
}
function supplierFormHTML(s){
  return`<header class="page"><h1>${s.isNew?'New supplier':'Edit supplier'}</h1></header>
  <div class="panel stack narrow"><div class="grid wide"><label>Name<input id="s_name" value="${esc(s.name)}"></label>
    <label>Type<select id="s_type">${SUPPLIER_TYPES.map(t=>`<option${t===s.type?' selected':''}>${t}</option>`).join('')}</select></label>
    <label>Phone<input id="s_phone" type="tel" value="${esc(s.phone)}"></label><label>Email<input id="s_email" type="email" value="${esc(s.email)}"></label>
    <label>GSTIN (optional)<input id="s_gstin" value="${esc(s.gstin)}"></label></div><label>Address<textarea id="s_addr">${esc(s.address)}</textarea></label>
    <div class="row"><button class="btn primary" id="s_save">Save supplier</button><button class="btn" id="s_cancel">Cancel</button></div></div>`;
}
function bindSupplierForm(s){
  const back=()=>{if(s.fromPurchase&&draftPur)return go(draftPur.isNew?'purchases/new':'purchases/'+draftPur.id+'/edit');go('suppliers')};
  $('#s_cancel').onclick=()=>{back();draftSup=null};
  $('#s_save').onclick=()=>{
    s.name=$('#s_name').value.trim();s.type=$('#s_type').value;s.phone=$('#s_phone').value.trim();s.email=$('#s_email').value.trim();s.gstin=$('#s_gstin').value.trim();s.address=$('#s_addr').value;
    if(!s.name)return toast('Enter the supplier name');
    if(s.email&&!/^\S+@\S+\.\S+$/.test(s.email))return toast('Enter a valid email address');
    const rec={id:s.id,name:s.name,type:s.type,phone:s.phone,email:s.email,gstin:s.gstin,address:s.address};
    const i=S.suppliers.findIndex(x=>x.id===s.id);if(i>=0)S.suppliers[i]=rec;else S.suppliers.push(rec);
    persist();if(s.fromPurchase&&draftPur)draftPur.supplierId=s.id;
    back();draftSup=null;toast('Supplier saved');
  };
}
