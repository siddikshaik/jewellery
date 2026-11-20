/* ---------- who is signed in, what they may do, and the sign-in screens ----------
   ME = {id, username, name, email, phone, role: superadmin|admin|user, storeId, storeName, perms:{invoices,customers,inventory,purchases},
         license:{plan, expiresAt, maxUsers, usedUsers, expired, daysLeft}, support:{name,email,phone}}   (license and support: store people only)
   monitor = {id, name} while a super admin is looking at one store (read-only). */
let ME=null,monitor=null,signupOpen=false;
const lvl=v=>v==='edit'?2:v==='view'?1:0;
function rawLevel(area){
  if(!ME)return 0;
  if(ME.role==='superadmin')return area==='users'||area==='stores'?2:(monitor?1:0);   /* store data only while monitoring, never editable */
  if(ME.role==='admin')return area==='stores'?0:2;
  return['invoices','customers','inventory','purchases'].includes(area)?lvl(ME.perms&&ME.perms[area]):0;
}
/* when the store's licence has ended its people can look but not change anything (the server enforces the same) */
const licenseLocked=()=>!!ME&&ME.role!=='superadmin'&&!!ME.license&&ME.license.expired;
function level(area){const r=rawLevel(area);return licenseLocked()&&r>1?1:r}
const can=(area,mode='view')=>level(area)>=(mode==='edit'?2:1);
const ROLE_LABEL={superadmin:'Super admin',admin:'Store owner',user:'Store user'};

async function api(method,path,body){
  let r;
  try{r=await fetch('api/'+path,{method,credentials:'same-origin',headers:body!==undefined?{'content-type':'application/json'}:{},body:body!==undefined?JSON.stringify(body):undefined})}
  catch(e){const err=new Error('offline');err.status=0;throw err}
  let j=null;try{j=await r.json()}catch(e){}
  if(r.status===401&&ME&&path!=='auth/login'&&path!=='auth/status'){leave();showGate('login','Your session ended. Please sign in again.')}
  if(!r.ok){const err=new Error((j&&j.error)||'Request failed');err.status=r.status;err.code=j&&j.code;throw err}
  return j;
}

/* ----- licence: what the store's people are told ----- */
const supportText=()=>{const s=ME&&ME.support;return s?`Contact ${esc(s.name)}${s.phone?' on '+esc(s.phone):''}${s.email?(s.phone?' or ':' at ')+esc(s.email):''}.`:'Contact the super admin.'};
function licenseBannerHTML(){
  if(!ME||ME.role==='superadmin'||!ME.license)return'';
  const l=ME.license;
  if(l.expired)return`<div class="monitor license-bad"><span><b>Your license ended on ${dmy(l.expiresAt)}.</b> You can look at your data and download a backup, but not make changes. ${supportText()}</span></div>`;
  if(l.daysLeft!==null&&l.daysLeft<=7)return`<div class="monitor"><span><b>${l.plan==='trial'?'Your free trial':'Your license'} ends ${l.daysLeft===0?'today':l.daysLeft===1?'tomorrow':'in '+l.daysLeft+' days'} (${dmy(l.expiresAt)}).</b> After that the store becomes read-only. ${supportText()}</span></div>`;
  return'';
}
/* the number of seats left, for screens that add people */
function seatInfo(){
  const l=ME&&ME.license;if(!l||ME.role==='superadmin')return null;
  return{used:l.usedUsers,max:l.maxUsers,full:l.usedUsers>=l.maxUsers,expired:l.expired};
}
/* the licence can change while someone is signed in (the super admin renews it, a store is turned off): check now and then */
async function refreshMe(){
  if(!ME)return;
  try{
    const st=await api('GET','auth/status');
    if(!st.user){leave();showGate('login','Your session ended. Please sign in again.');return}
    const was=JSON.stringify([ME.license,ME.role,ME.perms]);
    ME={...ME,...st.user};
    if(JSON.stringify([ME.license,ME.role,ME.perms])!==was){renderNav();renderWho();if(!draft&&!draftCust&&!draftStock&&!draftPur&&!draftSup)render()}   /* never redraw a form someone is filling in */
  }catch(e){}
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
/* ----- sign-in, store sign-up and first-run screens ----- */
function gateHTML(kind,msg){
  if(kind==='offline')return`<div class="gate"><div class="gate-card"><span class="logo big"></span><h1>Cannot reach the server</h1><p class="sub">This app needs its server for sign-in. Start it with <b>npm start</b> and open the address it prints.</p><button class="btn primary" id="g_retry">Try again</button></div></div>`;
  const f=(id,label,type='text',ac='off',extra='')=>`<label>${label}<input id="g_${id}" type="${type}" autocomplete="${ac}" ${extra} required></label>`;
  const pass=ac=>f('pass','Password'+(ac==='new-password'?' (at least 8 characters)':''),'password',ac);
  const contact=f('email','Email','email','email','autocapitalize="none" spellcheck="false"')+f('phone','Phone number (10 digits)','tel','tel','inputmode="tel"');
  const T={
    login:{h:'Sign in',sub:'Jewellery Billing',btn:'Sign in',fields:f('user','Username, email or phone','text','username','autocapitalize="none" spellcheck="false"')+pass('current-password')},
    setup:{h:'Welcome',sub:'Create the super admin account. This person adds stores, sets their licenses and can see all of them.',btn:'Create account',fields:f('name','Your name','text','name')+contact+f('user','Username','text','username','autocapitalize="none" spellcheck="false"')+pass('new-password')},
    signup:{h:'Create your store',sub:'Free for one month, up to 2 users. You become the store owner.',btn:'Create store account',fields:f('store','Store name','text','organization')+f('name','Your name','text','name')+contact+f('user','Choose a username','text','username','autocapitalize="none" spellcheck="false"')+pass('new-password')}
  }[kind];
  const alt=kind==='login'&&signupOpen?'<p class="gate-alt">New store? <button class="link" type="button" id="g_alt">Create an account</button></p>':kind==='signup'?'<p class="gate-alt">Already have an account? <button class="link" type="button" id="g_alt">Sign in</button></p>':'';
  return`<div class="gate">${kind==='login'?scannedCardHTML():''}<form class="gate-card" id="gateForm"><span class="logo big"></span><h1>${T.h}</h1>
    <p class="sub">${T.sub}</p>
    <div class="gate-msg" id="g_msg"${msg?'':' hidden'}>${esc(msg||'')}</div>
    ${T.fields}
    <button class="btn primary" type="submit" style="width:100%;padding:12px">${T.btn}</button>${alt}</form></div>`;
}
function showGate(kind,msg){
  document.body.classList.add('locked');
  $('#view').innerHTML=gateHTML(kind,msg);
  const retry=$('#g_retry');if(retry)retry.onclick=()=>boot();
  const f=$('#gateForm');if(!f)return;
  const alt=$('#g_alt');if(alt)alt.onclick=()=>showGate(kind==='login'?'signup':'login');
  const say=t=>{const m=$('#g_msg');m.textContent=t;m.hidden=false};
  const v=id=>($('#g_'+id)||{}).value||'';
  f.onsubmit=async e=>{
    e.preventDefault();
    const body=kind==='login'?{username:v('user'),password:v('pass')}
      :{...(kind==='signup'?{storeName:v('store')}:{}),name:v('name'),email:v('email'),phone:v('phone'),username:v('user'),password:v('pass')};
    try{const r=await api('POST',{login:'auth/login',setup:'auth/setup',signup:'auth/signup'}[kind],body);await enter(r.user)}
    catch(err){say(err.status===0?'Cannot reach the server.':err.message)}
  };
  const u=$('#g_store')||$('#g_name')||$('#g_user');u&&u.focus&&u.focus();
}
async function boot(){
  try{
    const st=await api('GET','auth/status');
    signupOpen=!!st.signupOpen;
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
const PLAN_LABEL={trial:'Free trial',licensed:'Licensed'};
function licensePanelHTML(){
  const l=ME.license;if(!l)return'';
  const state=l.expired?'<span class="pill due">Ended</span>':l.expiresAt?(l.daysLeft<=7?`<span class="pill part">${l.daysLeft===0?'Ends today':l.daysLeft+' day'+(l.daysLeft===1?'':'s')+' left'}</span>`:'<span class="pill paid">Active</span>'):'<span class="pill paid">No expiry</span>';
  return`<div class="panel"><h2>License</h2>
    <div class="kv"><span>Plan</span><span>${esc(PLAN_LABEL[l.plan]||l.plan)} ${state}</span></div>
    <div class="kv"><span>${l.expired?'Ended on':'Valid until'}</span><span>${l.expiresAt?dmy(l.expiresAt):'No end date'}</span></div>
    <div class="kv"><span>People</span><span>${l.usedUsers} of ${l.maxUsers} allowed</span></div>
    ${ME.role==='admin'?`<p class="set-note" style="margin-top:12px">To renew, or to allow more people, ${supportText().replace(/^Contact/,'contact')}</p>`:''}</div>`;
}
ROUTES.account={
  html(){
    return`<header class="page"><div><h1>Account</h1><p class="sub">Your sign-in details.</p></div><button class="btn danger" id="a_out">Sign out</button></header>
    <div class="stack narrow"><div class="panel stack"><h2 style="margin:0">Your details</h2>
      <div class="grid wide"><label>Name<input id="a_name" value="${esc(ME.name)}"></label>
        <label>Email<input id="a_email" type="email" autocapitalize="none" placeholder="name@example.com" value="${esc(ME.email||'')}"></label>
        <label>Phone number<input id="a_phone" type="tel" placeholder="10 digits" value="${esc(ME.phone||'')}"></label>
        <label>Username<input value="${esc(ME.username)}" disabled></label></div>
      <p class="set-note">You can sign in with your username, email or phone number.${ME.email&&ME.phone?'':' Add the missing details so others cannot take them.'}</p>
      <div class="kv" style="border-top:0;padding:0"><span>Role</span><span>${esc(ROLE_LABEL[ME.role])}${ME.storeName?' · '+esc(ME.storeName):''}</span></div>
      ${ME.role==='user'?`<div class="kv" style="border-top:0;padding:0"><span>Access</span><span>${['invoices','customers','inventory','purchases'].map(a=>cap(a)+': '+PERM_LABEL[ME.perms[a]||'none']).join(' · ')}</span></div>`:''}
      <div class="row"><button class="btn primary" id="a_info">Save details</button></div></div>
    ${licensePanelHTML()}
    <div class="panel stack"><h2 style="margin:0">Change password</h2>
      <div class="grid wide"><label>Current password<input id="a_cur" type="password" autocomplete="current-password"></label>
      <label>New password (at least 8 characters)<input id="a_new" type="password" autocomplete="new-password"></label>
      <label>New password again<input id="a_new2" type="password" autocomplete="new-password"></label></div>
      <div class="row"><button class="btn primary" id="a_save">Change password</button></div></div></div>`;
  },
  bind(){
    $('#a_out').onclick=signOut;
    $('#a_info').onclick=async()=>{
      try{const r=await api('PATCH','auth/me',{name:$('#a_name').value,email:$('#a_email').value,phone:$('#a_phone').value});ME={...ME,...r.user};renderWho();render();toast('Details saved')}
      catch(e){toast(e.message)}
    };
    $('#a_save').onclick=async()=>{
      if($('#a_new').value!==$('#a_new2').value)return toast('The new passwords do not match');
      try{await api('POST','auth/password',{current:$('#a_cur').value,next:$('#a_new').value});['#a_cur','#a_new','#a_new2'].forEach(s=>$(s).value='');toast('Password changed')}
      catch(e){toast(e.message)}
    };
  }
};
const cap=s=>s[0].toUpperCase()+s.slice(1);
const PERM_LABEL={none:'No access',view:'View only',edit:'View and edit'};
