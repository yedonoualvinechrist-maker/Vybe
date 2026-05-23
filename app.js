// ════════════════════════════════════════════
//  VYBE — app.js complet
// ════════════════════════════════════════════
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL    = 'https://coipxptoubwmuilvazqc.supabase.co';
const SUPABASE_ANON   = 'sb_publishable_1NWDVeNLcJc9Na7uFVyF-g_RDi2UXAi';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

let currentUser = null;
let activeCommentPostId = null;
let activeChatWith = null;
let pendingMedia = null;
let pendingStory = null;
let pendingReel  = null;
let realtimeFeed = null;
let realtimeChat = null;
let allUsers = [];
let profileViewId = null;
let storyList = [];
let storyIndex = 0;
let storyTimer = null;

// ── AVATARS ──
const COLORS = ['#7c5cfc','#fc5c8a','#3dcc8a','#fcb05c','#5cc4fc','#e05cfc','#fc5c5c'];
function avatarColor(s){let h=0;for(const c of(s||'x'))h=(h*31+c.charCodeAt(0))&0xffff;return COLORS[h%COLORS.length];}
function avatarInit(n){return(n||'?')[0].toUpperCase();}
function setAvatar(el,name,username,size=40){
  el.style.background=avatarColor(username||name);
  el.style.width=size+'px';el.style.height=size+'px';
  el.style.fontSize=Math.floor(size*.38)+'px';
  el.textContent=avatarInit(name);
}

// ── EMOJIS ──
const EMOJIS=['😀','😂','🥰','😍','🤩','😎','🥳','😭','😤','🤔','👍','❤️','🔥','💯','🎉','👏','🙏','💪','✨','😅','🤣','😊','😇','🥺','😏','😒','😬','🤯','😱','🫶','💀','👀','🤝','🫡','🥹','😴','🤑','😋','🎵','🎮','⚽','🏀','🚀','💎','🐐','🌸','🌊','🌙','⭐','🏆'];
function buildEmojiPicker(pickerId,inputId){
  const p=document.getElementById(pickerId);
  p.innerHTML=EMOJIS.map(e=>`<button class="emoji-btn" onclick="insertEmoji('${inputId}','${e}')">${e}</button>`).join('');
}
window.insertEmoji=(inputId,emoji)=>{
  const el=document.getElementById(inputId);
  const pos=el.selectionStart||el.value.length;
  el.value=el.value.slice(0,pos)+emoji+el.value.slice(pos);
  el.focus();el.selectionStart=el.selectionEnd=pos+emoji.length;
};
window.toggleEmojiPicker=()=>{
  const p=document.getElementById('emoji-picker');
  if(p.style.display==='none'){buildEmojiPicker('emoji-picker','chat-input');p.style.display='flex';}
  else p.style.display='none';
};

// ════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════
(async function boot(){
  const {data:{session}}=await sb.auth.getSession();
  if(session){
    const {data:p}=await sb.from('profiles').select('*').eq('id',session.user.id).single();
    if(p){currentUser=p;showScreen('app');initApp();return;}
  }
  showScreen('auth');
})();

// ════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════
window.switchAuthTab=(tab)=>{
  document.querySelectorAll('.auth-tab').forEach((t,i)=>t.classList.toggle('active',i===(tab==='login'?0:1)));
  document.getElementById('login-form').style.display=tab==='login'?'':'none';
  document.getElementById('register-form').style.display=tab==='register'?'':'none';
  document.getElementById('forgot-form').style.display='none';
  document.querySelector('.auth-tabs').style.display='';
};

window.register=async()=>{
  const name=document.getElementById('reg-name').value.trim();
  const username=document.getElementById('reg-username').value.trim().toLowerCase().replace(/[^a-z0-9_]/g,'_');
  const bio=document.getElementById('reg-bio').value.trim();
  const email=document.getElementById('reg-email').value.trim().toLowerCase();
  const password=document.getElementById('reg-password').value;
  const errEl=document.getElementById('reg-error');
  errEl.textContent='';
  if(!name||!username||!password){errEl.textContent='Remplis tous les champs obligatoires.';return;}
  if(username.length<3){errEl.textContent='Pseudo trop court (min 3 caractères).';return;}
  if(password.length<6){errEl.textContent='Mot de passe trop court (min 6 caractères).';return;}
  const{data:existing}=await sb.from('profiles').select('id').eq('username',username).maybeSingle();
  if(existing){errEl.textContent='Ce pseudo est déjà pris.';return;}
  const rand=Math.random().toString(36).substring(2,10);
  const authEmail=email||`${username}_${rand}@vybe-internal.app`;
  const{data:authData,error:authErr}=await sb.auth.signUp({email:authEmail,password,options:{data:{username,name}}});
  if(authErr){errEl.textContent=authErr.message.includes('rate')?'Attends 1 minute et réessaie.':authErr.message;return;}
  const{error:profileErr}=await sb.from('profiles').insert({id:authData.user.id,username,name,bio,internal_email:authEmail});
  if(profileErr){errEl.textContent=profileErr.message;return;}
  currentUser={id:authData.user.id,username,name,bio};
  showScreen('app');initApp();
};

window.login=async()=>{
  const username=document.getElementById('login-username').value.trim().toLowerCase();
  const password=document.getElementById('login-password').value;
  const errEl=document.getElementById('login-error');
  errEl.textContent='';
  const{data:profile}=await sb.from('profiles').select('id,internal_email,name,username,bio').eq('username',username).maybeSingle();
  if(!profile){errEl.textContent='Utilisateur introuvable.';return;}
  const{error}=await sb.auth.signInWithPassword({email:profile.internal_email,password});
  if(error){errEl.textContent='Mot de passe incorrect.';return;}
  currentUser=profile;showScreen('app');initApp();
};

window.logout=async()=>{
  [realtimeFeed,realtimeChat].forEach(s=>s&&sb.removeChannel(s));
  await sb.auth.signOut();currentUser=null;showScreen('auth');
};

window.showForgotPassword=(show=true)=>{
  document.getElementById('login-form').style.display=show?'none':'';
  document.getElementById('forgot-form').style.display=show?'':'none';
  document.querySelector('.auth-tabs').style.display=show?'none':'';
  document.getElementById('forgot-error').textContent='';
  document.getElementById('forgot-success').textContent='';
};

window.sendResetEmail=async()=>{
  const email=document.getElementById('forgot-email').value.trim().toLowerCase();
  const errEl=document.getElementById('forgot-error');
  const succEl=document.getElementById('forgot-success');
  errEl.textContent='';succEl.textContent='';
  if(!email){errEl.textContent='Entre ton email.';return;}
  const{data:profile}=await sb.from('profiles').select('id').eq('internal_email',email).maybeSingle();
  if(!profile){errEl.textContent='Aucun compte trouvé avec cet email.';return;}
  const{error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:window.location.href});
  if(error){errEl.textContent=error.message;return;}
  succEl.textContent='✅ Lien envoyé ! Vérifie ta boîte mail.';
};

// ════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════
function initApp(){
  setAvatar(document.getElementById('my-story-avatar'),currentUser.name,currentUser.username,50);
  setAvatar(document.getElementById('comment-avatar'),currentUser.name,currentUser.username,32);
  showPage('feed');
  // Charger tous les users en cache
  sb.from('profiles').select('id,name,username,bio').neq('id',currentUser.id).then(({data})=>{allUsers=data||[];});
}

// ════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════
window.showPage=(name)=>{
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.getElementById('nav-'+name).classList.add('active');
  if(name==='feed')    {loadFeed();loadStories();}
  if(name==='reels')    loadReels();
  if(name==='explore')  loadExplore('');
  if(name==='profile') {profileViewId=currentUser.id;loadProfile(currentUser.id);}
  if(name==='messages') loadConversations();
};

// ════════════════════════════════════════════
//  STORIES
// ════════════════════════════════════════════
async function loadStories(){
  const{data:stories}=await sb.from('stories')
    .select('*,profiles:author_id(id,name,username)')
    .gt('expires_at',new Date().toISOString())
    .order('created_at',{ascending:false});

  const storiesEl=document.getElementById('stories-list');
  if(!stories||!stories.length){storiesEl.innerHTML='';return;}

  // Grouper par auteur
  const byAuthor={};
  stories.forEach(s=>{
    const uid=s.author_id;
    if(!byAuthor[uid])byAuthor[uid]={user:s.profiles,stories:[]};
    byAuthor[uid].stories.push(s);
  });

  storiesEl.innerHTML=Object.values(byAuthor).map(g=>{
    const u=g.user;
    const color=avatarColor(u.username);
    return `<div class="story-item" onclick="openStoryViewer('${u.id}')">
      <div class="story-avatar" style="background:${color};">${avatarInit(u.name)}</div>
      <div class="story-name">${esc(u.name)}</div>
    </div>`;
  }).join('');
}

// OUVRIR MODAL AJOUT STORY
window.openAddStory=()=>{
  pendingStory=null;
  document.getElementById('story-text').value='';
  document.getElementById('story-preview').style.display='none';
  document.getElementById('story-preview').innerHTML='';
  document.getElementById('story-modal').style.display='flex';
};
window.closeStoryModal=()=>{document.getElementById('story-modal').style.display='none';};

window.previewStory=(input,type)=>{
  const file=input.files[0];if(!file)return;
  if(file.size>2*1024*1024){showToast('Max 2MB');input.value='';return;}
  const reader=new FileReader();
  reader.onload=(e)=>{
    pendingStory={dataUrl:e.target.result,type};
    const prev=document.getElementById('story-preview');
    prev.style.display='block';
    prev.innerHTML=type==='image'
      ?`<img src="${e.target.result}" style="width:100%;max-height:300px;object-fit:cover;display:block;border-radius:12px;"/>`
      :`<video src="${e.target.result}" controls style="width:100%;max-height:300px;display:block;border-radius:12px;"></video>`;
  };
  reader.readAsDataURL(file);
};

window.createStory=async()=>{
  const text=document.getElementById('story-text').value.trim();
  if(!pendingStory&&!text){showToast('Ajoute une photo, vidéo ou texte.');return;}
  const btn=document.getElementById('story-submit-btn');
  btn.disabled=true;btn.textContent='...';
  const{error}=await sb.from('stories').insert({
    author_id:currentUser.id,
    media_url:pendingStory?pendingStory.dataUrl:null,
    media_type:pendingStory?pendingStory.type:null,
    text,
  });
  btn.disabled=false;btn.textContent='Publier la Story';
  if(error){showToast('Erreur : '+error.message);return;}
  closeStoryModal();showToast('Story publiée !');loadStories();
};

// VIEWER DE STORY
window.openStoryViewer=async(authorId)=>{
  const{data:stories}=await sb.from('stories')
    .select('*,profiles:author_id(id,name,username)')
    .eq('author_id',authorId)
    .gt('expires_at',new Date().toISOString())
    .order('created_at',{ascending:true});
  if(!stories||!stories.length){showToast('Plus de story disponible.');return;}
  storyList=stories;storyIndex=0;
  showStory(0);
  document.getElementById('story-viewer').classList.add('open');
};

function showStory(idx){
  if(storyTimer)clearTimeout(storyTimer);
  const s=storyList[idx];
  const u=s.profiles;
  setAvatar(document.getElementById('story-viewer-avatar'),u.name,u.username,36);
  document.getElementById('story-viewer-name').textContent=u.name;
  document.getElementById('story-viewer-time').textContent=timeAgo(s.created_at);
  document.getElementById('story-viewer-text').textContent=s.text||'';

  const content=document.getElementById('story-viewer-content');
  if(s.media_url){
    if(s.media_type==='image') content.innerHTML=`<img src="${s.media_url}" style="max-width:100%;max-height:80vh;border-radius:12px;"/>`;
    else content.innerHTML=`<video src="${s.media_url}" autoplay style="max-width:100%;max-height:80vh;border-radius:12px;"></video>`;
  } else {
    content.innerHTML=`<div style="color:#fff;font-size:24px;font-weight:700;padding:40px;text-align:center;">${esc(s.text)}</div>`;
  }

  // Barres de progression
  const bars=document.getElementById('story-progress-bars');
  bars.innerHTML=storyList.map((_,i)=>`<div class="story-progress-bar-track"><div class="story-progress-bar-fill" id="spb-${i}"></div></div>`).join('');
  // Remplir les passées
  for(let i=0;i<idx;i++){const el=document.getElementById('spb-'+i);if(el)el.style.width='100%';}
  // Animer la courante
  const fill=document.getElementById('spb-'+idx);
  if(fill){fill.style.transition='width 5s linear';setTimeout(()=>{fill.style.width='100%';},50);}
  storyTimer=setTimeout(()=>nextStory(),5000);
}

window.nextStory=()=>{
  if(storyIndex<storyList.length-1){storyIndex++;showStory(storyIndex);}
  else closeStoryViewer();
};
window.prevStory=()=>{
  if(storyIndex>0){storyIndex--;showStory(storyIndex);}
};
window.closeStoryViewer=()=>{
  if(storyTimer)clearTimeout(storyTimer);
  document.getElementById('story-viewer').classList.remove('open');
  storyList=[];storyIndex=0;
};

// ════════════════════════════════════════════
//  MODAL NOUVEAU POST (depuis onglet Profil)
// ════════════════════════════════════════════
window.openPostModal=()=>{
  pendingMedia=null;
  document.getElementById('post-input').value='';
  document.getElementById('media-preview').style.display='none';
  document.getElementById('media-preview').innerHTML='';
  ['media-image','media-video','media-audio'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('post-modal').style.display='flex';
};
window.closePostModal=()=>{document.getElementById('post-modal').style.display='none';};

// ════════════════════════════════════════════
//  MODAL REEL (depuis onglet Profil)
// ════════════════════════════════════════════
window.openReelModal=()=>{
  pendingReel=null;
  document.getElementById('reel-caption').value='';
  document.getElementById('reel-preview').style.display='none';
  document.getElementById('reel-preview').innerHTML='';
  document.getElementById('reel-modal').style.display='flex';
};
window.closeReelModal=()=>{document.getElementById('reel-modal').style.display='none';};

window.previewReel=(input)=>{
  const file=input.files[0];if(!file)return;
  if(file.size>2*1024*1024){showToast('Max 2MB');input.value='';return;}
  const reader=new FileReader();
  reader.onload=(e)=>{
    pendingReel=e.target.result;
    const prev=document.getElementById('reel-preview');
    prev.style.display='block';
    prev.innerHTML=`<video src="${e.target.result}" controls style="width:100%;max-height:300px;display:block;border-radius:12px;"></video>`;
  };
  reader.readAsDataURL(file);
};

window.createReel=async()=>{
  if(!pendingReel){showToast('Choisis une vidéo.');return;}
  const caption=document.getElementById('reel-caption').value.trim();
  const btn=document.getElementById('reel-submit-btn');
  btn.disabled=true;btn.textContent='...';
  const{error}=await sb.from('reels').insert({author_id:currentUser.id,video_url:pendingReel,caption});
  btn.disabled=false;btn.textContent='Publier le Reel';
  if(error){showToast('Erreur : '+error.message);return;}
  closeReelModal();showToast('Reel publié !');
};

// ════════════════════════════════════════════
//  MÉDIAS POSTS
// ════════════════════════════════════════════
window.previewMedia=(input,type)=>{
  const file=input.files[0];if(!file)return;
  if(file.size>2*1024*1024){showToast('Max 2MB');input.value='';return;}
  const reader=new FileReader();
  reader.onload=(e)=>{
    pendingMedia={dataUrl:e.target.result,type};
    const prev=document.getElementById('media-preview');
    prev.style.display='block';
    const rm=`<button class="media-preview-remove" onclick="removeMedia()">×</button>`;
    if(type==='image')prev.innerHTML=`<img src="${e.target.result}"/>${rm}`;
    else if(type==='video')prev.innerHTML=`<video src="${e.target.result}" controls></video>${rm}`;
    else prev.innerHTML=`<audio src="${e.target.result}" controls></audio>${rm}`;
  };
  reader.readAsDataURL(file);
};
window.removeMedia=()=>{
  pendingMedia=null;
  const p=document.getElementById('media-preview');
  p.style.display='none';p.innerHTML='';
  ['media-image','media-video','media-audio'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
};

// ════════════════════════════════════════════
//  CRÉER UN POST
// ════════════════════════════════════════════
window.createPost=async()=>{
  const text=document.getElementById('post-input').value.trim();
  const btn=document.getElementById('post-submit-btn');
  if(!text&&!pendingMedia)return;
  btn.disabled=true;btn.textContent='...';
  const{error}=await sb.from('posts').insert({
    author_id:currentUser.id,body:text,
    media_url:pendingMedia?pendingMedia.dataUrl:null,
    media_type:pendingMedia?pendingMedia.type:null,
  });
  btn.disabled=false;btn.textContent='Publier';
  if(error){showToast('Erreur : '+error.message);return;}
  document.getElementById('post-input').value='';
  removeMedia();closePostModal();showToast('Post publié !');
  loadFeed();loadProfile(currentUser.id);
};

// ════════════════════════════════════════════
//  FEED
// ════════════════════════════════════════════
async function loadFeed(){
  const listEl=document.getElementById('feed-list');
  listEl.innerHTML=loading();
  const{data:follows}=await sb.from('follows').select('following_id').eq('follower_id',currentUser.id);
  const ids=[...(follows||[]).map(f=>f.following_id),currentUser.id];
  const{data:posts}=await sb.from('posts')
    .select('*,profiles:author_id(id,name,username),repost_profile:repost_of(author_id,profiles:author_id(name,username))')
    .in('author_id',ids).order('created_at',{ascending:false});
  if(!posts||!posts.length){
    listEl.innerHTML=`<div class="empty-feed"><h3>Aucun post pour l'instant</h3><p>Abonne-toi à des personnes ou publie depuis ton profil !</p></div>`;
    return;
  }
  const{data:myLikes}=await sb.from('likes').select('post_id').eq('user_id',currentUser.id);
  const likedSet=new Set((myLikes||[]).map(l=>l.post_id));
  listEl.innerHTML=posts.map(p=>postHTML(p,likedSet)).join('');
  if(realtimeFeed)sb.removeChannel(realtimeFeed);
  realtimeFeed=sb.channel('public-posts')
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'posts'},()=>loadFeed())
    .subscribe();
}

function postHTML(p,likedSet){
  const u=p.profiles||{name:'?',username:'?',id:''};
  const liked=likedSet&&likedSet.has(p.id);
  const color=avatarColor(u.username);
  const ago=timeAgo(p.created_at);
  let mediaHTML='';
  if(p.media_url){
    if(p.media_type==='image')mediaHTML=`<div class="post-media"><img src="${p.media_url}" loading="lazy"/></div>`;
    else if(p.media_type==='video')mediaHTML=`<div class="post-media"><video src="${p.media_url}" controls preload="metadata"></video></div>`;
    else if(p.media_type==='audio')mediaHTML=`<div class="post-media"><audio src="${p.media_url}" controls></audio></div>`;
  }
  return `<div class="post-card">
    <div class="post-header">
      <div class="avatar" style="background:${color};width:40px;height:40px;font-size:15px;cursor:pointer" onclick="viewProfile('${u.id}')">${avatarInit(u.name)}</div>
      <div class="post-header-info">
        <div class="post-username" onclick="viewProfile('${u.id}')">${esc(u.name)}</div>
        <div class="post-handle">@${u.username}</div>
      </div>
      <div class="post-time">${ago}</div>
    </div>
    ${p.body?`<div class="post-body">${esc(p.body)}</div>`:''}
    ${mediaHTML}
    <div class="post-actions">
      <button class="action-btn ${liked?'liked':''}" onclick="toggleLike('${p.id}',this)">
        <svg viewBox="0 0 24 24" fill="${liked?'currentColor':'none'}" stroke="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <span id="lc-${p.id}">${p.likes_count??0}</span>
      </button>
      <button class="action-btn" onclick="openComments('${p.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span id="cc-${p.id}">${p.comments_count??0}</span>
      </button>
      <button class="action-btn" onclick="repost('${p.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        <span id="rc-${p.id}">${p.reposts_count??0}</span>
      </button>
      ${u.id!==currentUser.id?`
      <button class="action-btn" onclick="openChat('${u.id}','${u.username}','${esc(u.name)}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        Message
      </button>`:''}
      ${u.id===currentUser.id?`
      <button class="action-btn delete-btn" onclick="deletePost('${p.id}',this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        Supprimer
      </button>`:''}
    </div>
  </div>`;
}

// ════════════════════════════════════════════
//  REELS
// ════════════════════════════════════════════
async function loadReels(){
  const listEl=document.getElementById('reels-list');
  listEl.innerHTML=loading();
  const{data:reels}=await sb.from('reels')
    .select('*,profiles:author_id(id,name,username)')
    .order('created_at',{ascending:false});
  if(!reels||!reels.length){
    listEl.innerHTML=`<div class="empty-feed"><h3>Aucun reel pour l'instant</h3><p>Publie le premier depuis ton profil !</p></div>`;
    return;
  }
  listEl.innerHTML=reels.map(r=>{
    const u=r.profiles||{name:'?',username:'?',id:''};
    const liked=(r.likes||[]).includes(currentUser.id);
    const color=avatarColor(u.username);
    return `<div class="reel-card">
      <video src="${r.video_url}" controls preload="metadata" style="width:100%;max-height:420px;display:block;"></video>
      <div class="reel-overlay">
        <div class="reel-author">
          <div class="avatar" style="background:${color};width:32px;height:32px;font-size:12px;cursor:pointer" onclick="viewProfile('${u.id}')">${avatarInit(u.name)}</div>
          <div class="reel-author-name" onclick="viewProfile('${u.id}')">${esc(u.name)}</div>
        </div>
        ${r.caption?`<div class="reel-caption">${esc(r.caption)}</div>`:''}
        <div class="reel-actions">
          <button class="reel-btn-action ${liked?'liked':''}" onclick="likeReel('${r.id}',this)">
            ❤️ <span id="rlc-${r.id}">${r.likes_count??0}</span>
          </button>
          ${u.id!==currentUser.id?`<button class="reel-btn-action" onclick="openChat('${u.id}','${u.username}','${esc(u.name)}')">💬 Message</button>`:''}
          ${u.id===currentUser.id?`<button class="reel-btn-action" onclick="deleteReel('${r.id}',this)" style="background:rgba(255,80,80,.3)">🗑️ Supprimer</button>`:''}
        </div>
      </div>
    </div>`;
  }).join('');
}

window.likeReel=async(reelId,btn)=>{
  const{data:reel}=await sb.from('reels').select('likes,likes_count').eq('id',reelId).single();
  const likes=reel.likes||[];
  const liked=likes.includes(currentUser.id);
  const newLikes=liked?likes.filter(l=>l!==currentUser.id):[...likes,currentUser.id];
  await sb.from('reels').update({likes:newLikes,likes_count:newLikes.length}).eq('id',reelId);
  btn.classList.toggle('liked',!liked);
  const el=document.getElementById('rlc-'+reelId);
  if(el)el.textContent=newLikes.length;
};

window.deleteReel=async(reelId,btn)=>{
  if(!confirm('Supprimer ce reel ?'))return;
  btn.disabled=true;
  await sb.from('reels').delete().eq('id',reelId);
  btn.closest('.reel-card')?.remove();
  showToast('Reel supprimé.');
};

// ════════════════════════════════════════════
//  LIKES, REPOST, DELETE
// ════════════════════════════════════════════
window.toggleLike=async(postId,btn)=>{
  const liked=btn.classList.contains('liked');
  if(liked)await sb.from('likes').delete().eq('post_id',postId).eq('user_id',currentUser.id);
  else await sb.from('likes').insert({post_id:postId,user_id:currentUser.id});
  const{count}=await sb.from('likes').select('*',{count:'exact',head:true}).eq('post_id',postId);
  const el=document.getElementById('lc-'+postId);if(el)el.textContent=count??0;
  btn.classList.toggle('liked');
  const svg=btn.querySelector('svg');
  if(svg)svg.setAttribute('fill',btn.classList.contains('liked')?'currentColor':'none');
};

window.repost=async(postId)=>{
  const{data:existing}=await sb.from('posts').select('id').eq('author_id',currentUser.id).eq('repost_of',postId).maybeSingle();
  if(existing){showToast('Tu as déjà reposté ce post.');return;}
  await sb.from('posts').insert({author_id:currentUser.id,body:'',repost_of:postId});
  await sb.from('posts').update({reposts_count:sb.rpc('increment')}).eq('id',postId);
  const el=document.getElementById('rc-'+postId);
  if(el)el.textContent=parseInt(el.textContent||'0')+1;
  showToast('Post repartagé !');
};

window.deletePost=async(postId,btn)=>{
  if(!confirm('Supprimer ce post ?'))return;
  btn.disabled=true;btn.textContent='...';
  await sb.from('likes').delete().eq('post_id',postId);
  await sb.from('comments').delete().eq('post_id',postId);
  const{error}=await sb.from('posts').delete().eq('id',postId);
  if(error){showToast('Erreur : '+error.message);btn.disabled=false;return;}
  btn.closest('.post-card')?.remove();showToast('Post supprimé.');
};

// ════════════════════════════════════════════
//  COMMENTAIRES
// ════════════════════════════════════════════
window.openComments=async(postId)=>{
  activeCommentPostId=postId;
  await loadComments();
  document.getElementById('comments-modal').classList.add('open');
};
window.closeComments=()=>{
  document.getElementById('comments-modal').classList.remove('open');
  activeCommentPostId=null;
};
async function loadComments(){
  const listEl=document.getElementById('comments-list');
  listEl.innerHTML=loading();
  const{data:comments}=await sb.from('comments')
    .select('*,profiles:author_id(name,username)')
    .eq('post_id',activeCommentPostId).order('created_at',{ascending:true});
  if(!comments||!comments.length){listEl.innerHTML=`<p style="color:var(--muted);text-align:center;padding:30px;">Sois le premier à commenter !</p>`;return;}
  listEl.innerHTML=comments.map(c=>{
    const u=c.profiles||{name:'?',username:'?'};
    return `<div class="comment-item">
      <div class="avatar" style="background:${avatarColor(u.username)};width:34px;height:34px;font-size:13px;flex-shrink:0;">${avatarInit(u.name)}</div>
      <div class="comment-body">
        <div class="comment-author">${esc(u.name)} <span style="font-weight:400;color:var(--muted);">@${u.username}</span></div>
        <div class="comment-text">${esc(c.body)}</div>
        <div class="comment-time">${timeAgo(c.created_at)}</div>
      </div>
    </div>`;
  }).join('');
  listEl.scrollTop=listEl.scrollHeight;
}
window.submitComment=async()=>{
  const input=document.getElementById('comment-input');
  const text=input.value.trim();
  if(!text||!activeCommentPostId)return;
  await sb.from('comments').insert({post_id:activeCommentPostId,author_id:currentUser.id,body:text});
  input.value='';await loadComments();
  const el=document.getElementById('cc-'+activeCommentPostId);
  if(el)el.textContent=parseInt(el.textContent||'0')+1;
};

// ════════════════════════════════════════════
//  EXPLORER
// ════════════════════════════════════════════
window.searchUsers=()=>renderUserList(document.getElementById('search-input').value.trim().toLowerCase());
async function loadExplore(q){
  document.getElementById('explore-list').innerHTML=loading();
  const{data:users}=await sb.from('profiles').select('id,name,username,bio').neq('id',currentUser.id).order('name');
  allUsers=users||[];renderUserList(q);
}
async function renderUserList(q){
  const listEl=document.getElementById('explore-list');
  let filtered=allUsers;
  if(q)filtered=allUsers.filter(u=>u.name.toLowerCase().includes(q)||u.username.toLowerCase().includes(q));
  if(!filtered.length){listEl.innerHTML=`<div class="no-results">${allUsers.length===0?'Aucun autre utilisateur inscrit pour l\'instant':'Aucun résultat pour "'+q+'"'}</div>`;return;}
  const{data:follows}=await sb.from('follows').select('following_id').eq('follower_id',currentUser.id);
  const followSet=new Set((follows||[]).map(f=>f.following_id));
  listEl.innerHTML=filtered.map(u=>{
    const isF=followSet.has(u.id);
    return `<div class="user-card">
      <div class="avatar" style="background:${avatarColor(u.username)};width:46px;height:46px;font-size:17px;cursor:pointer" onclick="viewProfile('${u.id}')">${avatarInit(u.name)}</div>
      <div class="user-card-info">
        <div class="user-card-name" onclick="viewProfile('${u.id}')">${esc(u.name)}</div>
        <div class="user-card-bio">@${u.username}${u.bio?' · '+u.bio:''}</div>
      </div>
      <button class="follow-btn ${isF?'following':'not-following'}" id="fb-${u.id}" onclick="toggleFollow('${u.id}')">${isF?'Abonné':'Suivre'}</button>
    </div>`;
  }).join('');
}
window.toggleFollow=async(targetId)=>{
  const{data:existing}=await sb.from('follows').select('id').eq('follower_id',currentUser.id).eq('following_id',targetId).maybeSingle();
  if(existing)await sb.from('follows').delete().eq('id',existing.id);
  else await sb.from('follows').insert({follower_id:currentUser.id,following_id:targetId});
  const btn=document.getElementById('fb-'+targetId);
  if(btn){const nowF=!existing;btn.textContent=nowF?'Abonné':'Suivre';btn.className=`follow-btn ${nowF?'following':'not-following'}`;}
};

// ════════════════════════════════════════════
//  PROFIL
// ════════════════════════════════════════════
async function loadProfile(userId){
  profileViewId=userId;
  const{data:u}=await sb.from('profiles').select('*').eq('id',userId).single();
  if(!u)return;
  setAvatar(document.getElementById('profile-avatar'),u.name,u.username,72);
  document.getElementById('profile-name').textContent=u.name;
  document.getElementById('profile-handle').textContent='@'+u.username;
  document.getElementById('profile-bio').textContent=u.bio||'';

  const[{count:pc},{count:frc},{count:fgc}]=await Promise.all([
    sb.from('posts').select('*',{count:'exact',head:true}).eq('author_id',userId),
    sb.from('follows').select('*',{count:'exact',head:true}).eq('following_id',userId),
    sb.from('follows').select('*',{count:'exact',head:true}).eq('follower_id',userId),
  ]);
  document.getElementById('stat-posts').textContent=pc??0;
  document.getElementById('stat-followers').textContent=frc??0;
  document.getElementById('stat-following').textContent=fgc??0;

  // Boutons poster/reel — visible seulement sur son propre profil
  const postActions=document.querySelector('.profile-post-actions');
  const btn=document.getElementById('profile-action-btn');
  if(userId===currentUser.id){
    postActions.style.display='flex';
    btn.textContent='Modifier';btn.onclick=openEditModal;
  } else {
    postActions.style.display='none';
    const{data:f}=await sb.from('follows').select('id').eq('follower_id',currentUser.id).eq('following_id',userId).maybeSingle();
    btn.textContent=f?'Abonné ✓':'Suivre';
    btn.onclick=async()=>{await toggleFollow(userId);await loadProfile(userId);};
  }

  const{data:myLikes}=await sb.from('likes').select('post_id').eq('user_id',currentUser.id);
  const likedSet=new Set((myLikes||[]).map(l=>l.post_id));
  const{data:posts}=await sb.from('posts').select('*,profiles:author_id(id,name,username)').eq('author_id',userId).order('created_at',{ascending:false});
  const postsEl=document.getElementById('profile-posts-list');
  postsEl.innerHTML=posts&&posts.length?posts.map(p=>postHTML(p,likedSet)).join(''):`<div style="color:var(--muted);text-align:center;padding:40px;font-size:14px;">Aucun post encore</div>`;
}

window.viewProfile=async(userId)=>{showPage('profile');await loadProfile(userId);};

// ── MODAL ABONNÉS / ABONNEMENTS (cliquable) ──
window.openFollowModal=async(type)=>{
  const uid=profileViewId||currentUser.id;
  const titles={posts:'Publications',followers:'Abonnés',following:'Abonnements'};
  document.getElementById('follow-modal-title').textContent=titles[type]||'';
  const listEl=document.getElementById('follow-modal-list');
  listEl.innerHTML=loading();
  document.getElementById('follow-modal').classList.add('open');

  if(type==='posts'){closeFollowModal();return;}

  let users=[];
  if(type==='followers'){
    const{data:rows}=await sb.from('follows').select('profiles:follower_id(id,name,username,bio)').eq('following_id',uid);
    users=(rows||[]).map(r=>r.profiles).filter(Boolean);
  } else {
    const{data:rows}=await sb.from('follows').select('profiles:following_id(id,name,username,bio)').eq('follower_id',uid);
    users=(rows||[]).map(r=>r.profiles).filter(Boolean);
  }

  if(!users.length){listEl.innerHTML=`<p style="color:var(--muted);text-align:center;padding:30px;">Aucun utilisateur</p>`;return;}

  const{data:myFollows}=await sb.from('follows').select('following_id').eq('follower_id',currentUser.id);
  const followSet=new Set((myFollows||[]).map(f=>f.following_id));

  listEl.innerHTML=users.map(u=>{
    const isF=followSet.has(u.id);
    const isMe=u.id===currentUser.id;
    return `<div class="conv-item" onclick="closeFollowModal();viewProfile('${u.id}')">
      <div class="avatar" style="background:${avatarColor(u.username)};width:42px;height:42px;font-size:15px;flex-shrink:0;">${avatarInit(u.name)}</div>
      <div class="conv-info">
        <div class="conv-name">${esc(u.name)}</div>
        <div class="conv-preview">@${u.username}${u.bio?' · '+u.bio:''}</div>
      </div>
      ${!isMe?`<button class="follow-btn ${isF?'following':'not-following'}" onclick="event.stopPropagation();toggleFollow('${u.id}');this.textContent=this.classList.contains('not-following')?'Abonné':'Suivre';this.className='follow-btn '+(this.classList.contains('not-following')?'following':'not-following');">${isF?'Abonné':'Suivre'}</button>`:''}
    </div>`;
  }).join('');
};
window.closeFollowModal=()=>document.getElementById('follow-modal').classList.remove('open');

// EDIT PROFIL
window.openEditModal=()=>{
  document.getElementById('edit-name').value=currentUser.name;
  document.getElementById('edit-bio').value=currentUser.bio||'';
  document.getElementById('edit-pass').value='';
  document.getElementById('edit-modal').classList.add('open');
};
window.closeEditModal=()=>document.getElementById('edit-modal').classList.remove('open');
window.saveProfile=async()=>{
  const name=document.getElementById('edit-name').value.trim();
  const bio=document.getElementById('edit-bio').value.trim();
  const pass=document.getElementById('edit-pass').value;
  if(!name)return;
  await sb.from('profiles').update({name,bio}).eq('id',currentUser.id);
  if(pass.length>=6)await sb.auth.updateUser({password:pass});
  currentUser.name=name;currentUser.bio=bio;
  closeEditModal();
  setAvatar(document.getElementById('my-story-avatar'),name,currentUser.username,50);
  await loadProfile(currentUser.id);showToast('Profil mis à jour !');
};

// ════════════════════════════════════════════
//  MESSAGERIE — tout le monde peut écrire
// ════════════════════════════════════════════
async function loadConversations(){
  const listEl=document.getElementById('conv-list');

  // On charge TOUS les utilisateurs (pas seulement ceux qu'on suit)
  const{data:users}=await sb.from('profiles').select('id,name,username').neq('id',currentUser.id).order('name');
  if(!users||!users.length){listEl.innerHTML=`<div style="color:var(--muted);text-align:center;padding:50px 20px;font-size:14px;">Aucun utilisateur pour l'instant.</div>`;return;}

  const{data:allMsgs}=await sb.from('messages')
    .select('*').or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
    .order('created_at',{ascending:false});

  listEl.innerHTML=users.map(u=>{
    const last=(allMsgs||[]).find(m=>(m.sender_id===currentUser.id&&m.receiver_id===u.id)||(m.sender_id===u.id&&m.receiver_id===currentUser.id));
    return `<div class="conv-item" onclick="openChat('${u.id}','${u.username}','${esc(u.name)}')">
      <div class="avatar" style="background:${avatarColor(u.username)};width:46px;height:46px;font-size:17px;flex-shrink:0;">${avatarInit(u.name)}</div>
      <div class="conv-info">
        <div class="conv-name">${esc(u.name)}</div>
        <div class="conv-preview">${last?(last.media_type?'📎 Média':esc(last.body.substring(0,50))):'Envoie un message...'}</div>
      </div>
      ${last?`<div class="conv-time">${timeAgo(last.created_at)}</div>`:''}
    </div>`;
  }).join('');
}

window.openChat=(uid,username,name)=>{
  activeChatWith={id:uid,username,name};
  setAvatar(document.getElementById('chat-avatar'),name,username,36);
  document.getElementById('chat-with-name').textContent=name;
  document.getElementById('emoji-picker').style.display='none';
  if(realtimeChat)sb.removeChannel(realtimeChat);
  realtimeChat=sb.channel('chat-'+[currentUser.id,uid].sort().join('_'))
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},payload=>{
      const m=payload.new;
      if((m.sender_id===currentUser.id&&m.receiver_id===uid)||(m.sender_id===uid&&m.receiver_id===currentUser.id))renderChatMessages();
    }).subscribe();
  renderChatMessages();
  document.getElementById('chat-view').classList.add('open');
};
window.closeChat=()=>{
  document.getElementById('chat-view').classList.remove('open');
  document.getElementById('emoji-picker').style.display='none';
  if(realtimeChat)sb.removeChannel(realtimeChat);
  activeChatWith=null;
  if(document.getElementById('page-messages').classList.contains('active'))loadConversations();
};
async function renderChatMessages(){
  const uid=activeChatWith.id;
  const chatEl=document.getElementById('chat-messages');
  const{data:msgs}=await sb.from('messages')
    .select('*').or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${uid}),and(sender_id.eq.${uid},receiver_id.eq.${currentUser.id})`)
    .order('created_at',{ascending:true});
  if(!msgs||!msgs.length){chatEl.innerHTML=`<div style="color:var(--muted);text-align:center;padding:40px;font-size:14px;">Envoie le premier message !</div>`;return;}
  chatEl.innerHTML=msgs.map(m=>{
    const isMe=m.sender_id===currentUser.id;
    let content=m.body?esc(m.body):'';
    if(m.media_url){
      if(m.media_type==='image')content+=`<img src="${m.media_url}" style="max-width:100%;border-radius:10px;margin-top:6px;display:block"/>`;
      else if(m.media_type==='video')content+=`<video src="${m.media_url}" controls style="max-width:100%;border-radius:10px;margin-top:6px;display:block"></video>`;
      else content+=`<audio src="${m.media_url}" controls style="width:100%;margin-top:6px"></audio>`;
    }
    return `<div><div class="msg-bubble ${isMe?'me':'them'}">${content}</div><div class="msg-time ${isMe?'':'them'}">${timeAgo(m.created_at)}</div></div>`;
  }).join('');
  chatEl.scrollTop=chatEl.scrollHeight;
}
window.sendMessage=async()=>{
  const input=document.getElementById('chat-input');
  const text=input.value.trim();
  if(!text||!activeChatWith)return;
  input.value='';
  document.getElementById('emoji-picker').style.display='none';
  await sb.from('messages').insert({sender_id:currentUser.id,receiver_id:activeChatWith.id,body:text});
};
window.sendChatMedia=async(input)=>{
  const file=input.files[0];if(!file||!activeChatWith)return;
  if(file.size>2*1024*1024){showToast('Max 2MB');input.value='';return;}
  const reader=new FileReader();
  reader.onload=async(e)=>{
    const type=file.type.startsWith('image')?'image':file.type.startsWith('video')?'video':'audio';
    await sb.from('messages').insert({sender_id:currentUser.id,receiver_id:activeChatWith.id,body:'',media_url:e.target.result,media_type:type});
    input.value='';
  };
  reader.readAsDataURL(file);
};

// ════════════════════════════════════════════
//  UTILITAIRES
// ════════════════════════════════════════════
function timeAgo(ts){
  const s=Math.floor((Date.now()-new Date(ts))/1000);
  if(s<60)return 'maintenant';if(s<3600)return Math.floor(s/60)+'min';
  if(s<86400)return Math.floor(s/3600)+'h';if(s<604800)return Math.floor(s/86400)+'j';
  return new Date(ts).toLocaleDateString('fr');
}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');}
function loading(){return '<div style="text-align:center;padding:40px;color:var(--muted);">Chargement...</div>';}
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);}
function showScreen(name){
  document.getElementById('loader').style.display='none';
  document.getElementById('auth-screen').style.display=name==='auth'?'flex':'none';
  document.getElementById('app').style.display=name==='app'?'flex':'none';
}
