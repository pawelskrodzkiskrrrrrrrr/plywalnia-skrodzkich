/* Pływalnia Skrodzkich — czysta logika (bez DOM).
   Algorytmy przeniesione 1:1 z referencja/app-claude-artifact.html (Z-2).
   Działa w przeglądarce (window.PlywLogic) i w Node (require) — na potrzeby testów. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PlywLogic=api;
})(typeof self!=='undefined'?self:this,function(){
'use strict';

/* ================= model ================= */
const STYLES=[
  {k:'dow',n:'dowolnym',s:'dow.',d:[25,50,100,200,400,800,1500]},
  {k:'grz',n:'grzbietowym',s:'grzb.',d:[25,50,100,200]},
  {k:'kla',n:'klasycznym',s:'klas.',d:[25,50,100,200]},
  {k:'mot',n:'motylkowym',s:'mot.',d:[25,50,100,200]},
  {k:'zm',n:'zmiennym',s:'zm.',d:[100,200,400]},
];
const EVENTS=[];STYLES.forEach((s,si)=>s.d.forEach(d=>EVENTS.push({key:s.k+'_'+d,label:d+' m '+s.n,short:d+' '+s.s,order:si*10000+d})));
const EV=Object.fromEntries(EVENTS.map(e=>[e.key,e]));

/* ================= czas ================= */
function fmt(t){ if(t==null||isNaN(t))return '';
  const cs=Math.round(t*100), m=Math.floor(cs/6000), s=Math.floor((cs%6000)/100), h=cs%100;
  return (m?m+':'+String(s).padStart(2,'0'):String(s))+','+String(h).padStart(2,'0');}
function fmtDelta(d){return (d>0?'+':'−')+fmt(Math.abs(d)).replace(/^0,/,'0,')+' s'}
function parseTime(str){
  if(!str)return null; let s=String(str).trim().replace(/\s+/g,'');
  if(!s)return null;
  const colon=s.includes(':');
  const p=s.split(/[:.,]+/).filter(Boolean);
  if(!p.every(x=>/^\d+$/.test(x)))return NaN;
  const hh=x=>x.length===1?+x*10:+x.slice(0,2);
  if(p.length===1)return +p[0];
  if(p.length===2){ if(colon)return +p[0]*60+ +p[1]; if(+p[1]>=100&&p[1].length>2)return NaN; return +p[0]+hh(p[1])/100;}
  if(p.length===3){ if(+p[1]>=60)return NaN; return +p[0]*60+ +p[1]+hh(p[2])/100;}
  return NaN;}

/* ================= daty ================= */
const MONTHS=['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];
function fmtDate(iso,approx){ if(!iso)return '—'; const [y,m,d]=iso.split('-');
  return approx? '≈ '+MONTHS[+m-1]+' '+y : (+d)+' '+MONTHS[+m-1]+' '+y;}
function dnum(iso){return Date.parse(iso+'T12:00:00Z')}

/* ================= rekordy ================= */
function poolOk(m,pool){return pool==='all'||m.pool===pool}
function kidMeets(meets,kid,pool){return meets.filter(m=>m.kid===kid&&(pool==null||poolOk(m,pool))).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0)}
/* chronological series for kid+event, flags: pbAtTime, current PB */
function series(meets,kid,ev,pool){
  const out=[];let best=Infinity;
  for(const m of kidMeets(meets,kid,pool)){const r=m.results&&m.results[ev]; if(!r||typeof r.t!=='number')continue;
    const prev=out.length?out[out.length-1].t:null;
    const isPb=r.t<best; if(isPb)best=r.t;
    out.push({m,t:r.t,n:r.n||'',pbAtTime:isPb,prev});}
  if(out.length){let bi=0;out.forEach((p,i)=>{if(p.t<out[bi].t)bi=i});out[bi].current=true;}
  return out;}
function kidEvents(meets,kid,pool){const set=new Set();kidMeets(meets,kid,pool).forEach(m=>Object.keys(m.results||{}).forEach(e=>set.add(e)));
  return [...set].sort((a,b)=>(EV[a]?.order??1e9)-(EV[b]?.order??1e9));}

/* ================= arkusz → model ================= */
/* Zamienia wiersze API (jeden wiersz = jeden wynik) na model referencji:
   kids:[{id,name,order}], meets:[{id,kid,name,date,approx,pool,note,results:{ev:{t,n}}}] */
function fromApi(data){
  const kids=(data.zawodnicy||[]).map(z=>({id:String(z.id),name:String(z.imie||z.id),order:Number(z.kolejnosc)||99}))
    .sort((a,b)=>(a.order||99)-(b.order||99));
  const byKey={};kids.forEach(k=>{byKey[k.id.toLowerCase()]=k.id;byKey[k.name.toLowerCase()]=k.id});
  const meets=[],idx={},warnings=[];
  (data.wyniki||[]).forEach(w=>{
    const id=String(w.id_zawodow||'');if(!id)return;
    let m=idx[id];
    if(!m){
      const kid=byKey[String(w.zawodnik||'').toLowerCase()];
      if(!kid){warnings.push('Nieznany zawodnik w zawodach '+id);return}
      m=idx[id]={id,kid,name:String(w.zawody||''),date:String(w.data||''),approx:!!w.data_orientacyjna,
        pool:w.basen_m?String(w.basen_m):'',note:String(w.uwagi_zawodow||''),results:{}};
      meets.push(m);
    }
    const t=typeof w.czas_s==='number'?w.czas_s:NaN;
    if(!w.konkurencja||isNaN(t))return;
    if(m.results[w.konkurencja]){warnings.push('Powtórzona konkurencja '+w.konkurencja+' w zawodach '+id);return}
    m.results[w.konkurencja]={t};if(w.uwagi_wyniku)m.results[w.konkurencja].n=String(w.uwagi_wyniku);
  });
  return {kids,meets,warnings};
}

/* model formularza → payload upsertMeet */
function toApiMeet(id,doc){
  return {id:id||undefined,zawodnik:doc.kid,data:doc.date,data_orientacyjna:!!doc.approx,zawody:doc.name,
    basen_m:doc.pool||'',uwagi_zawodow:doc.note||'',
    wyniki:Object.entries(doc.results).map(([e,r])=>({konkurencja:e,czas_s:r.t,uwagi_wyniku:r.n||''}))};
}

return {STYLES,EVENTS,EV,MONTHS,fmt,fmtDelta,parseTime,fmtDate,dnum,poolOk,kidMeets,series,kidEvents,fromApi,toApiMeet};
});
