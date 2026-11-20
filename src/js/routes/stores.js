/* ---------- route: stores (super admin) ----------
   Lists every store with its sales and stock, creates stores, switches them off, and opens one for read-only monitoring. */
let platformCache=null;   /* {stores, users, data:{storeId: normalised collections}, at} */
const PLATFORM_TTL=60000;

ROUTES.stores={
  html(p){
    if(p[0]==='new')return storeFormHTML();
    if(!platformCache||Date.now()-platformCache.at>PLATFORM_TTL){loadPlatform();if(!platformCache)return LOADING}
    return storesHTML();
  },
  bind(p){p[0]==='new'?bindStoreForm():bindStores()}
};
async function loadPlatform(){
  if(loadPlatform.busy)return;loadPlatform.busy=true;
  try{
    const [s,u]=await Promise.all([api('GET','stores'),api('GET','users')]);
    const data={};
    await Promise.all(s.stores.map(async st=>{try{data[st.id]=normalize((await api('GET','data?store='+st.id)).data)||defaults()}catch(e){data[st.id]=defaults()}}));
    platformCache={stores:s.stores,users:u.users,data,at:Date.now()};
  }catch(e){if(e.status!==401){toast('Could not load stores');platformCache={stores:[],users:[],data:{},at:Date.now()}}}
  loadPlatform.busy=false;render();
}
function storeStats(id){
  const d=platformCache.data[id]||defaults(),month=today().slice(0,7);
  const all=overall(d.invoices),mo=overall(d.invoices.filter(i=>i.date.slice(0,7)===month));
  const last=d.invoices.reduce((a,i)=>i.date>a?i.date:a,'');
  return{all,mo,last,customers:d.customers.length,stock:d.inventory.length};
}
function storesHTML(){
  const P=platformCache,rows=P.stores.map(s=>({s,st:storeStats(s.id),admins:P.users.filter(u=>u.storeId===s.id&&u.role==='admin'),n:P.users.filter(u=>u.storeId===s.id).length}));
  const tot=rows.reduce((a,r)=>({billed:a.billed+r.st.all.billed,paid:a.paid+r.st.all.paid,bal:a.bal+r.st.all.bal,mo:a.mo+r.st.mo.billed}),{billed:0,paid:0,bal:0,mo:0});
  return`<header class="page"><div><h1>Stores</h1><p class="sub">Every store at a glance. Open one to see its settings, invoices, customers, stock and analytics (read-only).</p></div>
    <div class="row"><button class="btn" id="stRefresh">Refresh</button><button class="btn primary" id="newStore">Add store</button></div></header>
  <div class="stack"><div class="tiles">${tile('Stores',rows.filter(r=>r.s.active).length,'',`${rows.length} in total`)}${tile('Billed this month',inr(tot.mo))}${tile('Billed (all time)',inr(tot.billed))}${tile('Collected',inr(tot.paid),'good')}${tile('Outstanding',inr(tot.bal),tot.bal>0?'bad':'')}</div>
  ${rows.length?rows.map(r=>`<div class="panel stack store-card" style="gap:16px">
    <div class="bar" style="margin:0"><div><h2 style="margin:0">${esc(r.s.name)} <span class="pill ${r.s.active?'paid':'due'}">${r.s.active?'Active':'Turned off'}</span></h2>
      <span class="set-note">${r.admins.length?'Admin: '+r.admins.map(a=>esc(a.name)+' (@'+esc(a.username)+')').join(', '):'No store admin yet'} · ${r.n} user${r.n===1?'':'s'}</span></div>
      <div class="row"><button class="btn primary sm" data-open="${r.s.id}" data-name="${esc(r.s.name)}">Open</button><button class="btn sm" data-toggle="${r.s.id}">${r.s.active?'Turn off':'Turn on'}</button></div></div>
    <div class="tiles">${tile('Billed this month',inr(r.st.mo.billed),'',`${r.st.mo.n} invoice${r.st.mo.n===1?'':'s'}`)}${tile('Billed (all time)',inr(r.st.all.billed),'',`${r.st.all.n} invoice${r.st.all.n===1?'':'s'}`)}${tile('Collected',inr(r.st.all.paid),'good')}${tile('Outstanding',inr(r.st.all.bal),r.st.all.bal>0?'bad':'')}</div>
    <span class="set-note">${r.st.customers} customer${r.st.customers===1?'':'s'} · ${r.st.stock} stock item${r.st.stock===1?'':'s'} · ${r.st.last?'last invoice '+dmy(r.st.last):'no invoices yet'}</span></div>`).join(''):'<div class="empty">No stores yet. Choose Add store.</div>'}</div>`;
}
function bindStores(){
  $('#newStore').onclick=()=>go('stores/new');
  $('#stRefresh').onclick=()=>{platformCache=null;render()};
  $$('[data-open]').forEach(b=>b.onclick=()=>monitorStore(b.dataset.open,b.dataset.name));
  $$('[data-toggle]').forEach(b=>b.onclick=async()=>{
    const s=platformCache.stores.find(x=>x.id===b.dataset.toggle);
    if(b.dataset.arm!=='1'){b.dataset.arm='1';b.textContent=s.active?'Confirm turn off':'Confirm turn on';return}
    try{await api('PATCH','stores/'+s.id,{active:!s.active});platformCache=null;render();toast(s.active?'Store turned off. Its people are signed out.':'Store turned on')}catch(e){toast(e.message)}});
}
function storeFormHTML(){
  return`<header class="page"><h1>Add store</h1><div class="row"><button class="btn" id="n_cancel">Cancel</button><button class="btn primary" id="n_save">Create store</button></div></header>
  <div class="stack narrow"><div class="panel stack"><label>Store name<input id="n_name"></label>
    <div><div class="sub-h" style="margin-bottom:10px">First store admin</div><div class="grid wide">
    <label>Name<input id="n_aname"></label><label>Username<input id="n_auser" autocapitalize="none"></label>
    <label>Password (at least 8 characters)<input id="n_apass" type="password" autocomplete="new-password"></label></div>
    <p class="set-note" style="margin-top:10px">The store admin sets up the store details, rates and users, and can add more people.</p></div></div></div>`;
}
function bindStoreForm(){
  $('#n_cancel').onclick=()=>go('stores');
  $('#n_save').onclick=async()=>{
    try{
      await api('POST','stores',{name:$('#n_name').value,admin:{name:$('#n_aname').value,username:$('#n_auser').value,password:$('#n_apass').value}});
      platformCache=null;usersCache=null;go('stores');toast('Store created');
    }catch(e){toast(e.message)}
  };
}
