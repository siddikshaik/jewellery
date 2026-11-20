/* ---------- who is signed in, what they may do, and the sign-in screens ----------
   ME = {id, username, name, role: superadmin|admin|user, storeId, storeName, perms:{invoices,customers,inventory}}
   monitor = {id, name} while a super admin is looking at one store (read-only). */
let ME=null,monitor=null;
const lvl=v=>v==='edit'?2:v==='view'?1:0;
function level(area){
  if(!ME)return 0;
  if(ME.role==='superadmin')return area==='users'||area==='stores'?2:(monitor?1:0);   /* store data only while monitoring, never editable */
  if(ME.role==='admin')return area==='stores'?0:2;
  return['invoices','customers','inventory','purchases'].includes(area)?lvl(ME.perms&&ME.perms[area]):0;
}
const can=(area,mode='view')=>level(area)>=(mode==='edit'?2:1);
const ROLE_LABEL={superadmin:'Super admin',admin:'Store admin',user:'Store user'};

async function api(method,path,body){
  let r;
  try{r=await fetch('api/'+path,{method,credentials:'same-origin',headers:body!==undefined?{'content-type':'application/json'}:{},body:body!==undefined?JSON.stringify(body):undefined})}
  catch(e){const err=new Error('offline');err.status=0;throw err}
  let j=null;try{j=await r.json()}catch(e){}
  if(r.status===401&&ME&&path!=='auth/login'&&path!=='auth/status'){leave();showGate('login','Your session ended. Please sign in again.')}
  if(!r.ok){const err=new Error((j&&j.error)||'Request failed');err.status=r.status;throw err}
  return j;
}

/* a tag was scanned before signing in: show what the QR itself carries (nothing is read from the server), then sign in for the full record */
function scannedCardHTML(){
  const h=location.hash||'',m=h.match(/^#\/item\/([^?]+)\??(.*)$/);if(!m)return'';
  const q=new URLSearchParams(m[2]);
  const row=(k,v)=>v?`<div class="kv"><span>${k}</span><span>${esc(v)}</span></div>`:'';
  return`<div class="gate-card scanned"><span class="pill huid" style="align-self:center">Scanned tag</span><h2 style="margin:0">${esc(decodeURIComponent(m[1]))}</h2>
    ${row('HUID',q.get('h'))}${row('Purity',q.get('p'))}${row('Gross weight',q.get('g')?q.get('g')+' g':'')}${row('Net weight',q.get('n')?q.get('n')+' g':'')}
    <p class="set-note">Sign in below to see the full record of this piece. Check a HUID on the BIS Care app.</p></div>`;
}
/* ----- sign-in / first-run screens ----- */
function gateHTML(kind,msg){
  const setup=kind==='setup';
  if(kind==='offline')return`<div class="gate"><div class="gate-card"><span class="logo big"></span><h1>Cannot reach the server</h1><p class="sub">This app needs its server for sign-in. Start it with <b>npm start</b> and open the address it prints.</p><button class="btn primary" id="g_retry">Try again</button></div></div>`;
  return`<div class="gate">${setup?'':scannedCardHTML()}<form class="gate-card" id="gateForm"><span class="logo big"></span><h1>${setup?'Welcome':'Sign in'}</h1>
    <p class="sub">${setup?'Create the super admin account. This person adds stores and can see all of them.':'Jewellery Billing'}</p>
    <div class="gate-msg" id="g_msg"${msg?'':' hidden'}>${esc(msg||'')}</div>
    ${setup?'<label>Your name<input id="g_name" autocomplete="name" required></label>':''}
    <label>Username<input id="g_user" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
    <label>Password${setup?' (at least 8 characters)':''}<input id="g_pass" type="password" autocomplete="${setup?'new-password':'current-password'}" required></label>
    <button class="btn primary" type="submit" style="width:100%;padding:12px">${setup?'Create account':'Sign in'}</button></form></div>`;
}
function showGate(kind,msg){
  document.body.classList.add('locked');
  $('#view').innerHTML=gateHTML(kind,msg);
  const retry=$('#g_retry');if(retry)retry.onclick=()=>boot();
  const f=$('#gateForm');if(!f)return;
  const say=t=>{const m=$('#g_msg');m.textContent=t;m.hidden=false};
  f.onsubmit=async e=>{
    e.preventDefault();
    const body={username:$('#g_user').value,password:$('#g_pass').value};
    if(kind==='setup')body.name=$('#g_name').value;
    try{const r=await api('POST',kind==='setup'?'auth/setup':'auth/login',body);await enter(r.user)}
    catch(err){say(err.status===0?'Cannot reach the server.':err.message)}
  };
  const u=$('#g_name')||$('#g_user');u&&u.focus&&u.focus();
}
async function boot(){
  try{
    const st=await api('GET','auth/status');
    if(st.user)return enter(st.user);
    showGate(st.setupNeeded?'setup':'login');
  }catch(e){showGate('offline')}
}
function leave(){ME=null;monitor=null;ready=false;S=defaults();draft=draftCust=draftStock=draftPur=draftSup=null;stopPolling();usersCache=null;platformCache=null;try{sessionStorage.removeItem('jb-monitor')}catch(e){}}
async function enter(user){
  ME=user;monitor=null;S=defaults();ready=false;usersCache=null;platformCache=null;
  document.body.classList.remove('locked');
  if(ME.role==='superadmin'){try{monitor=JSON.parse(sessionStorage.getItem('jb-monitor')||'null')}catch(e){}}
  try{if(ME.role!=='superadmin'||monitor)await loadData()}
  catch(e){if(monitor){monitor=null;try{sessionStorage.removeItem('jb-monitor')}catch(e2){}}else if(e.status!==401){leave();return showGate('offline')}}
  ready=true;renderNav();renderWho();startPolling();
  if(!location.hash||location.hash==='#'||location.hash==='#/')location.hash='#/'+defaultRoute();
  render();
}
async function signOut(){try{await api('POST','auth/logout')}catch(e){}leave();$('#nav').innerHTML='';$('#who').innerHTML='';showGate('login')}
async function monitorStore(id,name){
  monitor={id,name};try{sessionStorage.setItem('jb-monitor',JSON.stringify(monitor))}catch(e){}
  S=defaults();ready=false;renderNav();
  try{await loadData()}catch(e){toast('Could not open that store');exitMonitor();return}
  ready=true;go('analytics');
}
function exitMonitor(){monitor=null;S=defaults();try{sessionStorage.removeItem('jb-monitor')}catch(e){}renderNav();go('stores')}
const initials=n=>String(n||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
function renderWho(){
  if(!ME){$('#who').innerHTML='';return}
  $('#who').innerHTML=`<a class="who-chip" href="#/account"><span class="av">${esc(initials(ME.name))}</span><span class="bt"><b>${esc(ME.name)}</b><small>${esc(ROLE_LABEL[ME.role])}${ME.storeName?' · '+esc(ME.storeName):''}</small></span></a>`;
}

/* ----- account page ----- */
ROUTES.account={
  html(){
    return`<header class="page"><div><h1>Account</h1><p class="sub">Your sign-in details.</p></div><button class="btn danger" id="a_out">Sign out</button></header>
    <div class="stack narrow"><div class="panel"><div class="kv"><span>Name</span><span>${esc(ME.name)}</span></div><div class="kv"><span>Username</span><span>${esc(ME.username)}</span></div>
      <div class="kv"><span>Role</span><span>${esc(ROLE_LABEL[ME.role])}</span></div>${ME.storeName?`<div class="kv"><span>Store</span><span>${esc(ME.storeName)}</span></div>`:''}
      ${ME.role==='user'?`<div class="kv"><span>Access</span><span>${['invoices','customers','inventory','purchases'].map(a=>cap(a)+': '+PERM_LABEL[ME.perms[a]||'none']).join(' · ')}</span></div>`:''}</div>
    <div class="panel stack"><h2 style="margin:0">Change password</h2>
      <div class="grid wide"><label>Current password<input id="a_cur" type="password" autocomplete="current-password"></label>
      <label>New password (at least 8 characters)<input id="a_new" type="password" autocomplete="new-password"></label>
      <label>New password again<input id="a_new2" type="password" autocomplete="new-password"></label></div>
      <div class="row"><button class="btn primary" id="a_save">Change password</button></div></div></div>`;
  },
  bind(){
    $('#a_out').onclick=signOut;
    $('#a_save').onclick=async()=>{
      if($('#a_new').value!==$('#a_new2').value)return toast('The new passwords do not match');
      try{await api('POST','auth/password',{current:$('#a_cur').value,next:$('#a_new').value});['#a_cur','#a_new','#a_new2'].forEach(s=>$(s).value='');toast('Password changed')}
      catch(e){toast(e.message)}
    };
  }
};
const cap=s=>s[0].toUpperCase()+s.slice(1);
const PERM_LABEL={none:'No access',view:'View only',edit:'View and edit'};
