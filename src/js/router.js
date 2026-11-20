/* ---------- router: hash routes, one file per area under routes/ ----------
   #/invoices[/new|/<id>|/<id>/edit]   #/customers[/new|/<id>]   #/inventory[/new|/<id>]   #/analytics
   #/settings/<store|rates|invoicing|preferences|data>   #/users[/new|/<id>]   #/stores[/new]   #/account
   A route file registers ROUTES.<name> = { html(parts) -> string | LOADING | null, bind(parts) }.
   html() returns null after calling go() to redirect. What a person may open depends on their role (see can() in auth.js). */
const ROUTES={};
/* the permission area(s) a route needs; an array means any one of them is enough */
const ROUTE_AREA={invoices:'invoices',customers:'customers',inventory:'inventory',purchases:'purchases',suppliers:'purchases',item:'inventory',scan:'inventory',tags:'inventory',
  analytics:['invoices','purchases','inventory'],settings:'settings',users:'users',stores:'stores',account:null};
const NAV_OF={item:'inventory',scan:'inventory',tags:'inventory',suppliers:'purchases'};   /* which menu entry stays lit */
const NAV_ITEMS={stores:'Stores',users:'Users',analytics:'Analytics',invoices:'Invoices',customers:'Customers',inventory:'Inventory',purchases:'Purchases',settings:'Settings'};
const routeAllowed=name=>{const a=ROUTE_AREA[name];return!a||[].concat(a).some(x=>can(x))};
const LOADING='__loading__';   /* a route returns this while the data it needs is still arriving */
let route={name:'invoices',parts:[]},lastHash=null;
let draft=null,draftCust=null,draftStock=null,draftPur=null,draftSup=null;   /* the record being edited; kept only while its route is open */

/* what the side menu shows for this person */
function navList(){
  if(!ME)return[];
  const out=[];
  if(ME.role==='superadmin'){
    out.push('stores','users');
    if(monitor)out.push('|'+monitor.name,'analytics','invoices','customers','inventory','purchases','settings');
  }else{
    ['invoices','customers','inventory','purchases','analytics','users','settings'].forEach(k=>{if(routeAllowed(k))out.push(k)});
  }
  return out;
}
const defaultRoute=()=>{const r=navList().find(k=>k[0]!=='|');return r||'account'};
function renderNav(){
  $('#nav').innerHTML=navList().map(k=>k[0]==='|'?`<div class="nav-label">${esc(k.slice(1))}<small>read-only</small></div>`:`<a href="#/${k}" data-r="${k}">${icon(k)}<span>${NAV_ITEMS[k]}</span></a>`).join('');
}
function parseHash(){
  const p=(location.hash||'').replace(/^#\/?/,'').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
  const qs=((location.hash||'').split('?')[1]||'').split('#')[0];
  return{name:p[0]||(ME?defaultRoute():'invoices'),parts:p.slice(1),query:new URLSearchParams(qs)};
}
function go(path){const h='#/'+path;if(location.hash===h)render();else location.hash=h}
const invEditorRoute=r=>r.name==='invoices'&&(r.parts[0]==='new'||r.parts[1]==='edit');
const noAccessHTML=()=>`<div class="empty"><b>Nothing to open here</b><p style="margin-top:6px">Your account does not have access to this part of the app. Ask your store admin to change your role.</p></div>`;
const monitorBanner=()=>monitor?`<div class="monitor"><span><b>${esc(monitor.name)}</b> · read-only view of this store</span><a href="#/stores" id="m_exit">Back to all stores</a></div>`:'';

function render(){
  if(!ME)return;
  route=parseHash();
  const def=ROUTES[route.name];
  if(!def)return go(defaultRoute());
  if(!routeAllowed(route.name)){
    const d=defaultRoute();
    if(d!==route.name&&routeAllowed(d))return go(d);
    $('#view').innerHTML=noAccessHTML();return;
  }
  if(!invEditorRoute(route)&&!(route.name==='customers'&&draftCust&&draftCust.fromInvoice))draft=null;
  if(!(route.name==='customers'&&route.parts.length))draftCust=null;
  if(!(route.name==='inventory'&&route.parts.length))draftStock=null;
  const purEditor=route.name==='purchases'&&(route.parts[0]==='new'||route.parts[1]==='edit');
  if(!purEditor&&!(route.name==='suppliers'&&draftSup&&draftSup.fromPurchase))draftPur=null;
  if(!(route.name==='suppliers'&&route.parts.length))draftSup=null;
  stopScan();
  document.body.classList.toggle('tag-print',route.name==='tags');
  const lit=NAV_OF[route.name]||route.name;
  $$('#nav a').forEach(a=>a.setAttribute('aria-current',a.dataset.r===lit?'page':'false'));
  const wh=$('#who a');if(wh)wh.setAttribute('aria-current',String(route.name==='account'));
  $('#brandName').textContent=ME.role==='superadmin'?'Jewellery Billing':(S.settings.store.name||'Jewellery Billing');
  const html=def.html(route.parts);
  if(html==null)return;
  const v=$('#view');
  if(html===LOADING||(!ready&&route.name!=='account')){v.innerHTML=monitorBanner()+licenseBannerHTML()+'<div class="empty">Loading…</div>';return}
  v.innerHTML=monitorBanner()+licenseBannerHTML()+html;
  if(lastHash!==location.hash){lastHash=location.hash;sampleConfirm=false;   /* a half-done "click again to remove" does not survive leaving the page */v.style.animation='none';void v.offsetWidth;v.style.animation='';window.scrollTo&&window.scrollTo(0,0)}
  def.bind(route.parts);
}
