/* ---------- QR code encoder (ISO/IEC 18004), written for this app: byte mode, error correction level M, versions 1 to 10 (up to 213 bytes).
   qrMatrix(text) -> array of rows of booleans (true = dark).  qrSVG(text, opts) -> an <svg> string that scales to any size. ---------- */
const QR_RAW=[26,44,70,100,134,172,196,242,292,346];          /* codewords in the symbol, versions 1..10 */
const QR_ECC=[10,16,26,18,24,16,18,22,22,26];                  /* error-correction codewords per block (level M) */
const QR_BLOCKS=[1,1,1,2,2,4,4,4,5,5];                         /* number of blocks (level M) */
const QR_ALIGN=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];
const qrDataCap=v=>QR_RAW[v-1]-QR_ECC[v-1]*QR_BLOCKS[v-1];

function qrMul(x,y){let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x}return z}
function qrDivisor(deg){
  const r=new Array(deg).fill(0);r[deg-1]=1;let root=1;
  for(let i=0;i<deg;i++){for(let j=0;j<r.length;j++){r[j]=qrMul(r[j],root);if(j+1<r.length)r[j]^=r[j+1]}root=qrMul(root,2)}
  return r;
}
function qrRemainder(data,div){
  const r=new Array(div.length).fill(0);
  for(const b of data){const f=b^r.shift();r.push(0);div.forEach((c,i)=>{r[i]^=qrMul(c,f)})}
  return r;
}
function qrCodewords(bytes,v){
  const bits=[],put=(val,n)=>{for(let i=n-1;i>=0;i--)bits.push((val>>>i)&1)};
  put(4,4);put(bytes.length,v<=9?8:16);bytes.forEach(b=>put(b,8));
  const cap=qrDataCap(v)*8;
  put(0,Math.min(4,cap-bits.length));
  while(bits.length%8)bits.push(0);
  for(let pad=0xEC;bits.length<cap;pad^=0xEC^0x11)put(pad,8);
  const data=[];for(let i=0;i<bits.length;i+=8)data.push(parseInt(bits.slice(i,i+8).join(''),2));
  const nb=QR_BLOCKS[v-1],ecl=QR_ECC[v-1],raw=QR_RAW[v-1],short=nb-raw%nb,shortLen=Math.floor(raw/nb),div=qrDivisor(ecl);
  const blocks=[];let k=0;
  for(let i=0;i<nb;i++){
    const d=data.slice(k,k+shortLen-ecl+(i<short?0:1));k+=d.length;
    const ec=qrRemainder(d,div);if(i<short)d.push(0);   /* a placeholder keeps short and long blocks aligned for interleaving */
    blocks.push(d.concat(ec));
  }
  const out=[];
  for(let i=0;i<blocks[0].length;i++)blocks.forEach((b,j)=>{if(i!==shortLen-ecl||j>=short)out.push(b[i])});
  return out;
}
function qrMatrix(text){
  const bytes=Array.from(new TextEncoder().encode(String(text)));
  let v=1;while(v<=10&&4+(v<=9?8:16)+8*bytes.length>qrDataCap(v)*8)v++;
  if(v>10)throw new Error('QR text too long');
  const n=17+4*v,mod=Array.from({length:n},()=>new Array(n).fill(false)),fn=Array.from({length:n},()=>new Array(n).fill(false));
  const set=(x,y,d)=>{mod[y][x]=d;fn[y][x]=true};
  const bit=(x,i)=>((x>>>i)&1)!==0;
  for(let i=0;i<n;i++){set(6,i,i%2===0);set(i,6,i%2===0)}
  for(const [cx,cy] of [[3,3],[n-4,3],[3,n-4]])for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
    const d=Math.max(Math.abs(dx),Math.abs(dy)),x=cx+dx,y=cy+dy;if(x>=0&&x<n&&y>=0&&y<n)set(x,y,d!==2&&d!==4)}
  const ap=QR_ALIGN[v-1];
  ap.forEach((ax,i)=>ap.forEach((ay,j)=>{
    if((i===0&&j===0)||(i===0&&j===ap.length-1)||(i===ap.length-1&&j===0))return;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(ax+dx,ay+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1)}));
  const drawFormat=mask=>{                                       /* level M = 00 */
    const data=mask;let r=data;for(let i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537);
    const bits=((data<<10)|r)^0x5412;
    for(let i=0;i<=5;i++)set(8,i,bit(bits,i));
    set(8,7,bit(bits,6));set(8,8,bit(bits,7));set(7,8,bit(bits,8));
    for(let i=9;i<15;i++)set(14-i,8,bit(bits,i));
    for(let i=0;i<8;i++)set(n-1-i,8,bit(bits,i));
    for(let i=8;i<15;i++)set(8,n-15+i,bit(bits,i));
    set(8,n-8,true);
  };
  drawFormat(0);
  if(v>=7){let r=v;for(let i=0;i<12;i++)r=(r<<1)^((r>>>11)*0x1F25);const bits=(v<<12)|r;
    for(let i=0;i<18;i++){const a=n-11+i%3,b=Math.floor(i/3);set(a,b,bit(bits,i));set(b,a,bit(bits,i))}}
  /* data bits, zig-zag from the bottom right, skipping the vertical timing column */
  const cw=qrCodewords(bytes,v);let i=0;
  for(let right=n-1;right>=1;right-=2){
    if(right===6)right=5;
    for(let vert=0;vert<n;vert++)for(let j=0;j<2;j++){
      const x=right-j,y=((right+1)&2)===0?n-1-vert:vert;
      if(!fn[y][x]&&i<cw.length*8){mod[y][x]=bit(cw[i>>>3],7-(i&7));i++}}}
  const MASKS=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x,y)=>x%3===0,(x,y)=>(x+y)%3===0,(x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,
    (x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];
  const flip=m=>{for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(!fn[y][x]&&MASKS[m](x,y))mod[y][x]=!mod[y][x]};
  let best=0,bestScore=Infinity;
  for(let m=0;m<8;m++){flip(m);drawFormat(m);const s=qrPenalty(mod,n);if(s<bestScore){bestScore=s;best=m}flip(m)}
  flip(best);drawFormat(best);
  return mod;
}
/* readability score used to pick the mask (lower is better): long runs, 2x2 blocks, finder-like patterns, dark/light balance */
function qrPenalty(m,n){
  let p=0,dark=0;
  const line=get=>{let run=1;for(let k=1;k<n;k++){if(get(k)===get(k-1)){run++;if(run===5)p+=3;else if(run>5)p++}else run=1}
    let s='';for(let k=0;k<n;k++)s+=get(k)?'1':'0';
    for(const pat of['10111010000','00001011101']){let at=s.indexOf(pat);while(at>=0){p+=40;at=s.indexOf(pat,at+1)}}};
  for(let a=0;a<n;a++){line(k=>m[a][k]);line(k=>m[k][a])}
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){if(m[y][x])dark++;if(x+1<n&&y+1<n&&m[y][x]===m[y][x+1]&&m[y][x]===m[y+1][x]&&m[y][x]===m[y+1][x+1])p+=3}
  return p+10*Math.floor(Math.abs(dark*20-n*n*10)/(n*n));
}
function qrSVG(text,o={}){
  const m=qrMatrix(text),n=m.length,q=o.margin===undefined?2:o.margin,sz=n+2*q;let d='';
  for(let y=0;y<n;y++){let x=0;while(x<n){if(!m[y][x]){x++;continue}let s=x;while(x<n&&m[y][x])x++;d+=`M${s+q} ${y+q}h${x-s}v1h-${x-s}z`}}
  return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sz} ${sz}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${sz}" height="${sz}" fill="${o.bg||'#fff'}"/><path d="${d}" fill="${o.fg||'#000'}"/></svg>`;
}
