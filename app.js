const $=s=>document.querySelector(s), langs={en:'en',ru:'ru',tk:'tk',id:'id',ar:'ar',kk:'kk'};let entries=[],index=0;

/* ================= TTS 配置 =================
   后端(edge-tts·Thalita真人女声)部署好后, 把下面引号里填成你的后端地址, 例如:
   const TTS_API='https://tts-backend-xxxx.onrender.com';
   部署步骤见 thalita-backend-deploy/部署指南.md。留空则降级用 Google 女声。 */
const TTS_API='https://REPLACE-WITH-YOUR-BACKEND.onrender.com';
const TTS_VOICE='pt-BR-ThalitaMultilingualNeural';

/* 语速: 滑块值 0.5 ~ 1.5, 记忆在浏览器本地 */
function getSpeed(){return Math.min(1.5,Math.max(0.5,parseFloat(localStorage.getItem('dict-speed'))||0.85))}
function setSpeed(v){localStorage.setItem('dict-speed',v)}
$('#speed').value=getSpeed();$('#speed-val').textContent=getSpeed().toFixed(2)+'×';
$('#speed').addEventListener('input',()=>{const v=+$('#speed').value;setSpeed(v);$('#speed-val').textContent=v.toFixed(2)+'×'});

/* 播放器与缓存 */
const audio=new Audio();
/* 移动端兼容: iOS/Safari 自动播放限制 — 用户首次触摸页面时静音"解锁"音频,
   之后即使不在点击动作里(如点完成后的自动朗读)也能正常出声 */
let audioUnlocked=false;
function unlockAudio(){
  if(audioUnlocked)return;audioUnlocked=true;
  audio.muted=true;
  audio.src='data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==';
  audio.play().catch(()=>{});
  setTimeout(()=>{audio.muted=false},50);
}
document.addEventListener('pointerdown',unlockAudio,{once:true});
document.addEventListener('touchstart',unlockAudio,{once:true});
const urlCache=new Map(); // text -> 当前语速下已合成的地址
let engine='';            // 'edge' | 'google' | 'browser'

function edgeRate(speed){const pct=Math.round((speed-1)*100);return (pct>=0?'+':'')+pct+'%'}

function synthUrl(text,speed){
  if(TTS_API)return `${TTS_API}/api/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(TTS_VOICE)}&rate=${encodeURIComponent(edgeRate(speed))}&pitch=${encodeURIComponent('+0Hz')}`;
  return `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=zh-CN&q=${encodeURIComponent(text.slice(0,200))}`;
}

/* 合成并朗读: 优先真实女声接口, 失败自动降级到浏览器 TTS */
function speak(){
  if(!entries.length)return;
  const text=entries[index].text, speed=getSpeed();
  const url=synthUrl(text,speed);
  const onFail=()=>{ // 接口失败 → 浏览器自带 TTS 兜底
    engine='browser';urlCache.delete(text);
    if(!window.speechSynthesis)return;
    speechSynthesis.cancel();
    let u=new SpeechSynthesisUtterance(text);
    u.lang='zh-CN';u.rate=Math.min(2,Math.max(.5,speed));
    speechSynthesis.speak(u);
  };
  audio.onerror=onFail;
  audio.onended=null;
  audio.muted=false;
  audio.src=url;
  audio.preservesPitch=true;audio.webkitPreservesPitch=true; // 变速不变调
  // edge-tts 在服务端已变速; 其它引擎用前端变速
  audio.playbackRate=TTS_API?1:speed;
  audio.play().catch(onFail);
  // 若几秒内仍拿不到音频(接口挂了), 兜底
  clearTimeout(speak._t);
  speak._t=setTimeout(()=>{if(audio.readyState<2&&!audio.duration)onFail()},5000);
}

const translations={en:{input:'Enter dictation content (one per line)',done:'Done',next:'Next',check:'Check answers',again:'Dictate again'},ru:{input:'Введите текст для диктанта (по одному в строке)',done:'Готово',next:'Далее',check:'Проверить ответы',again:'Начать заново'},tk:{input:'Diktant tekstini giriziň (her setirde bir)',done:'Taýýar',next:'Indiki',check:'Jogaplary barla',again:'Täzeden başla'},id:{input:'Masukkan materi dikte (satu per baris)',done:'Selesai',next:'Berikutnya',check:'Periksa jawaban',again:'Ulangi dikte'},ar:{input:'أدخل نص الإملاء (عنصر واحد في كل سطر)',done:'تم',next:'التالي',check:'تحقق من الإجابات',again:'أعد الإملاء'},kk:{input:'Диктант мәтінін енгізіңіз (әр жолға біреуін)',done:'Дайын',next:'Келесі',check:'Жауаптарды тексер',again:'Қайта диктант'}};
function setLang(){let t=translations[$('#language').value];$('#input-translation').textContent=t.input;$('#done-translation').textContent=t.done;$('#next-translation').textContent=t.next;$('#check-translation').textContent=t.check;$('#again-translation').textContent=t.again;for(const id of ['input-translation','done-translation','next-translation','check-translation','again-translation'])$('#'+id).lang=langs[$('#language').value]}
$('#language').addEventListener('change',setLang);setLang();
let pinyinFn=null;async function loadPinyin(){if(pinyinFn)return pinyinFn;const mod=await import('https://esm.sh/pinyin-pro@3.26.0');pinyinFn=mod.pinyin;return pinyinFn}
async function translate(text){const code=$('#language').value;const url=`https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=${code}&dt=t&q=${encodeURIComponent(text)}`;const r=await fetch(url);if(!r.ok)throw Error('Translation unavailable');const data=await r.json();const result=(data[0]||[]).map(part=>part?.[0]||'').join('').trim();if(!result||result===text)throw Error('Translation unavailable');if((code==='ru'||code==='kk')&&!/[\u0400-\u04ff]/.test(result))throw Error('Wrong target language');if(code==='ar'&&!/[\u0600-\u06ff]/.test(result))throw Error('Wrong target language');return result}
$('#prepare').onclick=async()=>{let lines=$('#phrases').value.split(/\n/).map(x=>x.trim()).filter(Boolean);if(!lines.length)return;$('#prepare').disabled=true;try{const makePinyin=await loadPinyin();entries=await Promise.all(lines.map(async text=>({text,pinyin:makePinyin(text,{toneType:'symbol',type:'array'}).join(' '),translation:await translate(text).catch(()=> '—')})));for(let i=entries.length-1;i>0;i--){let j=Math.random()*(i+1)|0;[entries[i],entries[j]]=[entries[j],entries[i]]}index=0;urlCache.clear();showPage('page-practice');render();speak()}catch{alert('无法加载拼音服务，请检查网络后重试')}finally{$('#prepare').disabled=false}};
function showPage(id){document.querySelectorAll('.screen').forEach(x=>x.classList.add('hidden'));$('#'+id).classList.remove('hidden')}
function render(){let e=entries[index];$('#next').classList.toggle('hidden',index===entries.length-1);$('#check').classList.toggle('hidden',index!==entries.length-1)}
$('#replay').onclick=speak;$('#next').onclick=()=>{index++;render();speak()};$('#check').onclick=()=>{showPage('page-answers');$('#answers').innerHTML=entries.map(e=>`<article class="answer"><strong>${escapeHtml(e.text)}</strong><span>${escapeHtml(e.pinyin)}</span><span lang="${langs[$('#language').value]}">${escapeHtml(e.translation)}</span></article>`).join('')};function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
const dict={'老':'lǎo','师':'shī','苹':'píng','果':'guǒ','你':'nǐ','好':'hǎo','我':'wǒ','是':'shì','中':'zhōng','国':'guó','人':'rén','学':'xué','习':'xí','汉':'hàn','语':'yǔ','的':'de','了':'le','吗':'ma','不':'bù','有':'yǒu','在':'zài','天':'tiān','地':'dì','大':'dà','小':'xiǎo','水':'shuǐ','火':'huǒ','山':'shān','月':'yuè','日':'rì','明':'míng','春':'chūn','风':'fēng','又':'yòu','绿':'lǜ','江':'jiāng','南':'nán','岸':'àn','几':'jǐ','时':'shí','说':'shuō','再':'zài','见':'jiàn','谢':'xiè','请':'qǐng','早':'zǎo','上':'shàng','下':'xià','来':'lái','去':'qù','爱':'ài','家':'jiā','朋':'péng','友':'yǒu','吃':'chī','饭':'fàn','工':'gōng','作':'zuò','生':'shēng','活':'huó','快':'kuài','乐':'lè','很':'hěn','趣':'qù','气':'qì','书':'shū','看':'kàn','听':'tīng','写':'xiě','花':'huā','开':'kāi','树':'shù','叶':'yè','雨':'yǔ','雪':'xuě','光':'guāng','远':'yuǎn','近':'jìn','心':'xīn','情':'qíng','美':'měi','问':'wèn','为':'wèi','什':'shén','么':'me','这':'zhè','那':'nà','个':'gè','一':'yī','二':'èr','三':'sān','四':'sì','五':'wǔ','六':'liù','七':'qī','八':'bā','九':'jiǔ','十':'shí','年':'nián','今':'jīn','昨':'zuó','周':'zhōu','末':'mò','候':'hòu','字':'zì','词':'cí','句':'jù','子':'zi','声':'shēng','音':'yīn','读':'dú','文':'wén','主':'zhǔ','默':'mò','想':'xiǎng','念':'niàn','和':'hé','平':'píng','世':'shì','界':'jiè','欢':'huān','迎':'yíng','努':'nǔ','力':'lì'};

$('#again').onclick=()=>{if(window.speechSynthesis)speechSynthesis.cancel();audio.pause();entries=[];index=0;$('#phrases').value='';showPage('page-input')};
