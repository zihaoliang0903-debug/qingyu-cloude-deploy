const topics = [
  { id: "all", name: "全部", tone: "" },
  { id: "hot", name: "热点", tone: "hot" },
  { id: "love", name: "情感", tone: "hot" },
  { id: "school", name: "校园", tone: "school" },
  { id: "work", name: "职场", tone: "work" },
  { id: "life", name: "生活", tone: "life" },
  { id: "mbti", name: "MBTI", tone: "mbti" },
  { id: "city", name: "城市", tone: "city" }
];

const state = {
  view: "home",
  filter: "all",
  loading: true,
  refreshing: false,
  user: null,
  posts: [],
  reports: [],
  verificationRequests: [],
  viewedProfile: null,
  message: ""
};

const app = document.querySelector("#app");
const detailSheet = document.querySelector("#detailSheet");
const postDetail = document.querySelector("#postDetail");
const tokenKey = "qingyu_token";

function getToken() {
  return localStorage.getItem(tokenKey);
}

function setToken(token) {
  localStorage.setItem(tokenKey, token);
}

function clearToken() {
  localStorage.removeItem(tokenKey);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function boot() {
  setupPullRefresh();
  try {
    await refreshState({ silent: true });
  } catch (error) {
    state.loading = false;
    state.message = error.message;
    render();
  }
}

async function refreshState({ silent = false } = {}) {
  if (!silent) state.refreshing = true;
  if (state.loading) render();
  const data = await api("/api/state");
  state.user = data.user;
  state.posts = data.posts;
  state.reports = data.reports || [];
  state.verificationRequests = data.verificationRequests || [];
  state.loading = false;
  state.refreshing = false;
  render();
}

function topicName(id) {
  return topics.find((topic) => topic.id === id)?.name || "生活";
}

function topicTone(id) {
  return topics.find((topic) => topic.id === id)?.tone || "";
}

function verificationText(status) {
  return {
    verified: "学历已认证",
    pending: "学历审核中",
    rejected: "认证未通过",
    unverified: "资料自填"
  }[status || "unverified"];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function tagsHtml(tags, verificationStatus = "unverified") {
  const safeTags = (tags || []).filter(Boolean);
  const verification = `<span class="chip ${verificationStatus === "verified" ? "verified" : ""}">${verificationText(verificationStatus)}</span>`;
  return [...safeTags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`), verification].join("");
}

function userTags(user) {
  if (!user?.publicTags) return [];
  return [user.mbti, user.education, user.city, user.industry].filter(Boolean);
}

function isOwner(authorId) {
  return Boolean(state.user && authorId === state.user.id);
}

function canManage(authorId) {
  return Boolean(state.user && (state.user.isAdmin || authorId === state.user.id));
}

function render() {
  if (state.loading) {
    app.innerHTML = `<div class="card empty">正在连接社区服务器...</div>`;
    return;
  }

  if (!state.user) {
    app.innerHTML = renderLogin();
    bindScreenEvents();
    syncNav();
    return;
  }

  const renderers = {
    home: renderHome,
    topics: renderTopics,
    compose: renderCompose,
    notice: renderNotice,
    profile: renderProfile,
    userProfile: renderViewedProfile,
    admin: renderAdmin
  };
  app.innerHTML = `${state.refreshing ? `<div class="refresh-bar">正在刷新...</div>` : ""}${renderers[state.view]()}`;
  bindScreenEvents();
  syncNav();
}

function setView(view) {
  state.view = view;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function filteredPosts() {
  if (state.filter === "all") return state.posts;
  return state.posts.filter((post) => post.topic === state.filter || post.tags.includes(state.filter.toUpperCase()));
}

function renderLogin() {
  return `
    <div class="stack">
      <section class="hero">
        <h2>登录后，大家才能互相看到发言</h2>
        <p>v0.2 仍是昵称登录，但账号会固定保存在当前手机浏览器里。下一步可接微信 openid 绑定。</p>
      </section>
      <form class="card form" id="loginForm">
        <h2>进入轻屿</h2>
        ${state.message ? `<p class="notice-text">${escapeHtml(state.message)}</p>` : ""}
        <div class="field">
          <label for="loginName">昵称</label>
          <input id="loginName" name="name" maxlength="18" placeholder="比如：晚风岛民" required />
        </div>
        <button class="primary-button" type="submit">登录 / 创建账号</button>
        <p class="muted">微信绑定需要公众号或开放平台配置，v0.2 先把社区基础功能跑稳。</p>
      </form>
    </div>
  `;
}

function renderHome() {
  const posts = filteredPosts();
  return `
    <div class="stack">
      <section class="hero">
        <h2>今天想聊什么，都可以从这里开始</h2>
        <p>下拉页面可刷新。点击头像可以看对方主页；自己的帖子和回复可以删除。</p>
        <div class="hero-actions">
          <button class="primary-button" data-action="compose" type="button">马上发帖</button>
          <button class="ghost-button" data-action="refresh" type="button">刷新</button>
          <button class="ghost-button" data-action="copy-link" type="button">复制链接</button>
        </div>
      </section>

      <section class="stats" aria-label="社区数据">
        <div class="stat"><strong>${state.posts.length}</strong><span class="muted">公开帖子</span></div>
        <div class="stat"><strong>${state.posts.reduce((sum, post) => sum + post.comments, 0)}</strong><span class="muted">讨论回复</span></div>
        <div class="stat"><strong>${state.user.isAdmin ? "管理员" : "普通"}</strong><span class="muted">当前权限</span></div>
      </section>

      <section class="stack">
        <div class="section-title">
          <h2>正在热聊</h2>
          <span class="muted">最新内容靠前</span>
        </div>
        ${renderFilters()}
        ${posts.length ? posts.map(renderPostCard).join("") : `<div class="card empty">这个筛选下还没有帖子。</div>`}
      </section>
    </div>
  `;
}

function renderFilters() {
  return `
    <div class="filters" aria-label="话题筛选">
      ${topics
        .map(
          (topic) => `
            <button class="filter-button ${state.filter === topic.id ? "active" : ""}" data-filter="${topic.id}" type="button">
              ${topic.name}
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderAuthor(post) {
  return `
    <button class="author author-button" data-open-user="${escapeHtml(post.authorId)}" type="button">
      <span class="avatar">${escapeHtml(post.author.slice(0, 1))}</span>
      <span>
        <span class="author-name">${escapeHtml(post.author)}</span>
        <span class="muted">${escapeHtml(post.time)}</span>
      </span>
    </button>
  `;
}

function renderPostCard(post) {
  return `
    <article class="card post-card">
      <div class="post-meta">
        ${renderAuthor(post)}
        <span class="topic-pill ${topicTone(post.topic)}">${topicName(post.topic)}</span>
      </div>
      <button class="plain-title" data-open-post="${post.id}" type="button">
        <h3>${escapeHtml(post.title)}</h3>
      </button>
      <p class="post-content">${escapeHtml(post.body)}</p>
      <div class="chips">${tagsHtml(post.tags)}</div>
      <div class="row">
        <button class="ghost-button" data-like="${post.id}" type="button">赞 ${post.likes}</button>
        <button class="ghost-button" data-open-post="${post.id}" type="button">回帖 ${post.comments}</button>
        <button class="ghost-button" data-report="${post.id}" type="button">举报</button>
        ${canManage(post.authorId) ? `<button class="danger-button" data-delete-post="${post.id}" type="button">删除</button>` : ""}
      </div>
    </article>
  `;
}

function renderTopics() {
  return `
    <div class="stack">
      <div class="section-title">
        <h2>话题广场</h2>
        <button class="ghost-button" data-action="refresh" type="button">刷新</button>
      </div>
      <div class="topic-grid">
        ${topics
          .filter((topic) => topic.id !== "all")
          .map(
            (topic) => `
              <button class="card topic-card" data-topic="${topic.id}" type="button">
                <h3>${topic.name}</h3>
                <p>${topicDescription(topic.id)}</p>
              </button>
            `
          )
          .join("")}
      </div>
      <section class="card">
        <h3>认证规则</h3>
        <p class="muted">MBTI、城市、行业默认是自填资料；学历可以提交说明，由管理员人工审核后显示“学历已认证”。</p>
      </section>
    </div>
  `;
}

function topicDescription(id) {
  const copy = {
    hot: "正在发生的事，大家一起看。",
    love: "关系、亲密、心动和困惑。",
    school: "校园、考试、专业和学历经验。",
    work: "工作、行业、选择和压力。",
    life: "日常碎片，真实生活。",
    mbti: "类型只是入口，交流才是重点。",
    city: "同城生活、搬家和归属感。"
  };
  return copy[id] || "自由表达。";
}

function renderCompose() {
  return `
    <form class="card form" id="composeForm">
      <h2>发布新帖子</h2>
      <div class="field">
        <label for="topic">选择话题</label>
        <select id="topic" name="topic">
          ${topics.filter((topic) => topic.id !== "all").map((topic) => `<option value="${topic.id}">${topic.name}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="title">标题</label>
        <input id="title" name="title" maxlength="40" placeholder="一句话说清楚你想聊什么" required />
      </div>
      <div class="field">
        <label for="body">正文</label>
        <textarea id="body" name="body" maxlength="500" placeholder="展开说说你的经历、问题或观点" required></textarea>
      </div>
      <div class="card toggle-row">
        <div>
          <strong>带上我的属性标签</strong>
          <p class="muted">关闭后只显示昵称，不展示 MBTI、学历等信息。</p>
        </div>
        <label class="switch">
          <input id="showTags" type="checkbox" ${state.user.publicTags ? "checked" : ""} />
          <span></span>
        </label>
      </div>
      <button class="primary-button" type="submit">发布</button>
    </form>
  `;
}

function renderNotice() {
  return `
    <div class="stack">
      <div class="section-title">
        <h2>通知</h2>
        <button class="ghost-button" data-action="refresh" type="button">刷新</button>
      </div>
      <article class="card">
        <h3>v0.2 已支持</h3>
        <p class="post-content">下拉刷新、删除自己的内容、查看别人主页、学历认证申请、管理员审核。</p>
      </article>
      <article class="card">
        <h3>下一步微信绑定</h3>
        <p class="muted">需要公众号或开放平台接入微信授权，用 openid/unionid 绑定账号。</p>
      </article>
      <article class="card">
        <h3>社区规则</h3>
        <p class="post-content">允许表达不同观点，禁止人身攻击、恶意泄露隐私、广告引流和歧视性内容。</p>
      </article>
    </div>
  `;
}

function renderProfile() {
  return renderProfileBody(state.user, true);
}

function renderViewedProfile() {
  if (!state.viewedProfile) return `<div class="card empty">用户资料加载中...</div>`;
  return renderProfileBody(state.viewedProfile, false);
}

function renderProfileBody(profile, editable) {
  const visibleTags = userTags(profile);
  return `
    <div class="stack">
      <section class="card profile-head">
        <div class="profile-avatar">${escapeHtml(profile.name.slice(0, 1))}</div>
        <div>
          <h2>${escapeHtml(profile.name)} ${profile.isAdmin ? `<span class="status-pill done">管理员</span>` : ""}</h2>
          <p class="muted">${escapeHtml(profile.bio || "还没有简介。")}</p>
        </div>
        <div class="profile-tags">${profile.publicTags ? tagsHtml(visibleTags, profile.verificationStatus) : `<span class="chip">属性已隐藏</span>`}</div>
        ${editable ? `<button class="ghost-button" data-action="logout" type="button">退出登录</button>` : `<button class="ghost-button" data-action="back-home" type="button">返回首页</button>`}
      </section>

      ${
        editable
          ? `
            <form class="card form" id="profileForm">
              <h3>编辑个人资料</h3>
              <div class="field"><label for="name">昵称</label><input id="name" name="name" value="${escapeHtml(profile.name)}" required /></div>
              <div class="field"><label for="bio">简介</label><input id="bio" name="bio" value="${escapeHtml(profile.bio)}" /></div>
              <div class="field"><label for="mbti">MBTI</label><input id="mbti" name="mbti" value="${escapeHtml(profile.mbti)}" placeholder="可不填" /></div>
              <div class="field"><label for="education">学历</label><input id="education" name="education" value="${escapeHtml(profile.education)}" placeholder="可不填" /></div>
              <div class="field"><label for="city">城市</label><input id="city" name="city" value="${escapeHtml(profile.city)}" placeholder="可不填" /></div>
              <div class="field"><label for="industry">行业/身份</label><input id="industry" name="industry" value="${escapeHtml(profile.industry)}" placeholder="可不填" /></div>
              <div class="toggle-row">
                <strong>公开属性标签</strong>
                <label class="switch">
                  <input id="publicTags" type="checkbox" ${profile.publicTags ? "checked" : ""} />
                  <span></span>
                </label>
              </div>
              <button class="primary-button" type="submit">保存资料</button>
            </form>

            <form class="card form" id="verificationForm">
              <h3>学历认证</h3>
              <p class="muted">当前状态：${verificationText(profile.verificationStatus)}。先用人工审核，证明内容只给管理员看。</p>
              <div class="field">
                <label for="proof">认证说明</label>
                <textarea id="proof" name="proof" maxlength="220" placeholder="例如：学校、专业、毕业年份，或你愿意提交给管理员核验的信息"></textarea>
              </div>
              <button class="primary-button" type="submit">提交认证申请</button>
            </form>
          `
          : `
            <section class="stack">
              <div class="section-title">
                <h2>Ta 的帖子</h2>
                <span class="muted">${profile.posts?.length || 0} 条</span>
              </div>
              ${profile.posts?.length ? profile.posts.map(renderPostCard).join("") : `<div class="card empty">还没有公开帖子。</div>`}
            </section>
          `
      }
    </div>
  `;
}

function renderAdmin() {
  if (!state.user.isAdmin) {
    return `
      <form class="card form" id="adminUnlockForm">
        <h2>管理中心</h2>
        <p class="muted">普通用户不能处理举报和认证。v0.2 默认管理员口令是 qingyu-admin-2026，正式部署请改成环境变量。</p>
        <div class="field">
          <label for="adminKey">管理员口令</label>
          <input id="adminKey" name="adminKey" type="password" placeholder="输入管理员口令" required />
        </div>
        <button class="primary-button" type="submit">解锁管理权限</button>
      </form>
    `;
  }

  return `
    <div class="stack">
      <div class="section-title">
        <h2>管理中心</h2>
        <button class="ghost-button" data-action="refresh" type="button">刷新</button>
      </div>
      <section class="admin-list">
        <h3>学历认证审核</h3>
        ${
          state.verificationRequests.length
            ? state.verificationRequests
                .map(
                  (item) => `
                    <article class="card">
                      <div class="post-meta">
                        <h3>${escapeHtml(item.name)} · ${escapeHtml(item.education)}</h3>
                        <span class="status-pill ${item.status !== "待审核" ? "done" : ""}">${escapeHtml(item.status)}</span>
                      </div>
                      <p class="post-content">${escapeHtml(item.proof)}</p>
                      <div class="row">
                        <button class="primary-button" data-verify-action="approve" data-user-id="${item.userId}" type="button">通过</button>
                        <button class="danger-button" data-verify-action="reject" data-user-id="${item.userId}" type="button">拒绝</button>
                      </div>
                    </article>
                  `
                )
                .join("")
            : `<div class="card empty">暂无认证申请。</div>`
        }
      </section>
      <section class="admin-list">
        <h3>举报处理</h3>
        ${
          state.reports.length
            ? state.reports
                .map(
                  (report) => `
                    <article class="card">
                      <div class="post-meta">
                        <h3>${escapeHtml(report.title)}</h3>
                        <span class="status-pill ${report.status !== "待处理" ? "done" : ""}">${escapeHtml(report.status)}</span>
                      </div>
                      <p class="muted">${escapeHtml(report.reason)}</p>
                      <div class="row">
                        <button class="danger-button" data-report-action="delete" data-report-id="${report.id}" type="button">标记删除</button>
                        <button class="ghost-button" data-report-action="ban" data-report-id="${report.id}" type="button">标记封禁</button>
                      </div>
                    </article>
                  `
                )
                .join("")
            : `<div class="card empty">暂无举报。</div>`
        }
      </section>
    </div>
  `;
}

function bindScreenEvents() {
  const loginForm = app.querySelector("#loginForm");
  if (loginForm) loginForm.addEventListener("submit", submitLogin);

  app.querySelectorAll("[data-action='compose']").forEach((button) => button.addEventListener("click", () => setView("compose")));
  app.querySelectorAll("[data-action='copy-link']").forEach((button) => button.addEventListener("click", copyShareLink));
  app.querySelectorAll("[data-action='logout']").forEach((button) => button.addEventListener("click", logout));
  app.querySelectorAll("[data-action='refresh']").forEach((button) => button.addEventListener("click", () => refreshState()));
  app.querySelectorAll("[data-action='back-home']").forEach((button) => button.addEventListener("click", () => setView("home")));

  app.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      render();
    });
  });
  app.querySelectorAll("[data-topic]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.topic;
      setView("home");
    });
  });
  app.querySelectorAll("[data-open-user]").forEach((button) => button.addEventListener("click", () => openUser(button.dataset.openUser)));
  app.querySelectorAll("[data-open-post]").forEach((button) => button.addEventListener("click", () => openPost(Number(button.dataset.openPost))));
  app.querySelectorAll("[data-like]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/posts/${button.dataset.like}/like`, { method: "POST" });
      await refreshState();
    });
  });
  app.querySelectorAll("[data-report]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/posts/${button.dataset.report}/report`, { method: "POST" });
      state.view = "notice";
      await refreshState();
    });
  });
  app.querySelectorAll("[data-delete-post]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("确定删除这条帖子吗？")) return;
      await api(`/api/posts/${button.dataset.deletePost}`, { method: "DELETE" });
      detailSheet.classList.add("hidden");
      await refreshState();
    });
  });
  app.querySelectorAll("[data-report-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/reports/${button.dataset.reportId}`, {
        method: "PATCH",
        body: { action: button.dataset.reportAction }
      });
      await refreshState();
    });
  });
  app.querySelectorAll("[data-verify-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/verifications/${button.dataset.userId}`, {
        method: "PATCH",
        body: { action: button.dataset.verifyAction }
      });
      await refreshState();
    });
  });

  const composeForm = app.querySelector("#composeForm");
  if (composeForm) composeForm.addEventListener("submit", submitPost);
  const profileForm = app.querySelector("#profileForm");
  if (profileForm) profileForm.addEventListener("submit", submitProfile);
  const verificationForm = app.querySelector("#verificationForm");
  if (verificationForm) verificationForm.addEventListener("submit", submitVerification);
  const adminUnlockForm = app.querySelector("#adminUnlockForm");
  if (adminUnlockForm) adminUnlockForm.addEventListener("submit", submitAdminUnlock);
}

async function submitLogin(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const data = await api("/api/login", {
      method: "POST",
      body: { name: form.get("name").trim() }
    });
    setToken(data.token);
    state.view = "home";
    await refreshState();
  } catch (error) {
    state.message = error.message;
    render();
  }
}

async function submitPost(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const title = form.get("title").trim();
  const body = form.get("body").trim();
  const warningWords = ["广告", "加微信", "人肉", "辱骂"];
  const matched = warningWords.find((word) => title.includes(word) || body.includes(word));
  if (matched && !confirm(`内容中出现「${matched}」，可能需要修改。仍然发布吗？`)) return;
  await api("/api/posts", {
    method: "POST",
    body: { topic: form.get("topic"), title, body, showTags: app.querySelector("#showTags").checked }
  });
  state.filter = "all";
  state.view = "home";
  await refreshState();
}

async function submitProfile(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await api("/api/profile", {
    method: "PUT",
    body: {
      name: form.get("name").trim(),
      bio: form.get("bio").trim(),
      mbti: form.get("mbti").trim().toUpperCase(),
      education: form.get("education").trim(),
      city: form.get("city").trim(),
      industry: form.get("industry").trim(),
      publicTags: app.querySelector("#publicTags").checked
    }
  });
  await refreshState();
}

async function submitVerification(event) {
  event.preventDefault();
  const proof = new FormData(event.currentTarget).get("proof").trim();
  await api("/api/verification", { method: "POST", body: { proof } });
  await refreshState();
}

async function submitAdminUnlock(event) {
  event.preventDefault();
  const key = new FormData(event.currentTarget).get("adminKey").trim();
  await api("/api/admin/unlock", { method: "POST", body: { key } });
  state.view = "admin";
  await refreshState();
}

async function openUser(userId) {
  if (!userId) return;
  if (state.user?.id === userId) return setView("profile");
  try {
    const data = await api(`/api/users/${userId}`);
    state.viewedProfile = data.profile;
    setView("userProfile");
  } catch (error) {
    alert(error.message);
  }
}

function currentPost(id) {
  return state.posts.find((item) => item.id === id);
}

async function openPost(id) {
  const post = currentPost(id);
  if (!post) return;
  postDetail.innerHTML = `
    <article class="post-card">
      <span class="topic-pill ${topicTone(post.topic)}">${topicName(post.topic)}</span>
      <h2>${escapeHtml(post.title)}</h2>
      <div class="post-meta">
        ${renderAuthor(post)}
        ${canManage(post.authorId) ? `<button class="danger-button" data-delete-post="${post.id}" type="button">删除帖子</button>` : ""}
      </div>
      <div class="chips">${tagsHtml(post.tags)}</div>
      <p class="post-content">${escapeHtml(post.body)}</p>
      <form class="form" id="replyForm">
        <div class="field">
          <label for="replyText">写回复</label>
          <textarea id="replyText" name="replyText" maxlength="220" placeholder="说说你的看法" required></textarea>
        </div>
        <button class="primary-button" type="submit">回复</button>
      </form>
      <section>
        <h3>全部回复</h3>
        ${
          post.replies.length
            ? post.replies
                .map(
                  (reply) => `
                    <div class="reply">
                      <div class="reply-meta">
                        <button class="author-name text-button" data-open-user="${escapeHtml(reply.authorId)}" type="button">${escapeHtml(reply.author)}</button>
                        <span class="muted">${escapeHtml(reply.time)}</span>
                        ${canManage(reply.authorId) || canManage(post.authorId) ? `<button class="danger-link" data-delete-reply="${reply.id}" data-post-id="${post.id}" type="button">删除</button>` : ""}
                      </div>
                      <p>${escapeHtml(reply.body)}</p>
                    </div>
                  `
                )
                .join("")
            : `<p class="empty">还没有回复。</p>`
        }
      </section>
    </article>
  `;
  detailSheet.classList.remove("hidden");
  bindDetailEvents(post.id);
}

function bindDetailEvents(postId) {
  postDetail.querySelectorAll("[data-open-user]").forEach((button) => {
    button.addEventListener("click", () => {
      detailSheet.classList.add("hidden");
      openUser(button.dataset.openUser);
    });
  });
  postDetail.querySelectorAll("[data-delete-post]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("确定删除这条帖子吗？")) return;
      await api(`/api/posts/${button.dataset.deletePost}`, { method: "DELETE" });
      detailSheet.classList.add("hidden");
      await refreshState();
    });
  });
  postDetail.querySelectorAll("[data-delete-reply]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("确定删除这条回复吗？")) return;
      await api(`/api/posts/${button.dataset.postId}/replies/${button.dataset.deleteReply}`, { method: "DELETE" });
      detailSheet.classList.add("hidden");
      await refreshState();
      openPost(postId);
    });
  });
  const replyForm = postDetail.querySelector("#replyForm");
  if (replyForm) {
    replyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = new FormData(event.currentTarget).get("replyText").trim();
      if (!body) return;
      await api(`/api/posts/${postId}/replies`, { method: "POST", body: { body } });
      detailSheet.classList.add("hidden");
      await refreshState();
      openPost(postId);
    });
  }
}

async function copyShareLink() {
  const url = location.origin;
  try {
    await navigator.clipboard.writeText(url);
    alert("分享链接已复制");
  } catch {
    prompt("复制这个链接发给别人：", url);
  }
}

function logout() {
  clearToken();
  state.user = null;
  state.view = "home";
  render();
}

function syncNav() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", Boolean(state.user) && button.dataset.view === state.view);
  });
}

function setupPullRefresh() {
  let startY = 0;
  let pulling = false;
  window.addEventListener("touchstart", (event) => {
    if (window.scrollY === 0) {
      pulling = true;
      startY = event.touches[0].clientY;
    }
  }, { passive: true });
  window.addEventListener("touchmove", (event) => {
    if (!pulling || state.refreshing || !state.user) return;
    const diff = event.touches[0].clientY - startY;
    if (diff > 82) {
      pulling = false;
      refreshState();
    }
  }, { passive: true });
  window.addEventListener("touchend", () => {
    pulling = false;
  }, { passive: true });
}

document.querySelector("#adminButton").addEventListener("click", () => {
  if (state.user) setView("admin");
});
document.querySelectorAll(".bottom-nav [data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    if (state.user) setView(button.dataset.view);
  });
});
document.querySelector("#closeDetail").addEventListener("click", () => detailSheet.classList.add("hidden"));
detailSheet.addEventListener("click", (event) => {
  if (event.target === detailSheet) detailSheet.classList.add("hidden");
});

boot();
