/* Pływalnia Skrodzkich — logika UI.
   Przeniesiona 1:1 z referencja/app-claude-artifact.html. Zmieniona jest tylko warstwa danych:
   zamiast window.claude.use('db') jest PlywApi (Apps Script), plus ekran kodu rodzinnego i pole PIN. */
(function(){
const L=window.PlywLogic, Api=window.PlywApi;
/* ================= model ================= */
const {STYLES,EV,fmt,fmtDelta,parseTime,fmtDate,dnum,MONTHS}=L;
const KCOL=['var(--k0)','var(--k1)','var(--k2)'];

let kids=[], meets=[], ready={kids:false,meets:false};
const ui={kid:null,view:'rekordy',pool:'all',chartEv:null,compare:false,newestFirst:true,tblMode:'auto'};
const MQ=window.matchMedia('(max-width:640px)');const isPhone=()=>MQ.matches;
try{const s=JSON.parse(localStorage.getItem('plyw-ui')||'{}');Object.assign(ui,s)}catch(e){}
function saveUi(){try{localStorage.setItem('plyw-ui',JSON.stringify(ui))}catch(e){}}

/* ================= helpers ================= */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function kidIndex(id){const i=kids.findIndex(k=>k.id===id);return i<0?0:i}
function kidColor(id){const k=kids.find(k=>k.id===id);return KCOL[(k&&k.color!=null?k.color:kidIndex(id))%KCOL.length]}
function kidMeets(kid,respectPool=true){return L.kidMeets(meets,kid,respectPool?ui.pool:null)}
function series(kid,ev){return L.series(meets,kid,ev,ui.pool)}
function kidEvents(kid){return L.kidEvents(meets,kid,ui.pool)}
function evLabel(k){return EV[k]?EV[k].label:k}

/* ================= render ================= */
function renderLanes(){
  const el=$('#lanes');
  el.innerHTML=kids.map((k,i)=>{const n=meets.filter(m=>m.kid===k.id).length;
    return `<button class="lane" role="tab" type="button" data-kid="${esc(k.id)}" aria-selected="${k.id===ui.kid}" style="--kc:${kidColor(k.id)}">
      <span class="no">Tor ${i+1}</span><span class="nm">${esc(k.name)}</span><span class="ct">${n} ${plural(n,'start','starty','startów')}</span></button>`}).join('');
  el.querySelectorAll('.lane').forEach(b=>b.onclick=()=>{ui.kid=b.dataset.kid;ui.chartEv=null;saveUi();render()});
}
function plural(n,a,b,c){if(n===1)return a;const d=n%10,e=n%100;return (d>=2&&d<=4&&(e<12||e>14))?b:c}

function render(){
  if(!ready.kids||!ready.meets)return;
  if(!kids.length){$('#app').innerHTML='<div class="state"><h3>Brak zawodników</h3><p>Baza jest pusta.</p></div>';return}
  if(!kids.find(k=>k.id===ui.kid))ui.kid=kids[0].id;
  renderLanes();
  const kid=kids.find(k=>k.id===ui.kid);
  const km=kidMeets(kid.id);
  const evs=kidEvents(kid.id);
  // stats
  const allKm=kidMeets(kid.id,false);
  const last=allKm[allKm.length-1];
  const yearAgo=new Date();yearAgo.setFullYear(yearAgo.getFullYear()-1);const ya=yearAgo.toISOString().slice(0,10);
  let pbYear=0,pbTotal=0; evs.forEach(e=>{series(kid.id,e).forEach(p=>{if(p.pbAtTime&&p.prev!=null){pbTotal++; if(p.m.date>=ya)pbYear++;}})});
  const first=allKm[0];
  const html=`
  <section class="summary" aria-label="Podsumowanie">
    <div class="stat"><span class="lbl">Zawody</span><span class="val num">${allKm.length}</span><span class="sub">${first?'od '+fmtDate(first.date,first.approx):'—'}</span></div>
    <div class="stat"><span class="lbl">Konkurencje</span><span class="val num">${kidEvents(kid.id).length}</span><span class="sub">${evs.length?esc(evs.slice(0,3).map(e=>EV[e]?.short||e).join(' · ')):'—'}</span></div>
    <div class="stat"><span class="lbl">Poprawione życiówki · 12 mies.</span><span class="val num">${pbYear}</span><span class="sub">łącznie ${pbTotal}</span></div>
    <div class="stat"><span class="lbl">Ostatni start</span><span class="val" style="font-size:22px">${last?fmtDate(last.date,last.approx):'—'}</span><span class="sub" title="${esc(last?.name)}">${esc(last?.name||'')}</span></div>
  </section>
  <div class="toolbar">
    <div class="tabs" role="tablist" aria-label="Widok">
      ${[['rekordy','Rekordy'],['tabela','Tabela'],['wykres','Wykres']].map(([k,n])=>`<button class="tab" role="tab" type="button" data-view="${k}" aria-selected="${ui.view===k}">${n}</button>`).join('')}
    </div>
    <div class="filters"><span class="seg-label">Basen</span><div class="seg" role="group" aria-label="Basen">
      ${[['all','Wszystkie'],['25','25 m'],['50','50 m']].map(([k,n])=>`<button type="button" data-pool="${k}" aria-pressed="${ui.pool===k}">${n}</button>`).join('')}
    </div></div>
  </div>
  <div id="view"></div>`;
  $('#app').innerHTML=html;
  $('#app').querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{ui.view=b.dataset.view;saveUi();render()});
  $('#app').querySelectorAll('[data-pool]').forEach(b=>b.onclick=()=>{ui.pool=b.dataset.pool;saveUi();render()});
  const v=$('#view');
  if(!km.length){v.innerHTML=`<div class="state"><h3>Brak startów${ui.pool!=='all'?' na basenie '+ui.pool+' m':''}</h3><p>Dodaj pierwsze zawody przyciskiem „Dodaj zawody”.</p></div>`;return}
  if(ui.view==='rekordy')renderCards(v,kid,evs);
  else if(ui.view==='tabela')renderTable(v,kid,km,evs);
  else renderChart(v,kid,evs);
}

function spark(pts){
  if(pts.length<2)return '';
  const W=110,H=34,p=4,ts=pts.map(x=>x.t),mn=Math.min(...ts),mx=Math.max(...ts),rg=mx-mn||1;
  const xs=pts.map((_,i)=>p+i*(W-2*p)/(pts.length-1)), ys=pts.map(x=>p+(x.t-mn)/rg*(H-2*p));
  const d=xs.map((x,i)=>(i?'L':'M')+x.toFixed(1)+' '+ys[i].toFixed(1)).join('');
  const bi=pts.findIndex(x=>x.current);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${xs[bi]}" cy="${ys[bi]}" r="4" fill="var(--gold)" stroke="var(--surface)" stroke-width="2"/></svg>`;
}
function renderCards(v,kid,evs){
  v.innerHTML=`<div class="cards">${evs.map(e=>{
    const s=series(kid.id,e); if(!s.length)return '';
    const pb=s.find(p=>p.current), firstT=s[0].t, imp=firstT-pb.t;
    const lastPbStep=s.filter(p=>p.pbAtTime&&p.prev!=null).pop();
    return `<button class="card" type="button" data-ev="${esc(e)}">
      <div class="ev"><b>${esc(evLabel(e))}</b><span>${s.length} ${plural(s.length,'start','starty','startów')}</span></div>
      <div class="pb"><span class="medal" aria-label="rekord życiowy">PB</span><span class="t num">${fmt(pb.t)}</span></div>
      <div class="meta">${esc(fmtDate(pb.m.date,pb.m.approx))} · ${esc(pb.m.name)}${pb.m.pool==='50'?' · 50 m':''}${pb.n?' · '+esc(pb.n):''}</div>
      <div class="prog"><div>${s.length>1?`<small>od pierwszego startu (${fmt(firstT)})</small><span class="d num">${imp>0?fmtDelta(-imp):'bez zmian'}</span>`:'<small>pierwszy start</small>'}</div>${spark(s)}</div>
    </button>`}).join('')}</div>`;
  v.querySelectorAll('.card').forEach(c=>c.onclick=()=>{ui.view='wykres';ui.chartEv=c.dataset.ev;saveUi();render()});
}

function tblBar(km){
  const mode=tblMode();
  return `<div class="tblbar">
    <span class="hint">${km.length} ${plural(km.length,'zawody','zawody','zawodów')}${mode==='siatka'?' · przewiń w bok, żeby zobaczyć '+(ui.newestFirst?'starsze':'nowsze'):''}</span>
    <div class="ctl">
      <div class="seg" role="group" aria-label="Układ"><button type="button" data-mode="lista" aria-pressed="${mode==='lista'}">Lista zawodów</button><button type="button" data-mode="siatka" aria-pressed="${mode==='siatka'}">Siatka</button></div>
      <div class="seg" role="group" aria-label="Kolejność"><button type="button" data-ord="1" aria-pressed="${ui.newestFirst}">Najnowsze</button><button type="button" data-ord="0" aria-pressed="${!ui.newestFirst}">Od najstarszych</button></div>
    </div></div>`;
}
function tblMode(){return ui.tblMode==='lista'||ui.tblMode==='siatka'?ui.tblMode:(isPhone()?'lista':'siatka')}
function bindTblBar(v){
  v.querySelectorAll('[data-ord]').forEach(b=>b.onclick=()=>{ui.newestFirst=b.dataset.ord==='1';saveUi();render()});
  v.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{ui.tblMode=b.dataset.mode;saveUi();render()});
  v.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openForm(meets.find(m=>m.id===b.dataset.edit)));
}
function renderTable(v,kid,km,evs){
  const cols=ui.newestFirst?[...km].reverse():km;
  const S=Object.fromEntries(evs.map(e=>[e,series(kid.id,e)]));
  const cellMap={};evs.forEach(e=>S[e].forEach(p=>{cellMap[e+'|'+p.m.id]=p}));
  const tags=m=>`${m.pool==='50'?'<span class="tag">50 m</span>':''}${m.pool==='25'?'<span class="tag">25 m</span>':''}${m.approx?'<span class="tag warn">data?</span>':''}`;
  if(tblMode()==='lista'){
    v.innerHTML=tblBar(km)+`<div class="mlist">${cols.map(m=>{
      const rs=Object.keys(m.results||{}).sort((a,b)=>(EV[a]?.order??0)-(EV[b]?.order??0)).map(e=>cellMap[e+'|'+m.id]).filter(Boolean);
      return `<article class="mcard">
        <button class="mcard-h" type="button" data-edit="${esc(m.id)}" aria-label="Edytuj zawody ${esc(m.name)}">
          <span><span class="d">${esc(fmtDate(m.date,m.approx))}</span><span class="n">${esc(m.name)}</span>${tags(m)?`<span class="tags">${tags(m)}</span>`:''}</span>
          <span class="ed">Edytuj</span></button>
        <ul class="mres">${rs.map(p=>{const d=p.prev!=null?p.t-p.prev:null;const e=Object.keys(m.results).find(k=>cellMap[k+'|'+m.id]===p);
          const cls=p.current?'cur':(p.pbAtTime&&p.prev!=null?'hist':'');
          return `<li><span class="e">${esc(evLabel(e))}${p.current?'<span class="pbchip">PB</span>':cls==='hist'?'<span class="pbchip hist">życiówka</span>':''}</span>
            <span class="t num ${cls}">${fmt(p.t)}</span>
            <span class="dl ${d==null?'na':d<0?'up':'down'}">${d==null?'1. start':fmtDelta(d)}</span></li>`}).join('')}</ul>
        ${m.note||rs.some(p=>p.n)?`<div class="mnote">${esc([m.note,...rs.map(p=>p.n)].filter(Boolean).join(' · '))}</div>`:''}
      </article>`}).join('')}</div>
    <div class="legend"><span><span class="pbchip" style="margin:0 6px 0 0">PB</span>aktualny rekord życiowy</span><span><span class="pbchip hist" style="margin:0 6px 0 0">życiówka</span>poprawiona życiówka w tamtym momencie</span><span>różnica vs poprzedni start w tej konkurencji</span></div>`;
    bindTblBar(v);return;
  }
  v.innerHTML=tblBar(km)+`
  <div class="tbl-wrap"><table>
    <thead><tr><th class="ev" scope="col"><span class="lf">Konkurencja</span><span class="ls">Dystans</span></th><th class="pbcol" scope="col">PB</th>
      ${cols.map(m=>`<th class="m" scope="col"><button type="button" data-edit="${esc(m.id)}" title="Edytuj: ${esc(m.name)}">
        <span class="md">${esc(fmtDate(m.date,m.approx))}</span><span class="mn">${esc(m.name)}</span>
        <span class="tags">${tags(m)}</span></button></th>`).join('')}
    </tr></thead>
    <tbody>${evs.map(e=>{const pb=S[e].find(p=>p.current);
      return `<tr><td class="ev"><span class="lf">${esc(evLabel(e))}</span><span class="ls">${esc(EV[e]?EV[e].short:e)}</span></td><td class="pbcol num">${pb?fmt(pb.t):''}</td>${cols.map(m=>{const p=cellMap[e+'|'+m.id];
        if(!p)return '<td class="c empty">·</td>';
        const cls=p.current?'cur':(p.pbAtTime&&p.prev!=null?'hist':'');
        const d=p.prev!=null?p.t-p.prev:null;
        const title=`${evLabel(e)} — ${fmt(p.t)}${d!=null?' ('+fmtDelta(d)+' vs poprzedni start)':''}${p.n?' · '+p.n:''}${p.m.note?' · '+p.m.note:''}`;
        return `<td class="c ${cls}" title="${esc(title)}"><span class="cell">${fmt(p.t)}</span></td>`}).join('')}</tr>`}).join('')}
    </tbody></table></div>
  <div class="legend"><span><i style="background:var(--gold)"></i>aktualny rekord życiowy</span><span><i style="box-shadow:inset 0 0 0 1px var(--gold)"></i>poprawiona życiówka w tamtym momencie</span><span>≈ / „data?” — data orientacyjna</span></div>`;
  bindTblBar(v);
}

let chartCleanup=null;
function renderChart(v,kid,evs){
  if(!ui.chartEv||!evs.includes(ui.chartEv))ui.chartEv=evs.includes('dow_50')?'dow_50':evs[0];
  const ev=ui.chartEv;
  const who=ui.compare?kids.filter(k=>series(k.id,ev).length):[kid];
  v.innerHTML=`<div class="chart-card">
    <div class="chart-head">
      <div><h2>${esc(evLabel(ev))}</h2><div class="sub">Wyżej = szybciej. Złote punkty to poprawione życiówki.</div></div>
      <div class="filters">
        <select class="inp" id="evSel" aria-label="Konkurencja">${evs.map(e=>`<option value="${esc(e)}" ${e===ev?'selected':''}>${esc(evLabel(e))}</option>`).join('')}</select>
        <label class="chk"><input type="checkbox" id="cmp" ${ui.compare?'checked':''}> Porównaj rodzeństwo</label>
      </div>
    </div>
    <div class="chart-box" id="cbox"></div>
    <div class="klegend" id="klg"></div>
  </div>`;
  $('#evSel').onchange=e=>{ui.chartEv=e.target.value;saveUi();render()};
  $('#cmp').onchange=e=>{ui.compare=e.target.checked;saveUi();render()};
  const data=who.map(k=>({k,pts:series(k.id,ev)}));
  $('#klg').innerHTML=data.length>1?data.map(d=>`<span><i style="background:${kidColor(d.k.id)}"></i>${esc(d.k.name)} · PB ${fmt(d.pts.find(p=>p.current).t)}</span>`).join(''):'';
  const box=$('#cbox');
  const draw=()=>drawChart(box,data);
  draw();
  if(chartCleanup)chartCleanup();
  const ro=new ResizeObserver(()=>{draw()});ro.observe(box);chartCleanup=()=>ro.disconnect();
}
function niceStep(range,target){const raw=range/target, mag=Math.pow(10,Math.floor(Math.log10(raw))), n=raw/mag;return (n<1.5?1:n<3?2:n<7?5:10)*mag}
function drawChart(box,data){
  const W=Math.max(280,box.clientWidth), small=W<480, H=Math.round(small?Math.max(240,W*.8):Math.min(420,Math.max(260,W*.5)));
  const L=small?44:58,R=small?10:16,T=22,B=32, FS=small?11:12;
  const all=data.flatMap(d=>d.pts);
  if(!all.length){box.innerHTML='<div class="state">Brak danych</div>';return}
  let x0=Math.min(...all.map(p=>dnum(p.m.date))), x1=Math.max(...all.map(p=>dnum(p.m.date)));
  if(x0===x1){x0-=30*864e5;x1+=30*864e5}
  const pad=(x1-x0)*.03;x0-=pad;x1+=pad;
  let y0=Math.min(...all.map(p=>p.t)), y1=Math.max(...all.map(p=>p.t));
  const yr=Math.max(y1-y0,1); const st=niceStep(yr,small?4:5);
  y0=Math.floor((y0-yr*.05)/st)*st; y1=Math.ceil((y1+yr*.05)/st)*st; if(y0<0)y0=0;
  const sx=t=>L+(t-x0)/(x1-x0)*(W-L-R), sy=v=>T+(v-y0)/(y1-y0)*(H-T-B); // faster (smaller) at top
  let g='';
  for(let v=y0;v<=y1+1e-9;v+=st){const y=sy(v);g+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="1"/><text x="${L-8}" y="${y+4}" text-anchor="end" font-size="${FS}" fill="var(--ink-3)" class="num">${fmt(v).replace(/,00$/,'')}</text>`}
  // x ticks: years / half-years
  const y0d=new Date(x0),y1d=new Date(x1);const span=(x1-x0)/(365*864e5);
  const stepM=span>2.5?12:span>1?6:span>.5?3:1;
  let d=new Date(Date.UTC(y0d.getUTCFullYear(),0,1));
  while(d.getTime()<x0)d=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+stepM,1));
  let lastX=-99;
  while(d.getTime()<=x1){const x=sx(d.getTime());
    if(x-lastX>(small?40:50)){const lab=stepM===12||d.getUTCMonth()===0?String(d.getUTCFullYear()):MONTHS[d.getUTCMonth()]+' '+String(d.getUTCFullYear()).slice(2);
      g+=`<line x1="${x}" x2="${x}" y1="${H-B}" y2="${H-B+5}" stroke="var(--line-strong)"/><text x="${x}" y="${H-B+20}" text-anchor="middle" font-size="${FS}" fill="var(--ink-3)">${lab}</text>`;lastX=x}
    d=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+stepM,1));}
  g+=`<line x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}" stroke="var(--line-strong)"/>`;
  let marks='';const hits=[];
  data.forEach(ds=>{const col=kidColor(ds.k.id);
    const pts=ds.pts.map(p=>({...p,x:sx(dnum(p.m.date)),y:sy(p.t),col,kid:ds.k}));
    if(pts.length>1)marks+=`<path d="${pts.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join('')}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    pts.forEach(p=>{const pb=p.pbAtTime;
      marks+=`<circle cx="${p.x}" cy="${p.y}" r="${p.current?7:pb?5.5:4.5}" fill="${pb?'var(--gold)':col}" stroke="${pb?col:'var(--surface)'}" stroke-width="2"/>`;
      hits.push(p)});
    const cur=pts.find(p=>p.current);
    if(cur&&data.length===1){const lx=Math.min(Math.max(cur.x,L+40),W-R-40);marks+=`<text x="${lx}" y="${cur.y-13}" text-anchor="middle" font-size="13" font-weight="700" fill="var(--ink)" class="num">PB ${fmt(cur.t)}</text>`}
  });
  box.innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Wykres czasów w czasie">${g}<g id="xh"></g>${marks}<rect id="hit" x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}" fill="transparent"/></svg><div class="tip" id="tip" hidden></div>`;
  const svg=box.querySelector('svg'),tip=box.querySelector('#tip'),xh=box.querySelector('#xh');
  function show(ev){const r=svg.getBoundingClientRect();const mx=(ev.clientX-r.left)*(W/r.width);
    let best=null,bd=Infinity;hits.forEach(p=>{const dd=Math.abs(p.x-mx);if(dd<bd){bd=dd;best=p}});
    if(!best||bd>40){tip.hidden=true;xh.innerHTML='';return}
    const same=hits.filter(p=>Math.abs(p.x-best.x)<1);
    xh.innerHTML=`<line x1="${best.x}" x2="${best.x}" y1="${T}" y2="${H-B}" stroke="var(--ink-3)" stroke-dasharray="3 3"/>`;
    tip.innerHTML=`<div>${esc(fmtDate(best.m.date,best.m.approx))} · ${esc(best.m.name)}${best.m.pool==='50'?' · 50 m':''}</div>`+same.map(p=>{const dlt=p.prev!=null?p.t-p.prev:null;
      return `<div class="row">${data.length>1?`<span class="sw" style="background:${p.col}"></span>${esc(p.kid.name)}: `:''}<b class="num">${fmt(p.t)}</b>${dlt!=null?` <span class="num">(${fmtDelta(dlt)})</span>`:''}${p.pbAtTime?' · PB':''}</div>${p.n?`<div>${esc(p.n)}</div>`:''}`}).join('');
    tip.hidden=false;
    const px=best.x*(r.width/W),py=Math.min(...same.map(p=>p.y))*(r.height/H);
    const tw=tip.offsetWidth;let left=px+12;if(left+tw>r.width)left=px-tw-12;if(left<0)left=0;
    tip.style.left=left+'px';tip.style.top=Math.max(0,py-10)+'px';}
  const hit=svg.querySelector('#hit');
  hit.addEventListener('pointermove',show);hit.addEventListener('pointerdown',show);
  hit.addEventListener('pointerleave',()=>{tip.hidden=true;xh.innerHTML=''});
}

/* ================= form ================= */
function evOptions(sel){return STYLES.map(s=>`<optgroup label="Styl ${s.n}">${s.d.map(d=>{const k=s.k+'_'+d;return `<option value="${k}" ${k===sel?'selected':''}>${d} m ${s.n}</option>`}).join('')}</optgroup>`).join('')}
function openForm(meet){
  const editing=!!meet;
  const kidId=meet?meet.kid:ui.kid;
  const today=new Date().toISOString().slice(0,10);
  const rows=meet?Object.entries(meet.results||{}).sort((a,b)=>(EV[a[0]]?.order??0)-(EV[b[0]]?.order??0)).map(([e,r])=>({e,t:fmt(r.t),n:r.n||''})):
    (()=>{const km=kidMeets(kidId,false);const lastM=km[km.length-1];let evs=lastM?Object.keys(lastM.results||{}):[];if(!evs.length)evs=['dow_50'];evs.sort((a,b)=>(EV[a]?.order??0)-(EV[b]?.order??0));return evs.map(e=>({e,t:'',n:''}))})();
  const names=[...new Set(meets.map(m=>m.name))].sort();
  $('#overlay-root').innerHTML=`<div class="overlay" id="ov"><div class="panel" role="dialog" aria-modal="true" aria-labelledby="fTitle">
    <div class="panel-head"><h2 id="fTitle">${editing?'Edytuj zawody':'Nowe zawody'}</h2><button class="x" type="button" id="fClose" aria-label="Zamknij">×</button></div>
    <form class="panel-body" id="fForm" novalidate>
      <div class="fld"><label for="fKid">Zawodnik</label><select class="inp" id="fKid">${kids.map(k=>`<option value="${esc(k.id)}" ${k.id===kidId?'selected':''}>${esc(k.name)}</option>`).join('')}</select></div>
      <div class="fld"><label for="fName">Nazwa zawodów</label><input class="inp" id="fName" list="fNames" value="${esc(meet?.name||'')}" placeholder="np. OMDO" autocomplete="off"><datalist id="fNames">${names.map(n=>`<option value="${esc(n)}">`).join('')}</datalist></div>
      <div class="row2">
        <div class="fld"><label for="fDate">Data</label><input class="inp" type="date" id="fDate" value="${esc(meet?.date||today)}"></div>
        <div class="fld"><label for="fPool">Basen</label><select class="inp" id="fPool">${[['','nie podano'],['25','25 m'],['50','50 m']].map(([k,n])=>`<option value="${k}" ${(meet?.pool||'')===k?'selected':''}>${n}</option>`).join('')}</select></div>
      </div>
      <label class="chk"><input type="checkbox" id="fApprox" ${meet?.approx?'checked':''}> Data orientacyjna</label>
      <div class="fld"><span class="lb">Wyniki</span><span class="hint">Czas wpisz jak w arkuszu: 28.59, 1.04.03 albo 1:04,03</span>
        <div class="rs" id="fRows"></div>
        <button class="btn ghost" type="button" id="fAddRow" style="align-self:flex-start">＋ Dodaj konkurencję</button>
      </div>
      <div class="fld"><label for="fNote">Uwagi</label><textarea class="inp" id="fNote" rows="2" placeholder="np. sztafeta, międzyczasy, miejsce">${esc(meet?.note||'')}</textarea></div>
      <div class="fld pinfld" id="fPinWrap" hidden><label for="fPin">PIN do edycji</label><input class="inp" type="password" id="fPin" inputmode="numeric" autocomplete="off"><span class="hint">Pytamy raz na sesję przeglądarki. PIN nie jest zapisywany na stałe.</span></div>
    </form>
    <div class="panel-foot">
      <div id="fDelWrap">${editing?'<button class="btn danger" type="button" id="fDel">Usuń zawody</button>':''}</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="formerr" id="fErr" role="alert"></span><button class="btn" type="button" id="fCancel">Anuluj</button><button class="btn primary" type="button" id="fSave">Zapisz</button></div>
    </div>
  </div></div>`;
  const rowsEl=$('#fRows');
  function addRow(r){const div=document.createElement('div');div.className='rrow';
    div.innerHTML=`<select class="inp" aria-label="Konkurencja">${evOptions(r.e)}</select><input class="inp num" aria-label="Czas" inputmode="decimal" placeholder="0.00" value="${esc(r.t)}"><button class="iconbtn" type="button" aria-label="Usuń wiersz">×</button><span class="hint"></span>`;
    div.dataset.note=r.n||'';
    const [sel,inp,del,hint]=div.children;
    const upd=()=>{const t=parseTime(inp.value);hint.className='hint';hint.textContent='';
      if(inp.value.trim()==='')return; if(isNaN(t)||t==null||t<=0){hint.className='hint err';hint.textContent='Nie rozpoznaję czasu';return}
      const kidSel=$('#fKid').value;const s=series(kidSel,sel.value).filter(p=>!meet||p.m.id!==meet.id);const pb=s.length?Math.min(...s.map(p=>p.t)):null;
      if(pb==null){hint.textContent=fmt(t)+' · pierwszy start w tej konkurencji'}
      else if(t<pb){hint.className='hint pb';hint.textContent=fmt(t)+' · nowa życiówka! '+fmtDelta(t-pb)}
      else hint.textContent=fmt(t)+' · PB '+fmt(pb)+' ('+fmtDelta(t-pb)+')'};
    inp.oninput=upd;sel.onchange=upd;del.onclick=()=>div.remove();
    rowsEl.appendChild(div);upd();}
  rows.forEach(addRow);
  $('#fAddRow').onclick=()=>{addRow({e:'dow_50',t:'',n:''});rowsEl.lastChild.querySelector('select').focus()};
  $('#fKid').onchange=()=>rowsEl.querySelectorAll('input').forEach(i=>i.dispatchEvent(new Event('input')));
  const close=()=>{$('#overlay-root').innerHTML=''};
  $('#fClose').onclick=close;$('#fCancel').onclick=close;
  $('#ov').addEventListener('click',e=>{if(e.target.id==='ov')close()});
  document.addEventListener('keydown',function k(e){if(e.key==='Escape'){close();document.removeEventListener('keydown',k)}});
  /* PIN: pytamy przy pierwszym zapisie w sesji; przy błędnym PIN-ie pole wraca z komunikatem */
  const pinWrap=$('#fPinWrap'),pinInp=$('#fPin');
  if(!Api.pin.get())pinWrap.hidden=false;
  const pinValue=()=>pinWrap.hidden?'':pinInp.value.trim();
  const needPin=()=>{if(!pinWrap.hidden&&!pinInp.value.trim()){$('#fErr').textContent='Podaj PIN do edycji';pinInp.focus();return true}return false};
  const apiErr=(e,prefix)=>{
    if(e&&(e.code==='pin'||e.code==='blokada')){pinWrap.hidden=false;pinInp.value='';if(e.code==='pin')pinInp.focus()}
    return e&&e.message?e.message:prefix+' — spróbuj ponownie';
  };
  if(editing)$('#fDel').onclick=()=>{
    $('#fDelWrap').innerHTML=`<div class="confirm">Usunąć „${esc(meet.name)}” (${esc(fmtDate(meet.date,meet.approx))})? <button class="btn danger" type="button" id="fDelYes">Usuń</button><button class="btn" type="button" id="fDelNo">Nie</button></div>`;
    $('#fDelNo').onclick=()=>{close();openForm(meet)};
    $('#fDelYes').onclick=async()=>{$('#fErr').textContent='';if(needPin())return;
      const b=$('#fDelYes');b.disabled=true;
      try{applyData(await Api.deleteMeet(meet.id,pinValue()));close();render();toast('Usunięto zawody')}
      catch(e){b.disabled=false;$('#fErr').textContent='Nie udało się usunąć: '+apiErr(e,'błąd')}}};
  $('#fSave').onclick=async()=>{
    const err=$('#fErr');err.textContent='';
    const name=$('#fName').value.trim(),date=$('#fDate').value,kid=$('#fKid').value;
    if(!name){err.textContent='Podaj nazwę zawodów';$('#fName').focus();return}
    if(!date){err.textContent='Podaj datę';return}
    const results={};let bad=false;
    rowsEl.querySelectorAll('.rrow').forEach(r=>{const e=r.children[0].value,raw=r.children[1].value;if(!raw.trim())return;const t=parseTime(raw);
      if(t==null||isNaN(t)||t<=0){bad=true;return} results[e]={t:Math.round(t*100)/100};if(r.dataset.note)results[e].n=r.dataset.note});
    if(bad){err.textContent='Popraw czasy oznaczone na czerwono';return}
    if(!Object.keys(results).length){err.textContent='Wpisz co najmniej jeden czas';return}
    if(needPin())return;
    // PBs beaten
    const newPbs=Object.entries(results).filter(([e,r])=>{const s=series(kid,e).filter(p=>!meet||p.m.id!==meet.id);return s.length&&r.t<Math.min(...s.map(p=>p.t))});
    const doc={kid,name,date,approx:$('#fApprox').checked,pool:$('#fPool').value,note:$('#fNote').value.trim(),results};
    const btn=$('#fSave');btn.disabled=true;btn.textContent='Zapisuję…';
    try{
      applyData(await Api.upsertMeet(L.toApiMeet(editing?meet.id:null,doc),pinValue()));
      close(); ui.kid=kid; saveUi(); render();
      const kn=kids.find(k=>k.id===kid)?.name||'';
      if(newPbs.length)toast(`Nowa życiówka${newPbs.length>1?'i':''}: ${kn} — ${newPbs.map(([e,r])=>evLabel(e)+' '+fmt(r.t)).join(', ')}`,true);
      else toast('Zapisano wyniki');
    }catch(e){btn.disabled=false;btn.textContent='Zapisz';
      err.textContent=apiErr(e,'Nie udało się zapisać');}
  };
  setTimeout(()=>$('#fName')?.focus(),30);
}
let toastT;
function toast(msg,gold){clearTimeout(toastT);$('#toast-root').innerHTML=`<div class="toast${gold?' gold':''}" role="status">${esc(msg)}</div>`;toastT=setTimeout(()=>{$('#toast-root').innerHTML=''},gold?6000:3000)}

const addH=()=>{if(!ready.kids||!ready.meets){toast('Poczekaj, aż wyniki się wczytają');return}openForm(null)};$('#addBtn').onclick=addH;$('#fab').onclick=addH;

try{MQ.addEventListener('change',()=>{if(ui.view==='tabela')render()})}catch(e){}

/* ================= data (API Apps Script) ================= */
let loadedAt=0;
function applyData(data){
  const r=L.fromApi(data);
  if(r.warnings.length)console.warn('Pływalnia — dane do sprawdzenia w arkuszu:',r.warnings);
  kids=r.kids;meets=r.meets;ready.kids=ready.meets=true;loadedAt=Date.now();
}
function setAddEnabled(on){$('#addBtn').disabled=!on;$('#fab').hidden=!on}
function showState(title,text,retry){
  $('#app').innerHTML=`<div class="state"><h3>${esc(title)}</h3><p>${esc(text)}</p>${retry?'<button class="btn" type="button" id="retry">Spróbuj ponownie</button>':''}</div>`;
  if(retry)$('#retry').onclick=()=>load();
}
function showGate(msg){
  setAddEnabled(false);$('#lanes').innerHTML='';
  $('#app').innerHTML=`<form class="gate" id="gate" novalidate>
    <h3>Kod rodzinny</h3>
    <p>Wyniki są prywatne. Wpisz kod rodzinny — zapamiętamy go na tym urządzeniu.</p>
    <input class="inp" type="password" id="gKod" autocomplete="current-password" aria-label="Kod rodzinny" required>
    <span class="formerr" id="gErr" role="alert">${esc(msg||'')}</span>
    <button class="btn primary" type="submit" id="gGo">Pokaż wyniki</button>
  </form>`;
  const f=$('#gate'),inp=$('#gKod');
  f.onsubmit=async e=>{e.preventDefault();const v=inp.value.trim();
    if(!v){$('#gErr').textContent='Wpisz kod rodzinny';inp.focus();return}
    Api.kod.set(v);$('#gGo').disabled=true;$('#gGo').textContent='Sprawdzam…';await load()};
  setTimeout(()=>inp.focus(),30);
}
async function load(silent){
  if(!silent&&!ready.meets)$('#app').innerHTML='<div class="state"><h3>Ładuję wyniki…</h3></div>';
  try{
    applyData(await Api.list());
    setAddEnabled(true);
    if(!$('#ov'))render();
  }catch(e){
    if(silent)return;
    if(e.code==='kod'||(e.code==='blokada'&&!ready.meets))return showGate(e.code==='kod'&&!Api.kod.get()&&/Podaj/.test(e.message)?'':e.message);
    setAddEnabled(false);
    if(e.code==='konfig')return showState('Baza wyników niedostępna',e.message);
    showState('Nie udało się wczytać wyników',e.message,true);
  }
}
/* referencja odświeżała się na żywo (onSnapshot); tu: odśwież po powrocie do karty, jeśli minęła ≥1 min */
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&ready.meets&&Date.now()-loadedAt>60000)load(true)});
load();
})();
