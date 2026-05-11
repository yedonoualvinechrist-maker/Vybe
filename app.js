// ════════════════════════════════════════════
//  VYBE — app.js
//  Toute la logique de l'application
// ════════════════════════════════════════════

// ────────────────────────────────────────────
//  STOCKAGE LOCAL (base de données simplifiée)
// ────────────────────────────────────────────
const DB = {
  get: (key, defaultValue) => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  },
  set: (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

const getUsers    = ()      => DB.get('vybe_users', {});
const saveUsers   = (data)  => DB.set('vybe_users', data);
const getPosts    = ()      => DB.get('vybe_posts', []);
const savePosts   = (data)  => DB.set('vybe_posts', data);
const getMessages = ()      => DB.get('vybe_messages', {});
const saveMessages = (data) => DB.set('vybe_messages', data);

// ────────────────────────────────────────────
//  ÉTAT GLOBAL
// ────────────────────────────────────────────
let currentUser          = null;
let activeCommentPostId  = null;
let activeChatWith       = null;

// ────────────────────────────────────────────
//  AVATARS
// ────────────────────────────────────────────
const AVATAR_COLORS = [
  '#7c5cfc', '#fc5c8a', '#3dcc8a',
  '#fcb05c', '#5cc4fc', '#e05cfc', '#fc5c5c'
];

function avatarColor(username) {
  let hash = 0;
  for (let char of username) {
    hash = (hash * 31 + char.charCodeAt(0)) & 0xffff;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function avatarInitial(name) {
  return (name || '?')[0].toUpperCase();
}

function renderAvatar(element, name, username, size = 40) {
  element.style.background  = avatarColor(username || name);
  element.style.width       = size + 'px';
  element.style.height      = size + 'px';
  element.style.fontSize    = Math.floor(size * 0.38) + 'px';
  element.textContent       = avatarInitial(name);
}

// ════════════════════════════════════════════
//  AUTHENTIFICATION
// ════════════════════════════════════════════

function switchAuthTab(tab) {
  const tabs = document.querySelectorAll('.auth-tab');
  tabs.forEach((t, i) => t.classList.toggle('active', i === (tab === 'login' ? 0 : 1)));
  document.getElementById('login-form').style.display    = tab === 'login'    ? '' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? '' : 'none';
}

function register() {
  const name     = document.getElementById('reg-name').value.trim();
  const username = document.getElementById('reg-username').value.trim().toLowerCase().replace(/\s+/g, '_');
  const bio      = document.getElementById('reg-bio').value.trim();
  const password = document.getElementById('reg-password').value;
  const errorEl  = document.getElementById('reg-error');

  if (!name || !username || !password) {
    errorEl.textContent = 'Remplis tous les champs obligatoires.';
    return;
  }
  if (username.length < 3) {
    errorEl.textContent = 'Pseudo trop court (minimum 3 caractères).';
    return;
  }
  if (password.length < 6) {
    errorEl.textContent = 'Mot de passe trop court (minimum 6 caractères).';
    return;
  }

  const users = getUsers();
  if (users[username]) {
    errorEl.textContent = 'Ce pseudo est déjà pris.';
    return;
  }

  errorEl.textContent = '';
  users[username] = {
    name,
    username,
    bio,
    pass: password,
    followers: [],
    following: [],
    joined: Date.now()
  };
  saveUsers(users);
  loginAs(username);
}

function login() {
  const username = document.getElementById('login-username').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;
  const errorEl  = document.getElementById('login-error');
  const users    = getUsers();

  if (!users[username]) {
    errorEl.textContent = 'Utilisateur introuvable.';
    return;
  }
  if (users[username].pass !== password) {
    errorEl.textContent = 'Mot de passe incorrect.';
    return;
  }

  errorEl.textContent = '';
  loginAs(username);
}

function loginAs(username) {
  currentUser = username;
  localStorage.setItem('vybe_session', username);
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  initApp();
}

function logout() {
  localStorage.removeItem('vybe_session');
  currentUser = null;
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

// ════════════════════════════════════════════
//  INITIALISATION
// ════════════════════════════════════════════

function initApp() {
  renderComposeBar();
  showPage('feed');
}

function renderComposeBar() {
  const users = getUsers();
  const user  = users[currentUser];
  renderAvatar(document.getElementById('compose-avatar'), user.name, user.username);
  renderAvatar(document.getElementById('comment-avatar'), user.name, user.username, 32);
}

// ════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');

  if (name === 'feed')     renderFeed();
  if (name === 'explore')  renderExplore('');
  if (name === 'profile')  renderProfile(currentUser);
  if (name === 'messages') renderConversations();
}

// ════════════════════════════════════════════
//  POSTS — CRÉER & AFFICHER
// ════════════════════════════════════════════

function createPost() {
  const text = document.getElementById('post-input').value.trim();
  if (!text) return;

  const posts = getPosts();
  posts.unshift({
    id:       Date.now(),
    author:   currentUser,
    body:     text,
    likes:    [],
    comments: [],
    time:     Date.now()
  });
  savePosts(posts);

  document.getElementById('post-input').value = '';
  renderFeed();
  showToast('Post publié !');
}

function renderFeed() {
  const posts   = getPosts();
  const users   = getUsers();
  const me      = users[currentUser];
  const visible = posts.filter(p =>
    p.author === currentUser || (me.following || []).includes(p.author)
  );
  const listEl  = document.getElementById('feed-list');

  if (!visible.length) {
    listEl.innerHTML = `
      <div class="empty-feed">
        <h3>Aucun post pour l'instant</h3>
        <p>Abonne-toi à des personnes pour voir leurs posts,<br>ou publie le premier !</p>
      </div>`;
    return;
  }

  listEl.innerHTML = visible.map(p => buildPostHTML(p, users)).join('');
}

function buildPostHTML(post, users) {
  const user  = users[post.author] || { name: post.author, username: post.author };
  const liked = (post.likes || []).includes(currentUser);
  const color = avatarColor(user.username);
  const init  = avatarInitial(user.name);
  const ago   = timeAgo(post.time);

  return `
  <div class="post-card" id="post-${post.id}">
    <div class="post-header">
      <div class="avatar"
           style="background:${color};width:40px;height:40px;font-size:15px;"
           onclick="viewUserProfile('${user.username}')">${init}</div>
      <div class="post-header-info">
        <div class="post-username" onclick="viewUserProfile('${user.username}')">${user.name}</div>
        <div class="post-handle">@${user.username}</div>
      </div>
      <div class="post-time">${ago}</div>
    </div>
    <div class="post-body">${escHtml(post.body)}</div>
    <div class="post-actions">
      <button class="action-btn ${liked ? 'liked' : ''}" onclick="toggleLike(${post.id})">
        <svg viewBox="0 0 24 24" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        ${(post.likes || []).length}
      </button>
      <button class="action-btn" onclick="openComments(${post.id})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        ${(post.comments || []).length}
      </button>
      ${post.author !== currentUser ? `
      <button class="action-btn" onclick="openChatWith('${post.author}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
        Message
      </button>` : ''}
    </div>
  </div>`;
}

function toggleLike(postId) {
  const posts = getPosts();
  const post  = posts.find(p => p.id === postId);
  if (!post) return;

  const index = (post.likes || []).indexOf(currentUser);
  if (index >= 0) {
    post.likes.splice(index, 1);
  } else {
    post.likes.push(currentUser);
  }

  savePosts(posts);
  renderFeed();
}

// ════════════════════════════════════════════
//  COMMENTAIRES
// ════════════════════════════════════════════

function openComments(postId) {
  activeCommentPostId = postId;
  renderCommentsList();
  document.getElementById('comments-modal').classList.add('open');
}

function closeComments() {
  document.getElementById('comments-modal').classList.remove('open');
  activeCommentPostId = null;
}

function renderCommentsList() {
  const posts  = getPosts();
  const users  = getUsers();
  const post   = posts.find(p => p.id === activeCommentPostId);
  if (!post) return;

  const listEl = document.getElementById('comments-list');

  if (!(post.comments || []).length) {
    listEl.innerHTML = `<p style="color:var(--muted);text-align:center;padding:30px;">Sois le premier à commenter !</p>`;
    return;
  }

  listEl.innerHTML = post.comments.map(comment => {
    const user  = users[comment.author] || { name: comment.author, username: comment.author };
    const color = avatarColor(user.username);
    const init  = avatarInitial(user.name);
    return `
    <div class="comment-item">
      <div class="avatar"
           style="background:${color};width:34px;height:34px;font-size:13px;flex-shrink:0;">${init}</div>
      <div class="comment-body">
        <div class="comment-author">
          ${user.name}
          <span style="font-weight:400;color:var(--muted);font-family:var(--font-body);">@${user.username}</span>
        </div>
        <div class="comment-text">${escHtml(comment.text)}</div>
        <div class="comment-time">${timeAgo(comment.time)}</div>
      </div>
    </div>`;
  }).join('');
}

function submitComment() {
  const input = document.getElementById('comment-input');
  const text  = input.value.trim();
  if (!text || !activeCommentPostId) return;

  const posts = getPosts();
  const post  = posts.find(p => p.id === activeCommentPostId);
  if (!post) return;

  if (!post.comments) post.comments = [];
  post.comments.push({ author: currentUser, text, time: Date.now() });

  savePosts(posts);
  input.value = '';
  renderCommentsList();
  renderFeed();
}

// ════════════════════════════════════════════
//  EXPLORER / RECHERCHE
// ════════════════════════════════════════════

function searchUsers() {
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  renderExplore(query);
}

function renderExplore(query) {
  const users  = getUsers();
  const me     = users[currentUser];
  let userList = Object.values(users).filter(u => u.username !== currentUser);

  if (query) {
    userList = userList.filter(u =>
      u.name.toLowerCase().includes(query) ||
      u.username.toLowerCase().includes(query)
    );
  }

  const listEl = document.getElementById('explore-list');

  if (!userList.length) {
    listEl.innerHTML = `<div class="no-results">Aucun utilisateur trouvé</div>`;
    return;
  }

  listEl.innerHTML = userList.map(u => {
    const following      = (me.following || []).includes(u.username);
    const color          = avatarColor(u.username);
    const init           = avatarInitial(u.name);
    const followersCount = (u.followers || []).length;

    return `
    <div class="user-card">
      <div class="avatar"
           style="background:${color};width:46px;height:46px;font-size:17px;"
           onclick="viewUserProfile('${u.username}')">${init}</div>
      <div class="user-card-info">
        <div class="user-card-name" onclick="viewUserProfile('${u.username}')">${u.name}</div>
        <div class="user-card-bio">
          @${u.username}${u.bio ? ' · ' + u.bio : ''} · ${followersCount} abonné${followersCount !== 1 ? 's' : ''}
        </div>
      </div>
      <button class="follow-btn ${following ? 'following' : 'not-following'}"
              onclick="toggleFollow('${u.username}')">
        ${following ? 'Abonné' : 'Suivre'}
      </button>
    </div>`;
  }).join('');
}

function toggleFollow(targetUsername) {
  const users  = getUsers();
  const me     = users[currentUser];
  const target = users[targetUsername];
  if (!me || !target) return;

  if (!me.following)       me.following = [];
  if (!target.followers)   target.followers = [];

  const idx = me.following.indexOf(targetUsername);
  if (idx >= 0) {
    me.following.splice(idx, 1);
    target.followers.splice(target.followers.indexOf(currentUser), 1);
  } else {
    me.following.push(targetUsername);
    target.followers.push(currentUser);
  }

  users[currentUser]    = me;
  users[targetUsername] = target;
  saveUsers(users);

  const query = (document.getElementById('search-input')?.value || '').toLowerCase();
  renderExplore(query);
}

// ════════════════════════════════════════════
//  PROFIL
// ════════════════════════════════════════════

function renderProfile(username) {
  const users = getUsers();
  const user  = users[username];
  if (!user) return;

  renderAvatar(document.getElementById('profile-avatar'), user.name, user.username, 72);
  document.getElementById('profile-name').textContent   = user.name;
  document.getElementById('profile-handle').textContent = '@' + user.username;
  document.getElementById('profile-bio').textContent    = user.bio || '';

  const posts = getPosts().filter(p => p.author === username);
  document.getElementById('stat-posts').textContent     = posts.length;
  document.getElementById('stat-followers').textContent = (user.followers || []).length;
  document.getElementById('stat-following').textContent = (user.following || []).length;

  const postsEl = document.getElementById('profile-posts-list');
  if (!posts.length) {
    postsEl.innerHTML = `<div style="color:var(--muted);text-align:center;padding:40px 0;font-size:14px;">Aucun post encore</div>`;
    return;
  }
  postsEl.innerHTML = posts.map(p => buildPostHTML(p, users)).join('');
}

function viewUserProfile(username) {
  showPage('profile');

  const users = getUsers();
  const user  = users[username];
  if (!user) return;

  renderAvatar(document.getElementById('profile-avatar'), user.name, user.username, 72);
  document.getElementById('profile-name').textContent   = user.name;
  document.getElementById('profile-handle').textContent = '@' + user.username;
  document.getElementById('profile-bio').textContent    = user.bio || '';

  const posts = getPosts().filter(p => p.author === username);
  document.getElementById('stat-posts').textContent     = posts.length;
  document.getElementById('stat-followers').textContent = (user.followers || []).length;
  document.getElementById('stat-following').textContent = (user.following || []).length;

  const editBtn = document.querySelector('.edit-profile-btn');
  if (username === currentUser) {
    editBtn.textContent = 'Modifier';
    editBtn.onclick     = openEditModal;
  } else {
    const me        = users[currentUser];
    const following = (me.following || []).includes(username);
    editBtn.textContent = following ? 'Abonné ✓' : 'Suivre';
    editBtn.onclick     = () => { toggleFollow(username); viewUserProfile(username); };
  }

  const postsEl = document.getElementById('profile-posts-list');
  postsEl.innerHTML = posts.map(p => buildPostHTML(p, users)).join('');
}

// ════════════════════════════════════════════
//  MODIFIER PROFIL
// ════════════════════════════════════════════

function openEditModal() {
  const user = getUsers()[currentUser];
  document.getElementById('edit-name').value = user.name;
  document.getElementById('edit-bio').value  = user.bio || '';
  document.getElementById('edit-pass').value = '';
  document.getElementById('edit-modal').classList.add('open');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('open');
}

function saveProfile() {
  const users    = getUsers();
  const user     = users[currentUser];
  const newName  = document.getElementById('edit-name').value.trim();
  const newBio   = document.getElementById('edit-bio').value.trim();
  const newPass  = document.getElementById('edit-pass').value;

  if (!newName) return;

  user.name = newName;
  user.bio  = newBio;
  if (newPass.length >= 6) user.pass = newPass;

  users[currentUser] = user;
  saveUsers(users);
  closeEditModal();
  renderComposeBar();
  renderProfile(currentUser);

  // Remettre le bouton "Modifier" sur la page profil
  const editBtn   = document.querySelector('.edit-profile-btn');
  editBtn.textContent = 'Modifier';
  editBtn.onclick     = openEditModal;

  showToast('Profil mis à jour !');
}

// ════════════════════════════════════════════
//  MESSAGERIE
// ════════════════════════════════════════════

function convKey(userA, userB) {
  return [userA, userB].sort().join('__');
}

function renderConversations() {
  const users     = getUsers();
  const me        = users[currentUser];
  const messages  = getMessages();
  const following = me.following || [];
  const listEl    = document.getElementById('conv-list');

  if (!following.length) {
    listEl.innerHTML = `
      <div style="color:var(--muted);text-align:center;padding:50px 20px;font-size:14px;">
        Abonne-toi à des personnes pour leur écrire !
      </div>`;
    return;
  }

  listEl.innerHTML = following.map(uid => {
    const user = users[uid];
    if (!user) return '';

    const key          = convKey(currentUser, uid);
    const conversation = messages[key] || [];
    const lastMsg      = conversation[conversation.length - 1];
    const color        = avatarColor(user.username);
    const init         = avatarInitial(user.name);

    return `
    <div class="conv-item" onclick="openChatWith('${uid}')">
      <div class="avatar"
           style="background:${color};width:46px;height:46px;font-size:17px;flex-shrink:0;">${init}</div>
      <div class="conv-info">
        <div class="conv-name">${user.name}</div>
        <div class="conv-preview">
          ${lastMsg ? escHtml(lastMsg.text.substring(0, 50)) : 'Commencer la conversation...'}
        </div>
      </div>
      ${lastMsg ? `<div class="conv-time">${timeAgo(lastMsg.time)}</div>` : ''}
    </div>`;
  }).join('');
}

function openChatWith(uid) {
  const users = getUsers();
  const user  = users[uid];
  if (!user) return;

  activeChatWith = uid;
  renderAvatar(document.getElementById('chat-avatar'), user.name, user.username, 36);
  document.getElementById('chat-with-name').textContent = user.name;
  renderChatMessages();

  document.getElementById('chat-view').classList.add('open');
  setTimeout(() => {
    const chatEl  = document.getElementById('chat-messages');
    chatEl.scrollTop = chatEl.scrollHeight;
  }, 50);
}

function closeChat() {
  document.getElementById('chat-view').classList.remove('open');
  activeChatWith = null;
  if (document.getElementById('page-messages').classList.contains('active')) {
    renderConversations();
  }
}

function renderChatMessages() {
  const messages     = getMessages();
  const key          = convKey(currentUser, activeChatWith);
  const conversation = messages[key] || [];
  const chatEl       = document.getElementById('chat-messages');

  if (!conversation.length) {
    chatEl.innerHTML = `
      <div style="color:var(--muted);text-align:center;padding:40px;font-size:14px;">
        Envoie le premier message !
      </div>`;
    return;
  }

  chatEl.innerHTML = conversation.map(msg => {
    const isMe = msg.from === currentUser;
    return `
    <div>
      <div class="msg-bubble ${isMe ? 'me' : 'them'}">${escHtml(msg.text)}</div>
      <div class="msg-time ${isMe ? '' : 'them'}">${timeAgo(msg.time)}</div>
    </div>`;
  }).join('');

  chatEl.scrollTop = chatEl.scrollHeight;
}

function sendMessage() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text || !activeChatWith) return;

  const messages = getMessages();
  const key      = convKey(currentUser, activeChatWith);
  if (!messages[key]) messages[key] = [];

  messages[key].push({
    from: currentUser,
    text,
    time: Date.now()
  });

  saveMessages(messages);
  input.value = '';
  renderChatMessages();
}

// ════════════════════════════════════════════
//  UTILITAIRES
// ════════════════════════════════════════════

function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60)     return 'maintenant';
  if (seconds < 3600)   return Math.floor(seconds / 60) + 'min';
  if (seconds < 86400)  return Math.floor(seconds / 3600) + 'h';
  if (seconds < 604800) return Math.floor(seconds / 86400) + 'j';
  return new Date(timestamp).toLocaleDateString('fr');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/\n/g, '<br>');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

// ════════════════════════════════════════════
//  DÉMARRAGE DE L'APPLICATION
// ════════════════════════════════════════════

(function boot() {
  const savedSession = localStorage.getItem('vybe_session');
  if (savedSession && getUsers()[savedSession]) {
    currentUser = savedSession;
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display         = 'flex';
    initApp();
  }
})();
