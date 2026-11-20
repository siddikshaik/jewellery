/* ---------- PDF (three templates). Rupee sign is 'Rs.' because jsPDF's built-in fonts have no ₹ glyph. ---------- */
const PT={
  classic:{bg:null,ink:[42,36,21],muted:[122,110,82],accent:[138,106,31],headFill:[243,233,200],headInk:[74,58,16],zebra:null,line:[226,214,176],totFill:[243,233,200],totInk:[74,58,16],border:[184,146,58],title:'times'},
  modern:{bg:null,ink:[28,36,51],muted:[102,112,137],accent:[36,59,107],headFill:[36,59,107],headInk:[255,255,255],zebra:[244,246,251],line:[227,231,239],totFill:[36,59,107],totInk:[255,255,255],band:[36,59,107],title:'helvetica'},
  elegant:{bg:[21,22,26],ink:[232,226,208],muted:[155,149,127],accent:[212,175,55],headFill:[30,31,36],headInk:[212,175,55],zebra:[29,30,35],line:[52,53,60],totFill:[212,175,55],totInk:[21,22,26],title:'times'}
};
async function makePDF(inv){
  if(!window.jspdf)return toast('PDF library did not load. Check your connection.');
  const{jsPDF}=window.jspdf,d=new jsPDF({unit:'mm',format:'a4'}),s=storeOf(),c=calc(inv),cu=custOf(inv.customerId)||{name:''};
  const tn=tplOf(inv),T=PT[tn],L=13,R=197;
  const ink=()=>d.setTextColor(...T.ink),mute=()=>d.setTextColor(...T.muted),acc=()=>d.setTextColor(...T.accent);
  const paint=()=>{
    if(T.bg){d.setFillColor(...T.bg);d.rect(0,0,210,297,'F')}
    if(T.border){d.setDrawColor(...T.border);d.setLineWidth(.6);d.rect(7,7,196,283);d.setLineWidth(.2);d.rect(8.5,8.5,193,280)}
    d.setLineWidth(.2);ink();
  };
  paint();
  let y;
  /* logo: measured first so the header can make room for it */
  let lg=null;
  if(s.logo){try{const im=await loadImg(s.logo),k=Math.min(40/im.naturalWidth,16/im.naturalHeight);lg={w:im.naturalWidth*k,h:im.naturalHeight*k}}catch(e){}}
  const put=(x,yy)=>d.addImage(s.logo,'PNG',x,yy,lg.w,lg.h);
  /* header */
  const addr=(s.address||'').split('\n').filter(Boolean),ids=[s.phone&&'Phone: '+s.phone,s.gstin&&'GSTIN: '+s.gstin].filter(Boolean).join('   ');
  const info=addr.concat(ids?[ids]:[]);
  if(tn==='modern'){
    d.setFillColor(...T.band);d.rect(0,0,210,36,'F');d.setFillColor(88,120,196);d.rect(0,36,210,1.4,'F');
    let tx=L;
    if(lg){d.setFillColor(255,255,255);d.roundedRect(L,8,lg.w+4,lg.h+4,2.5,2.5,'F');put(L+2,10);tx=L+lg.w+10}
    d.setTextColor(255);d.setFont('helvetica','bold');d.setFontSize(18);d.text(s.name||'',tx,14);
    d.setFont('helvetica','normal');d.setFontSize(8.5);let yy=20;info.forEach(l=>{d.text(l,tx,yy);yy+=4});
    d.setFont('helvetica','bold');d.setFontSize(13);d.text('TAX INVOICE',R,14,{align:'right'});
    y=48;
  }else if(tn==='classic'){
    y=20;if(lg){put(105-lg.w/2,13);y=13+lg.h+8}
    d.setFont('times','bold');d.setFontSize(22);acc();d.text(s.name||'',105,y,{align:'center'});
    d.setFont('helvetica','normal');d.setFontSize(8.5);mute();y+=6;info.forEach(l=>{d.text(l,105,y,{align:'center'});y+=4});
    d.setDrawColor(...T.border);d.line(L,y,R,y);d.line(L,y+.9,R,y+.9);y+=7;
    d.setFont('helvetica','bold');d.setFontSize(11);acc();d.text('TAX INVOICE',105,y,{align:'center'});y+=8;
  }else{
    y=20;let tx=L;if(lg){put(L,13);tx=L+lg.w+6}
    d.setFont('times','bold');d.setFontSize(22);acc();d.text(s.name||'',tx,y);
    d.setFont('helvetica','bold');d.setFontSize(12);d.text('TAX INVOICE',R,y,{align:'right'});
    d.setFont('helvetica','normal');d.setFontSize(8.5);mute();y+=6;info.forEach(l=>{d.text(l,tx,y);y+=4});
    if(lg)y=Math.max(y,13+lg.h+3);
    d.setDrawColor(...T.accent);d.setLineWidth(.35);d.line(L,y,R,y);d.setLineWidth(.2);y+=8;
  }
  /* bill to + invoice details */
  const my=y;
  d.setFontSize(7.5);d.setFont('helvetica','bold');mute();d.text('BILL TO',L,y);y+=4.5;
  d.setFontSize(10.5);ink();d.text(cu.name||'',L,y);d.setFont('helvetica','normal');d.setFontSize(9);mute();y+=4.5;
  (cu.address||'').split('\n').filter(Boolean).forEach(l=>{d.text(l,L,y);y+=4});
  contactLines(cu,x=>x).forEach(l=>{d.text(l.replace(/ · /g,'   '),L,y);y+=4});
  let ry=my;d.setFontSize(7.5);d.setFont('helvetica','bold');mute();d.text('INVOICE DETAILS',R,ry,{align:'right'});ry+=4.5;
  d.setFontSize(9);ink();d.text(inv.no+'   |   '+dmy(inv.date)+'   |   '+docStatus(inv),R,ry,{align:'right'});ry+=4.5;
  y=Math.max(y,ry)+4;
  /* table */
  const cols=[['#',5,'l'],['Item',28,'l'],['Gross\nwt (g)',12,'r'],['Stone\nwt (g)',12,'r'],['Beads\nwt (g)',12,'r'],['Net\nwt (g)',12,'r'],['Rate\nper g',13,'r'],['Metal\nvalue',18,'r'],['Making\n(% of net)',19,'r'],['Stone\ncharges',13,'r'],['Beads\ncharges',13,'r'],['Amount',19,'r']];
  const k=(R-L)/cols.reduce((a,x)=>a+x[1],0),xs=[];let x=L;cols.forEach(cl=>{xs.push(x);x+=cl[1]*k});
  const cell=(i,t,yy)=>{const cl=cols[i],w=cl[1]*k;cl[2]==='r'?d.text(t,xs[i]+w-1,yy,{align:'right'}):d.text(t,xs[i]+1,yy)};
  const head=()=>{d.setFillColor(...T.headFill);d.roundedRect(L,y,R-L,10,1.6,1.6,'F');if(tn==='elegant'){d.setDrawColor(...T.accent);d.line(L,y+10,R,y+10)}
    d.setFont('helvetica','bold');d.setFontSize(7);d.setTextColor(...T.headInk);cols.forEach((cl,i)=>{const p=cl[0].split('\n');p.forEach((t,j)=>cell2(i,t,y+(p.length>1?3.8+j*3.4:6)))});y+=10;d.setFont('helvetica','normal')};
  const cell2=cell;
  head();
  c.rows.forEach((r,i)=>{
    const nm=d.splitTextToSize(r.name||r.metal,cols[1][1]*k-2);const h=Math.max(11,nm.length*3.5+6.5+(r.huid?3:0));
    if(y+h>262){d.addPage();paint();y=16;head()}
    if(T.zebra&&i%2===1){d.setFillColor(...T.zebra);d.rect(L,y,R-L,h,'F')}
    d.setFontSize(7.5);ink();d.setFont('helvetica','normal');
    const yy=y+4.5;
    cell(0,String(i+1),yy);d.text(nm,xs[1]+1,yy);mute();d.setFontSize(6.5);d.text(r.metal+' '+r.purity,xs[1]+1,yy+nm.length*3.5-.2);if(r.huid){d.setFont('helvetica','bold');d.text('HUID '+r.huid,xs[1]+1,yy+nm.length*3.5+2.8);d.setFont('helvetica','normal')}
    d.setFontSize(7.5);ink();
    cell(2,wt(r.gross),yy);cell(3,wt(r.sw),yy);cell(4,wt(r.bw),yy);cell(5,wt(r.net),yy);cell(6,fmt(r.rate),yy);cell(7,fmt(r.value),yy);
    cell(8,fmt(r.making),yy);mute();d.setFontSize(6);cell(8,+r.pct.toFixed(3)+'% | '+wt(r.mwt)+' g',yy+3.6);d.setFontSize(7.5);ink();cell(9,fmt(r.stone),yy);cell(10,fmt(r.beads),yy);d.setFont('helvetica','bold');cell(11,fmt(r.amount),yy);d.setFont('helvetica','normal');
    y+=h;d.setDrawColor(...T.line);d.line(L,y,R,y);
  });
  /* weight and charge totals row */
  d.setFont('helvetica','bold');d.setFontSize(7.5);ink();d.setDrawColor(...T.accent);d.line(L,y,R,y);y+=4.8;
  cell(1,'Total',y);cell(2,wt(c.t.gross),y);cell(3,wt(c.t.sw),y);cell(4,wt(c.t.bw),y);cell(5,wt(c.t.net),y);cell(7,fmt(c.t.metal),y);cell(8,fmt(c.t.making),y);cell(9,fmt(c.t.stone),y);cell(10,fmt(c.t.beads),y);
  y+=9;
  /* charges breakup + totals */
  const L2=lines(inv,c),mn=money(inv),need=(L2.length+5+(mn.paid>0?2:0))*5.4+14;
  if(y+need>268){d.addPage();paint();y=16}
  const ty0=y;
  d.setFontSize(9);
  const tl=(lab,val,bold,col)=>{d.setFont('helvetica',bold?'bold':'normal');col?col():ink();d.text(lab,120,y);d.text(val,R,y,{align:'right'});y+=5.4};
  d.setFontSize(7.5);d.setFont('helvetica','bold');mute();d.text('CHARGES',120,y);y+=5;d.setFontSize(9);
  L2.forEach(([l,a])=>tl(l,'Rs. '+fmt(a)));
  d.setDrawColor(...T.line);d.line(120,y-3.4,R,y-3.4);
  tl('Subtotal','Rs. '+fmt(c.sub),true);
  tl('Central GST '+num(inv.cgst)+'%','Rs. '+fmt(c.cgst));tl('State GST '+num(inv.sgst)+'%','Rs. '+fmt(c.sgst));
  tl('Round off',(c.round>=0?'+':'-')+fmt(Math.abs(c.round)),false,mute);
  d.setFillColor(...T.totFill);d.roundedRect(120,y-2.5,R-120,10,2,2,'F');
  d.setTextColor(...T.totInk);d.setFont('helvetica','bold');d.setFontSize(11);d.text('Total',123,y+4);d.text('Rs. '+fmt(c.total),R-3,y+4,{align:'right'});y+=11;
  if(mn.paid>0){d.setFontSize(9);tl('Paid','Rs. '+fmt(mn.paid));tl('Balance due','Rs. '+fmt(mn.bal),true)}
  /* left: words + notes */
  let ly=ty0;d.setFont('helvetica','bold');d.setFontSize(7.5);mute();d.text('AMOUNT IN WORDS',L,ly);ly+=4.5;
  d.setFont('helvetica','italic');d.setFontSize(9);ink();const wl=d.splitTextToSize(wordsInr(c.total),95);d.text(wl,L,ly);ly+=wl.length*4.2+4;
  if(inv.notes){d.setFont('helvetica','bold');d.setFontSize(7.5);mute();d.text('NOTES',L,ly);ly+=4.5;d.setFont('helvetica','normal');d.setFontSize(8.5);ink();const nl=d.splitTextToSize(inv.notes,95);d.text(nl,L,ly)}
  /* footer */
  let fy=Math.max(y+8,262);if(fy>276){d.addPage();paint();fy=262}
  d.setDrawColor(...T.line);d.line(L,fy-4,R,fy-4);
  d.setFont('helvetica','normal');d.setFontSize(7.5);mute();d.text(d.splitTextToSize(s.terms||'',110),L,fy);
  d.setDrawColor(...T.muted);d.line(150,fy+9,R,fy+9);d.text('Authorised signatory',R,fy+13,{align:'right'});
  const blob=d.output('blob'),name=inv.no.replace(/[^\w-]+/g,'_')+'.pdf';
  if(await saveBlob(blob,name))toast('PDF ready');
}
