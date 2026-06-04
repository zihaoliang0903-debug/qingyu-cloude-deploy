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
  user: null,
  posts: [],
  reports: [],
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
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }
  return data;
}

async function boot() {
  try {
    await refreshState();
  } catch (error) {
    state.loading = false;
    state.message = error.message;
    render();
  }
}

async function refreshState() {
  state.loading = true;
  render();
  const data = await api("/api/state");
  state.user = data.user;
  state.posts = data.posts;
  state.reports = data.reports || [];
  state.loading = false;
  render();
}

function topicName(id) {
  return topics.find((topic) => topic.id === id)?.name || "生活";
}

function topicTone(id) {
  return topics.find((topic) => topic.id === id)?.tone || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function tagsHtml(tags) {
  if (!tags || tags.length === 0) return "";
  return tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("");
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
    admin: renderAdmin
  };
  app.innerHTML = renderers[state.view]();
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
        <p>第一版用昵称登录，帖子、回复、点赞和举报会保存到同一个服务器数据里。以后可以升级手机号、微信或邮箱登录。</p>
      </section>
      <form class="card form" id="loginForm">
        <h2>进入轻屿</h2>
        ${state.message ? `<p class="notice-text">${escapeHtml(state.message)}</p>` : ""}
        <div class="field">
          <label for="loginName">昵称</label>
          <input id="loginName" name="name" maxlength="18" placeholder="比如：晚风岛民" required />
        </div>
        <button class="primary-button" type="submit">登录 / 创建账号</button>
        <p class="muted">这是 MVP 登录方式，不需要密码；正式上线前建议接入手机号、微信或邮箱验证码。</p>
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
        <p>所有人打开同一个地址，都会看到同一批帖子和回复。分享链接：${escapeHtml(location.origin)}</p>
        <div class="hero-actions">
          <button class="primary-button" data-action="compose" type="button">马上发帖</button>
          <button class="ghost-button" data-action="copy-link" type="button">复制分享链接</button>
        </div>
      </section>

      <section class="stats" aria-label="社区数据">
        <div class="stat"><strong>${state.posts.length}</strong><span class="muted">公开帖子</span></div>
        <div class="stat"><strong>${state.posts.reduce((sum, post) => sum + post.comments, 0)}</strong><span class="muted">讨论回复</span></div>
        <div class="stat"><strong>${state.user.name.slice(0, 8)}</strong><span class="muted">当前账号</span></div>
      </section>

      <section class="stack">
        <div class="section-title">
          <h2>正在热聊</h2>
          <span class="muted">刷新可看到最新内容</span>
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

function renderPostCard(post) {
  const tone = topicTone(post.topic);
  return `
    <article class="card post-card">
      <div class="post-meta">
        <div class="author">
          <span class="avatar">${escapeHtml(post.author.slice(0, 1))}</span>
          <div>
            <div class="author-name">${escapeHtml(post.author)}</div>
            <div class="muted">${escapeHtml(post.time)}</div>
          </div>
        </div>
        <span class="topic-pill ${tone}">${topicName(post.topic)}</span>
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
      </div>
    </article>
  `;
}

function renderTopics() {
  return `
    <div class="stack">
      <div class="section-title">
        <h2>话题广场</h2>
        <span class="muted">先分区，再用标签找同频</span>
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
        <h3>标签筛选</h3>
        <p class="muted">这些属性只用于表达和筛选，不强制填写，也不参与排序。</p>
        <div class="chips">
          ${["INFP", "ENFP", "INTJ", "本科", "硕士", "学生", "互联网", "上海", "杭州"].map((tag) => `<span class="chip">${tag}</span>`).join("")}
        </div>
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
      <button class="primary-button" type="submit">发布到服务器</button>
      <p class="muted">发布后，打开同一地址的其他人刷新即可看到。</p>
    </form>
  `;
}

function renderNotice() {
  return `
    <div class="stack">
      <div class="section-title">
        <h2>通知</h2>
        <span class="muted">回复和治理提醒</span>
      </div>
      <article class="card">
        <h3>联网方式</h3>
        <p class="post-content">让别人访问同一个服务器地址，大家就会看到同一份帖子数据。当前地址是：${escapeHtml(location.origin)}</p>
      </article>
      <article class="card">
        <h3>举报处理</h3>
        <p class="muted">你提交的举报会进入管理中心，管理员可标记删除内容或封禁用户。</p>
      </article>
      <article class="card">
        <h3>社区规则</h3>
        <p class="post-content">允许表达不同观点，禁止人身攻击、恶意泄露隐私、广告引流和歧视性内容。</p>
      </article>
    </div>
  `;
}

function renderProfile() {
  const profile = state.user;
  const visibleTags = [profile.mbti, profile.education, profile.city, profile.industry].filter(Boolean);
  return `
    <div class="stack">
      <section class="card profile-head">
        <div class="profile-avatar">${escapeHtml(profile.name.slice(0, 1))}</div>
        <div>
          <h2>${escapeHtml(profile.name)}</h2>
          <p class="muted">${escapeHtml(profile.bio || "还没有简介。")}</p>
        </div>
        <div class="profile-tags">${profile.publicTags ? tagsHtml(visibleTags) : `<span class="chip">属性已隐藏</span>`}</div>
        <button class="ghost-button" data-action="logout" type="button">退出登录</button>
      </section>

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
        <button class="primary-button" type="submit">保存到服务器</button>
      </form>
    </div>
  `;
}

function renderAdmin() {
  return `
    <div class="stack">
      <div class="section-title">
        <h2>管理中心</h2>
        <span class="muted">基础审核能力</span>
      </div>
      <section class="card">
        <h3>敏感词提示</h3>
        <p class="post-content">发布前提示攻击、广告、隐私泄露等风险词。第一版不先审后发，避免影响正常表达。</p>
      </section>
      <section class="admin-list">
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
                        <button class="danger-button" data-report-action="delete" data-report-id="${report.id}" type="button">删除内容</button>
                        <button class="ghost-button" data-report-action="ban" data-report-id="${report.id}" type="button">封禁用户</button>
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
  app.querySelectorAll("[data-report-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/reports/${button.dataset.reportId}`, {
        method: "PATCH",
        body: { action: button.dataset.reportAction }
      });
      await refreshState();
    });
  });

  const composeForm = app.querySelector("#composeForm");
  if (composeForm) composeForm.addEventListener("submit", submitPost);

  const profileForm = app.querySelector("#profileForm");
  if (profileForm) profileForm.addEventListener("submit", submitProfile);
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
    body: {
      topic: form.get("topic"),
      title,
      body,
      showTags: app.querySelector("#showTags").checked
    }
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

async function openPost(id) {
  const post = state.posts.find((item) => item.id === id);
  if (!post) return;
  postDetail.innerHTML = `
    <article class="post-card">
      <span class="topic-pill ${topicTone(post.topic)}">${topicName(post.topic)}</span>
      <h2>${escapeHtml(post.title)}</h2>
      <div class="author">
        <span class="avatar">${escapeHtml(post.author.slice(0, 1))}</span>
        <div>
          <div class="author-name">${escapeHtml(post.author)}</div>
          <div class="muted">${escapeHtml(post.time)} · ${post.likes} 赞 · ${post.comments} 回帖</div>
        </div>
      </div>
      <div class="chips">${tagsHtml(post.tags)}</div>
      <p class="post-content">${escapeHtml(post.body)}</p>
      <form class="form" id="replyForm">
        <div class="field">
          <label for="replyText">写回复</label>
          <textarea id="replyText" name="replyText" maxlength="220" placeholder="说说你的看法" required></textarea>
        </div>
        <button class="primary-button" type="submit">回复到服务器</button>
      </form>
      <section>
        <h3>全部回复</h3>
        ${post.replies.length ? post.replies.map((reply) => `<div class="reply"><div class="reply-meta"><strong>${escapeHtml(reply.author)}</strong><span class="muted">${escapeHtml(reply.time)}</span></div><p>${escapeHtml(reply.body)}</p></div>`).join("") : `<p class="empty">还没有回复。</p>`}
      </section>
    </article>
  `;
  detailSheet.classList.remove("hidden");
  document.querySelector("#replyForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = new FormData(event.currentTarget).get("replyText").trim();
    if (!body) return;
    await api(`/api/posts/${id}/replies`, { method: "POST", body: { body } });
    detailSheet.classList.add("hidden");
    await refreshState();
    openPost(id);
  });
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
