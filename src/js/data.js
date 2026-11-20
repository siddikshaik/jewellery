/* ---------- state: S = {settings, rates, customers[], invoices[]}. Each key is its own JSON file (see docs/DATA_MODEL.md). ---------- */
const COLLECTIONS=['settings','rates','customers','invoices','inventory','suppliers','purchases'];
const LISTS=['customers','invoices','inventory','suppliers','purchases'];   /* saved one record at a time; settings and rates are saved whole */
const SUPPLIER_TYPES=['Wholesaler','Manufacturer / karigar','Bullion dealer','Old gold from customer','Other'];
const CATEGORIES=['Chain','Necklace','Ring','Bangle','Bracelet','Earrings','Pendant','Anklet','Coin','Bar','Other'];
const DEFAULT_MODES=['Cash','UPI','Card','Bank transfer','Cheque'];
const DEFAULT_QUICK=['Hallmark charges','Courier charges','Packing charges','Insurance'];
const defaults=()=>({
  settings:{
    store:{name:'Your Jewellery Store',address:'12, Main Bazaar\nCity - 600001',phone:'',gstin:'',logo:'',appUrl:''},
    invoice:{prefix:'INV-',next:1,cgst:1.5,sgst:1.5,template:'classic',requireHuid:false,terms:'Goods once sold will not be taken back. Subject to local jurisdiction.'},
    purchase:{prefix:'PUR-',next:1,cgst:1.5,sgst:1.5},
    app:{paymentModes:[...DEFAULT_MODES],quickCharges:[...DEFAULT_QUICK]}
  },
  rates:{gold:{'24K':7500,'22K':6875,'18K':'','14K':'','9K':''},silver:95,date:''},
  customers:[],invoices:[],inventory:[],suppliers:[],purchases:[]
});
let S=defaults();

const custOf=id=>S.customers.find(c=>c.id===id);
const storeOf=()=>({...S.settings.store,terms:S.settings.invoice.terms});
const tplOf=inv=>TEMPLATES[inv.template]?inv.template:(TEMPLATES[S.settings.invoice.template]?S.settings.invoice.template:'classic');
const modes=()=>S.settings.app.paymentModes;
function newItem(){return{id:uid(),name:'',metal:'Gold',purity:'22K',huid:'',gross:'',stoneWt:'',beadsWt:'',makingPct:'',stone:'',beads:''}}
function newInvoice(){
  const s=S.settings.invoice,r=S.rates;
  return{id:uid(),no:nextInvoiceNo(),date:today(),customerId:'',goldRates:{...r.gold},silverRate:r.silver,
    cgst:s.cgst,sgst:s.sgst,payments:[],notes:'',items:[newItem()],charges:[],isNew:true};
}
/* next invoice number: one past the highest used with this prefix ("Start numbering from" in Settings is only the floor) */
function nextInvoiceNo(){
  const s=S.settings.invoice;let max=Math.max(0,(+s.next||1)-1);
  S.invoices.forEach(i=>{if(String(i.no).startsWith(s.prefix)){const m=String(i.no).slice(s.prefix.length).match(/^(\d+)$/);if(m)max=Math.max(max,+m[1])}});
  return s.prefix+String(max+1).padStart(4,'0');
}
function nextTag(metal){
  const p=metal==='Silver'?'S-':'G-';let max=0;
  S.inventory.forEach(i=>{const m=String(i.tag).match(/^[GS]-(\d+)$/);if(m&&String(i.tag).startsWith(p))max=Math.max(max,+m[1])});
  return p+String(max+1).padStart(4,'0');
}
function newStock(metal='Gold'){
  return{id:uid(),tag:nextTag(metal),name:'',category:'Chain',metal,purity:metal==='Silver'?PURITY.Silver[1]:'22K',gross:'',stoneWt:'',beadsWt:'',makingPct:'',stone:'',beads:'',huid:'',notes:'',addedOn:today(),isNew:true};
}
/* a stock item is sold when an invoice item points at it (derived; nothing is stored on the stock item) */
const soldBy=(stockId,exceptInvId)=>S.invoices.find(i=>i.id!==exceptInvId&&(i.items||[]).some(x=>x.stockId===stockId));
const isSold=id=>!!soldBy(id)||serverSold.includes(id);
/* purchases */
function nextPurchaseNo(){
  const s=S.settings.purchase;let max=Math.max(0,(+s.next||1)-1);
  S.purchases.forEach(i=>{if(String(i.no).startsWith(s.prefix)){const m=String(i.no).slice(s.prefix.length).match(/^(\d+)$/);if(m)max=Math.max(max,+m[1])}});
  return s.prefix+String(max+1).padStart(4,'0');
}
function newPurchaseItem(kind='Piece'){
  const metal='Gold',purity='22K';
  return{id:uid(),kind,name:'',category:'Chain',metal,purity,huid:'',gross:'',stoneWt:'',beadsWt:'',rate:S.rates.gold[purity]||'',makingPct:'',stone:'',beads:'',addStock:true};
}
function newPurchase(){
  const s=S.settings.purchase;
  return{id:uid(),no:nextPurchaseNo(),billNo:'',date:today(),supplierId:'',cgst:s.cgst,sgst:s.sgst,items:[newPurchaseItem()],charges:[],payments:[],notes:'',isNew:true};
}
const newSupplier=()=>({id:uid(),name:'',type:SUPPLIER_TYPES[0],phone:'',email:'',gstin:'',address:'',isNew:true});
const supplierOf=id=>S.suppliers.find(s=>s.id===id);
const purchaseOf=id=>S.purchases.find(p=>p.id===id);
/* what a piece cost: the amount (before GST) on the purchase line that brought it in. Derived; null when it was not bought through Purchases. */
function pieceCost(piece){
  const p=piece.purchaseId&&purchaseOf(piece.purchaseId);if(!p)return null;
  const row=pcalc(p).rows.find(r=>r.id===piece.purchaseItemId);
  return row?row.amount:null;
}
const newCustomer=()=>({id:uid(),name:'',phone:'',email:'',instagram:'',address:'',gstin:'',isNew:true});

/* ---------- migrations: any change to the stored shape needs a line here ---------- */
function migrateInvoice(inv){
  inv.charges=Array.isArray(inv.charges)?inv.charges:[];
  if(!inv.goldRates){inv.goldRates=allGold(num(inv.goldRate));delete inv.goldRate}
  inv.items=(inv.items||[]).map(it=>{
    const n={...it};
    if(n.gross===undefined)n.gross=n.weight??'';
    n.stoneWt=n.stoneWt??'';n.beadsWt=n.beadsWt??'';n.huid=n.huid??'';
    if(num(n.other)>0){inv.charges.push({id:uid(),label:'Other charges',amount:num(n.other)})}
    if(n.metal!=='Silver')n.purity=goldKey(n.purity);
    if(n.makingPct===undefined){/* older invoices stored a making amount: convert to the equal percentage */
      const value=Math.max(0,num(n.gross)-num(n.stoneWt)-num(n.beadsWt))*rateFor(inv,n);
      n.makingPct=value>0?+(num(n.making)/value*100).toFixed(4):0;
    }
    delete n.weight;delete n.other;delete n.making;return n;
  });
  if(!Array.isArray(inv.payments)){inv.payments=[];
    if(inv.status==='Paid')inv.payments.push({id:uid(),date:inv.date,amount:calc(inv).total,mode:'Cash',note:''})}
  delete inv.status;
  return inv;
}
const migrateStock=s=>({huid:'',...s});
const migratePurchase=p=>({...p,items:Array.isArray(p.items)?p.items:[],charges:Array.isArray(p.charges)?p.charges:[],payments:Array.isArray(p.payments)?p.payments:[]});
/* accepts the current shape, the old flat-settings shape (v1: one object with settings.name, settings.goldRates ...) or nothing */
function normalize(d){
  if(!d||typeof d!=='object')return null;
  if(!COLLECTIONS.some(k=>d[k]!=null))return null;
  const b=defaults(),ds=d.settings||{};
  const store={...b.settings.store},inv={...b.settings.invoice},app={...b.settings.app},pur={...b.settings.purchase};
  if(ds.store||ds.invoice||ds.app||ds.purchase){Object.assign(store,ds.store);Object.assign(inv,ds.invoice);Object.assign(app,ds.app);Object.assign(pur,ds.purchase)}
  else{Object.keys(store).forEach(k=>{if(ds[k]!==undefined)store[k]=ds[k]});Object.keys(inv).forEach(k=>{if(ds[k]!==undefined)inv[k]=ds[k]})}
  delete app.theme;
  app.paymentModes=Array.isArray(app.paymentModes)&&app.paymentModes.length?app.paymentModes.map(String):[...DEFAULT_MODES];
  app.quickCharges=Array.isArray(app.quickCharges)?app.quickCharges.map(String):[...DEFAULT_QUICK];
  let rates;
  if(d.rates&&typeof d.rates==='object')rates={gold:Object.fromEntries(GK.map(k=>[k,(d.rates.gold||{})[k]??''])),silver:d.rates.silver??'',date:d.rates.date||''};
  else rates={gold:ds.goldRates?Object.fromEntries(GK.map(k=>[k,ds.goldRates[k]??''])):ds.goldRate?allGold(num(ds.goldRate)):b.rates.gold,
    silver:ds.silverRate!==undefined?ds.silverRate:b.rates.silver,date:ds.ratesDate||''};
  return{settings:{store,invoice:inv,purchase:pur,app},rates,customers:Array.isArray(d.customers)?d.customers:[],invoices:(Array.isArray(d.invoices)?d.invoices:[]).map(migrateInvoice),inventory:Array.isArray(d.inventory)?d.inventory.map(migrateStock):[],suppliers:Array.isArray(d.suppliers)?d.suppliers:[],purchases:Array.isArray(d.purchases)?d.purchases.map(migratePurchase):[]};
}
