// ════════════════════════════════════════════
//  VYBE — app.js
//  Backend : Supabase (auth + database + storage + realtime)
// ════════════════════════════════════════════

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ────────────────────────────────────────────
//  ⚙️  CONFIGURATION SUPABASE
//  Remplace ces deux valeurs par les tiennes
//  depuis https://supabase.com → Settings → API
// ────────────────────────────────────────────
const SUPABASE_URL    = 'https://coipxptoubwmuilvazqc.supabase.co';
const SUPABASE_ANON   = 'sb_publishable_1NWDVeNLcJc9Na7uFVyF-g_RDi2UXAi';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ────────────────────────────────────────────
//  ÉTAT GLOBAL
// ────────────────────────────────────────────
let currentUser         = null;   // objet profil complet
let activeCommentPostId = null;
let activeChatWith      = null;   // { id, username, name }
let pendingMedia        = null;   // { file, type }
let realtimeFeedSub     = null;
let realtimeChatSub     = null;

// ════════════════════════════════════════════
//  AVATARS
// ════════════════════════════════════════════
const AVATAR_COLORS = ['#7c5cfc','#fc5c8a','#3dcc8a','#fcb05c','#5cc4fc','#e05cfc','#fc5c5c'];

function avatarColor(str) {
  let h = 0;
  for (const c of (str || 'x')) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function avatarInitial(name) { return (name || '?')[0].toUpperCase(); }

function setAvatar(el, name, username, size = 40) {
  el.style.background = avatarColor(username || name);
  el.style.width      = size + 'px';
  el.style.height     = size + 'px';
  el.style.fontSize   = Math.floor(size * 0.38) + 'px';
  el.textContent      = avatarInitial(name);
}

// ════════════════════════════════════════════
//  BOOT — vérifier session existante
// ════════════════════════════════════════════
(async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await loadCurrentUser(session.user.id);
  } else {
    showLoader(false);
    showScreen('auth');
  }
})();

async function loadCurrentUser(userId) {
  const { data } = await sb.from('profiles').select('*').eq('id', userId).single();
  if (data) {
    currentUser = data;
    showLoader(false);
    showScreen('app');
    initApp();
  } else {
    showLoader(false);
    showScreen('auth');
  }
}

// ════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════

window.switchAuthTab = function(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) =>
    t.classList.toggle('active', i === (tab === 'login' ? 0 : 1))
  );
  document.getElementById('login-form').style.display    = tab === 'login'    ? '' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? '' : 'none';
};

window.register = async function() {
  const name     = document.getElementById('reg-name').value.trim();
  const username = document.getElementById('reg-username').value.trim().toLowerCase().replace(/\s+/g,'_');
  const bio      = document.getElementById('reg-bio').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl    = document.getElementById('reg-error');

  errEl.textContent = '';
  if (!name || !username || !password) { errEl.textContent = 'Remplis tous les champs.'; return; }
  if (username.length < 3)             { errEl.textContent = 'Pseudo trop court (min 3 caractères).'; return; }
  if (password.length < 6)             { errEl.textContent = 'Mot de passe trop court (min 6 caractères).'; return; }

  // Vérifier que le pseudo est unique
  const { data: existing } = await sb.from('profiles').select('id').eq('username', username).single();
  if (existing) { errEl.textContent = 'Ce pseudo est déjà pris.'; return; }

  // Créer le compte Supabase Auth
  const fakeEmail = `${username}@vybe.app`;
  const { data: authData, error: authErr } = await sb.auth.signUp({ email: fakeEmail, password });
  if (authErr) { errEl.textContent = authErr.message; return; }

  // Créer le profil dans la table profiles
  const { error: profileErr } = await sb.from('profiles').insert({
    id: authData.user.id,
    username,
    name,
    bio,
  });
  if (profileErr) { errEl.textContent = profileErr.message; return; }

  currentUser = { id: authData.user.id, username, name, bio };
  showScreen('app');
  initApp();
};

window.login = async function() {
  const username = document.getElementById('login-username').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');

  errEl.textContent = '';

  // Retrouver l'email fictif lié au username
  const { data: profile } = await sb.from('profiles').select('id').eq('username', username).single();
  if (!profile) { errEl.textContent = 'Utilisateur introuvable.'; return; }

  const fakeEmail = `${username}@vybe.app`;
  const { error } = await sb.auth.signInWithPassword({ email: fakeEmail, password });
  if (error) { errEl.textContent = 'Mot de passe incorrect.'; return; }

  await loadCurrentUser(profile.id);
};

window.logout = async function() {
  await sb.auth.signOut();
  currentUser = null;
  if (realtimeFeedSub) sb.removeChannel(realtimeFeedSub);
  if (realtimeChatSub) sb.removeChannel(realtimeChatSub);
  showScreen('auth');
};

// ════════════════════════════════════════════
//  INIT APP
// ════════════════════════════════════════════
function initApp() {
  setAvatar(document.getElementById('compose-avatar'), currentUser.name, currentUser.username);
  setAvatar(document.getElementById('comment-avatar'), currentUser.name, currentUser.username, 32);
  showPage('feed');
}

// ════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════
window.showPage = function(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.getElementById('nav-'  + name).classList.add('active');

  if (name === 'feed')     renderFeed();
  if (name === 'explore')  renderExplore('');
  if (name === 'profile')  renderProfile(currentUser.id);
  if (name === 'messages') renderConversations();
};

// ════════════════════════════════════════════
//  MÉDIAS — PRÉVISUALISATION
// ════════════════════════════════════════════
window.previewMedia = function(input, type) {
  const file = input.files[0];
  if (!file) return;
  pendingMedia = { file, type };

  const preview = document.getElementById('media-preview');
  preview.style.display = 'block';

  const removeBtn = `<button class="media-preview-remove" onclick="removeMedia()">×</button>`;
  const url       = URL.createObjectURL(file);

  if (type === 'image') {
    preview.innerHTML = `<img src="${url}" />${removeBtn}`;
  } else if (type === 'video') {
    preview.innerHTML = `<video src="${url}" controls></video>${removeBtn}`;
  } else if (type === 'audio') {
    preview.innerHTML = `<audio src="${url}" controls></audio>${removeBtn}`;
  }
};

window.removeMedia = function() {
  pendingMedia = null;
  const preview = document.getElementById('media-preview');
  preview.style.display = 'none';
  preview.innerHTML = '';
  ['media-image','media-video','media-audio'].forEach(id => {
    document.getElementById(id).value = '';
  });
};

// ════════════════════════════════════════════
//  CRÉER UN POST
// ════════════════════════════════════════════
window.createPost = async function() {
  const text   = document.getElementById('post-input').value.trim();
  const btn    = document.querySelector('.post-btn');
  if (!text && !pendingMedia) return;

  btn.disabled  = true;
  btn.textContent = '...';

  let mediaUrl  = null;
  let mediaType = null;

  // Upload du média si présent
  if (pendingMedia) {
    const ext      = pendingMedia.file.name.split('.').pop();
    const path     = `${currentUser.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage
      .from('media')
      .upload(path, pendingMedia.file, { cacheControl: '3600', upsert: false });

    if (upErr) { showToast('Erreur upload : ' + upErr.message); btn.disabled = false; btn.textContent = 'Poster'; return; }

    const { data: urlData } = sb.storage.from('media').getPublicUrl(path);
    mediaUrl  = urlData.publicUrl;
    mediaType = pendingMedia.type;
  }

  const { error } = await sb.from('posts').insert({
    author_id:  currentUser.id,
    body:       text,
    media_url:  mediaUrl,
    media_type: mediaType,
  });

  btn.disabled    = false;
  btn.textContent = 'Poster';

  if (error) { showToast('Erreur : ' + error.message); return; }

  document.getElementById('post-input').value = '';
  removeMedia();
  showToast('Post publié !');
  renderFeed();
};

// ════════════════════════════════════════════
//  FEED
// ════════════════════════════════════════════
async function renderFeed() {
  const listEl = document.getElementById('feed-list');
  listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">Chargement...</div>';

  // Posts de moi + ceux que je suis
  const { data: following } = await sb.from('follows')
    .select('following_id').eq('follower_id', currentUser.id);

  const followingIds = (following || []).map(f => f.following_id);
  followingIds.push(currentUser.id);

  const { data: posts } = await sb.from('posts')
    .select(`*, profiles:author_id(id, name, username)`)
    .in('author_id', followingIds)
    .order('created_at', { ascending: false });

  if (!posts || !posts.length) {
    listEl.innerHTML = `
      <div class="empty-feed">
        <h3>Aucun post pour l'instant</h3>
        <p>Abonne-toi à des personnes ou publie le premier !</p>
      </div>`;
    return;
  }

  // Récupérer mes likes
  const { data: myLikes } = await sb.from('likes')
    .select('post_id').eq('user_id', currentUser.id);
  const likedSet = new Set((myLikes || []).map(l => l.post_id));

  listEl.innerHTML = posts.map(p => buildPostHTML(p, likedSet)).join('');

  // Realtime : nouveau post s'affiche automatiquement
  if (realtimeFeedSub) sb.removeChannel(realtimeFeedSub);
  realtimeFeedSub = sb.channel('feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => renderFeed())
    .subscribe();
}

function buildPostHTML(post, likedSet) {
  const u      = post.profiles || { name: '?', username: '?' };
  const liked  = likedSet && likedSet.has(post.id);
  const color  = avatarColor(u.username);
  const init   = avatarInitial(u.name);
  const ago    = timeAgo(post.created_at);

  let mediaHTML = '';
  if (post.media_url) {
    if (post.media_type === 'image') {
      mediaHTML = `<div class="post-media"><img src="${post.media_url}" alt="image" loading="lazy" /></div>`;
    } else if (post.media_type === 'video') {
      mediaHTML = `<div class="post-media"><video src="${post.media_url}" controls preload="metadata"></video></div>`;
    } else if (post.media_type === 'audio') {
      mediaHTML = `<div class="post-media"><audio src="${post.media_url}" controls></audio></div>`;
    }
  }

  return `
  <div class="post-card">
    <div class="post-header">
      <div class="avatar" style="background:${color};width:40px;height:40px;font-size:15px;cursor:pointer"
           onclick="viewUserProfile('${u.id}')">${init}</div>
      <div class="post-header-info">
        <div class="post-username" onclick="viewUserProfile('${u.id}')">${escHtml(u.name)}</div>
        <div class="post-handle">@${u.username}</div>
      </div>
      <div class="post-time">${ago}</div>
    </div>
    ${post.body ? `<div class="post-body">${escHtml(post.body)}</div>` : ''}
    ${mediaHTML}
    <div class="post-actions">
      <button class="action-btn ${liked ? 'liked' : ''}" onclick="toggleLike('${post.id}', this)">
        <svg viewBox="0 0 24 24" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        <span id="likes-${post.id}">${post.likes_count ?? 0}</span>
      </button>
      <button class="action-btn" onclick="openComments('${post.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span id="cmts-${post.id}">${post.comments_count ?? 0}</span>
      </button>
      ${u.id !== currentUser.id ? `
      <button class="action-btn" onclick="openChatWith('${u.id}','${u.username}','${escHtml(u.name)}')">
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
window.toggleLike = async function(postId, btn) {
  const isLiked = btn.classList.contains('liked');

  if (isLiked) {
    await sb.from('likes').delete().eq('post_id', postId).eq('user_id', currentUser.id);
  } else {
    await sb.from('likes').insert({ post_id: postId, user_id: currentUser.id });
  }

  // Mettre à jour le compteur
  const { count } = await sb.from('likes').select('*', { count: 'exact', head: true }).eq('post_id', postId);
  const countEl = document.getElementById('likes-' + postId);
  if (countEl) countEl.textContent = count ?? 0;

  btn.classList.toggle('liked');
  const svg = btn.querySelector('svg');
  if (svg) svg.setAttribute('fill', btn.classList.contains('liked') ? 'currentColor' : 'none');
};

// ════════════════════════════════════════════
//  COMMENTAIRES
// ════════════════════════════════════════════
window.openComments = async function(postId) {
  activeCommentPostId = postId;
  await renderCommentsList();
  document.getElementById('comments-modal').classList.add('open');
};

window.closeComments = function() {
  document.getElementById('comments-modal').classList.remove('open');
  activeCommentPostId = null;
};

async function renderCommentsList() {
  const listEl = document.getElementById('comments-list');
  listEl.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px;">Chargement...</div>';

  const { data: comments } = await sb.from('comments')
    .select(`*, profiles:author_id(name, username)`)
    .eq('post_id', activeCommentPostId)
    .order('created_at', { ascending: true });

  if (!comments || !comments.length) {
    listEl.innerHTML = `<p style="color:var(--muted);text-align:center;padding:30px;">Sois le premier à commenter !</p>`;
    return;
  }

  listEl.innerHTML = comments.map(c => {
    const u     = c.profiles || { name: '?', username: '?' };
    const color = avatarColor(u.username);
    return `
    <div class="comment-item">
      <div class="avatar" style="background:${color};width:34px;height:34px;font-size:13px;flex-shrink:0;">
        ${avatarInitial(u.name)}
      </div>
      <div class="comment-body">
        <div class="comment-author">${escHtml(u.name)}
          <span style="font-weight:400;color:var(--muted);">@${u.username}</span>
        </div>
        <div class="comment-text">${escHtml(c.body)}</div>
        <div class="comment-time">${timeAgo(c.created_at)}</div>
      </div>
    </div>`;
  }).join('');

  listEl.scrollTop = listEl.scrollHeight;
}

window.submitComment = async function() {
  const input = document.getElementById('comment-input');
  const text  = input.value.trim();
  if (!text || !activeCommentPostId) return;

  await sb.from('comments').insert({
    post_id:   activeCommentPostId,
    author_id: currentUser.id,
    body:      text,
  });

  input.value = '';
  await renderCommentsList();

  // Mettre à jour compteur de commentaires dans le DOM
  const { count } = await sb.from('comments')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', activeCommentPostId);
  const el = document.getElementById('cmts-' + activeCommentPostId);
  if (el) el.textContent = count ?? 0;
};

// ════════════════════════════════════════════
//  EXPLORER / RECHERCHE
// ════════════════════════════════════════════
window.searchUsers = function() {
  const q = document.getElementById('search-input').value.trim().toLowerCase();
  renderExplore(q);
};

async function renderExplore(query) {
  const listEl = document.getElementById('explore-list');

  let req = sb.from('profiles').select('*').neq('id', currentUser.id);
  if (query) req = req.or(`username.ilike.%${query}%,name.ilike.%${query}%`);

  const { data: users } = await req.order('name');

  if (!users || !users.length) {
    listEl.innerHTML = `<div class="no-results">${query ? 'Aucun utilisateur trouvé' : 'Aucun autre utilisateur inscrit pour l\'instant'}</div>`;
    return;
  }

  // Mes abonnements
  const { data: following } = await sb.from('follows')
    .select('following_id').eq('follower_id', currentUser.id);
  const followSet = new Set((following || []).map(f => f.following_id));

  listEl.innerHTML = users.map(u => {
    const isFollowing    = followSet.has(u.id);
    const color          = avatarColor(u.username);
    return `
    <div class="user-card">
      <div class="avatar" style="background:${color};width:46px;height:46px;font-size:17px;cursor:pointer"
           onclick="viewUserProfile('${u.id}')">${avatarInitial(u.name)}</div>
      <div class="user-card-info">
        <div class="user-card-name" onclick="viewUserProfile('${u.id}')">${escHtml(u.name)}</div>
        <div class="user-card-bio">@${u.username}${u.bio ? ' · ' + u.bio : ''}</div>
      </div>
      <button class="follow-btn ${isFollowing ? 'following' : 'not-following'}"
              id="follow-btn-${u.id}"
              onclick="toggleFollow('${u.id}')">
        ${isFollowing ? 'Abonné' : 'Suivre'}
      </button>
    </div>`;
  }).join('');
}

window.toggleFollow = async function(targetId) {
  const { data: existing } = await sb.from('follows')
    .select('id').eq('follower_id', currentUser.id).eq('following_id', targetId).single();

  if (existing) {
    await sb.from('follows').delete().eq('id', existing.id);
  } else {
    await sb.from('follows').insert({ follower_id: currentUser.id, following_id: targetId });
  }

  const btn = document.getElementById('follow-btn-' + targetId);
  if (btn) {
    const nowFollowing = !existing;
    btn.textContent = nowFollowing ? 'Abonné' : 'Suivre';
    btn.className   = `follow-btn ${nowFollowing ? 'following' : 'not-following'}`;
  }
};

// ════════════════════════════════════════════
//  PROFIL
// ════════════════════════════════════════════
async function renderProfile(userId) {
  const { data: user } = await sb.from('profiles').select('*').eq('id', userId).single();
  if (!user) return;

  setAvatar(document.getElementById('profile-avatar'), user.name, user.username, 72);
  document.getElementById('profile-name').textContent   = user.name;
  document.getElementById('profile-handle').textContent = '@' + user.username;
  document.getElementById('profile-bio').textContent    = user.bio || '';

  const [{ count: postsCount }, { count: followersCount }, { count: followingCount }] = await Promise.all([
    sb.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', userId),
    sb.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
    sb.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
  ]);

  document.getElementById('stat-posts').textContent     = postsCount    ?? 0;
  document.getElementById('stat-followers').textContent = followersCount ?? 0;
  document.getElementById('stat-following').textContent = followingCount ?? 0;

  // Bouton action
  const actionBtn = document.getElementById('profile-action-btn');
  if (userId === currentUser.id) {
    actionBtn.textContent = 'Modifier';
    actionBtn.onclick     = openEditModal;
  } else {
    const { data: f } = await sb.from('follows')
      .select('id').eq('follower_id', currentUser.id).eq('following_id', userId).single();
    const isF           = !!f;
    actionBtn.textContent = isF ? 'Abonné ✓' : 'Suivre';
    actionBtn.onclick     = async () => { await toggleFollow(userId); await renderProfile(userId); };
  }

  // Posts de l'utilisateur
  const { data: myLikes } = await sb.from('likes').select('post_id').eq('user_id', currentUser.id);
  const likedSet = new Set((myLikes || []).map(l => l.post_id));

  const { data: posts } = await sb.from('posts')
    .select(`*, profiles:author_id(id, name, username)`)
    .eq('author_id', userId)
    .order('created_at', { ascending: false });

  const listEl = document.getElementById('profile-posts-list');
  if (!posts || !posts.length) {
    listEl.innerHTML = `<div style="color:var(--muted);text-align:center;padding:40px;font-size:14px;">Aucun post encore</div>`;
  } else {
    listEl.innerHTML = posts.map(p => buildPostHTML(p, likedSet)).join('');
  }
}

window.viewUserProfile = async function(userId) {
  showPage('profile');
  await renderProfile(userId);
};

// ════════════════════════════════════════════
//  MODIFIER PROFIL
// ════════════════════════════════════════════
window.openEditModal = function() {
  document.getElementById('edit-name').value = currentUser.name;
  document.getElementById('edit-bio').value  = currentUser.bio || '';
  document.getElementById('edit-pass').value = '';
  document.getElementById('edit-modal').classList.add('open');
};

window.closeEditModal = function() {
  document.getElementById('edit-modal').classList.remove('open');
};

window.saveProfile = async function() {
  const name    = document.getElementById('edit-name').value.trim();
  const bio     = document.getElementById('edit-bio').value.trim();
  const newPass = document.getElementById('edit-pass').value;

  if (!name) return;

  await sb.from('profiles').update({ name, bio }).eq('id', currentUser.id);
  if (newPass.length >= 6) await sb.auth.updateUser({ password: newPass });

  currentUser.name = name;
  currentUser.bio  = bio;
  closeEditModal();
  setAvatar(document.getElementById('compose-avatar'), name, currentUser.username);
  await renderProfile(currentUser.id);
  showToast('Profil mis à jour !');
};

// ════════════════════════════════════════════
//  MESSAGERIE
// ════════════════════════════════════════════
async function renderConversations() {
  const listEl = document.getElementById('conv-list');

  const { data: following } = await sb.from('follows')
    .select('following_id, profiles:following_id(id, name, username)')
    .eq('follower_id', currentUser.id);

  if (!following || !following.length) {
    listEl.innerHTML = `<div style="color:var(--muted);text-align:center;padding:50px 20px;font-size:14px;">
      Abonne-toi à des personnes pour leur écrire !</div>`;
    return;
  }

  // Derniers messages par conversation
  const ids = following.map(f => f.following_id);
  const { data: lastMsgs } = await sb.from('messages')
    .select('*')
    .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
    .order('created_at', { ascending: false });

  listEl.innerHTML = following.map(f => {
    const u    = f.profiles;
    const color= avatarColor(u.username);
    const last = (lastMsgs || []).find(m =>
      (m.sender_id === currentUser.id && m.receiver_id === u.id) ||
      (m.sender_id === u.id && m.receiver_id === currentUser.id)
    );
    return `
    <div class="conv-item" onclick="openChatWith('${u.id}','${u.username}','${escHtml(u.name)}')">
      <div class="avatar" style="background:${color};width:46px;height:46px;font-size:17px;flex-shrink:0;">
        ${avatarInitial(u.name)}</div>
      <div class="conv-info">
        <div class="conv-name">${escHtml(u.name)}</div>
        <div class="conv-preview">${last ? escHtml(last.body.substring(0, 50)) : 'Commencer la conversation...'}</div>
      </div>
      ${last ? `<div class="conv-time">${timeAgo(last.created_at)}</div>` : ''}
    </div>`;
  }).join('');
}

window.openChatWith = async function(userId, username, name) {
  activeChatWith = { id: userId, username, name };
  setAvatar(document.getElementById('chat-avatar'), name, username, 36);
  document.getElementById('chat-with-name').textContent = name;

  await renderChatMessages();
  document.getElementById('chat-view').classList.add('open');

  // Realtime messages
  if (realtimeChatSub) sb.removeChannel(realtimeChatSub);
  realtimeChatSub = sb.channel('chat-' + userId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
      const m = payload.new;
      if (
        (m.sender_id === currentUser.id && m.receiver_id === userId) ||
        (m.sender_id === userId && m.receiver_id === currentUser.id)
      ) {
        await renderChatMessages();
      }
    })
    .subscribe();
};

window.closeChat = function() {
  document.getElementById('chat-view').classList.remove('open');
  if (realtimeChatSub) sb.removeChannel(realtimeChatSub);
  activeChatWith = null;
  if (document.getElementById('page-messages').classList.contains('active')) {
    renderConversations();
  }
};

async function renderChatMessages() {
  const { data: msgs } = await sb.from('messages')
    .select('*')
    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeChatWith.id}),and(sender_id.eq.${activeChatWith.id},receiver_id.eq.${currentUser.id})`)
    .order('created_at', { ascending: true });

  const chatEl = document.getElementById('chat-messages');
  if (!msgs || !msgs.length) {
    chatEl.innerHTML = `<div style="color:var(--muted);text-align:center;padding:40px;font-size:14px;">Envoie le premier message !</div>`;
    return;
  }

  chatEl.innerHTML = msgs.map(m => {
    const isMe = m.sender_id === currentUser.id;
    return `
    <div>
      <div class="msg-bubble ${isMe ? 'me' : 'them'}">${escHtml(m.body)}</div>
      <div class="msg-time ${isMe ? '' : 'them'}">${timeAgo(m.created_at)}</div>
    </div>`;
  }).join('');
  chatEl.scrollTop = chatEl.scrollHeight;
}

window.sendMessage = async function() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text || !activeChatWith) return;

  input.value = '';
  await sb.from('messages').insert({
    sender_id:   currentUser.id,
    receiver_id: activeChatWith.id,
    body:        text,
  });
  // renderChatMessages est appelé par le listener realtime
};

// ════════════════════════════════════════════
//  UTILITAIRES
// ════════════════════════════════════════════
function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60)     return 'maintenant';
  if (s < 3600)   return Math.floor(s / 60) + 'min';
  if (s < 86400)  return Math.floor(s / 3600) + 'h';
  if (s < 604800) return Math.floor(s / 86400) + 'j';
  return new Date(ts).toLocaleDateString('fr');
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function showLoader(show) {
  document.getElementById('loader').style.display = show ? 'flex' : 'none';
}

function showScreen(name) {
  document.getElementById('loader').style.display      = 'none';
  document.getElementById('auth-screen').style.display = name === 'auth' ? 'flex' : 'none';
  document.getElementById('app').style.display         = name === 'app'  ? 'flex' : 'none';
}
