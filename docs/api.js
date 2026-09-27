/* Pływalnia Skrodzkich — klient API (Apps Script Web App).
   POST z Content-Type: text/plain, żeby uniknąć preflightu CORS.
   Kod rodzinny: localStorage (pytamy raz). PIN do edycji: tylko sessionStorage. */
window.PlywApi=(function(){
'use strict';
const KOD_KEY='plyw-kod', PIN_KEY='plyw-pin';

class ApiError extends Error{constructor(msg,code){super(msg);this.name='ApiError';this.code=code||'serwer'}}

function get(store,k){try{return window[store].getItem(k)||''}catch(e){return ''}}
function set(store,k,v){try{v?window[store].setItem(k,v):window[store].removeItem(k)}catch(e){}}

const kod={get:()=>get('localStorage',KOD_KEY),set:v=>set('localStorage',KOD_KEY,v)};
const pin={get:()=>get('sessionStorage',PIN_KEY),set:v=>set('sessionStorage',PIN_KEY,v)};

async function call(body){
  const url=window.PLYW_CONFIG&&window.PLYW_CONFIG.apiUrl;
  if(!url)throw new ApiError('Aplikacja nie jest jeszcze połączona z bazą wyników (brak adresu API).','konfig');
  let res;
  try{res=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),redirect:'follow',cache:'no-store',credentials:'omit'})}
  catch(e){throw new ApiError('Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.','siec')}
  let data;
  try{data=await res.json()}catch(e){throw new ApiError('Serwer zwrócił nieoczekiwaną odpowiedź. Spróbuj ponownie za chwilę.','serwer')}
  if(!data||!data.ok){
    const err=new ApiError((data&&data.error)||'Nieznany błąd serwera.',data&&data.code);
    if(err.code==='kod')kod.set('');
    if(err.code==='pin')pin.set('');
    throw err;
  }
  return data;
}

/* Zapis: PIN z parametru (świeżo wpisany) albo z sessionStorage. Po sukcesie zapamiętujemy go na czas sesji. */
async function withPin(body,pinValue){
  const p=pinValue||pin.get();
  if(!p)throw new ApiError('Podaj PIN do edycji.','pin');
  const data=await call(Object.assign({},body,{pin:p}));
  pin.set(p);
  return data;
}

return {
  ApiError,kod,pin,
  list:()=>call({action:'list',kod:kod.get()}),
  upsertMeet:(meet,pinValue)=>withPin({action:'upsertMeet',meet},pinValue),
  deleteMeet:(id,pinValue)=>withPin({action:'deleteMeet',id},pinValue),
};
})();
