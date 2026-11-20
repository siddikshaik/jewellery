/* ---------- route: users (store admin: people in their store; super admin: everyone) ---------- */
let usersCache=null;   /* {users:[...], stores:[...]} loaded from the server on entry, cleared after a change */

ROUTES.users={
  html(p){
    if(!usersCache){loadUsers();return LOADING}
    if(!p.length)return usersHTML();
    if(p[0]==='new')return userFormHTML(null);
    const u=usersCache.users.find(x=>x.id===p[0]);
    if(!u){go('users');return null}
    return userFormHTML(u);
  },
  bind(p){p.length?bindUserForm(p[0]==='new'?null:usersCache.users.find(x=>x.id===p[0])):bindUsers()}
};
async function loadUsers(){
  try{
    const [u,s]=await Promise.all([api('GET','users'),ME.role==='superadmin'?api('GET','stores'):Promise.resolve({stores:[]})]);
    usersCache={users:u.users,stores:s.stores};render();
  }catch(e){if(e.status!==401){toast('Could not load users');usersCache={users:[],stores:[]};render()}}
}
const storeName=id=>{const s=(usersCache.stores||[]).find(x=>x.id===id);return s?s.name:''};
const permSummary=u=>u.role==='user'?['invoices','customers','inventory','purchases'].map(a=>cap(a)+': '+({none:'None',view:'View',edit:'Edit'})[u.perms[a]||'none']).join(' · '):u.role==='admin'?'Full access to the store':'All stores, read-only';

function usersHTML(){
  const list=[...usersCache.users].sort((a,b)=>(storeName(a.storeId)).localeCompare(storeName(b.storeId))||a.role.localeCompare(b.role)||a.name.localeCompare(b.name));
  const mine=u=>ME.role==='superadmin'||u.role==='user';
  return`<header class="page"><div><h1>Users</h1><p class="sub">${ME.role==='superadmin'?'Everyone who can sign in, across all stores.':'People who can sign in to '+esc(ME.storeName||'your store')+'.'}</p></div><button class="btn primary" id="newUser">Add user</button></header>
  <div class="list">${list.map(u=>`<div class="item"><div class="main"><b>${esc(u.name)} <span class="muted" style="font-weight:400">@${esc(u.username)}</span></b>
      <span class="sub">${esc(ROLE_LABEL[u.role])}${u.storeId&&ME.role==='superadmin'?' · '+esc(storeName(u.storeId)):''} · ${esc(permSummary(u))}</span></div>
      <div class="row"><span class="pill ${u.active?'paid':'due'}">${u.active?'Active':'Turned off'}</span>${mine(u)?`<button class="btn sm" data-edit="${u.id}">Edit</button>`:''}</div></div>`).join('')||'<div class="empty">No users yet.</div>'}</div>`;
}
function bindUsers(){
  $('#newUser').onclick=()=>go('users/new');
  $$('[data-edit]').forEach(b=>b.onclick=()=>go('users/'+b.dataset.edit));
}

function userFormHTML(u){
  const isNew=!u,sa=ME.role==='superadmin',role=u?u.role:'user';
  const perm=a=>`<label>${cap(a)}<select data-perm="${a}">${['none','view','edit'].map(l=>`<option value="${l}"${((u&&u.perms&&u.perms[a])||'none')===l?' selected':''}>${PERM_LABEL[l]}</option>`).join('')}</select></label>`;
  return`<header class="page"><div><h1>${isNew?'Add user':esc(u.name)}</h1>${isNew?'':`<p class="sub">@${esc(u.username)} · ${esc(ROLE_LABEL[u.role])}${u.storeId&&sa?' · '+esc(storeName(u.storeId)):''}</p>`}</div>
    <div class="row"><button class="btn" id="u_cancel">Cancel</button><button class="btn primary" id="u_save">Save user</button></div></header>
  <div class="stack narrow"><div class="panel stack"><div class="grid wide">
    <label>Name<input id="u_name" value="${esc(u?u.name:'')}"></label>
    <label>Username${isNew?' (letters, numbers, . - _)':''}<input id="u_user" autocapitalize="none" value="${esc(u?u.username:'')}"${isNew?'':' disabled'}></label>
    <label>${isNew?'Password (at least 8 characters)':'New password (leave empty to keep the current one)'}<input id="u_pass" type="password" autocomplete="new-password"></label>
    ${isNew&&sa?`<label>Role<select id="u_role"><option value="admin">Store admin</option><option value="user" selected>Store user</option><option value="superadmin">Super admin</option></select></label>
    <label id="u_storewrap">Store<select id="u_store">${usersCache.stores.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>`:''}</div>
    <div id="u_perms" ${role==='user'?'':'hidden'}><div class="sub-h" style="margin-bottom:10px">What this person can do</div>
      <div class="grid">${['invoices','customers','inventory','purchases'].map(perm).join('')}</div>
      <p class="set-note" style="margin-top:10px">People with Invoices access can always see customer names and today's rates. To add a customer they also need Customers: View and edit. Purchases covers suppliers too. Analytics shows the parts of Invoices, Purchases and Inventory the person can see. Adding a bought piece to stock needs Inventory: View and edit as well.</p></div>
    ${isNew?'':`<label class="check"><input type="checkbox" id="u_active"${u.active?' checked':''}${u.id===ME.id?' disabled':''}> Allowed to sign in</label>`}</div></div>`;
}
function bindUserForm(u){
  const isNew=!u,sa=ME.role==='superadmin';
  const roleSel=$('#u_role');
  const sync=()=>{const r=roleSel?roleSel.value:'user';$('#u_perms').hidden=r!=='user';const w=$('#u_storewrap');if(w)w.hidden=r==='superadmin'};
  if(roleSel){roleSel.onchange=sync;sync()}
  $('#u_cancel').onclick=()=>go('users');
  $('#u_save').onclick=async()=>{
    const perms={};$$('[data-perm]').forEach(s=>perms[s.dataset.perm]=s.value);
    try{
      if(isNew){
        await api('POST','users',{name:$('#u_name').value,username:$('#u_user').value,password:$('#u_pass').value,role:roleSel?roleSel.value:'user',storeId:$('#u_store')?$('#u_store').value:undefined,perms});
      }else{
        const body={name:$('#u_name').value,active:$('#u_active').checked};
        if(u.role==='user')body.perms=perms;
        if($('#u_pass').value)body.password=$('#u_pass').value;
        await api('PATCH','users/'+u.id,body);
      }
      usersCache=null;go('users');toast('User saved');
    }catch(e){toast(e.message)}
  };
}
