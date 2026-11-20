/* ---------- sample data: lets a store owner see the whole app working, then take it away again ----------
   Every sample record carries sample:true, so removal only ever touches those. The set covers customers, suppliers, purchase bills
   (with payments), stock (some bought through a bill, some not, some without a HUID), and invoices over the last months with a mix of
   paid, part-paid and unpaid, so Invoices, Customers, Inventory, Purchases and all four Analytics tabs have something to show.
   Rates: the owner gives only the 24K gold rate and the silver rate; 22K is 92% and 18K is 75% of 24K. They can change them later in Settings. */
const SAMPLE_PCT={'22K':.92,'18K':.75};
const SAMPLE_LISTS=['customers','invoices','inventory','suppliers','purchases'];
const round2=n=>Math.round(n*100)/100;
function sampleRates(r24){return{'24K':round2(r24),'22K':round2(r24*SAMPLE_PCT['22K']),'18K':round2(r24*SAMPLE_PCT['18K'])}}
const sampleTag=x=>x&&x.sample?' <span class="pill sample">Sample</span>':'';
const hasSample=()=>SAMPLE_LISTS.some(n=>S[n].some(x=>x.sample));
const storeIsEmpty=()=>SAMPLE_LISTS.every(n=>S[n].length===0);
const sampleCounts=()=>Object.fromEntries(SAMPLE_LISTS.map(n=>[n,S[n].filter(x=>x.sample).length]));

/* a plain, believable shop: day offsets are "days ago" so the charts always cover the recent months */
const SAMPLE_PIECES={
  p1:{name:'Gold chain 22K',category:'Chain',metal:'Gold',purity:'22K',gross:'12.500',mk:'8',huid:1},
  p2:{name:'Bridal necklace set',category:'Necklace',metal:'Gold',purity:'22K',gross:'48.200',stoneWt:'2.100',beadsWt:'0.800',mk:'12',stone:'350',huid:2},
  p3:{name:'Plain bangle pair',category:'Bangle',metal:'Gold',purity:'22K',gross:'36.000',mk:'9',huid:3},
  p4:{name:'Jhumka earrings',category:'Earrings',metal:'Gold',purity:'22K',gross:'9.400',stoneWt:'0.600',beadsWt:'0.300',mk:'14',stone:'180',huid:4},
  p5:{name:'Gold ring',category:'Ring',metal:'Gold',purity:'22K',gross:'5.800',stoneWt:'0.200',mk:'10',stone:'60',huid:5},
  p6:{name:'Temple pendant',category:'Pendant',metal:'Gold',purity:'22K',gross:'7.200',stoneWt:'0.500',beadsWt:'0.200',mk:'13',stone:'120',huid:6},
  p7:{name:'Gold bracelet',category:'Bracelet',metal:'Gold',purity:'22K',gross:'14.600',mk:'9'},
  p8:{name:'Stone ring 18K',category:'Ring',metal:'Gold',purity:'18K',gross:'4.900',stoneWt:'0.400',mk:'16',stone:'450',huid:8},
  p9:{name:'Light chain 18K',category:'Chain',metal:'Gold',purity:'18K',gross:'8.300',mk:'11'},
  p10:{name:'Gold coin 10 g',category:'Coin',metal:'Gold',purity:'24K',gross:'10.000',mk:'3',huid:10},
  s1:{name:'Silver anklet pair',category:'Anklet',metal:'Silver',purity:'925 Sterling',gross:'62.000',mk:'12'},
  s2:{name:'Silver pooja plate',category:'Other',metal:'Silver',purity:'925 Sterling',gross:'148.000',mk:'10'},
  s3:{name:'Silver chain',category:'Chain',metal:'Silver',purity:'925 Sterling',gross:'28.000',mk:'14'},
  s4:{name:'Silver bangles set',category:'Bangle',metal:'Silver',purity:'925 Sterling',gross:'55.000',mk:'12'},
  s5:{name:'Silver coin 20 g',category:'Coin',metal:'Silver',purity:'999 Fine',gross:'20.000',mk:'5'}
};
const SAMPLE_BILLS=[   /* days ago, supplier, share paid, pieces, optional metal line */
  {d:200,sup:0,pay:1,pieces:['p1','p3'],metal:{name:'24K gold bar',purity:'24K',gross:'20'}},
  {d:150,sup:1,pay:1,pieces:['p2','p4']},
  {d:100,sup:0,pay:.5,pieces:['p5','p6','p9']},
  {d:70,sup:2,pay:1,pieces:['s1','s2','s3']},
  {d:35,sup:1,pay:.5,pieces:['p7','p8','p10']},
  {d:12,sup:2,pay:0,pieces:['s4','s5']}
];
const SAMPLE_LOOSE=[   /* stock that did not come through a bill */
  {name:'Gold stud earrings',category:'Earrings',metal:'Gold',purity:'22K',gross:'3.600',mk:'14',d:5},
  {name:'Antique gold ring',category:'Ring',metal:'Gold',purity:'22K',gross:'6.800',mk:'11',d:190},
  {name:'Silver toe rings',category:'Other',metal:'Silver',purity:'925 Sterling',gross:'18.000',mk:'12',d:3}
];
const SAMPLE_SALES=[   /* days ago, customer, share paid, lines: a stock key, or a hand-written line */
  {d:165,c:0,pay:1,lines:['p3']},
  {d:140,c:1,pay:1,lines:[{name:'Silver glass set',metal:'Silver',purity:'925 Sterling',gross:'90',mk:'10'}]},
  {d:118,c:2,pay:1,lines:['p1']},
  {d:95,c:3,pay:.6,lines:['p4',{name:'Gold nose pin',metal:'Gold',purity:'22K',gross:'1.1',mk:'15',huid:'SMP901'}]},
  {d:78,c:0,pay:1,lines:[{name:'Silver diya pair',metal:'Silver',purity:'925 Sterling',gross:'120',mk:'10'}]},
  {d:60,c:4,pay:1,lines:['p5']},
  {d:48,c:1,pay:1,lines:['s1']},
  {d:40,c:5,pay:0,lines:[{name:'Gold chain 18K',metal:'Gold',purity:'18K',gross:'6.4',mk:'11',huid:'SMP902'}]},
  {d:27,c:2,pay:.5,lines:['p8']},
  {d:20,c:3,pay:1,lines:['s3']},
  {d:14,c:4,pay:1,lines:['p10']},
  {d:9,c:5,pay:0,lines:[{name:'Gold bangles 22K',metal:'Gold',purity:'22K',gross:'18',mk:'9',huid:'SMP903'},{name:'Silver payal',metal:'Silver',purity:'925 Sterling',gross:'40',mk:'12'}]},
  {d:4,c:0,pay:1,lines:[{name:'Gold earrings 22K',metal:'Gold',purity:'22K',gross:'4.2',mk:'14',huid:'SMP904'}]},
  {d:1,c:1,pay:.4,lines:[{name:'Silver anklet',metal:'Silver',purity:'925 Sterling',gross:'40',mk:'12'},'s5']}
];
/* a piece used twice would be sold twice: each stock key above appears once */

/* Adds the sample set and sets today's rates from the 24K and silver rates. Returns what was added. */
function loadSample(r24,silver){
  S.rates={gold:{...S.rates.gold,...sampleRates(r24)},silver:round2(silver),date:today()};   /* 14K and 9K stay as the owner had them */
  const mark=o=>({...o,sample:true});
  const dayStr=d=>new Date(Date.now()-d*864e5).toISOString().slice(0,10);
  /* the going rate then: rates drift up slowly, so older bills were a little cheaper */
  const rateThen=(metal,purity,d)=>{const base=metal==='Silver'?S.rates.silver:S.rates.gold[purity];return Math.round(num(base)*(1-0.0003*d)*10)/10};
  const usedHuids=new Set(S.inventory.map(s=>s.huid).filter(Boolean));
  const huid=n=>{let k=n,h;do{h='SMP'+String(k).padStart(3,'0');k+=100}while(usedHuids.has(h));usedHuids.add(h);return h};
  const modes=['UPI','Cash','Card','Bank transfer'];let mi=0;
  const payments=(total,frac,date,spread)=>{
    if(frac<=0)return[];
    if(frac>=1){const a=round2(total*.6);return[{id:uid(),date,amount:a,mode:modes[mi++%4],note:''},{id:uid(),date:dayStr(Math.max(0,spread)),amount:round2(total-a),mode:modes[mi++%4],note:''}]}
    return[{id:uid(),date,amount:round2(total*frac),mode:modes[mi++%4],note:''}];
  };
  const added={customers:0,suppliers:0,purchases:0,inventory:0,invoices:0};

  const customers=[['Asha Rao','9876543201','asha.rao@example.com','asha.rao','12 Lake Road, Chennai'],['Rahul Mehta','9876543202','rahul.mehta@example.com','','45 Market Street, Mumbai'],
    ['Priya Nair','9876543203','priya.nair@example.com','priya.nair','8 Palm Avenue, Kochi'],['Karan Singh','9876543204','','karansingh','22 Civil Lines, Delhi'],
    ['Meera Iyer','9876543205','meera.iyer@example.com','','5 Temple Street, Madurai'],['Imran Qureshi','9876543206','','','31 Old City, Hyderabad']]
    .map(([name,phone,email,instagram,address])=>mark({id:uid(),name,phone,email,instagram,gstin:'',address}));
  S.customers.push(...customers);added.customers=customers.length;
  const suppliers=[['Sample Bullion House','Wholesaler','9811100011','27ABCDE1234F1Z5','Zaveri Bazaar, Mumbai'],['Sample Karigar Works','Manufacturer / karigar','9811100012','','Gold Lane, Rajkot'],['Sample Silver Traders','Wholesaler','9811100013','','Silver Market, Jaipur']]
    .map(([name,type,phone,gstin,address])=>mark({id:uid(),name,type,phone,email:'',gstin,address}));
  S.suppliers.push(...suppliers);added.suppliers=suppliers.length;

  /* purchase bills: each piece on a bill becomes a stock piece that remembers its bill line */
  const pieces={};
  SAMPLE_BILLS.forEach((b,k)=>{
    const date=dayStr(b.d),pu=S.settings.purchase,items=[];
    b.pieces.forEach(key=>{
      const c=SAMPLE_PIECES[key],lineId=uid(),pieceId=uid();
      items.push({id:lineId,kind:'Piece',name:c.name,category:c.category,metal:c.metal,purity:c.purity,huid:c.huid?huid(c.huid):'',gross:c.gross,stoneWt:c.stoneWt||'',beadsWt:c.beadsWt||'',
        rate:String(Math.round(rateThen(c.metal,c.purity,b.d)*.985*10)/10),makingPct:'4',stone:c.stoneWt?'100':'',beads:'',stockId:pieceId});
      pieces[key]={id:pieceId,lineId,c,huid:items[items.length-1].huid,date};
    });
    if(b.metal)items.push({id:uid(),kind:'Metal',name:b.metal.name,category:'Chain',metal:'Gold',purity:b.metal.purity,huid:'',gross:b.metal.gross,stoneWt:'',beadsWt:'',
      rate:String(Math.round(rateThen('Gold',b.metal.purity,b.d)*.99*10)/10),makingPct:'',stone:'',beads:''});
    const gold=b.pieces.filter(k2=>SAMPLE_PIECES[k2].metal==='Gold').length;
    const bill=mark({id:uid(),no:nextPurchaseNo(),billNo:'SB/'+(210+k),date,supplierId:suppliers[b.sup].id,cgst:pu.cgst,sgst:pu.sgst,items,
      charges:gold?[{id:uid(),label:'Hallmarking charges',amount:String(45*gold)}]:[],payments:[],notes:'Sample purchase'});
    bill.payments=payments(pcalc(bill).total,b.pay,dayStr(b.d-2),b.d-5);
    S.purchases.push(bill);added.purchases++;
    b.pieces.forEach(key=>{const p=pieces[key],c=p.c;
      S.inventory.push(mark({id:p.id,tag:nextTag(c.metal),name:c.name,category:c.category,metal:c.metal,purity:c.purity,gross:c.gross,stoneWt:c.stoneWt||'',beadsWt:c.beadsWt||'',
        makingPct:c.mk,stone:c.stone||'',beads:'',huid:p.huid,notes:'Sample piece',addedOn:p.date,purchaseId:bill.id,purchaseItemId:p.lineId}));added.inventory++});
  });
  SAMPLE_LOOSE.forEach(c=>{S.inventory.push(mark({id:uid(),tag:nextTag(c.metal),name:c.name,category:c.category,metal:c.metal,purity:c.purity,gross:c.gross,stoneWt:'',beadsWt:'',
    makingPct:c.mk,stone:'',beads:'',huid:'',notes:'Sample piece',addedOn:dayStr(c.d)}));added.inventory++});

  /* invoices: lines taken from stock mark those pieces sold; the rest are written by hand */
  const iv=S.settings.invoice;
  SAMPLE_SALES.forEach(s=>{
    const items=s.lines.map(l=>{
      const it=newItem();
      if(typeof l==='string'){applyStockToItem(it,S.inventory.find(x=>x.id===pieces[l].id));return it}
      return Object.assign(it,{name:l.name,metal:l.metal,purity:l.purity,huid:l.huid||'',gross:l.gross,makingPct:l.mk});
    });
    const inv=mark({id:uid(),no:nextInvoiceNo(),date:dayStr(s.d),customerId:customers[s.c].id,goldRates:{},silverRate:'',cgst:iv.cgst,sgst:iv.sgst,payments:[],notes:'Sample invoice',items,
      charges:items.some(i=>i.metal==='Gold')?[{id:uid(),label:'Hallmark charges',amount:'45'}]:[]});
    items.forEach(it=>{if(it.metal==='Silver')inv.silverRate=rateThen('Silver',it.purity,s.d);else inv.goldRates[goldKey(it.purity)]=rateThen('Gold',it.purity,s.d)});
    inv.payments=payments(calc(inv).total,s.pay,dayStr(Math.max(0,s.d-1)),s.d-3);
    S.invoices.push(inv);added.invoices++;
  });
  persist();
  return added;
}

/* Removes every sample record. A sample record that the owner's own records use (an invoice on a sample customer or piece, a bill from a sample supplier)
   is kept and becomes a normal record, so nothing real is left pointing at something deleted. */
function removeSample(){
  const keep={customers:new Set(),inventory:new Set(),suppliers:new Set(),purchases:new Set()};
  S.invoices.filter(i=>!i.sample).forEach(i=>{keep.customers.add(i.customerId);i.items.forEach(it=>{if(it.stockId)keep.inventory.add(it.stockId)})});
  S.purchases.filter(p=>!p.sample).forEach(p=>{keep.suppliers.add(p.supplierId);keep.purchases.add(p.id);p.items.forEach(it=>{if(it.stockId)keep.inventory.add(it.stockId)})});
  S.inventory.filter(s=>!s.sample&&s.purchaseId).forEach(s=>keep.purchases.add(s.purchaseId));
  for(let grew=true;grew;){   /* a kept piece needs its bill and supplier; a kept bill needs all its pieces */
    grew=false;
    S.inventory.forEach(s=>{
      if(keep.inventory.has(s.id)&&s.purchaseId&&!keep.purchases.has(s.purchaseId)){keep.purchases.add(s.purchaseId);grew=true}
      if(s.purchaseId&&keep.purchases.has(s.purchaseId)&&!keep.inventory.has(s.id)){keep.inventory.add(s.id);grew=true}});
    S.purchases.forEach(p=>{if(keep.purchases.has(p.id)){
      if(!keep.suppliers.has(p.supplierId)){keep.suppliers.add(p.supplierId);grew=true}
      p.items.forEach(it=>{if(it.stockId&&!keep.inventory.has(it.stockId)){keep.inventory.add(it.stockId);grew=true}})}});
  }
  let removed=0,kept=0;
  SAMPLE_LISTS.forEach(n=>{S[n]=S[n].filter(x=>{
    if(!x.sample)return true;
    if(keep[n]&&keep[n].has(x.id)){delete x.sample;kept++;return true}
    removed++;return false})});
  persist();
  return{removed,kept};
}

/* ----- the screen: Settings -> Sample data, for the store owner only (nothing about it appears on other pages) ----- */
let sampleConfirm=false;
const sampleAllowed=()=>!!ME&&ME.role==='admin'&&can('invoices','edit');
function sampleSectionHTML(){
  if(hasSample()){
    const c=sampleCounts();
    return`<div class="panel stack narrow" style="gap:14px"><div><h2 style="margin:0">Sample data is loaded</h2>
      <p class="set-note">${c.invoices} invoices, ${c.customers} customers, ${c.inventory} stock pieces, ${c.suppliers} suppliers and ${c.purchases} purchases. Each is tagged "Sample" in its list.</p></div>
      <p class="set-note">Remove it before you start with your own records. Anything of yours that uses a sample customer, supplier or piece is kept, and your rates are left as they are.</p>
      <div class="row"><button class="btn danger" id="sm_remove">${sampleConfirm?'Click again to remove':'Remove sample data'}</button></div></div>`;
  }
  const real=!!S.rates.date,g=real?S.rates.gold['24K']:'',s=real?S.rates.silver:'';
  return`<div class="panel stack narrow" style="gap:14px"><div><h2 style="margin:0">Sample data</h2>
    <p class="set-note">Fills the store with example customers, suppliers, purchase bills, stock with HUIDs and invoices over the last months, so you can look at Invoices, Customers, Inventory, Purchases and Analytics. Remove it any time.</p></div>
    <div class="grid wide"><label>Gold rate, 24K (₹ per gram)<input id="sm_gold" type="number" min="1" step="any" inputmode="decimal" placeholder="e.g. 7500" value="${esc(g)}"></label>
      <label>Silver rate (₹ per gram)<input id="sm_silver" type="number" min="1" step="any" inputmode="decimal" placeholder="e.g. 95" value="${esc(s)}"></label></div>
    <p class="set-note" id="sm_calc">Enter the 24K rate and the 22K and 18K rates are worked out for you (92% and 75% of 24K).</p>
    ${real?'<p class="set-note">This replaces your saved 24K, 22K and 18K gold rates and the silver rate. 14K and 9K stay as they are.</p>':''}
    ${storeIsEmpty()?'':'<p class="set-note">Your store already has records. The sample data is added next to them and tagged "Sample".</p>'}
    <div class="row"><button class="btn primary" id="sm_go">Load sample data</button></div></div>`;
}
function bindSampleUI(){
  const val=e=>typeof e.value==='string'?e.value:'';
  const g=$('#sm_gold'),s=$('#sm_silver');
  if(g&&s){
    const preview=()=>{const r=num(val(g)),t=$('#sm_calc');if(!t)return;
      t.innerHTML=r>0?`22K will be <b>${inr(round2(r*SAMPLE_PCT['22K']))}</b> (92% of 24K) and 18K <b>${inr(round2(r*SAMPLE_PCT['18K']))}</b> (75% of 24K). You can change any rate later in Settings → Rates.`
        :'Enter the 24K rate and the 22K and 18K rates are worked out for you (92% and 75% of 24K).'};
    g.oninput=preview;preview();
    $('#sm_go').onclick=()=>{
      if(!(num(val(g))>0))return toast('Enter the 24K gold rate');
      if(!(num(val(s))>0))return toast('Enter the silver rate');
      const a=loadSample(num(val(g)),num(val(s)));sampleConfirm=false;render();
      toast(`Sample data loaded: ${a.invoices} invoices, ${a.customers} customers, ${a.inventory} stock pieces, ${a.purchases} purchases.`);
    };
  }
  const rm=$('#sm_remove');
  if(rm)rm.onclick=()=>{
    if(!sampleConfirm){sampleConfirm=true;render();return}
    sampleConfirm=false;const r=removeSample();render();
    toast(`Sample data removed (${r.removed} records).`+(r.kept?` ${r.kept} were kept because your own records use them.`:''));
  };
}
