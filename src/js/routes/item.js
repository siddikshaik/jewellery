/* ---------- routes: item details (what a scanned QR opens), scan, printable tags ----------
   Every stock piece has a QR code. It holds a link to this app plus the facts printed on the tag:
     <app address>/#/item/<tag>?s=<store>&h=<HUID>&g=<gross g>&n=<net g>&p=<purity mark>
   Any phone camera opens the link. In the app it shows the live record, and warns when the tag was printed with different details. */
let tagSel=new Set(),tagSize='a4';

ROUTES.item={
  html(p){
    const tag=p[0]||'';
    if(!ready)return LOADING;
    const piece=S.inventory.find(s=>s.tag===tag)||S.inventory.find(s=>s.tag.toLowerCase()===tag.toLowerCase());
    const q=route.query;
    if(q.get('s')&&storeIdNow()&&q.get('s')!==storeIdNow())return`<div class="empty"><b>This tag belongs to another store</b><p style="margin-top:6px">Sign in with an account of that store to open it.</p></div>`;
    if(!piece)return`<header class="page"><h1>${esc(tag)}</h1></header><div class="empty"><b>No item with this tag in your store</b><p style="margin-top:6px">It may have been deleted, or the tag belongs to another store.</p><p style="margin-top:12px"><a class="btn primary" href="#/inventory">Open Inventory</a> <a class="btn" href="#/scan">Scan another</a></p></div>`;
    return pieceHTML(piece,q);
  },
  bind(p){
    const piece=S.inventory.find(s=>s.tag===p[0])||S.inventory.find(s=>s.tag.toLowerCase()===String(p[0]).toLowerCase());
    if(piece&&$('#pc_print'))bindPiece(piece);   /* the "other store" message has no buttons */
  }
};
const storeIdNow=()=>monitor?monitor.id:(ME&&ME.storeId)||'';
function appBase(){
  const set=(S.settings.store.appUrl||'').trim().replace(/\/+$/,'');
  if(set)return set;
  return((typeof location!=='undefined'&&location.origin)||'')+(((typeof location!=='undefined'&&location.pathname)||'/').replace(/index\.html$/,'').replace(/\/+$/,''));
}
const isLocalBase=()=>/^(https?:\/\/)?(localhost|127\.|\[::1\])/i.test(appBase());
/* the text inside a piece's QR code */
function tagPayload(s){
  const q=new URLSearchParams();
  if(storeIdNow())q.set('s',storeIdNow());
  if(s.huid)q.set('h',s.huid);
  q.set('g',wt(num(s.gross)));q.set('n',wt(stockNet(s)));q.set('p',hallmarkMark(s.metal,s.purity));
  return appBase()+'/#/item/'+encodeURIComponent(s.tag)+'?'+q.toString();
}
/* read a scanned or typed text: a tag link, a bare tag, or a bare HUID */
function parseScan(text){
  text=String(text||'').trim();
  const m=text.match(/#\/item\/([^?#\s]+)(?:\?(\S*))?/);
  if(m){const q=new URLSearchParams(m[2]||'');return{tag:decodeURIComponent(m[1]),store:q.get('s'),huid:q.get('h'),gross:q.get('g'),net:q.get('n'),purity:q.get('p')}}
  const up=text.toUpperCase();
  if(up&&S.inventory.some(s=>s.tag.toUpperCase()===up))return{tag:S.inventory.find(s=>s.tag.toUpperCase()===up).tag};
  if(/^[A-Z0-9]{6}$/.test(up))return{huid:up};
  return null;
}
function findScanned(sc){
  if(!sc)return null;
  return(sc.tag&&S.inventory.find(s=>s.tag===sc.tag))||(sc.huid&&S.inventory.find(s=>s.huid===sc.huid))||null;
}

/* ----- item details page ----- */
function pieceHTML(s,q){
  const sold=isSold(s.id),inv=sold?soldBy(s.id):null,rate=stockRate(s),mark=hallmarkMark(s.metal,s.purity);
  const cost=can('purchases')?pieceCost(s):null,pu=s.purchaseId&&can('purchases')?purchaseOf(s.purchaseId):null,sup=pu&&supplierOf(pu.supplierId);
  const edit=can('inventory','edit');
  /* compare the tag that was scanned with the record as it is now */
  const diffs=[];
  if(q.get('n')!==null&&q.get('n')!==wt(stockNet(s)))diffs.push('net weight '+q.get('n')+' g (now '+wt(stockNet(s))+' g)');
  if(q.get('g')!==null&&q.get('g')!==wt(num(s.gross)))diffs.push('gross weight '+q.get('g')+' g (now '+wt(num(s.gross))+' g)');
  if(q.get('h')!==null&&(q.get('h')||'')!==(s.huid||''))diffs.push('HUID '+(q.get('h')||'none')+' (now '+(s.huid||'none')+')');
  if(q.get('p')!==null&&q.get('p')!==mark)diffs.push('purity '+q.get('p')+' (now '+mark+')');
  const kv=(k,v)=>`<div class="kv"><span>${k}</span><span>${v}</span></div>`;
  return`<header class="page"><div><a href="#/inventory" class="btn sm" style="margin-bottom:14px">‹ Inventory</a><h1>${esc(s.tag)}</h1><p class="sub">${esc(s.name||s.category)} · ${esc(s.category)}</p></div>
    <div class="row">${edit?`<a class="btn" href="#/inventory/${s.id}">Edit</a>`:''}<button class="btn" id="pc_print">Print tag</button>${can('invoices','edit')&&!sold?'<button class="btn primary" id="pc_bill">Bill this piece</button>':''}</div></header>
  ${diffs.length?`<div class="monitor" style="background:var(--bad-soft);color:var(--bad)"><span><b>This tag was printed with different details:</b> ${esc(diffs.join('; '))}. Reprint the tag.</span></div>`:''}
  <div class="grid wide piece-grid"><div class="panel">
    ${kv('Status',sold?`<span class="pill due">Sold${inv?' · '+(can('invoices')?`<a href="#/invoices/${inv.id}">${esc(inv.no)}</a>`:esc(inv.no)):''}</span>`:'<span class="pill paid">In stock</span>')}
    ${kv('Metal and purity',esc(s.metal)+' '+esc(s.purity)+' · hallmark '+esc(mark))}
    ${kv('HUID',s.huid?`<b class="mono">${esc(s.huid)}</b>`:(s.metal==='Gold'?'<span class="pill part">Missing: gold must carry a HUID to be sold</span>':'<span class="muted">Not recorded</span>'))}
    ${kv('Gross weight',wt(num(s.gross))+' g')}${kv('Stones and beads',wt(num(s.stoneWt))+' g + '+wt(num(s.beadsWt))+' g')}${kv('Net weight','<b>'+wt(stockNet(s))+' g</b>')}
    ${kv('Metal value today',rate>0?inr(stockValue(s)):'<span class="muted">No rate set</span>')}
    ${s.makingPct||s.stone||s.beads?kv('Default charges',`${num(s.makingPct)}% making · stone ${inr(num(s.stone))} · beads ${inr(num(s.beads))}`):(edit&&!sold?kv('Selling charges','<span class="muted">No making charge set. Add one in Edit so billing includes it.</span>'):'')}
    ${cost!=null?kv('Bought for',inr(cost)+' before GST'+(pu?` · <a href="#/purchases/${pu.id}">${esc(pu.no)}</a>`:'')+(sup?' · '+esc(sup.name):'')):''}
    ${kv('Added on',dmy(s.addedOn))}${s.notes?kv('Notes',esc(s.notes)):''}
    <p class="set-note" style="margin-top:12px">Check a HUID on the BIS Care app. It shows the purity and the jeweller the piece was hallmarked for.</p></div>
  <div class="panel qr-card"><div class="qr-box" id="pc_qr">${qrSVG(tagPayload(s),{margin:2})}</div>
    <b class="mono" style="font-size:18px">${esc(s.tag)}</b>
    <span class="set-note">${esc(hallmarkMark(s.metal,s.purity))} · gross ${wt(num(s.gross))} g · net ${wt(stockNet(s))} g${s.huid?' · HUID '+esc(s.huid):''}</span>
    <code class="payload" id="pc_payload">${esc(tagPayload(s))}</code>
    <div class="row" style="justify-content:center"><button class="btn sm" id="pc_copy">Copy link</button></div>
    ${isLocalBase()?'<p class="set-note" style="color:var(--warn)">This link starts with localhost, so a phone cannot open it. Set the app address in Settings → Store details.</p>':''}</div></div>`;
}
function bindPiece(s){
  $('#pc_print').onclick=()=>{tagSel=new Set([s.id]);go('tags')};
  const b=$('#pc_bill');if(b)b.onclick=()=>{draft=newInvoice();applyStockToItem(draft.items[0],s);ratesOpen=false;go('invoices/new')};
  $('#pc_copy').onclick=async()=>{try{await navigator.clipboard.writeText(tagPayload(s));toast('Link copied')}catch(e){toast('Copy is blocked here. Select the link and copy it.')}};
}

/* ----- scan: camera where the browser can read QR codes, otherwise type, paste or use a USB scanner ----- */
let scanStream=null,scanTimer=null;
function stopScan(){
  clearInterval(scanTimer);scanTimer=null;
  if(scanStream){scanStream.getTracks().forEach(t=>t.stop());scanStream=null}
}
ROUTES.scan={
  html(){
    const cam=typeof window!=='undefined'&&'BarcodeDetector' in window&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia;
    return`<header class="page"><div><h1>Scan a tag</h1><p class="sub">Open a piece from its QR code, tag number or HUID.</p></div><a class="btn" href="#/inventory">Inventory</a></header>
    <div class="stack narrow">${cam?`<div class="panel stack"><video id="sc_video" class="scan-video" playsinline muted></video><p class="set-note" id="sc_status">Starting the camera…</p></div>`
      :'<div class="panel"><p class="set-note">This browser cannot read QR codes inside the page. Scan with your phone\'s camera app, which opens the item directly, or use a USB scanner or type below.</p></div>'}
    <div class="panel stack"><h2 style="margin:0">Type or paste</h2><label>Tag number, HUID, or the text a scanner reads<input id="sc_text" autocomplete="off" autocapitalize="characters" placeholder="G-0001  or  AB12CD" autofocus></label>
      <div class="row"><button class="btn primary" id="sc_go">Open item</button></div></div></div>`;
  },
  bind(){
    const open=text=>{
      const sc=parseScan(text),piece=findScanned(sc);
      if(sc&&sc.store&&storeIdNow()&&sc.store!==storeIdNow())return toast('That tag belongs to another store'),false;
      if(!piece)return toast(sc?'No item found for that tag':'That is not a tag or HUID'),false;
      stopScan();go('item/'+encodeURIComponent(piece.tag)+(text.includes('#/item/')?'?'+(text.split('?')[1]||''):''));return true};
    $('#sc_go').onclick=()=>open($('#sc_text').value);
    $('#sc_text').onkeydown=e=>{if(e.key==='Enter')open(e.target.value)};
    const v=$('#sc_video');if(!v||typeof BarcodeDetector==='undefined')return;
    const st=t=>{const e=$('#sc_status');if(e)e.textContent=t};
    navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}).then(stream=>{
      if(route.name!=='scan'){stream.getTracks().forEach(t=>t.stop());return}
      scanStream=stream;v.srcObject=stream;v.play();st('Point the camera at a tag.');
      const det=new BarcodeDetector({formats:['qr_code']});let busy=false;
      scanTimer=setInterval(async()=>{
        if(busy||v.readyState<2)return;busy=true;
        try{const r=await det.detect(v);if(r.length&&open(r[0].rawValue)){}}catch(e){}
        busy=false;
      },300);
    }).catch(()=>st('The camera is not available here (it needs https or localhost and your permission). Type the tag below instead.'));
  }
};

/* ----- printable tags ----- */
ROUTES.tags={
  html(){
    const pieces=S.inventory.filter(s=>tagSel.has(s.id));
    if(!pieces.length){go('inventory');return null}
    const name=S.settings.store.name;
    const label=s=>`<div class="tag-label"><div class="tag-qr">${qrSVG(tagPayload(s),{margin:1})}</div><div class="tag-text">
      <span class="tag-store">${esc(name)}</span><b class="tag-no">${esc(s.tag)}</b>${s.huid?`<span class="tag-huid">HUID ${esc(s.huid)}</span>`:'<span class="tag-huid none">HUID —</span>'}
      <span class="tag-w">G ${wt(num(s.gross))} g · N ${wt(stockNet(s))} g</span><span class="tag-p">${esc(hallmarkMark(s.metal,s.purity))}</span></div></div>`;
    return`<div class="tag-controls"><header class="page"><div><h1>Print tags</h1><p class="sub">${pieces.length} tag${pieces.length===1?'':'s'}. Each QR code holds the tag number, HUID, gross and net weight and purity, and opens the item when scanned.</p></div>
      <div class="row"><a class="btn" href="#/inventory">Back</a><label style="flex-direction:row;align-items:center;gap:8px">Paper<select id="tg_size" style="width:auto"><option value="a4"${tagSize==='a4'?' selected':''}>A4 sheet, 3 across</option><option value="roll"${tagSize==='roll'?' selected':''}>Label roll, 60 × 30 mm</option></select></label><button class="btn primary" id="tg_print">Print</button></div></header>
      ${isLocalBase()?'<div class="monitor"><span>The QR codes point at <b>localhost</b>, which phones cannot open. Set the app address in Settings → Store details first.</span></div>':''}</div>
    <div class="tag-sheet ${tagSize}" id="tg_sheet">${pieces.map(label).join('')}</div>`;
  },
  bind(){
    $('#tg_size').onchange=e=>{tagSize=e.target.value;render()};
    $('#tg_print').onclick=()=>{
      let st=document.getElementById('tg_page');if(!st){st=document.createElement('style');st.id='tg_page';document.head.appendChild(st)}
      st.textContent=tagSize==='roll'?'@page{size:60mm 30mm;margin:0}':'@page{size:A4;margin:10mm}';
      window.print();
    };
  }
};
