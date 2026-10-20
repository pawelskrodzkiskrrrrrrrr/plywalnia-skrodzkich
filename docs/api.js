/* Pływalnia Skrodzkich — klient API (Apps Script Web App).
   POST z Content-Type: text/plain, żeby uniknąć preflightu CORS.
   Kod rodzinny: localStorage (pytamy raz). Zapis bez PIN-u. */
window.PlywApi=(function(){
'use strict';
const KOD_KEY='plyw-kod';

class ApiError extends Error{constructor(msg,code){super(msg);this.name='ApiError';this.code=code||'serwer'}}

function get(store,k){try{return window[store].getItem(k)||''}catch(e){return ''}}
function set(store,k,v){try{v?window[store].setItem(k,v):window[store].removeItem(k)}catch(e){}}

const kod={get:()=>get('localStorage',KOD_KEY),set:v=>set('localStorage',KOD_KEY,v)};

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
    throw err;
  }
  return data;
}

return {
  ApiError,kod,
  list:()=>call({action:'list',kod:kod.get()}),
  upsertMeet:meet=>call({action:'upsertMeet',meet}),
  deleteMeet:id=>call({action:'deleteMeet',id}),
};
})();
