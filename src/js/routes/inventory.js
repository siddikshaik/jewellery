/* ---------- route: inventory (gold and silver pieces in stock) ----------
   One record per piece, with its own tag and HUID. Net weight, value and "sold" are derived: a piece is sold when an invoice item points at it. */
let stMetal='all',stStatus='instock',qStock='';

ROUTES.inventory={
  html(p){
    if(!p.length)return inventoryHTML();
    if(!can('inventory','edit')){go('inventory');return null}
    if(p[0]==='new'){if(!draftStock||!draftStock.isNew)draftStock=newStock();return stockFormHTML(draftStock)}
    const it=S.inventory.find(x=>x.id===p[0]);
    if(!it){if(!ready)return LOADING;go('inventory');return null}
    if(!draftStock||draftStock.id!==it.id)draftStock=clone(it);
    return stockFormHTML(draftStock);
  },
  bind(p){p.length?bindStockForm(draftStock):bindInventory()}
};

/* today's rate for a piece's purity, 0 when no rate is set */
const stockRate=s=>s.metal==='Silver'?num(S.rates.silver):num((S.rates.gold||{})[goldKey(s.purity)]);
const stockValue=s=>stockNet(s)*stockRate(s);
const needsHuid=s=>s.metal==='Gold'&&!s.huid;

function inventoryHTML(){
  const q=qStock.toLowerCase(),edit=can('inventory','edit');
  const all=S.inventory.map(s=>({s,sold:isSold(s.id)}));
  const inStock=all.filter(x=>!x.sold);
  const sum=m=>inStock.filter(x=>x.s.metal===m).reduce((a,x)=>a+stockNet(x.s),0);
  const value=inStock.reduce((a,x)=>a+stockValue(x.s),0);
  const noHuid=inStock.filter(x=>needsHuid(x.s)).length;
  const list=all.filter(x=>(stMetal==='all'||x.s.metal===stMetal)&&(stStatus==='all'||(stStatus==='sold')===x.sold)
    &&(!q||x.s.tag.toLowerCase().includes(q)||x.s.name.toLowerCase().includes(q)||(x.s.huid||'').toLowerCase().includes(q)||(x.s.category||'').toLowerCase().includes(q)||(x.s.notes||'').toLowerCase().includes(q)))
    .sort((a,b)=>b.s.addedOn.localeCompare(a.s.addedOn)||b.s.tag.localeCompare(a.s.tag));
  const row=x=>{const s=x.s,inv=x.sold?soldBy(s.id):null;
    return`<div class="item" data-open="${esc(s.tag)}" role="link" tabindex="0">
      <label class="check sel"><input type="checkbox" data-sel="${s.id}"${tagSel.has(s.id)?' checked':''} aria-label="Select ${esc(s.tag)}"></label>
      <div class="main"><b>${esc(s.tag)} · ${esc(s.name||s.category)}${sampleTag(s)}</b>
      <span class="sub">${esc(s.category)} · ${esc(s.metal)} ${esc(hallmarkMark(s.metal,s.purity))} · gross ${wt(num(s.gross))} g · net ${wt(stockNet(s))} g${s.notes?' · '+esc(s.notes):''}</span></div>
      <div class="row">${s.huid?`<span class="pill huid">HUID ${esc(s.huid)}</span>`:needsHuid(s)?'<span class="pill part">No HUID</span>':''}
      ${x.sold?`<span class="pill due">Sold${inv?' · '+esc(inv.no):''}</span>`:'<span class="pill paid">In stock</span>'}
      <span class="amt" title="Metal value at today's rate">${stockRate(s)>0?inr(stockValue(s)):'<span class="muted">No rate</span>'}</span></div>
      ${edit?`<div class="row"><button class="btn sm" data-edit="${s.id}">Edit</button><button class="btn sm danger" data-del="${s.id}">Delete</button></div>`:''}</div>`};
  const nSel=[...tagSel].filter(id=>S.inventory.some(s=>s.id===id)).length;
  return`<header class="page"><div><h1>Inventory</h1><p class="sub">Gold and silver pieces in stock. Each has a tag, a HUID and a QR code. Pick a piece on an invoice to mark it sold.</p></div>
    <div class="row"><a class="btn" href="#/scan">Scan a tag</a>${edit?'<button class="btn primary" id="newStock">Add item</button>':''}</div></header>
  <div class="stack"><div class="tiles">${tile('Items in stock',inStock.length,'',`of ${all.length} recorded`)}${tile('Gold in stock',wt(sum('Gold'))+' g','','net weight')}${tile('Silver in stock',wt(sum('Silver'))+' g','','net weight')}${tile('Stock value',inr(value),'',"metal at today's rates")}${tile('Gold without HUID',noHuid,noHuid?'bad':'good',noHuid?'add before selling':'all in stock have one')}</div>
  <div class="bar" style="margin:0"><div class="row"><div class="seg" id="stM">${[['all','All'],['Gold','Gold'],['Silver','Silver']].map(([k,l])=>`<button data-m="${k}" aria-pressed="${stMetal===k}">${l}</button>`).join('')}</div>
    <div class="seg" id="stS">${[['instock','In stock'],['sold','Sold'],['all','All']].map(([k,l])=>`<button data-s="${k}" aria-pressed="${stStatus===k}">${l}</button>`).join('')}</div></div>
    <input id="q" type="search" placeholder="Search tag, HUID, name, category" value="${esc(qStock)}" style="width:260px"></div>
  <div class="bar" style="margin:0"><span class="set-note">${nSel?nSel+' selected':'Tick pieces to print their tags.'}</span>
    <div class="row"><button class="btn sm" id="selAll">Select all shown</button><button class="btn sm primary" id="printTags"${nSel?'':' disabled'}>Print tags${nSel?' ('+nSel+')':''}</button></div></div>
  <div class="list">${list.length?list.map(row).join(''):`<div class="empty">${S.inventory.length?'No items match this filter.':'No stock recorded yet.'+(edit?' Choose Add item to record your first piece, or add pieces from a purchase.':'')}</div>`}</div></div>`;
}
function bindInventory(){
  const nb=$('#newStock');if(nb)nb.onclick=()=>{draftStock=null;go('inventory/new')};
  $('#stM').onclick=e=>{const b=e.target.closest('[data-m]');if(!b)return;stMetal=b.dataset.m;render()};
  $('#stS').onclick=e=>{const b=e.target.closest('[data-s]');if(!b)return;stStatus=b.dataset.s;render()};
  $('#q').oninput=e=>{qStock=e.target.value;const p=e.target.selectionStart;render();const q=$('#q');q.focus();q.setSelectionRange(p,p)};
  $$('.item[data-open]').forEach(el=>{
    const open=()=>go('item/'+encodeURIComponent(el.dataset.open));
    el.onclick=e=>{if(e.target.closest('button,input,label'))return;open()};
    el.onkeydown=e=>{if(e.key==='Enter'&&e.target===el)open()};
  });
  $$('[data-sel]').forEach(c=>c.onchange=()=>{c.checked?tagSel.add(c.dataset.sel):tagSel.delete(c.dataset.sel);render()});
  $('#selAll').onclick=()=>{$$('[data-sel]').forEach(c=>tagSel.add(c.dataset.sel));render()};
  $('#printTags').onclick=()=>go('tags');
  $$('[data-edit]').forEach(b=>b.onclick=()=>{draftStock=null;go('inventory/'+b.dataset.edit)});
  $$('[data-del]').forEach(b=>b.onclick=()=>{
    if(isSold(b.dataset.del))return toast('This piece is on an invoice, so it cannot be deleted');
    if(b.dataset.arm!=='1'){b.dataset.arm='1';b.textContent='Confirm';return}
    tagSel.delete(b.dataset.del);S.inventory=S.inventory.filter(s=>s.id!==b.dataset.del);persist();render();toast('Item deleted')});
}

function stockFormHTML(s){
  const f=(k,l,extra='')=>`<label>${l}<input data-k="${k}" type="number" min="0" step="any" inputmode="decimal" value="${esc(s[k])}" ${extra}></label>`;
  const sold=!s.isNew&&isSold(s.id),inv=sold?soldBy(s.id):null,pu=s.purchaseId&&can('purchases')?purchaseOf(s.purchaseId):null;
  return`<header class="page"><div><h1>${s.isNew?'Add item':'Edit '+esc(s.tag)}</h1>${sold?`<p class="sub">Sold${inv?' on '+esc(inv.no):''}. Changing it here does not change that invoice.</p>`:''}${pu?`<p class="sub">Bought on <a href="#/purchases/${pu.id}">${esc(pu.no)}</a>.</p>`:''}</div>
    <div class="row"><button class="btn" id="st_cancel">Cancel</button><button class="btn primary" id="st_save">Save item</button></div></header>
  <div class="stack narrow"><div class="panel stack"><div class="grid wide">
    <label>Tag<input data-k="tag" value="${esc(s.tag)}"></label>
    <label>Item name<input data-k="name" placeholder="e.g. Gold necklace, 22K" value="${esc(s.name)}"></label>
    <label>Category<select data-k="category">${CATEGORIES.map(c=>`<option${c===s.category?' selected':''}>${c}</option>`).join('')}</select></label>
    <label>Date added<input data-k="addedOn" type="date" value="${esc(s.addedOn)}"></label>
    <label>Metal<select data-k="metal"><option${s.metal==='Gold'?' selected':''}>Gold</option><option${s.metal==='Silver'?' selected':''}>Silver</option></select></label>
    <label>Purity<select data-k="purity">${PURITY[s.metal].map(p=>`<option${p===s.purity?' selected':''}>${p}</option>`).join('')}</select></label>
    <label>HUID (6 letters or digits)<input data-k="huid" maxlength="6" autocapitalize="characters" spellcheck="false" placeholder="e.g. AB12CD" value="${esc(s.huid)}"></label>
    <label>Hallmark purity mark<input id="st_mark" readonly value="${esc(hallmarkMark(s.metal,s.purity))}"></label></div>
    <p class="set-note" id="st_huidnote"></p>
    <div class="sub-h">Weights (grams)</div>
    <div class="grid">${f('gross','Gross weight')}${f('stoneWt','Stones weight')}${f('beadsWt','Beads weight')}<label>Net weight<input id="st_net" readonly value="0.000"></label></div>
    <div class="sub-h">Default charges, copied to an invoice when you pick this piece</div>
    <div class="grid">${f('makingPct','Making (% of net weight)')}${f('stone','Stone charges (₹)')}${f('beads','Beads charges (₹)')}<label>Metal value today (₹)<input id="st_val" readonly value="0.00"></label></div>
    <label>Notes<textarea data-k="notes" placeholder="Optional: design number, supplier, location in the shop">${esc(s.notes)}</textarea></label></div></div>`;
}
function bindStockForm(s){
  const refresh=()=>{
    $('#st_net').value=wt(stockNet(s));$('#st_val').value=fmt(stockValue(s));$('#st_mark').value=hallmarkMark(s.metal,s.purity);
    $('#st_huidnote').textContent=s.huid&&!huidOk(s.huid)?'A HUID has exactly 6 letters or digits.':needsHuid(s)?'Gold needs a HUID before it can be sold. Add it once the piece is back from the hallmarking centre.':'';
  };
  refresh();
  $$('[data-k]').forEach(e=>e.oninput=ev=>{
    if(e.dataset.k==='huid'){s.huid=cleanHuid(ev.target.value);ev.target.value=s.huid;refresh();return}
    s[e.dataset.k]=ev.target.value;
    if(e.dataset.k==='metal'){s.purity=s.metal==='Silver'?PURITY.Silver[1]:'22K';if(s.isNew)s.tag=nextTag(s.metal);render();return}
    if(e.dataset.k==='purity'){refresh();return}
    refresh();
  });
  $('#st_cancel').onclick=()=>{draftStock=null;go('inventory')};
  $('#st_save').onclick=()=>{
    s.tag=s.tag.trim();s.name=s.name.trim();
    if(!s.tag)return toast('Enter a tag');
    if(S.inventory.some(x=>x.tag===s.tag&&x.id!==s.id))return toast('That tag is already used');
    if(s.huid&&!huidOk(s.huid))return toast('A HUID has exactly 6 letters or digits');
    if(s.huid&&S.inventory.some(x=>x.huid===s.huid&&x.id!==s.id))return toast('HUID '+s.huid+' is already on another piece');
    if(!s.name)return toast('Enter the item name');
    if(num(s.gross)-num(s.stoneWt)-num(s.beadsWt)<0)return toast('Stones and beads weight cannot exceed gross weight');
    if(stockNet(s)<=0)return toast('Enter the gross weight');
    const rec={...s};delete rec.isNew;
    const i=S.inventory.findIndex(x=>x.id===rec.id);if(i>=0)S.inventory[i]=rec;else S.inventory.push(rec);
    persist();draftStock=null;go('inventory');toast('Item saved');
  };
}
