/* ---------- route: settings (store details, today's rates, invoicing, preferences, data & backup) ---------- */
const SET_TABS=[['store','Store details'],['rates',"Today's rates"],['invoicing','Invoicing'],['preferences','Preferences'],['data','Data & backup'],['sample','Sample data']];
let pendingRestore=null;
const SECTIONS={
  store:{html:storeHTML,bind:bindStore},rates:{html:ratesHTML,bind:bindRates},invoicing:{html:invoicingHTML,bind:bindInvoicing},
  preferences:{html:preferencesHTML,bind:bindPreferences},data:{html:dataHTML,bind:bindData},sample:{html:sampleSectionHTML,bind:bindSampleUI}
};
ROUTES.settings={
  html(p){if(!SECTIONS[p[0]]||(p[0]==='sample'&&!sampleAllowed())){go('settings/store');return null}return settingsHTML(p[0])},
  bind(p){SECTIONS[p[0]].bind();if(!can('settings','edit'))lockFields()}
};
/* theme is a per-browser choice, not store data */
const THEME_KEY='jb-theme';
const getTheme=()=>{try{return localStorage.getItem(THEME_KEY)||'system'}catch(e){return'system'}};
function applyTheme(){
  const t=getTheme(),r=document.documentElement;if(!r)return;
  if(t==='light'||t==='dark')r.setAttribute('data-theme',t);else r.removeAttribute('data-theme');
}
/* people who may look but not change: disable the fields and hide the save buttons */
function lockFields(){
  $$('#view input,#view select,#view textarea,#view .tpl-pick button').forEach(e=>{e.disabled=true});
  $$('#view .btn:not(#d_export)').forEach(e=>{e.hidden=true});
}
function settingsHTML(sec){
  return `<header class="page"><div><h1>Settings</h1><p class="sub">Your store, rates and how the app behaves.</p></div></header>
  <nav class="seg tabs" aria-label="Settings sections">${SET_TABS.filter(([k])=>k!=='sample'||sampleAllowed()).map(([k,l])=>`<a href="#/settings/${k}" aria-current="${k===sec}">${l}</a>`).join('')}</nav>
  ${can('settings','edit')?'':'<p class="set-note" style="margin:-8px 0 16px">You can look at these settings but not change them.</p>'}
  ${SECTIONS[sec].html()}`;
}

/* ----- store details ----- */
function storeHTML(){
  const s=S.settings.store;
  return `<div class="panel stack narrow"><div><h2 style="margin:0">Store details</h2><p class="set-note">Printed at the top of every invoice.</p></div>
    <div class="grid wide"><label>Store name<input id="s_name" value="${esc(s.name)}"></label><label>Phone<input id="s_phone" type="tel" value="${esc(s.phone)}"></label>
    <label>GSTIN<input id="s_gstin" value="${esc(s.gstin)}"></label></div>
    <label>Address<textarea id="s_addr">${esc(s.address)}</textarea></label>
    <label>App address for QR codes<input id="s_url" inputmode="url" autocapitalize="none" spellcheck="false" placeholder="e.g. http://192.168.1.20:3000 or https://billing.yourshop.com" value="${esc(s.appUrl||'')}"></label>
    <p class="set-note" style="margin-top:-8px">Tag QR codes open this address when scanned. Use the address your phones can reach (not localhost). Now: <b>${esc(appBase())}</b></p>
    <div><div class="sub-h" style="margin-bottom:10px">Logo</div>
      <div class="logo-pick"><div class="logo-prev" id="s_logoprev">${logoPrev(s.logo)}</div>
        <div class="stack" style="gap:8px"><div class="row"><label class="btn" style="flex-direction:row;cursor:pointer">Choose image<input id="s_logo" type="file" accept="image/*" hidden></label><button class="btn danger" id="s_logo_rm"${s.logo?'':' hidden'}>Remove</button></div>
        <span class="set-note">PNG, JPG or SVG. Printed on every invoice and PDF. A wide logo on a transparent background looks best.</span></div></div></div>
    <div class="row"><button class="btn primary" id="s_save">Save store details</button></div></div>`;
}
const logoPrev=l=>l?`<img src="${esc(l)}" alt="Store logo">`:'<span class="muted">No logo</span>';
function bindStore(){
  let logo=S.settings.store.logo||'';
  const show=()=>{$('#s_logoprev').innerHTML=logoPrev(logo);$('#s_logo_rm').hidden=!logo};
  $('#s_logo').onchange=async e=>{const f=e.target.files&&e.target.files[0];if(!f)return;
    try{logo=await readLogo(f);show()}catch(err){toast('That image could not be read')}};
  $('#s_logo_rm').onclick=()=>{logo='';show()};
  $('#s_save').onclick=()=>{
    const s=S.settings.store;s.logo=logo;
    s.name=$('#s_name').value.trim()||'Your Jewellery Store';s.phone=$('#s_phone').value.trim();s.gstin=$('#s_gstin').value.trim();s.address=$('#s_addr').value;s.appUrl=$('#s_url').value.trim().replace(/\/+$/,'');
    persist();render();toast('Store details saved');
  };
}

/* ----- today's rates ----- */
function ratesHTML(){
  const r=S.rates;
  return `<div class="stack"><p class="set-note">${r.date?'Last updated '+dmy(r.date)+'. ':''}Set your rates once a day. New invoices use them automatically.</p>
  <div class="rates"><div class="rate-card" style="--c:var(--gold)"><h2>Gold, per gram (₹)</h2><div class="grid">${GK.map(k=>`<label>${k} ${k==='24K'||k==='22K'?'(required)':'(optional)'}<input id="r_${k}" type="number" min="0" step="any" inputmode="decimal" value="${r.gold[k]??''}"></label>`).join('')}</div><span class="set-note">Only purities with a rate can be picked on an item. An invoice lists just the rates of the purities it uses.</span></div>
  <div class="rate-card" style="--c:var(--silver)"><h2>Silver, per gram (₹)</h2><label>Silver (optional)<input id="r_s" type="number" min="0" step="any" inputmode="decimal" value="${r.silver??''}"></label><span class="set-note">One rate for every silver item.</span></div></div>
  <div class="row"><button class="btn primary" id="r_save">Save today's rates</button></div>
  <p class="set-note">Saved invoices keep the rates they were made with, so changing rates here never alters past bills.</p></div>`;
}
function bindRates(){$('#r_save').onclick=()=>{
  const g={};for(const k of GK){const v=num($('#r_'+k).value);g[k]=v>0?v:''}
  if(!g['24K']||!g['22K'])return toast('24K and 22K rates are required');
  const s=num($('#r_s').value);
  S.rates={gold:g,silver:s>0?s:'',date:today()};persist();render();toast('Rates saved')}}

/* ----- invoicing ----- */
function invoicingHTML(){
  const s=S.settings.invoice,pu=S.settings.purchase,sw={classic:'linear-gradient(#fffdf6,#f3e9c8)',modern:'linear-gradient(#243b6b 35%,#fff 35%)',elegant:'#15161a'};
  return `<div class="panel stack narrow"><div><h2 style="margin:0">Invoicing</h2><p class="set-note">Defaults copied into each new invoice. Saved invoices are never changed.</p></div>
    <div class="grid"><label>Default Central GST (%)<input id="s_cg" type="number" step="any" min="0" value="${s.cgst}"></label>
    <label>Default State GST (%)<input id="s_sg" type="number" step="any" min="0" value="${s.sgst}"></label>
    <label>Invoice prefix<input id="s_pre" value="${esc(s.prefix)}"></label>
    <label>Start numbering from<input id="s_next" type="number" min="1" step="1" value="${s.next}"></label></div>
    <label>Terms printed on invoice<textarea id="s_terms">${esc(s.terms)}</textarea></label>
    <label class="check"><input type="checkbox" id="s_huid"${s.requireHuid?' checked':''}> Do not allow billing a gold item without its HUID</label>
    <div><div class="sub-h" style="margin-bottom:10px">Purchases</div><div class="grid">
      <label>Default Central GST (%)<input id="p_cg" type="number" step="any" min="0" value="${pu.cgst}"></label><label>Default State GST (%)<input id="p_sg" type="number" step="any" min="0" value="${pu.sgst}"></label>
      <label>Purchase prefix<input id="p_pre" value="${esc(pu.prefix)}"></label><label>Start purchase numbers from<input id="p_next" type="number" min="1" step="1" value="${pu.next}"></label></div></div>
    <div><div class="sub-h" style="margin-bottom:10px">Default invoice template</div><div class="tpl-pick" id="s_tpl">${Object.entries(TEMPLATES).map(([k,v])=>`<button data-t="${k}" aria-pressed="${k===s.template}"><i style="background:${sw[k]}"></i><b>${v}</b></button>`).join('')}</div></div>
    <div class="row"><button class="btn primary" id="s_save">Save invoicing</button></div></div>`;
}
function bindInvoicing(){
  let tpl=S.settings.invoice.template;
  $('#s_tpl').onclick=e=>{const b=e.target.closest('[data-t]');if(!b)return;tpl=b.dataset.t;$$('#s_tpl button').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.t===tpl)))};
  $('#s_save').onclick=()=>{
    const s=S.settings.invoice;
    s.terms=$('#s_terms').value;s.cgst=num($('#s_cg').value);s.sgst=num($('#s_sg').value);s.requireHuid=$('#s_huid').checked;
    const pu=S.settings.purchase;pu.cgst=num($('#p_cg').value);pu.sgst=num($('#p_sg').value);pu.prefix=$('#p_pre').value;pu.next=Math.max(1,Math.floor(num($('#p_next').value))||1);
    s.prefix=$('#s_pre').value;s.next=Math.max(1,Math.floor(num($('#s_next').value))||1);s.template=tpl;
    persist();render();toast('Invoicing saved');
  };
}

/* ----- preferences ----- */
const splitList=t=>[...new Set(String(t).split(/[,\n]/).map(x=>x.trim()).filter(Boolean))];
function preferencesHTML(){
  const a=S.settings.app;
  return `<div class="panel stack narrow"><div><h2 style="margin:0">Preferences</h2><p class="set-note">How the app looks and the choices offered while billing.</p></div>
    <div><div class="sub-h" style="margin-bottom:10px">Appearance on this device</div><div class="seg" id="p_theme">${[['system','Automatic'],['light','Light'],['dark','Dark']].map(([k,l])=>`<button data-t="${k}" aria-pressed="${getTheme()===k}">${l}</button>`).join('')}</div></div>
    <label>Payment modes (separated by commas)<input id="p_modes" value="${esc(a.paymentModes.join(', '))}"></label>
    <label>Quick-add charges on invoices (separated by commas)<input id="p_quick" value="${esc(a.quickCharges.join(', '))}"></label>
    <div class="row"><button class="btn primary" id="p_save">Save preferences</button></div></div>`;
}
function bindPreferences(){
  $('#p_theme').onclick=e=>{const b=e.target.closest('[data-t]');if(!b)return;try{localStorage.setItem(THEME_KEY,b.dataset.t)}catch(err){}applyTheme();render()};
  $('#p_save').onclick=()=>{
    const m=splitList($('#p_modes').value);if(!m.length)return toast('Keep at least one payment mode');
    S.settings.app.paymentModes=m;S.settings.app.quickCharges=splitList($('#p_quick').value);
    persist();render();toast('Preferences saved');
  };
}

/* ----- data & backup ----- */
const backupName=()=>'jewellery-billing-backup-'+String(S.settings.store.name||'store').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join('-')+'-'+today()+'.json';
function backupObject(){return{app:'jewellery-billing',version:3,exportedAt:new Date().toISOString(),...clone(S)}}
function dataHTML(){
  const files=[['settings.json','Store, invoicing and app preferences'],['rates.json',"Today's rates"],['customers.json',S.customers.length+' customers'],['invoices.json',S.invoices.length+' invoices (with their payments)'],['inventory.json',S.inventory.length+' stock items'],['suppliers.json',S.suppliers.length+' suppliers'],['purchases.json',S.purchases.length+' purchase bills (with their payments)']];
  const pr=pendingRestore;
  return `<div class="stack narrow"><div class="panel"><h2>Where your data lives</h2>
    <div class="kv"><span>Store</span><span>${esc(S.settings.store.name)}</span></div>
    ${files.map(([f,d])=>`<div class="kv"><span>${f}</span><span>${esc(d)}</span></div>`).join('')}
    <p class="set-note" style="margin-top:12px">Each store keeps these files in its own folder under <b>data/stores/</b>. Back up the whole <b>data</b> folder, or use the button below for this store.</p></div>
  <div class="panel stack"><h2 style="margin:0">Backup</h2>
    <div class="row"><button class="btn primary" id="d_export">Download backup</button></div>
    <label>Restore from a backup file<input id="d_file" type="file" accept="application/json,.json"></label>
    ${pr?`<div class="panel" style="background:var(--warn-soft);box-shadow:none"><b>Replace everything with this backup?</b><p class="set-note" style="color:inherit;margin:4px 0 12px">${pr.customers.length} customers and ${pr.invoices.length} invoices. Current data on this screen will be overwritten.</p>
      <div class="row"><button class="btn danger" id="d_confirm">Replace all data</button><button class="btn" id="d_cancel">Cancel</button></div></div>`:''}</div></div>`;
}
function bindData(){
  $('#d_export').onclick=async()=>{if(await saveBlob(new Blob([JSON.stringify(backupObject(),null,2)],{type:'application/json'}),backupName()))toast('Backup saved')};
  $('#d_file').onchange=async e=>{
    const f=e.target.files&&e.target.files[0];if(!f)return;
    try{const d=normalize(JSON.parse(await f.text()));if(!d)throw 0;pendingRestore=d;render()}
    catch(err){pendingRestore=null;toast('That file is not a valid backup')}
  };
  if(pendingRestore){
    $('#d_cancel').onclick=()=>{pendingRestore=null;render()};
    $('#d_confirm').onclick=()=>{S=pendingRestore;pendingRestore=null;applyTheme();persist();render();toast('Backup restored')};
  }
}
