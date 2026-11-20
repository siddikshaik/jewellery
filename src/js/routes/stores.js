/* ---------- route: stores (super admin) ----------
   Lists every store with its sales and stock, creates stores, switches them off, and opens one for read-only monitoring. */
let platformCache=null;   /* {stores, users, data:{storeId: normalised collections}, at} */
const PLATFORM_TTL=60000;

ROUTES.stores={
  html(p){
    if(p[0]==='new')return storeFormHTML();
    if(!platformCache||Date.now()-platformCache.at>PLATFORM_TTL){loadPlatform();if(!platformCache)return LOADING}
    if(p[1]==='license'){const s=platformCache.stores.find(x=>x.id===p[0]);if(!s){go('stores');return null}return licenseFormHTML(s)}
    return storesHTML();
  },
  bind(p){p[0]==='new'?bindStoreForm():p[1]==='license'?bindLicenseForm(platformCache.stores.find(x=>x.id===p[0])):bindStores()}
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
/* a store's licence in a line: plan, state, people */
function licenseLine(s){
  const l=s.license||{},state=l.expired?`<span class="pill due">Ended ${dmy(l.expiresAt)}</span>`:l.expiresAt?`<span class="pill ${l.daysLeft<=7?'part':'paid'}">Until ${dmy(l.expiresAt)} · ${l.daysLeft===0?'last day':l.daysLeft+' day'+(l.daysLeft===1?'':'s')+' left'}</span>`:'<span class="pill paid">No expiry</span>';
  return`<span class="pill huid">${esc(PLAN_LABEL[l.plan]||l.plan||'')}</span> ${state} <span class="set-note">${l.usedUsers} of ${l.maxUsers} users${l.usedUsers>=l.maxUsers?' (full)':''}</span>`;
}
function storesHTML(){
  const P=platformCache,rows=P.stores.map(s=>({s,st:storeStats(s.id),admins:P.users.filter(u=>u.storeId===s.id&&u.role==='admin'),n:P.users.filter(u=>u.storeId===s.id).length}));
  const tot=rows.reduce((a,r)=>({billed:a.billed+r.st.all.billed,paid:a.paid+r.st.all.paid,bal:a.bal+r.st.all.bal,mo:a.mo+r.st.mo.billed}),{billed:0,paid:0,bal:0,mo:0});
  return`<header class="page"><div><h1>Stores</h1><p class="sub">Every store at a glance. Open one to see its settings, invoices, customers, stock and analytics (read-only).</p></div>
    <div class="row"><button class="btn" id="stRefresh">Refresh</button><button class="btn primary" id="newStore">Add store</button></div></header>
  <div class="stack"><div class="tiles">${tile('Stores',rows.filter(r=>r.s.active).length,'',`${rows.length} in total`)}${tile('Billed this month',inr(tot.mo))}${tile('Billed (all time)',inr(tot.billed))}${tile('Collected',inr(tot.paid),'good')}${tile('Outstanding',inr(tot.bal),tot.bal>0?'bad':'')}</div>
  ${rows.length?rows.map(r=>`<div class="panel stack store-card" style="gap:16px">
    <div class="bar" style="margin:0"><div><h2 style="margin:0">${esc(r.s.name)} <span class="pill ${r.s.active?'paid':'due'}">${r.s.active?'Active':'Turned off'}</span></h2>
      <span class="set-note">${r.admins.length?'Owner: '+r.admins.map(a=>esc(a.name)+' (@'+esc(a.username)+(a.phone?' · '+esc(a.phone):'')+')').join(', '):'No store owner yet'} · ${r.n} user${r.n===1?'':'s'}</span>
      <div style="margin-top:6px">${licenseLine(r.s)}</div></div>
      <div class="row"><button class="btn primary sm" data-open="${r.s.id}" data-name="${esc(r.s.name)}">Open</button><button class="btn sm" data-license="${r.s.id}">License</button><button class="btn sm" data-toggle="${r.s.id}">${r.s.active?'Turn off':'Turn on'}</button></div></div>
    <div class="tiles">${tile('Billed this month',inr(r.st.mo.billed),'',`${r.st.mo.n} invoice${r.st.mo.n===1?'':'s'}`)}${tile('Billed (all time)',inr(r.st.all.billed),'',`${r.st.all.n} invoice${r.st.all.n===1?'':'s'}`)}${tile('Collected',inr(r.st.all.paid),'good')}${tile('Outstanding',inr(r.st.all.bal),r.st.all.bal>0?'bad':'')}</div>
    <span class="set-note">${r.st.customers} customer${r.st.customers===1?'':'s'} · ${r.st.stock} stock item${r.st.stock===1?'':'s'} · ${r.st.last?'last invoice '+dmy(r.st.last):'no invoices yet'}</span></div>`).join(''):'<div class="empty">No stores yet. Choose Add store.</div>'}</div>`;
}
function bindStores(){
  $('#newStore').onclick=()=>go('stores/new');
  $('#stRefresh').onclick=()=>{platformCache=null;render()};
  $$('[data-open]').forEach(b=>b.onclick=()=>monitorStore(b.dataset.open,b.dataset.name));
  $$('[data-license]').forEach(b=>b.onclick=()=>go('stores/'+b.dataset.license+'/license'));
  $$('[data-toggle]').forEach(b=>b.onclick=async()=>{
    const s=platformCache.stores.find(x=>x.id===b.dataset.toggle);
    if(b.dataset.arm!=='1'){b.dataset.arm='1';b.textContent=s.active?'Confirm turn off':'Confirm turn on';return}
    try{await api('PATCH','stores/'+s.id,{active:!s.active});platformCache=null;render();toast(s.active?'Store turned off. Its people are signed out.':'Store turned on')}catch(e){toast(e.message)}});
}
function storeFormHTML(){
  return`<header class="page"><h1>Add store</h1><div class="row"><button class="btn" id="n_cancel">Cancel</button><button class="btn primary" id="n_save">Create store</button></div></header>
  <div class="stack narrow"><div class="panel stack"><label>Store name<input id="n_name"></label>
    <div><div class="sub-h" style="margin-bottom:10px">Store owner</div><div class="grid wide">
    <label>Name<input id="n_aname"></label><label>Username<input id="n_auser" autocapitalize="none"></label>
    <label>Email<input id="n_aemail" type="email" autocapitalize="none"></label><label>Phone number (10 digits)<input id="n_aphone" type="tel"></label>
    <label>Password (at least 8 characters)<input id="n_apass" type="password" autocomplete="new-password"></label></div>
    <p class="set-note" style="margin-top:10px">The owner sets up the store details, rates and people. Email and phone must be new to the platform.</p></div>
    <div><div class="sub-h" style="margin-bottom:10px">License</div><div class="grid wide">
    <label>Plan<select id="n_plan"><option value="licensed" selected>Licensed</option><option value="trial">Free trial</option></select></label>
    <label>Valid for<select id="n_months"><option value="1" selected>1 month</option><option value="3">3 months</option><option value="6">6 months</option><option value="12">12 months</option><option value="24">24 months</option><option value="0">No expiry</option></select></label>
    <label>Users allowed<input id="n_max" type="number" min="1" step="1" value="2"></label></div></div></div></div>`;
}
function bindStoreForm(){
  $('#n_cancel').onclick=()=>go('stores');
  $('#n_save').onclick=async()=>{
    try{
      const months=+$('#n_months').value;
      await api('POST','stores',{name:$('#n_name').value,admin:{name:$('#n_aname').value,username:$('#n_auser').value,email:$('#n_aemail').value,phone:$('#n_aphone').value,password:$('#n_apass').value},
        license:{plan:$('#n_plan').value,maxUsers:+$('#n_max').value,...(months?{monthsFromToday:months}:{expiresAt:''})}});
      platformCache=null;usersCache=null;go('stores');toast('Store created');
    }catch(e){toast(e.message)}
  };
}

/* ----- one store's licence: valid until, how many people, plan ----- */
function licenseFormHTML(s){
  const l=s.license,owner=platformCache.users.filter(u=>u.storeId===s.id&&u.role==='admin');
  return`<header class="page"><div><a href="#/stores" class="btn sm" style="margin-bottom:14px">‹ All stores</a><h1>License</h1><p class="sub">${esc(s.name)}${owner.length?' · '+owner.map(o=>esc(o.name)+(o.phone?' '+esc(o.phone):'')).join(', '):''}</p></div>
    <div class="row"><button class="btn" id="l_cancel">Back</button><button class="btn primary" id="l_save">Save license</button></div></header>
  <div class="stack narrow"><div class="panel stack"><div id="l_now">${licenseLine(s)}</div>
    <div><div class="sub-h" style="margin-bottom:10px">Extend</div><div class="row">${[1,3,6,12].map(n=>`<button class="btn sm" data-ext="${n}">+${n} month${n===1?'':'s'}</button>`).join('')}</div>
      <p class="set-note" style="margin-top:8px">Adds to the current end date, or starts from today if the license has already ended.</p></div>
    <div class="grid wide"><label>Valid until (leave empty for no expiry)<input id="l_exp" type="date" value="${esc(l.expiresAt||'')}"></label>
      <label>Users allowed<input id="l_max" type="number" min="1" step="1" value="${l.maxUsers}"></label>
      <label>Plan<select id="l_plan"><option value="licensed"${l.plan==='licensed'?' selected':''}>Licensed</option><option value="trial"${l.plan==='trial'?' selected':''}>Free trial</option></select></label>
      <label>Note (only you see this)<input id="l_note" maxlength="200" placeholder="e.g. Paid till March, receipt 1042" value="${esc(l.note||'')}"></label></div>
    <p class="set-note">The store keeps working until the end of the day it is valid until. After that its people can sign in and look at their data, but cannot change it. They are told to contact you. Currently ${l.usedUsers} of ${l.maxUsers} users are in use.</p></div></div>`;
}
function bindLicenseForm(s){
  $('#l_cancel').onclick=()=>go('stores');
  const apply=r=>{const i=platformCache.stores.findIndex(x=>x.id===s.id);platformCache.stores[i]={...platformCache.stores[i],...r.store};render()};
  $$('[data-ext]').forEach(b=>b.onclick=async()=>{
    try{apply(await api('PATCH','stores/'+s.id,{license:{extendMonths:+b.dataset.ext}}));toast('License extended')}catch(e){toast(e.message)}});
  $('#l_save').onclick=async()=>{
    try{apply(await api('PATCH','stores/'+s.id,{license:{expiresAt:$('#l_exp').value,maxUsers:+$('#l_max').value,plan:$('#l_plan').value,note:$('#l_note').value}}));toast('License saved')}catch(e){toast(e.message)}};
}
