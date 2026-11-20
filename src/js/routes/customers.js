/* ---------- route: customers ---------- */
let qCust='';
ROUTES.customers={
  html(p){
    if(!p.length)return customersHTML();
    if(!can('customers','edit')){go('customers');return null}
    if(p[0]==='new'){if(!draftCust||!draftCust.isNew)draftCust=newCustomer();return customerFormHTML(draftCust)}
    const c=custOf(p[0]);
    if(!c){if(!ready)return LOADING;go('customers');return null}
    if(!draftCust||draftCust.id!==c.id)draftCust={...c};
    return customerFormHTML(draftCust);
  },
  bind(p){p.length?bindCustomerForm(draftCust):bindCustomers()}
};
function customerFormHTML(c){
  return `<header class="page"><h1>${c.isNew?'New customer':'Edit customer'}</h1></header>
    <div class="panel stack narrow"><div class="grid wide"><label>Name<input id="c_name" value="${esc(c.name)}"></label><label>Phone (WhatsApp)<input id="c_phone" type="tel" value="${esc(c.phone)}"></label>
    <label>Email<input id="c_email" type="email" placeholder="name@example.com" value="${esc(c.email)}"></label>
    <label>Instagram handle<input id="c_insta" placeholder="@handle" value="${c.instagram?'@'+esc(c.instagram):''}"></label>
    <label>GSTIN (optional)<input id="c_gstin" value="${esc(c.gstin)}"></label></div><label>Address<textarea id="c_addr">${esc(c.address)}</textarea></label>
    <div class="row"><button class="btn primary" id="c_save">Save customer</button><button class="btn" id="c_cancel">Cancel</button></div></div>`;
}
function bindCustomerForm(c){
  const back=()=>{if(c.fromInvoice&&draft)return go(draft.isNew?'invoices/new':'invoices/'+draft.id+'/edit');go('customers')};
  $('#c_cancel').onclick=()=>{back();draftCust=null};
  $('#c_save').onclick=()=>{
    c.name=$('#c_name').value.trim();c.phone=$('#c_phone').value.trim();c.gstin=$('#c_gstin').value.trim();c.address=$('#c_addr').value;
    c.email=$('#c_email').value.trim();c.instagram=$('#c_insta').value.trim().replace(/^@+/,'').replace(/\s+/g,'');
    if(!c.name)return toast('Enter the customer name');
    if(c.email&&!/^\S+@\S+\.\S+$/.test(c.email))return toast('Enter a valid email address');
    const rec={id:c.id,name:c.name,phone:c.phone,email:c.email,instagram:c.instagram,gstin:c.gstin,address:c.address};
    const i=S.customers.findIndex(x=>x.id===c.id);if(i>=0)S.customers[i]=rec;else S.customers.push(rec);
    persist();if(c.fromInvoice&&draft)draft.customerId=c.id;
    back();draftCust=null;toast('Customer saved');
  };
}
function customersHTML(){
  const q=qCust.toLowerCase();
  const list=[...S.customers].sort((a,b)=>a.name.localeCompare(b.name)).filter(c=>!q||c.name.toLowerCase().includes(q)||(c.phone||'').includes(q)||(c.email||'').toLowerCase().includes(q)||(c.instagram||'').toLowerCase().includes(q));
  return `<header class="page"><div><h1>Customers</h1><p class="sub">${S.customers.length} saved</p></div>
    <div class="row"><input id="q" type="search" placeholder="Search name, phone, email" value="${esc(qCust)}" style="width:240px">${can('customers','edit')?'<button class="btn primary" id="newC">New customer</button>':''}</div></header>
    <div class="list">${list.length?list.map(c=>{const mine=S.invoices.filter(i=>i.customerId===c.id),owe=mine.reduce((a,i)=>a+money(i).bal,0),inv=can('invoices'),ed=can('customers','edit');
      const contact=[c.phone||'No phone',c.email,c.instagram&&'@'+c.instagram].filter(Boolean).map(esc).join(' · ');
      return `<div class="item"><div class="main"><b>${esc(c.name)}${sampleTag(c)}</b><span class="sub">${contact}</span>${inv?`<span class="sub">${mine.length} invoice${mine.length===1?'':'s'}${owe>0.004?` · <span class="dueamt">Balance ${inr(owe)}</span>`:''}</span>`:''}</div>
      <div class="row">${can('invoices','edit')?`<button class="btn sm" data-bill="${c.id}">Bill</button>`:''}${ed?`<button class="btn sm" data-edit="${c.id}">Edit</button><button class="btn sm danger" data-del="${c.id}">Delete</button>`:''}</div></div>`}).join('')
      :`<div class="empty">No customers yet. Choose New customer to add one.</div>`}</div>`;
}
function bindCustomers(){
  const nc=$('#newC');if(nc)nc.onclick=()=>{draftCust=null;go('customers/new')};
  $('#q').oninput=e=>{qCust=e.target.value;const p=e.target.selectionStart;render();const q=$('#q');q.focus();q.setSelectionRange(p,p)};
  $$('[data-edit]').forEach(b=>b.onclick=()=>{draftCust=null;go('customers/'+b.dataset.edit)});
  $$('[data-bill]').forEach(b=>b.onclick=()=>{draft=newInvoice();draft.customerId=b.dataset.bill;ratesOpen=false;go('invoices/new')});
  $$('[data-del]').forEach(b=>b.onclick=()=>{
    if(b.dataset.arm!=='1'){b.dataset.arm='1';b.textContent='Confirm';return}
    S.customers=S.customers.filter(c=>c.id!==b.dataset.del);persist();render();toast('Customer deleted')});
}
