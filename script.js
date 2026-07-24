// ===== CONFIG =====
const API_KEY = 'bsog63BaN0sXddiIP6JakDc3agNjtmZ1pnyAumxO';
const API_URL = 'https://api.nasa.gov/planetary/apod';

// ===== STATE =====
let currentLang = localStorage.getItem('astrowafy_lang') || 'en';
let lastAPODData = null;
let currentQuality = 'hd'; // 'hd' or 'std'
let currentDisplayUrl = '';
let currentDownloadUrl = '';
let currentDownloadName = 'astrowafy-image.jpg';
let favorites = JSON.parse(localStorage.getItem('astrowafy_favs') || '[]');

// ===== DOM REFS =====
const $ = id => document.getElementById(id);
const langEnBtn = $('langEnBtn'), langBnBtn = $('langBnBtn');
const datePicker = $('datePicker'), refreshBtn = $('refreshBtn'), refreshIcon = $('refreshIcon');
const loadingState = $('loadingState'), errorState = $('errorState'), content = $('content');
const mediaWrapper = $('mediaWrapper'), hdOverlay = $('hdOverlay'), hdLink = $('hdLink');
const oneClickDownloadBtn = $('oneClickDownloadBtn'), oneClickDownloadLabel = $('oneClickDownloadLabel'), oneClickDownloadIcon = $('oneClickDownloadIcon');
const apodTitle = $('apodTitle'), apodDate = $('apodDate'), apodExplanation = $('apodExplanation');
const surpriseBtn = $('surpriseBtn');
const shareBtn = $('shareBtn'), favBtn = $('favBtn');
const lightboxOverlay = $('lightboxOverlay'), lightboxImg = $('lightboxImg'), lightboxClose = $('lightboxClose');
const favDrawer = $('favDrawer'), favList = $('favList'), closeDrawerBtn = $('closeDrawerBtn'), favToggleBtn = $('favToggleBtn');
const qualityStd = $('qualityStd'), qualityHd = $('qualityHd');

// ===== TRANSLATION =====
const translations = { en: { untitled: 'Untitled' }, bn: { untitled: 'শিরোনামহীন' } };
let translationCache = {};

function applyLanguage(lang) {
  currentLang = lang; localStorage.setItem('astrowafy_lang', lang);
  langEnBtn.classList.toggle('active', lang === 'en');
  langBnBtn.classList.toggle('active', lang === 'bn');
  if (lastAPODData) renderInfo(lastAPODData);
}
langEnBtn.addEventListener('click', ()=>applyLanguage('en'));
langBnBtn.addEventListener('click', ()=>applyLanguage('bn'));

async function translateText(text, targetLang) {
  if (!text || targetLang === 'en') return text;
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`);
    if (!res.ok) throw new Error('Translation failed');
    const data = await res.json();
    return data[0].map(chunk=>chunk[0]).join('');
  } catch(e) { console.warn('Translation error:', e); return text; }
}

// ===== HELPERS =====
function todayISO() { const d=new Date(); const off=d.getTimezoneOffset(); return new Date(d.getTime()-off*60000).toISOString().split('T')[0]; }
function formatDateDMY(iso) { if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}-${m}-${y}`; }
function setState(state) {
  loadingState.classList.add('hidden'); loadingState.classList.remove('flex');
  errorState.classList.add('hidden'); content.classList.add('hidden');
  if (state==='loading') { loadingState.classList.remove('hidden'); loadingState.classList.add('flex'); }
  else if (state==='error') errorState.classList.remove('hidden');
  else if (state==='content') content.classList.remove('hidden');
}

function getDisplayUrl(data) {
  if (data.media_type === 'video') return data.url;
  return (currentQuality === 'hd' && data.hdurl) ? data.hdurl : data.url;
}

// ===== RENDER =====
function renderMedia(data) {
  mediaWrapper.innerHTML = '';
  const isVideo = data.media_type === 'video';
  if (isVideo) {
    hdOverlay.classList.add('hidden'); oneClickDownloadBtn.classList.add('hidden');
    const container = document.createElement('div'); container.className='w-full'; container.style.aspectRatio='16/9';
    container.innerHTML = `<iframe src="${data.url}" class="w-full h-full" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    mediaWrapper.appendChild(container);
  } else {
    const img = document.createElement('img');
    const displayUrl = getDisplayUrl(data);
    img.src = displayUrl; img.alt = data.title || translations[currentLang].untitled;
    img.className = 'w-full object-contain'; img.style.maxHeight='550px';
    mediaWrapper.appendChild(img);
    // click to lightbox
    img.style.cursor = 'pointer';
    img.addEventListener('click', ()=> { lightboxImg.src = data.hdurl || data.url; lightboxOverlay.classList.add('active'); });

    const bestUrl = data.hdurl || data.url;
    hdLink.href = bestUrl;
    currentDisplayUrl = displayUrl;
    currentDownloadUrl = bestUrl;
    const extMatch = bestUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i);
    const ext = extMatch ? extMatch[1] : 'jpg';
    const safeName = (data.title || 'astrowafy-image').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
    currentDownloadName = `astrowafy-${data.date||''}-${safeName}.${ext}`;
    hdOverlay.classList.remove('hidden');
    oneClickDownloadBtn.classList.remove('hidden');
    // update fav button
    const isFav = favorites.some(f=>f.date===data.date);
    favBtn.textContent = isFav ? '★' : '⭐';
  }
}

async function renderInfo(data) {
  const lang = currentLang;
  apodDate.textContent = formatDateDMY(data.date);
  if (lang === 'en') {
    apodTitle.textContent = data.title || translations.en.untitled;
    apodExplanation.textContent = data.explanation || '';
    apodTitle.classList.remove('bn-text'); apodExplanation.classList.remove('bn-text');
    apodTitle.style.opacity='1'; apodExplanation.style.opacity='1';
    return;
  }
  const cacheKey = `${data.date}_${lang}`;
  if (translationCache[cacheKey]) {
    apodTitle.textContent = translationCache[cacheKey].title;
    apodExplanation.textContent = translationCache[cacheKey].explanation;
    apodTitle.classList.add('bn-text'); apodExplanation.classList.add('bn-text');
    apodTitle.style.opacity='1'; apodExplanation.style.opacity='1';
    return;
  }
  apodTitle.style.opacity='0.4'; apodExplanation.style.opacity='0.4';
  const [translatedTitle, translatedExplanation] = await Promise.all([
    translateText(data.title || '', lang), translateText(data.explanation || '', lang)
  ]);
  translationCache[cacheKey] = { title: translatedTitle || data.title || translations[lang].untitled, explanation: translatedExplanation || data.explanation || '' };
  if (currentLang === lang && lastAPODData && lastAPODData.date === data.date) {
    apodTitle.textContent = translationCache[cacheKey].title;
    apodExplanation.textContent = translationCache[cacheKey].explanation;
    apodTitle.classList.add('bn-text'); apodExplanation.classList.add('bn-text');
    apodTitle.style.opacity='1'; apodExplanation.style.opacity='1';
  }
}

// ===== FETCH =====
async function fetchAPOD(dateStr) {
  setState('loading'); refreshIcon.classList.add('animate-spin');
  try {
    const res = await fetch(`${API_URL}?api_key=${API_KEY}&date=${dateStr}`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    lastAPODData = data;
    renderMedia(data);
    await renderInfo(data);
    setState('content');
  } catch(err) { console.error(err); setState('error'); }
  finally { refreshIcon.classList.remove('animate-spin'); }
}

// ===== SURPRISE / RANDOM DATE =====
function randomDate() {
  const start = new Date(1995, 5, 16); // 1995-06-16
  const end = new Date();
  const diff = end.getTime() - start.getTime();
  const rand = start.getTime() + Math.random() * diff;
  const d = new Date(rand);
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
surpriseBtn.addEventListener('click', ()=>{
  const rand = randomDate();
  datePicker.value = rand;
  fetchAPOD(rand);
});

// ===== QUALITY TOGGLE =====
function setQuality(q) {
  currentQuality = q;
  qualityStd.classList.toggle('active', q==='std');
  qualityHd.classList.toggle('active', q==='hd');
  if (lastAPODData && lastAPODData.media_type !== 'video') {
    renderMedia(lastAPODData);
  }
}
qualityStd.addEventListener('click', ()=>setQuality('std'));
qualityHd.addEventListener('click', ()=>setQuality('hd'));

// ===== SHARE =====
shareBtn.addEventListener('click', async ()=>{
  const url = currentDisplayUrl || (lastAPODData && getDisplayUrl(lastAPODData));
  if (!url) return;
  try {
    if (navigator.share) await navigator.share({ title: lastAPODData?.title || 'AstroWafy', text: 'Check out this APOD!', url });
    else await navigator.clipboard.writeText(url).then(()=>alert('Image link copied!'));
  } catch(e) { if(e.name!=='AbortError') console.warn('Share failed', e); }
});

// ===== FAVORITES =====
function saveFavorites() { localStorage.setItem('astrowafy_favs', JSON.stringify(favorites)); renderFavList(); }
function renderFavList() {
  favList.innerHTML = '';
  if (!favorites.length) { favList.innerHTML = '<div class="empty">No favorites yet</div>'; return; }
  favorites.forEach((item, idx)=>{
    const div = document.createElement('div'); div.className='fav-item';
    div.innerHTML = `
      <img src="${item.url}" alt="${item.title}">
      <div class="info"><div class="title">${item.title}</div><div class="date">${item.date}</div></div>
      <button class="remove" data-idx="${idx}">&times;</button>
    `;
    div.querySelector('.remove').addEventListener('click', (e)=>{
      e.stopPropagation();
      favorites.splice(idx,1);
      saveFavorites();
      if (lastAPODData && lastAPODData.date === item.date) favBtn.textContent = '⭐';
    });
    div.addEventListener('click', ()=>{
      datePicker.value = item.date;
      fetchAPOD(item.date);
      favDrawer.classList.remove('open');
    });
    favList.appendChild(div);
  });
}
favBtn.addEventListener('click', ()=>{
  if (!lastAPODData) return;
  const idx = favorites.findIndex(f=>f.date===lastAPODData.date);
  if (idx>-1) { favorites.splice(idx,1); favBtn.textContent='⭐'; }
  else {
    favorites.push({ date: lastAPODData.date, title: lastAPODData.title, url: lastAPODData.url });
    favBtn.textContent='★';
  }
  saveFavorites();
});
favToggleBtn.addEventListener('click', ()=>{
  favDrawer.classList.toggle('open');
  renderFavList();
});
closeDrawerBtn.addEventListener('click', ()=>favDrawer.classList.remove('open'));
document.addEventListener('click', (e)=>{
  if (favDrawer.classList.contains('open') && !favDrawer.contains(e.target) && e.target !== favToggleBtn) favDrawer.classList.remove('open');
});

// ===== DOWNLOAD =====
oneClickDownloadBtn.addEventListener('click', async ()=>{
  if (!currentDownloadUrl) return;
  oneClickDownloadBtn.disabled = true; oneClickDownloadIcon.classList.add('animate-bounce'); oneClickDownloadLabel.textContent='Downloading…';
  try {
    const res = await fetch(currentDownloadUrl);
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=currentDownloadName; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch(e) { console.warn('Download fallback', e); window.open(currentDownloadUrl, '_blank'); }
  finally { oneClickDownloadBtn.disabled=false; oneClickDownloadIcon.classList.remove('animate-bounce'); oneClickDownloadLabel.textContent='Download'; }
});

// ===== LIGHTBOX =====
lightboxClose.addEventListener('click', ()=>lightboxOverlay.classList.remove('active'));
lightboxOverlay.addEventListener('click', (e)=>{ if (e.target===lightboxOverlay) lightboxOverlay.classList.remove('active'); });

// ===== INIT =====
document.addEventListener('DOMContentLoaded', ()=>{
  applyLanguage(currentLang);
  const today = todayISO();
  datePicker.value = today; datePicker.max = today;
  fetchAPOD(today);
  renderFavList();
});
datePicker.addEventListener('change', ()=>{ if(datePicker.value) fetchAPOD(datePicker.value); });
refreshBtn.addEventListener('click', ()=>{ const selected = datePicker.value || todayISO(); fetchAPOD(selected); });