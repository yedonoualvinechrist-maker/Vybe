// ════════════════════════════════════════════
//  VYBE — app.js  (Supabase)
//  Corrections : recherche, auth sans email,
//  messagerie temps réel, follow
// ════════════════════════════════════════════

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ────────────────────────────────────────────
//  ⚙️  REMPLACE CES DEUX VALEURS
//  Supabase → Settings → API
// ────────────────────────────────────────────
const SUPABASE_URL    = 'https://coipxptoubwmuilvazqc.supabase.co';
const SUPABASE_ANON   = 'sb_publishable_1NWDVeNLcJc9Na7uFVyF-g_RDi2UXAi';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ────────────────────────────────────────────
//  ÉTAT GLOBAL
// ────────────────────────────────────────────
let currentUser         = null;
let activeCommentPostId = null;
let activeChatWith      = null;
let realtimeFeed        = null;
let realtimeChat        = null;

// ════════════════════════════════════════════
//  AVATARS
// ════════════════════════════════════════════
const COLORS = ['#7c5cfc','#fc5c8a','#3dcc8a','#fcb05c','#5cc4fc','#e05cfc','#fc5c5c'];

function avatarColor(str) {
  let h = 0;
  for (const c of (str || 'x')) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return COLORS[h % COLORS.length];
}
function avatarInit(name) { return (name || '?')[0].toUpperCase(); }
function setAvatar(el, name, username, size = 40) {
  el.style.background = avatarColor(username || name);
  el.style.width      = size + 'px';
  el.style.height     = size + 'px';
  el.style.fontSize   = Math.floor(size * 0.38) + 'px';
  el.textContent      = avatarInit(name);
}

// ════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════
(async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    const { data: profile } = await sb.from('profiles')
      .select('*').eq('id', session.user.id).single();
    if (profile) {
      currentUser = profile;
      showScreen('app');
      initApp();
      return;
    }
  }
  showScreen('auth');
})();

// ════════════════════════════════════════════
//  AUTH  — INSCRIPTION SANS EMAIL
//  On génère un email interne invisible
//  format : uid_<random>@vybe-internal.app
//  L'utilisateur ne voit jamais cet email
// ════════════════════════════════════════════
window.switchAuthTab = (tab) => {
  document.querySelectorAll('.auth-tab').forEach((t,i) =>
    t.classList.toggle('active', i === (tab === 'login' ? 0 : 1))
  );
  document.getElementById('login-form').style.display    = tab === 'login'    ? '' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? '' : 'none';
};

window.register = async () => {
  const name     = document.getElementById('reg-name').value.trim();
  const username = document.getElementById('reg-username').value.trim()
                    .toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const bio      = document.getElementById('reg-bio').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl    = document.getElementById('reg-error');
  errEl.textContent = '';

  // Validations
  if (!name || !username || !password) {
    errEl.textContent = 'Remplis tous les champs obligatoires.'; return;
  }
  if (username.length < 3) {
    errEl.textContent = 'Pseudo trop court (min 3 caractères).'; return;
  }
  if (password.length < 6) {
    errEl.textContent = 'Mot de passe trop court (min 6 caractères).'; return;
  }

  // Vérifier unicité du pseudo
  const { data: existing } = await sb.from('profiles')
    .select('id').eq('username', username).maybeSingle();
  if (existing) { errEl.textContent = 'Ce pseudo est déjà pris.'; return; }

  // Générer un email interne unique (invisible pour l'utilisateur)
  const rand      = Math.random().toString(36).substring(2, 10);
  const fakeEmail = `${username}_${rand}@vybe-internal.app`;

  // Créer le compte Supabase Auth
  const { data: authData, error: authErr } = await sb.auth.signUp({
    email:    fakeEmail,
    password,
    options:  { data: { username, name } }
  });

  if (authErr) {
    // Si rate limit : message clair
    if (authErr.message.includes('rate limit') || authErr.message.includes('429')) {
      errEl.textContent = 'Trop d\'inscriptions rapides. Attends 1 minute et réessaie.';
    } else {
      errEl.textContent = authErr.message;
    }
    return;
  }

  // Sauvegarder le profil + l'email interne pour la connexion future
  const { error: profileErr } = await sb.from('profiles').insert({
    id:            authData.user.id,
    username,
    name,
    bio,
    internal_email: fakeEmail,
  });

  if (profileErr) { errEl.textContent = profileErr.message; return; }

  currentUser = { id: authData.user.id, username, name, bio };
  showScreen('app');
  initApp();
};

window.login = async () => {
  const username = document.getElementById('login-username').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';

  if (!username || !password) {
    errEl.textContent = 'Remplis tous les champs.'; return;
  }

  // Retrouver l'email interne depuis le pseudo
  const { data: profile, error: profileErr } = await sb.from('profiles')
    .select('id, internal_email, name, username, bio')
    .eq('username', username)
    .maybeSingle();

  if (!profile) {
    errEl.textContent = 'Utilisateur introuvable.'; return;
  }

  const { error: loginErr } = await sb.auth.signInWithPassword({
    email:    profile.internal_email,
    password,
  });

  if (loginErr) {
    errEl.textContent = 'Mot de passe incorrect.'; return;
  }

  currentUser = profile;
  showScreen('app');
  initApp();
};

window.logout = async () => {
  if (realtimeFeed) sb.removeChannel(realtimeFeed);
  if (realtimeChat) sb.removeChannel(realtimeChat);
  await sb.auth.signOut();
  currentUser = null;
  showScreen('auth');
};

// ════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════
function initApp() {
  setAvatar(document.getElementById('compose-avatar'), currentUser.name, currentUser.username);
  setAvatar(document.getElementById('comment-avatar'), currentUser.name, currentUser.username, 32);
  showPage('feed');
}

// ════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════
window.showPage = (name) => {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.getElementById('nav-'  + name).classList.add('active');

  if (name === 'feed')     loadFeed();
  if (name === 'explore')  loadExplore('');
  if (name === 'profile')  loadProfile(currentUser.id);
  if (name === 'messages') loadConversations();
};

// ════════════════════════════════════════════
//  MÉDIAS — PRÉVISUALISATION
// ════════════════════════════════════════════
let pendingMedia = null;

window.previewMedia = (input, type) => {
  const file = input.files[0];
  if (!file) return;

  // Limite taille : 2MB (base64 dans la DB)
  if (file.size > 2 * 1024 * 1024) {
    showToast('Fichier trop lourd (max 2MB)'); input.value = ''; return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    pendingMedia = { dataUrl: e.target.result, type };
    const preview   = document.getElementById('media-preview');
    preview.style.display = 'block';
    const removeBtn = `<button class="media-preview-remove" onclick="removeMedia()">×</button>`;
    if      (type === 'image') preview.innerHTML = `<img src="${e.target.result}"/>${removeBtn}`;
    else if (type === 'video') preview.innerHTML = `<video src="${e.target.result}" controls></video>${removeBtn}`;
    else if (type === 'audio') preview.innerHTML = `<audio src="${e.target.result}" controls></audio>${removeBtn}`;
  };
  reader.readAsDataURL(file);
};

window.removeMedia = () => {
  pendingMedia = null;
  const p = document.getElementById('media-preview');
  p.style.display = 'none'; p.innerHTML = '';
  ['media-image','media-video','media-audio'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
};

// ════════════════════════════════════════════
//  CRÉER UN POST
// ════════════════════════════════════════════
window.createPost = async () => {
  const text = document.getElementById('post-input').value.trim();
  const btn  = document.getElementById('post-submit-btn');
  if (!text && !pendingMedia) return;

  btn.disabled = true; btn.textContent = '...';

  const { error } = await sb.from('posts').insert({
    author_id:  currentUser.id,
    body:       text,
    media_url:  pendingMedia ? pendingMedia.dataUrl : null,
    media_type: pendingMedia ? pendingMedia.type    : null,
  });

  btn.disabled = false; btn.textContent = 'Poster';
  if (error) { showToast('Erreur : ' + error.message); return; }

  document.getElementById('post-input').value = '';
  removeMedia();
  showToast('Post publié !');
  loadFeed();
};

// ════════════════════════════════════════════
//  FEED
// ════════════════════════════════════════════
async function loadFeed() {
  const listEl = document.getElementById('feed-list');
  listEl.innerHTML = loading();

  // IDs des gens que je suis + moi-même
  const { data: follows } = await sb.from('follows')
    .select('following_id').eq('follower_id', currentUser.id);
  const ids = [...(follows || []).map(f => f.following_id), currentUser.id];

  // Posts
  const { data: posts } = await sb.from('posts')
    .select('*, profiles:author_id(id, name, username)')
    .in('author_id', ids)
    .order('created_at', { ascending: false });

  if (!posts || !posts.length) {
    listEl.innerHTML = `
      <div class="empty-feed">
        <h3>Aucun post pour l'instant</h3>
        <p>Abonne-toi à des personnes ou publie le premier !</p>
      </div>`;
    return;
  }

  // Mes likes
  const { data: myLikes } = await sb.from('likes')
    .select('post_id').eq('user_id', currentUser.id);
  const likedSet = new Set((myLikes || []).map(l => l.post_id));

  listEl.innerHTML = posts.map(p => postHTML(p, likedSet)).join('');

  // Realtime : nouveaux posts apparaissent automatiquement
  if (realtimeFeed) sb.removeChannel(realtimeFeed);
  realtimeFeed = sb.channel('public-posts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' },
      () => loadFeed())
    .subscribe();
}

function postHTML(p, likedSet) {
  const u     = p.profiles || { name: '?', username: '?', id: '' };
  const liked = likedSet && likedSet.has(p.id);
  const color = avatarColor(u.username);
  const ago   = timeAgo(p.created_at);

  return `
  <div class="post-card">
    <div class="post-header">
      <div class="avatar" style="background:${color};width:40px;height:40px;font-size:15px;cursor:pointer"
           onclick="viewProfile('${u.id}')">${avatarInit(u.name)}</div>
      <div class="post-header-info">
        <div class="post-username" onclick="viewProfile('${u.id}')">${esc(u.name)}</div>
        <div class="post-handle">@${u.username}</div>
      </div>
      <div class="post-time">${ago}</div>
    </div>
    ${p.body ? `<div class="post-body">${esc(p.body)}</div>` : ''}
    ${p.media_url ? `
    <div class="post-media">
      ${p.media_type === 'image' ? `<img src="${p.media_url}" loading="lazy"/>` : ''}
      ${p.media_type === 'video' ? `<video src="${p.media_url}" controls preload="metadata"></video>` : ''}
      ${p.media_type === 'audio' ? `<audio src="${p.media_url}" controls></audio>` : ''}
    </div>` : ''}
    <div class="post-actions">
      <button class="action-btn ${liked ? 'liked' : ''}" id="like-btn-${p.id}"
              onclick="toggleLike('${p.id}',this)">
        <svg viewBox="0 0 24 24" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        <span id="lc-${p.id}">${p.likes_count ?? 0}</span>
      </button>
      <button class="action-btn" onclick="openComments('${p.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span id="cc-${p.id}">${p.comments_count ?? 0}</span>
      </button>
      ${u.id !== currentUser.id ? `
      <button class="action-btn" onclick="openChat('${u.id}','${u.username}','${esc(u.name)}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
        Message
      </button>` : ''}
    </div>
  </div>`;
}

// ════════════════════════════════════════════
//  LIKES
// ════════════════════════════════════════════
window.toggleLike = async (postId, btn) => {
  const liked = btn.classList.contains('liked');

  if (liked) {
    await sb.from('likes').delete()
      .eq('post_id', postId).eq('user_id', currentUser.id);
  } else {
    await sb.from('likes').insert({ post_id: postId, user_id: currentUser.id });
  }

  const { count } = await sb.from('likes')
    .select('*', { count: 'exact', head: true }).eq('post_id', postId);

  const countEl = document.getElementById('lc-' + postId);
  if (countEl) countEl.textContent = count ?? 0;

  btn.classList.toggle('liked');
  const svg = btn.querySelector('svg');
  if (svg) svg.setAttribute('fill', btn.classList.contains('liked') ? 'currentColor' : 'none');
};

// ════════════════════════════════════════════
//  COMMENTAIRES
// ════════════════════════════════════════════
window.openComments = async (postId) => {
  activeCommentPostId = postId;
  await loadComments();
  document.getElementById('comments-modal').classList.add('open');
};
window.closeComments = () => {
  document.getElementById('comments-modal').classList.remove('open');
  activeCommentPostId = null;
};

async function loadComments() {
  const listEl = document.getElementById('comments-list');
  listEl.innerHTML = loading();

  const { data: comments } = await sb.from('comments')
    .select('*, profiles:author_id(name, username)')
    .eq('post_id', activeCommentPostId)
    .order('created_at', { ascending: true });

  if (!comments || !comments.length) {
    listEl.innerHTML = `<p style="color:var(--muted);text-align:center;padding:30px;">Sois le premier à commenter !</p>`;
    return;
  }

  listEl.innerHTML = comments.map(c => {
    const u = c.profiles || { name: '?', username: '?' };
    return `
    <div class="comment-item">
      <div class="avatar" style="background:${avatarColor(u.username)};width:34px;height:34px;font-size:13px;flex-shrink:0;">
        ${avatarInit(u.name)}</div>
      <div class="comment-body">
        <div class="comment-author">${esc(u.name)}
          <span style="font-weight:400;color:var(--muted);">@${u.username}</span>
        </div>
        <div class="comment-text">${esc(c.body)}</div>
        <div class="comment-time">${timeAgo(c.created_at)}</div>
      </div>
    </div>`;
  }).join('');
  listEl.scrollTop = listEl.scrollHeight;
}

window.submitComment = async () => {
  const input = document.getElementById('comment-input');
  const text  = input.value.trim();
  if (!text || !activeCommentPostId) return;

  await sb.from('comments').insert({
    post_id:   activeCommentPostId,
    author_id: currentUser.id,
    body:      text,
  });

  input.value = '';
  await loadComments();

  const el = document.getElementById('cc-' + activeCommentPostId);
  if (el) el.textContent = parseInt(el.textContent || '0') + 1;
};

// ════════════════════════════════════════════
//  EXPLORER — RECHERCHE CORRIGÉE
//  Charge TOUS les utilisateurs dès l'ouverture
//  puis filtre en temps réel selon la saisie
// ════════════════════════════════════════════
let allUsers = []; // cache de tous les utilisateurs

window.searchUsers = () => {
  const q = document.getElementById('search-input').value.trim().toLowerCase();
  renderUserList(q);
};

async function loadExplore(q) {
  const listEl = document.getElementById('explore-list');
  listEl.innerHTML = loading();

  // Charger TOUS les utilisateurs sauf moi
  const { data: users, error } = await sb.from('profiles')
    .select('id, name, username, bio')
    .neq('id', currentUser.id)
    .order('name');

  if (error) { listEl.innerHTML = `<div class="no-results">Erreur : ${error.message}</div>`; return; }

  allUsers = users || [];
  renderUserList(q);
}

async function renderUserList(q) {
  const listEl = document.getElementById('explore-list');

  // Filtrer localement (rapide, pas besoin d'appel réseau)
  let filtered = allUsers;
  if (q) {
    filtered = allUsers.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q)
    );
  }

  if (!filtered.length) {
    listEl.innerHTML = `<div class="no-results">${
      allUsers.length === 0
        ? 'Aucun autre utilisateur inscrit pour l\'instant'
        : 'Aucun résultat pour "' + q + '"'
    }</div>`;
    return;
  }

  // Récupérer mes abonnements
  const { data: follows } = await sb.from('follows')
    .select('following_id').eq('follower_id', currentUser.id);
  const followSet = new Set((follows || []).map(f => f.following_id));

  listEl.innerHTML = filtered.map(u => {
    const isF = followSet.has(u.id);
    return `
    <div class="user-card">
      <div class="avatar" style="background:${avatarColor(u.username)};width:46px;height:46px;font-size:17px;cursor:pointer"
           onclick="viewProfile('${u.id}')">${avatarInit(u.name)}</div>
      <div class="user-card-info">
        <div class="user-card-name" onclick="viewProfile('${u.id}')">${esc(u.name)}</div>
        <div class="user-card-bio">@${u.username}${u.bio ? ' · ' + u.bio : ''}</div>
      </div>
      <button class="follow-btn ${isF ? 'following' : 'not-following'}" id="fb-${u.id}"
              onclick="toggleFollow('${u.id}')">
        ${isF ? 'Abonné' : 'Suivre'}
      </button>
    </div>`;
  }).join('');
}

window.toggleFollow = async (targetId) => {
  const { data: existing } = await sb.from('follows')
    .select('id')
    .eq('follower_id', currentUser.id)
    .eq('following_id', targetId)
    .maybeSingle();

  if (existing) {
    await sb.from('follows').delete().eq('id', existing.id);
  } else {
    await sb.from('follows').insert({
      follower_id:  currentUser.id,
      following_id: targetId,
    });
  }

  const btn = document.getElementById('fb-' + targetId);
  if (btn) {
    const nowF      = !existing;
    btn.textContent = nowF ? 'Abonné' : 'Suivre';
    btn.className   = `follow-btn ${nowF ? 'following' : 'not-following'}`;
  }
};

// ════════════════════════════════════════════
//  PROFIL
// ════════════════════════════════════════════
async function loadProfile(userId) {
  const { data: u } = await sb.from('profiles')
    .select('*').eq('id', userId).single();
  if (!u) return;

  setAvatar(document.getElementById('profile-avatar'), u.name, u.username, 72);
  document.getElementById('profile-name').textContent   = u.name;
  document.getElementById('profile-handle').textContent = '@' + u.username;
  document.getElementById('profile-bio').textContent    = u.bio || '';

  // Compteurs
  const [{ count: pc }, { count: frc }, { count: fgc }] = await Promise.all([
    sb.from('posts').select('*',{count:'exact',head:true}).eq('author_id', userId),
    sb.from('follows').select('*',{count:'exact',head:true}).eq('following_id', userId),
    sb.from('follows').select('*',{count:'exact',head:true}).eq('follower_id', userId),
  ]);

  document.getElementById('stat-posts').textContent     = pc  ?? 0;
  document.getElementById('stat-followers').textContent = frc ?? 0;
  document.getElementById('stat-following').textContent = fgc ?? 0;

  // Bouton action
  const btn = document.getElementById('profile-action-btn');
  if (userId === currentUser.id) {
    btn.textContent = 'Modifier';
    btn.onclick     = openEditModal;
  } else {
    const { data: f } = await sb.from('follows')
      .select('id').eq('follower_id', currentUser.id).eq('following_id', userId).maybeSingle();
    btn.textContent = f ? 'Abonné ✓' : 'Suivre';
    btn.onclick     = async () => { await toggleFollow(userId); await loadProfile(userId); };
  }

  // Posts
  const { data: myLikes } = await sb.from('likes')
    .select('post_id').eq('user_id', currentUser.id);
  const likedSet = new Set((myLikes || []).map(l => l.post_id));

  const { data: posts } = await sb.from('posts')
    .select('*, profiles:author_id(id, name, username)')
    .eq('author_id', userId)
    .order('created_at', { ascending: false });

  const postsEl = document.getElementById('profile-posts-list');
  postsEl.innerHTML = posts && posts.length
    ? posts.map(p => postHTML(p, likedSet)).join('')
    : `<div style="color:var(--muted);text-align:center;padding:40px;font-size:14px;">Aucun post encore</div>`;
}

window.viewProfile = async (userId) => {
  showPage('profile');
  await loadProfile(userId);
};

// ════════════════════════════════════════════
//  MODIFIER PROFIL
// ════════════════════════════════════════════
window.openEditModal = () => {
  document.getElementById('edit-name').value = currentUser.name;
  document.getElementById('edit-bio').value  = currentUser.bio || '';
  document.getElementById('edit-pass').value = '';
  document.getElementById('edit-modal').classList.add('open');
};
window.closeEditModal = () => document.getElementById('edit-modal').classList.remove('open');

window.saveProfile = async () => {
  const name = document.getElementById('edit-name').value.trim();
  const bio  = document.getElementById('edit-bio').value.trim();
  const pass = document.getElementById('edit-pass').value;
  if (!name) return;

  await sb.from('profiles').update({ name, bio }).eq('id', currentUser.id);
  if (pass.length >= 6) await sb.auth.updateUser({ password: pass });

  currentUser.name = name; currentUser.bio = bio;
  closeEditModal();
  setAvatar(document.getElementById('compose-avatar'), name, currentUser.username);
  await loadProfile(currentUser.id);
  showToast('Profil mis à jour !');
};

// ════════════════════════════════════════════
//  MESSAGERIE
// ════════════════════════════════════════════
function convKey(a, b) { return [a, b].sort().join('__'); }

async function loadConversations() {
  const listEl = document.getElementById('conv-list');

  const { data: follows } = await sb.from('follows')
    .select('following_id, profiles:following_id(id, name, username)')
    .eq('follower_id', currentUser.id);

  if (!follows || !follows.length) {
    listEl.innerHTML = `<div style="color:var(--muted);text-align:center;padding:50px 20px;font-size:14px;">
      Abonne-toi à des personnes pour leur écrire !</div>`;
    return;
  }

  const { data: allMsgs } = await sb.from('messages')
    .select('*')
    .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
    .order('created_at', { ascending: false });

  listEl.innerHTML = follows.map(f => {
    const u    = f.profiles;
    if (!u) return '';
    const last = (allMsgs || []).find(m =>
      (m.sender_id === currentUser.id && m.receiver_id === u.id) ||
      (m.sender_id === u.id && m.receiver_id === currentUser.id)
    );
    return `
    <div class="conv-item" onclick="openChat('${u.id}','${u.username}','${esc(u.name)}')">
      <div class="avatar" style="background:${avatarColor(u.username)};width:46px;height:46px;font-size:17px;flex-shrink:0;">
        ${avatarInit(u.name)}</div>
      <div class="conv-info">
        <div class="conv-name">${esc(u.name)}</div>
        <div class="conv-preview">${last ? esc(last.body.substring(0,50)) : 'Commencer la conversation...'}</div>
      </div>
      ${last ? `<div class="conv-time">${timeAgo(last.created_at)}</div>` : ''}
    </div>`;
  }).join('');
}

window.openChat = (uid, username, name) => {
  activeChatWith = { id: uid, username, name };
  setAvatar(document.getElementById('chat-avatar'), name, username, 36);
  document.getElementById('chat-with-name').textContent = name;

  if (realtimeChat) sb.removeChannel(realtimeChat);

  // Listener temps réel
  realtimeChat = sb.channel('chat-' + convKey(currentUser.id, uid))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        const m = payload.new;
        if (
          (m.sender_id === currentUser.id && m.receiver_id === uid) ||
          (m.sender_id === uid && m.receiver_id === currentUser.id)
        ) renderChatMessages();
      })
    .subscribe();

  renderChatMessages();
  document.getElementById('chat-view').classList.add('open');
};

window.closeChat = () => {
  document.getElementById('chat-view').classList.remove('open');
  if (realtimeChat) sb.removeChannel(realtimeChat);
  activeChatWith = null;
  if (document.getElementById('page-messages').classList.contains('active')) loadConversations();
};

async function renderChatMessages() {
  const uid    = activeChatWith.id;
  const chatEl = document.getElementById('chat-messages');

  const { data: msgs } = await sb.from('messages')
    .select('*')
    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${uid}),and(sender_id.eq.${uid},receiver_id.eq.${currentUser.id})`)
    .order('created_at', { ascending: true });

  if (!msgs || !msgs.length) {
    chatEl.innerHTML = `<div style="color:var(--muted);text-align:center;padding:40px;font-size:14px;">Envoie le premier message !</div>`;
    return;
  }

  chatEl.innerHTML = msgs.map(m => {
    const me = m.sender_id === currentUser.id;
    return `<div>
      <div class="msg-bubble ${me ? 'me' : 'them'}">${esc(m.body)}</div>
      <div class="msg-time ${me ? '' : 'them'}">${timeAgo(m.created_at)}</div>
    </div>`;
  }).join('');
  chatEl.scrollTop = chatEl.scrollHeight;
}

window.sendMessage = async () => {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text || !activeChatWith) return;
  input.value = '';

  await sb.from('messages').insert({
    sender_id:   currentUser.id,
    receiver_id: activeChatWith.id,
    body:        text,
  });
};

// ════════════════════════════════════════════
//  UTILITAIRES
// ════════════════════════════════════════════
function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60)     return 'maintenant';
  if (s < 3600)   return Math.floor(s/60) + 'min';
  if (s < 86400)  return Math.floor(s/3600) + 'h';
  if (s < 604800) return Math.floor(s/86400) + 'j';
  return new Date(ts).toLocaleDateString('fr');
}

function esc(s) {
  return String(s||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

function loading() {
  return '<div style="text-align:center;padding:40px;color:var(--muted);">Chargement...</div>';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function showScreen(name) {
  document.getElementById('loader').style.display      = 'none';
  document.getElementById('auth-screen').style.display = name === 'auth' ? 'flex' : 'none';
  document.getElementById('app').style.display         = name === 'app'  ? 'flex' : 'none';
}
