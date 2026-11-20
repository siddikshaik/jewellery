/* ---------- helpers shared by every route ---------- */
const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>{const n=parseFloat(v);return isFinite(n)?n:0};
const fmt=n=>n.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const inr=n=>'₹'+fmt(n);
const wt=n=>n.toFixed(3);
const uid=()=>Math.random().toString(36).slice(2,10);
const today=()=>new Date().toISOString().slice(0,10);
const dmy=d=>{const[p,q,r]=(d||'').split('-');return r?`${r}-${q}-${p}`:d};
const clone=o=>JSON.parse(JSON.stringify(o));

const GK=['24K','22K','18K','14K','9K'];
const PURITY={Gold:GK,Silver:['999 Fine','925 Sterling','800']};
const goldKey=p=>(parseInt(p)||24)+'K';
const TEMPLATES={classic:'Classic',modern:'Modern',elegant:'Elegant'};

const ICONS={
  invoices:'<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M9.5 13h6M9.5 17h6"/>',
  customers:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M17 14c2.5 0 4.5 2 4.5 4.5"/>',
  analytics:'<path d="M4 20V11M10 20V4M16 20v-7M21 20H3"/>',
  settings:'<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/>',
  inventory:'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  users:'<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  stores:'<path d="M4 9l1.5-5h13L20 9M4 9h16M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>',
  purchases:'<path d="M6 8h12l-1 12H7z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  account:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>'
};
const icon=n=>`<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

function toast(t){const e=$('#toast');e.textContent=t;e.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>e.hidden=true,2600)}
function setSync(t){$('#sync').textContent=t}

/* read an image file, shrink it to fit maxW x maxH and return a PNG data URL (keeps transparency, keeps the stored file small) */
function readLogo(file,maxW=480,maxH=240){
  return new Promise((ok,fail)=>{
    const fr=new FileReader();
    fr.onerror=()=>fail(new Error('read'));
    fr.onload=()=>{const im=new Image();im.onerror=()=>fail(new Error('image'));
      im.onload=()=>{const k=Math.min(1,maxW/im.naturalWidth,maxH/im.naturalHeight),w=Math.max(1,Math.round(im.naturalWidth*k)),h=Math.max(1,Math.round(im.naturalHeight*k));
        const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(im,0,0,w,h);ok(c.toDataURL('image/png'))};
      im.src=fr.result};
    fr.readAsDataURL(file);
  });
}
const loadImg=src=>new Promise((ok,fail)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=fail;im.src=src});

/* save a file: Claude artifact downloads when available, otherwise a normal browser download. Resolves true when saved. */
async function saveBlob(blob,name){
  try{const dl=await window.claude?.use?.('downloads');if(dl){await dl.save({filename:name,data:blob});return true}}
  catch(e){if(e&&e.code==='not_granted'||/declin|cancel/i.test(String(e&&e.message)))return false}
  try{const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);return true}
  catch(e){toast('Download is not available in this view');return false}
}
