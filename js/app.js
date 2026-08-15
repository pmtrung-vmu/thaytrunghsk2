/* HSK Ôn Từ — vanilla JS single-page app
   Tự viết toàn bộ, không sao chép code từ trang nào khác. */

const LEVELS = [
  { id: "1", label: "HSK 1", file: "hsk1.json", grammar: "grammar1.json", grammarGroupLabel: "Bài", curriculum: "curriculum1.json" },
  { id: "2", label: "HSK 2", file: "hsk2.json", grammar: "grammar2.json", grammarGroupLabel: "Bài", curriculum: "curriculum2.json" },
  { id: "3", label: "HSK 3", file: "hsk3.json", grammar: "grammar3.json", grammarGroupLabel: "Bài", curriculum: "curriculum3.json", dienTu: "dientu3.json" },
  { id: "4", label: "HSK 4", file: "hsk4.json", grammar: "grammar4.json", grammarGroupLabel: "Nhóm" },
];

const UNIT_SIZE = 20;

const POS_LABEL = {
  n: "danh từ", v: "động từ", a: "tính từ", d: "phó từ", ad: "phó từ",
  p: "giới từ", c: "liên từ", cc: "liên từ", m: "số từ", q: "lượng từ",
  qt: "lượng từ", qv: "lượng từ", r: "đại từ", u: "trợ từ", y: "trợ từ",
  e: "thán từ", o: "thán từ", i: "thành ngữ", l: "cụm cố định",
  j: "từ viết tắt", t: "từ chỉ thời gian", s: "từ chỉ vị trí",
  f: "từ chỉ phương vị", b: "định ngữ", vn: "danh động từ", g: "từ tố", x: "khác",
  /* Nhãn từ loại rút gọn dùng cho dữ liệu HSK1-3 (theo giáo trình HSK 3.0) */
  "n.": "danh từ", "v.": "động từ", "adj.": "tính từ", "adv.": "phó từ",
  "pron.": "đại từ", "conj.": "liên từ", "prep.": "giới từ", "mod.": "định ngữ",
  "m.": "lượng từ", "part.": "trợ từ", "int.": "thán từ", "pref.": "tiền tố",
  "suf.": "hậu từ", "num.": "số từ",
};

const dataCache = {};
const grammarCache = {};

function levelInfo(id) {
  return LEVELS.find(l => l.id === id);
}

function stripTones(py) {
  const map = {
    "āáǎàa": "a", "ēéěèe": "e", "īíǐìi": "i", "ōóǒòo": "o",
    "ūúǔùu": "u", "ǖǘǚǜü": "v", "ńňǹn": "n", "ḿm": "m",
  };
  let out = py.toLowerCase();
  for (const group in map) {
    for (const ch of group) {
      out = out.split(ch).join(map[group]);
    }
  }
  return out.replace(/[^a-z]/g, "");
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchLevelData(id) {
  if (dataCache[id]) return dataCache[id];
  const info = levelInfo(id);
  const res = await fetch(`data/${info.file}`);
  const data = await res.json();
  dataCache[id] = data;
  return data;
}

async function fetchGrammarData(id) {
  if (grammarCache[id]) return grammarCache[id];
  const info = levelInfo(id);
  if (!info.grammar) return null;
  const res = await fetch(`data/${info.grammar}`);
  const data = await res.json();
  grammarCache[id] = data;
  return data;
}

/* Dữ liệu "giáo trình" (xem theo đúng thứ tự sách: bài khóa 课文 + ngữ pháp
   riêng của từng bài) — khác với dữ liệu "Từ vựng"/"Ngữ pháp" tổng hợp theo
   trình độ đã có ở trên. Hiện chỉ HSK3 có dữ liệu; HSK1/2/4 chưa có (info.curriculum
   undefined) nên trang sẽ hiện "chưa có dữ liệu". */
const curriculumCache = {};
async function fetchCurriculumData(id) {
  if (curriculumCache[id]) return curriculumCache[id];
  const info = levelInfo(id);
  if (!info || !info.curriculum) return null;
  const res = await fetch(`data/${info.curriculum}`);
  const data = await res.json();
  curriculumCache[id] = data;
  return data;
}

/* Dữ liệu bài tập "Điền từ nâng cao" (điền nhiều chỗ trống có ngân hàng từ,
   theo đúng bài trong giáo trình) — chỉ HSK3 có hiện tại. */
const dienTuCache = {};
async function fetchDienTuData(id) {
  if (dienTuCache[id]) return dienTuCache[id];
  const info = levelInfo(id);
  if (!info || !info.dienTu) return null;
  const res = await fetch(`data/${info.dienTu}`);
  const data = await res.json();
  dienTuCache[id] = data;
  return data;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

function meaningOf(w) {
  if (w.meaning_vi && w.meaning_vi.trim()) {
    return { text: w.meaning_vi, pending: false };
  }
  return { text: w.meaning_en || "(chưa có nghĩa)", pending: true };
}

function posLabel(p) {
  if (POS_LABEL[p]) return POS_LABEL[p];
  // Nhãn ghép kiểu "n./v." — dịch từng phần rồi nối lại.
  if (p.includes("/")) {
    return p.split("/").map(part => POS_LABEL[part.trim()] || part.trim()).join("/");
  }
  return p;
}

function posBadges(pos) {
  if (!pos || !pos.length) return "";
  return pos.slice(0, 2).map(p => `<span class="pos-tag">${posLabel(p)}</span>`).join(" ");
}

/* ---------------- Cấu trúc dữ liệu: theo bài học (HSK1-3) hay theo lô tần suất (HSK4-9) ---------------- */

function isLessonBased(data) {
  return Array.isArray(data) && data.length > 0 && Array.isArray(data[0].words);
}

function allWords(data) {
  return isLessonBased(data) ? data.flatMap(l => l.words) : data;
}

function wordCount(data) {
  return allWords(data).length;
}

/* Trả về danh sách "bài" đồng nhất, dù dữ liệu theo giáo trình thật hay theo lô 20 từ. */
function getUnits(data) {
  if (isLessonBased(data)) {
    return data.map(l => ({
      title: `Bài ${l.lesson} · ${l.title_zh}`,
      sub: l.title_vi,
      sample: l.words.slice(0, 4).map(w => w.hanzi).join(" · "),
      words: l.words,
    }));
  }
  const chunks = chunk(data, UNIT_SIZE);
  let start = 0;
  return chunks.map((w, i) => {
    const u = {
      title: `Bài ${i + 1}`,
      sub: `Từ ${start + 1}–${start + w.length}`,
      sample: w.slice(0, 4).map(x => x.hanzi).join(" · "),
      words: w,
    };
    start += w.length;
    return u;
  });
}

/* ---------------- Phân quyền theo lớp/trình độ ---------------- */

/* Xem danh sách từ / lật thẻ / ngữ pháp: MỌI người dùng (khách vãng lai,
   học viên, giáo viên) đều xem được ở TẤT CẢ các trình độ, không giới hạn
   theo lớp — nên không còn hàm chặn xem theo trình độ nữa.

   Luyện tập có chấm điểm (trắc nghiệm/điền pinyin/điền từ/dịch câu/viết chữ):
   khách vãng lai không dùng được (xem canUsePracticeModes ở dưới); học viên
   (tài khoản do giáo viên tạo) chỉ luyện tập được ở đúng trình độ của (các)
   lớp mình được phân; giáo viên luyện tập được mọi trình độ. */
function canPracticeLevel(levelId) {
  if (!window.HSKAuth || !HSKAuth.isConfigured) return true;
  if (!HSKAuth.user) return true;
  const profile = HSKAuth.profile;
  if (!profile) return true;
  if (profile.role === "teacher") return true;
  if (profile.role === "student") {
    return Array.isArray(profile.classes) && profile.classes.some((c) => c.level === levelId);
  }
  return true;
}

/* Trình độ (không trùng lặp) của tất cả các lớp một học viên đang thuộc. */
function studentLevels(profile) {
  if (!profile || !Array.isArray(profile.classes)) return [];
  return [...new Set(profile.classes.map((c) => c.level))];
}

function isLoggedIn() {
  return !!(window.HSKAuth && HSKAuth.user);
}

function isRestrictedStudent() {
  return !!(window.HSKAuth && HSKAuth.user && HSKAuth.profile && HSKAuth.profile.role === "student");
}

/* Banner nhắc khách vãng lai: chỉ xem được danh sách từ + lật thẻ, các chế
   độ luyện tập có chấm điểm (trắc nghiệm/điền pinyin/điền từ/dịch câu/viết
   chữ) cần tài khoản học viên do giáo viên cấp mới dùng được. */
function guestBanner() {
  return `<p class="guest-banner">👤 Bạn đang xem với tư cách khách — chỉ xem được danh sách từ và lật thẻ.
    <a href="#/login">Đăng nhập</a> bằng tài khoản học viên (do giáo viên cấp) để luyện tập trắc nghiệm, điền pinyin, điền từ, dịch câu, viết chữ và lưu tiến độ.</p>`;
}

/* ---------------- Router ---------------- */

function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  return h.split("/").filter(Boolean);
}

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", () => {
  buildNav();
  render();
});

function buildNav() {
  const nav = document.getElementById("level-nav");
  const visibleLevels = LEVELS;
  let extra = "";
  if (isRestrictedStudent()) {
    const names = (HSKAuth.profile.classes || []).map((c) => c.name).filter(Boolean);
    extra = `<span class="nav-locked-note">🔒 Luyện tập trong lớp: ${escapeHtml(names.length ? names.join(", ") : "chưa được phân lớp")} — các trình độ khác vẫn xem được từ vựng/ngữ pháp</span>`;
  } else if (!isLoggedIn()) {
    extra = `<span class="nav-locked-note">👤 Khách: chỉ xem danh sách từ & lật thẻ — <a href="#/login">đăng nhập</a> để luyện tập đầy đủ</span>`;
  }
  nav.innerHTML = `<a href="#/" data-nav="home">Trang chủ</a>` +
    visibleLevels.map(l => `<a href="#/level/${l.id}" data-nav="${l.id}">${l.label}</a>`).join("") +
    extra;
}

function markActiveNav(id) {
  document.querySelectorAll("#level-nav a").forEach(a => {
    a.classList.toggle("active", a.dataset.nav === (id || "home"));
  });
}

async function render() {
  const parts = parseHash();
  const app = document.getElementById("app");
  app.innerHTML = `<p class="empty-note">Đang tải...</p>`;
  if (window.HSKAuth) HSKAuth.stopHeartbeat(); // chỉ chạy khi đang ở trang một bài học cụ thể

  try {
    if (parts.length === 0) {
      markActiveNav(null);
      await renderHome(app);
      return;
    }
    if (parts[0] === "login") { markActiveNav(null); await renderLogin(app); return; }
    if (parts[0] === "signup") { markActiveNav(null); await renderSignup(app); return; }
    if (parts[0] === "progress") { markActiveNav(null); await renderMyProgressPage(app); return; }
    if (parts[0] === "curriculum") {
      markActiveNav(null);
      if (parts[1] && parts[2] === "lesson" && parts[3]) {
        await renderCurriculumLesson(app, parts[1], parts[3]);
      } else if (parts[1]) {
        await renderCurriculumLevel(app, parts[1]);
      } else {
        await renderCurriculumHome(app);
      }
      return;
    }
    if (parts[0] === "teacher") {
      markActiveNav(null);
      if (parts[1] === "class" && parts[2]) {
        await renderClassDetailPage(app, parts[2]);
      } else if (parts[1] === "student" && parts[2]) {
        await renderStudentDetailPage(app, parts[2]);
      } else if (parts[1] === "level" && parts[2]) {
        await renderTeacherLevelPage(app, parts[2]);
      } else {
        await renderTeacherPage(app);
      }
      return;
    }
    if (parts[0] === "level") {
      const id = parts[1];
      markActiveNav(id);
      if (parts[2] === "grammar") {
        await renderGrammar(app, id);
      } else if (parts[2] === "unit") {
        const unitIdx = parts[3];
        const mode = parts[4] || "list";
        await renderUnit(app, id, unitIdx, mode);
      } else {
        await renderLevel(app, id);
      }
      return;
    }
    app.innerHTML = `<p class="empty-note">Không tìm thấy trang.</p>`;
  } catch (err) {
    console.error(err);
    app.innerHTML = `<p class="empty-note">Có lỗi khi tải dữ liệu: ${err.message}</p>`;
  }
}

if (window.HSKAuth) {
  HSKAuth.onChange(() => {
    // Vai trò/lớp có thể vừa thay đổi (đăng nhập/đăng xuất) — làm mới cả
    // thanh điều hướng (danh sách trình độ được phép) lẫn nội dung trang.
    buildNav();
    render();
  });
}

/* ---------------- Home ---------------- */

async function renderHome(app) {
  // Ai cũng XEM được toàn bộ nội dung ở mọi trình độ (kể cả khách chưa đăng
  // nhập) — riêng phần LUYỆN TẬP có chấm điểm thì học viên chỉ dùng được ở
  // đúng trình độ lớp mình được phân (xem canPracticeLevel() ở trên). Nếu
  // Firebase chưa được cấu hình, trang vẫn hoạt động bình thường ở chế độ
  // "chỉ khách".
  if (window.HSKAuth) await HSKAuth.ready;
  const configured = !!(window.HSKAuth && HSKAuth.isConfigured);
  const loggedIn = isLoggedIn();

  const dataSets = await Promise.all(LEVELS.map(l => fetchLevelData(l.id)));
  const total = dataSets.reduce((s, d) => s + wordCount(d), 0);
  const restricted = isRestrictedStudent();
  const firstPracticeLevel = LEVELS.find((l) => canPracticeLevel(l.id)) || LEVELS[0];

  app.innerHTML = `
    <section class="hero">
      <div class="blob b1"></div><div class="blob b2"></div>
      <div class="wrap hero-grid">
        <div>
          <h1>Học tiếng Trung <span class="accent">vui mỗi ngày</span></h1>
          <p class="lead">Flashcard, trắc nghiệm, điền từ và luyện viết tay chữ Hán — theo đúng giáo trình 新HSK教程, có giáo viên theo dõi tiến độ từng buổi học.</p>
          <div class="hero-actions">
            ${firstPracticeLevel ? `<a class="btn primary" href="#/level/${firstPracticeLevel.id}">Bắt đầu ôn tập →</a>` : ""}
            <a class="btn ghost" href="#/curriculum">Xem giáo trình</a>
          </div>
          <div class="stat-row">
            <div class="stat"><b>${LEVELS.length}</b><span>Cấp độ</span></div>
            <div class="stat"><b>${total.toLocaleString("vi-VN")}</b><span>Từ vựng</span></div>
            <div class="stat"><b>7</b><span>Chế độ ôn</span></div>
          </div>
          ${restricted ? (() => {
            const names = (HSKAuth.profile.classes || []).map((c) => c.name).filter(Boolean);
            const labels = studentLevels(HSKAuth.profile).map((lv) => (levelInfo(lv) || {}).label || lv);
            return `<p class="class-banner">🔒 Bạn thuộc ${escapeHtml(names.join(", ") || "chưa có lớp nào")} — xem được từ vựng &amp; ngữ pháp mọi trình độ, nhưng chỉ luyện tập có chấm điểm được ở trình độ ${escapeHtml(labels.join(", ") || "—")}.</p>`;
          })() : (configured && !loggedIn ? guestBanner() : "")}
        </div>
        <div class="hero-card">
          <div class="flash-mock">
            <div class="hz">老师</div>
            <div class="py">lǎoshī</div>
            <div class="vi">giáo viên, thầy/cô</div>
          </div>
          <div class="mini-row">
            <div class="mini-tag">✏️ Trắc nghiệm</div>
            <div class="mini-tag">🖌️ Viết chữ</div>
            <div class="mini-tag">📝 Điền từ</div>
          </div>
        </div>
      </div>
    </section>

    <section class="features">
      <div class="feat-grid">
        <div class="feat"><div class="ico">📚</div><h4>Đúng giáo trình</h4><p>Bám sát 新HSK教程, chia bài học rõ ràng theo từng cấp.</p></div>
        <div class="feat"><div class="ico">🖌️</div><h4>Luyện viết tay</h4><p>Chấm đúng/sai từng nét bút ngay khi viết chữ Hán.</p></div>
        <div class="feat"><div class="ico">🌐</div><h4>Xem thử miễn phí</h4><p>Xem danh sách từ và lật thẻ không cần đăng nhập.</p></div>
        <div class="feat"><div class="ico">📊</div><h4>Luyện tập & theo dõi tiến độ</h4><p>Đăng nhập bằng tài khoản học viên (do giáo viên cấp) để luyện tập đầy đủ và lưu điểm từng lần làm bài.</p></div>
      </div>
    </section>

    <section id="level-grid-section" class="levels">
      <div class="sec-title"><h2>Chọn trình độ của bạn</h2><span>${LEVELS.length} cấp độ · từ HSK 1 đến HSK 9</span></div>
      <div class="level-grid">
        ${LEVELS.map((l, i) => {
          const canPractice = canPracticeLevel(l.id);
          const inner = `
            <div class="lc-top">
              <span class="badge">${l.label}</span>
              ${l.grammar ? '<span class="badge" style="background:#e5f4ea;color:#1f6b3c;">có ngữ pháp</span>' : ""}
              ${isRestrictedStudent() && !canPractice ? '<span class="badge" style="background:#f4ecff;color:#5c3de0;" title="Xem được, nhưng luyện tập có chấm điểm chỉ ở trình độ lớp bạn">👁️ chỉ xem</span>' : ""}
            </div>
            <h3>Từ vựng ${l.label}</h3>
            <p>${wordCount(dataSets[i]).toLocaleString("vi-VN")} từ · ${getUnits(dataSets[i]).length} bài học</p>
          `;
          return `<a class="level-card" href="#/level/${l.id}">${inner}</a>`;
        }).join("")}
      </div>
    </section>
  `;
}

/* ---------------- Level page ---------------- */

async function renderLevel(app, id) {
  const info = levelInfo(id);
  if (!info) { app.innerHTML = `<p class="empty-note">Cấp độ không tồn tại.</p>`; return; }
  const data = await fetchLevelData(id);
  const units = getUnits(data);
  const total = wordCount(data);
  const lessonBased = isLessonBased(data);
  const orderNote = lessonBased
    ? "sắp theo đúng thứ tự giáo trình HSK 3.0"
    : `mỗi bài ${UNIT_SIZE} từ, sắp theo độ thông dụng`;

  app.innerHTML = `
    <div class="crumbs"><a href="#/">Trang chủ</a> / ${info.label}</div>
    <div class="section-title"><h2>Từ vựng ${info.label}</h2></div>
    <p class="section-sub">${total.toLocaleString("vi-VN")} từ · ${units.length} bài học (${orderNote})</p>

    <div class="unit-grid">
      <a class="unit-card highlight-card" href="#/level/${id}/unit/all/list">
        <div class="u-title">⭐ Ôn toàn bộ ${info.label}</div>
        <div class="u-sub">${total.toLocaleString("vi-VN")} từ</div>
        <div class="u-sample">Danh sách · Lật thẻ · Trắc nghiệm · Điền từ</div>
      </a>
      ${info.grammar ? `
      <a class="unit-card highlight-card" href="#/level/${id}/grammar">
        <div class="u-title">📖 Ngữ pháp ${info.label}</div>
        <div class="u-sub">Lý thuyết + ví dụ</div>
        <div class="u-sample">Xem điểm ngữ pháp</div>
      </a>` : ""}
      ${info.curriculum ? `
      <a class="unit-card highlight-card" href="#/curriculum/${id}">
        <div class="u-title">📘 Giáo trình ${info.label}</div>
        <div class="u-sub">Bài khóa (课文) + ngữ pháp theo từng bài</div>
        <div class="u-sample">Xem theo đúng thứ tự sách</div>
      </a>` : ""}
      ${units.map((u, i) => `
        <a class="unit-card" href="#/level/${id}/unit/${i}/list">
          <div class="u-title">${u.title}</div>
          <div class="u-sub">${u.sub}</div>
          <div class="u-sample">${u.sample}…</div>
          <span class="pill">${u.words.length} từ</span>
        </a>
      `).join("")}
    </div>
  `;
}

/* ---------------- Giáo trình (xem theo đúng thứ tự sách: bài khóa + ngữ pháp) ---------------- */

async function renderCurriculumHome(app) {
  const dataSets = await Promise.all(LEVELS.map((l) => fetchCurriculumData(l.id)));
  app.innerHTML = `
    <div class="crumbs"><a href="#/">Trang chủ</a> / Giáo trình</div>
    <div class="section-title"><h2>📘 Giáo trình theo sách</h2></div>
    <p class="section-sub">Xem bài khóa (课文) và ngữ pháp theo đúng thứ tự từng bài trong giáo trình — chọn trình độ để bắt đầu.</p>
    <div class="level-grid">
      ${LEVELS.map((l, i) => {
        const data = dataSets[i];
        const has = !!data;
        const inner = `
          <div class="lc-top">
            <span class="badge">${l.label}</span>
            ${!has ? '<span class="badge" style="background:#f1f1f4;color:#8a8a99;">chưa có dữ liệu</span>' : ""}
          </div>
          <h3>Giáo trình ${l.label}</h3>
          <p>${has ? `${data.length} bài · bài khóa + ngữ pháp` : "Sẽ được cập nhật sau"}</p>
        `;
        return has
          ? `<a class="level-card" href="#/curriculum/${l.id}">${inner}</a>`
          : `<div class="level-card locked" title="Chưa có dữ liệu giáo trình cho trình độ này">${inner}</div>`;
      }).join("")}
    </div>
  `;
}

async function renderCurriculumLevel(app, levelId) {
  const info = levelInfo(levelId);
  if (!info) { app.innerHTML = `<p class="empty-note">Trình độ không tồn tại.</p>`; return; }
  const data = await fetchCurriculumData(levelId);
  if (!data) {
    app.innerHTML = `
      <div class="crumbs"><a href="#/">Trang chủ</a> / <a href="#/curriculum">Giáo trình</a> / ${info.label}</div>
      <div class="section-title"><h2>Giáo trình ${info.label}</h2></div>
      <p class="empty-note">Chưa có dữ liệu giáo trình cho ${info.label}. Sẽ được cập nhật sau.</p>
    `;
    return;
  }
  /* Danh mục tên các bài (trang này) luôn xem được ở MỌI trình độ, kể cả
     khách vãng lai và học viên trình độ khác — chỉ NỘI DUNG chi tiết từng
     bài (renderCurriculumLesson) mới bị chặn theo trình độ. Hiện badge nhỏ
     để người xem không đủ quyền biết trước khi bấm vào. */
  const detailAllowed = canViewCurriculumDetail(levelId);

  app.innerHTML = `
    <div class="crumbs"><a href="#/">Trang chủ</a> / <a href="#/curriculum">Giáo trình</a> / ${info.label}</div>
    <div class="section-title"><h2>📘 Giáo trình ${info.label}</h2></div>
    <p class="section-sub">${data.length} bài · mỗi bài gồm bài khóa (课文) và ngữ pháp riêng${!detailAllowed ? ` · bạn chỉ xem được danh mục tên bài, chưa xem được nội dung chi tiết` : ""}</p>
    <div class="unit-grid">
      ${data.map((l) => `
        <a class="unit-card" href="#/curriculum/${levelId}/lesson/${l.lesson}">
          <div class="u-title">Bài ${l.lesson} · ${escapeHtml(l.titleZh || "")}${!detailAllowed ? " 🔒" : ""}</div>
          <div class="u-sub">${escapeHtml(l.titleVi || "")}</div>
          <div class="u-sample">${l.texts.length} bài khóa · ${l.grammar.length} điểm ngữ pháp</div>
        </a>
      `).join("")}
    </div>
  `;
}

/* Ghép từng dòng nội dung (中文) với dòng pinyin/nghĩa Việt tương ứng —
   3 chuỗi contentZh/pinyin/vi được tách dòng song song nhau từ nguồn Excel
   (mỗi câu thoại 1 dòng ở cả 3 cột), nên chỉ cần zip theo chỉ số dòng. */
function bkLinesHtml(t) {
  const zhLines = (t.contentZh || "").split("\n");
  const pyLines = (t.pinyin || "").split("\n");
  const viLines = (t.vi || "").split("\n");
  const n = Math.max(zhLines.length, pyLines.length, viLines.length);
  let html = "";
  for (let i = 0; i < n; i++) {
    const zh = (zhLines[i] || "").trim();
    if (!zh && !(pyLines[i] || "").trim() && !(viLines[i] || "").trim()) continue;
    html += `<div class="bk-line">
      <div class="bk-zh">${escapeHtml(zh)}</div>
      ${(pyLines[i] || "").trim() ? `<div class="bk-pinyin">${escapeHtml(pyLines[i].trim())}</div>` : ""}
      ${(viLines[i] || "").trim() ? `<div class="bk-vi">${escapeHtml(viLines[i].trim())}</div>` : ""}
    </div>`;
  }
  return html;
}

async function renderCurriculumLesson(app, levelId, lessonNumStr) {
  const info = levelInfo(levelId);
  if (!info) { app.innerHTML = `<p class="empty-note">Trình độ không tồn tại.</p>`; return; }
  if (!canViewCurriculumDetail(levelId)) {
    app.innerHTML = curriculumLockedNote(levelId);
    return;
  }
  const data = await fetchCurriculumData(levelId);
  if (!data) { app.innerHTML = `<p class="empty-note">Chưa có dữ liệu giáo trình cho ${info.label}.</p>`; return; }
  const lessonNum = Number(lessonNumStr);
  const lesson = data.find((l) => l.lesson === lessonNum);
  if (!lesson) { app.innerHTML = `<p class="empty-note">Không tìm thấy bài học.</p>`; return; }

  /* Dữ liệu từ vựng HSK1-3 đã theo đúng thứ tự giáo trình (lesson N ↔ unit
     index N-1 trong getUnits()/isLessonBased()), nên có thể suy ra thẳng URL
     sang phần luyện tập "Điền từ nâng cao" của đúng bài này. */
  const unitIdx = lessonNum - 1;
  const dienTuData = await fetchDienTuData(levelId);
  const dienTuLesson = dienTuData && dienTuData.find((d) => d.lesson === lessonNum);
  const hasDienTu = !!(dienTuLesson && dienTuLesson.blocks && dienTuLesson.blocks.length);

  const prevLesson = data.find((l) => l.lesson === lessonNum - 1);
  const nextLesson = data.find((l) => l.lesson === lessonNum + 1);

  app.innerHTML = `
    <div class="crumbs"><a href="#/">Trang chủ</a> / <a href="#/curriculum">Giáo trình</a> / <a href="#/curriculum/${levelId}">${info.label}</a> / Bài ${lesson.lesson}</div>
    <div class="section-title"><h2>Bài ${lesson.lesson} · ${escapeHtml(lesson.titleZh || "")}</h2></div>
    <p class="section-sub">${lesson.titlePinyin ? escapeHtml(lesson.titlePinyin) + " — " : ""}${escapeHtml(lesson.titleVi || "")}</p>

    <div class="curr-lesson-nav">
      ${prevLesson ? `<a href="#/curriculum/${levelId}/lesson/${prevLesson.lesson}">← Bài ${prevLesson.lesson}</a>` : `<span></span>`}
      ${hasDienTu ? `<a class="btn primary btn-sm" href="#/level/${levelId}/unit/${unitIdx}/advfill">🧩 Luyện điền từ nâng cao — Bài ${lesson.lesson}</a>` : `<span></span>`}
      ${nextLesson ? `<a href="#/curriculum/${levelId}/lesson/${nextLesson.lesson}">Bài ${nextLesson.lesson} →</a>` : `<span></span>`}
    </div>

    <div class="tab-row curr-tab-row">
      <a class="curr-tab active" data-tab="baikhoa">📖 Bài khóa (课文)</a>
      <a class="curr-tab" data-tab="ngupap">📐 Ngữ pháp${lesson.grammar.length ? ` (${lesson.grammar.length})` : ""}</a>
    </div>

    <div class="curr-toggles" id="curr-baikhoa-toggles">
      <label class="toggle-item"><input type="checkbox" id="toggle-pinyin"> Hiện pinyin</label>
      <label class="toggle-item"><input type="checkbox" id="toggle-vi"> Hiện nghĩa tiếng Việt</label>
    </div>

    <div id="curr-pane-baikhoa" class="curr-pane hide-pinyin hide-vi">
      ${lesson.texts.map((t, i) => `
        <div class="baikhoa-card">
          <div class="bk-head">
            <span class="bk-label">${escapeHtml(t.label || `课文${i + 1}`)}</span>
            <span class="bk-title-zh">${escapeHtml(t.titleZh || "")}</span>
            ${t.titlePinyin ? `<span class="bk-title-py bk-pinyin">${escapeHtml(t.titlePinyin)}</span>` : ""}
          </div>
          ${t.titleVi ? `<div class="bk-title-vi bk-vi">${escapeHtml(t.titleVi)}</div>` : ""}
          <div class="bk-lines">${bkLinesHtml(t)}</div>
        </div>
      `).join("")}
    </div>

    <div id="curr-pane-ngupap" class="curr-pane" hidden>
      <div class="grammar-list">
        ${lesson.grammar.length ? lesson.grammar.map((g) => `
          <div class="gram-card">
            <h4 class="gram-name">${escapeHtml(g.hanzi || "")}</h4>
            ${g.meaning ? `<div class="gram-vi">${escapeHtml(g.meaning)}</div>` : ""}
            ${g.structure ? `<div class="gram-struct">${escapeHtml(g.structure)}</div>` : ""}
            ${g.explain ? `<p class="gram-explain">${escapeHtml(g.explain)}</p>` : ""}
            ${(g.examples || []).map((ex) => `
              <div class="gram-ex">
                <div class="zh">${escapeHtml(ex.zh || "")}</div>
                ${ex.vi ? `<div class="vi">${escapeHtml(ex.vi)}</div>` : ""}
              </div>
            `).join("")}
          </div>
        `).join("") : `<p class="empty-note">Bài này chưa có điểm ngữ pháp riêng.</p>`}
      </div>
    </div>
  `;

  const tabs = Array.from(app.querySelectorAll(".curr-tab"));
  const paneBaiKhoa = document.getElementById("curr-pane-baikhoa");
  const paneNguPhap = document.getElementById("curr-pane-ngupap");
  const toggles = document.getElementById("curr-baikhoa-toggles");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      paneBaiKhoa.hidden = target !== "baikhoa";
      paneNguPhap.hidden = target !== "ngupap";
      toggles.hidden = target !== "baikhoa";
    });
  });

  const pinyinToggle = document.getElementById("toggle-pinyin");
  const viToggle = document.getElementById("toggle-vi");
  function applyToggles() {
    paneBaiKhoa.classList.toggle("hide-pinyin", !pinyinToggle.checked);
    paneBaiKhoa.classList.toggle("hide-vi", !viToggle.checked);
  }
  pinyinToggle.addEventListener("change", applyToggles);
  viToggle.addEventListener("change", applyToggles);
}

/* ---------------- Unit (4 modes) ---------------- */

/* Chế độ "luyện tập" có chấm điểm (trắc nghiệm/điền pinyin/điền từ/dịch câu/
   viết chữ):
   - Khách vãng lai (chưa đăng nhập): không dùng được ở BẤT KỲ trình độ nào —
     chỉ xem được danh sách từ ("list") và lật thẻ ("flash").
   - Học viên (tài khoản do giáo viên cấp): dùng được, nhưng CHỈ ở đúng
     trình độ của (các) lớp mình được phân — các trình độ khác vẫn xem được
     danh sách từ/lật thẻ/ngữ pháp bình thường, chỉ riêng phần luyện tập có
     chấm điểm là bị khoá.
   - Giáo viên: dùng được ở mọi trình độ. */
const PRACTICE_MODES = ["quiz", "fill", "cloze", "translate", "write", "advfill"];
function canUsePracticeModes(levelId) {
  return isLoggedIn() && canPracticeLevel(levelId);
}

function practiceLockedNote(baseUrl, levelId) {
  if (!isLoggedIn()) {
    return `<div class="empty-note">
      🔒 Chế độ luyện tập (trắc nghiệm, điền pinyin, điền từ, dịch câu, viết chữ) chỉ dành cho tài khoản đã đăng nhập.<br>
      Khách vãng lai vẫn xem được <a href="${baseUrl}/list">danh sách từ</a> và <a href="${baseUrl}/flash">lật thẻ</a> ở bài học này.<br><br>
      Tài khoản học viên do giáo viên cấp sẵn — liên hệ giáo viên phụ trách để được cấp tài khoản.<br><br>
      <a href="#/login" class="btn primary" style="display:inline-block;">Đăng nhập</a>
    </div>`;
  }
  const profile = window.HSKAuth && HSKAuth.profile;
  const info = levelInfo(levelId);
  const myLevels = studentLevels(profile).map(levelInfo).filter(Boolean);
  return `<div class="empty-note">
    🔒 Tài khoản của bạn được phân vào lớp trình độ ${myLevels.length ? myLevels.map((l) => `<b>${escapeHtml(l.label)}</b>`).join(", ") : "—"},
    nên chỉ luyện tập có chấm điểm (trắc nghiệm, điền pinyin, điền từ, dịch câu, viết chữ) được ở (các) trình độ đó.<br>
    Bạn vẫn xem được <a href="${baseUrl}/list">danh sách từ</a> và <a href="${baseUrl}/flash">lật thẻ</a> ở ${info ? escapeHtml(info.label) : "trình độ này"} bình thường.
    ${myLevels.length ? `<br><br>${myLevels.map((l) => `<a href="#/level/${l.id}">Đến trang ${escapeHtml(l.label)} để luyện tập →</a>`).join(" · ")}` : ""}
  </div>`;
}

/* Xem CHI TIẾT giáo trình (bài khóa 课文 + ngữ pháp riêng của từng bài, trong
   renderCurriculumLesson) yêu cầu chặt hơn xem danh mục — chỉ giáo viên và
   học viên đúng trình độ lớp mình mới xem được nội dung đầy đủ; khách vãng
   lai và học viên ở trình độ khác chỉ xem được DANH MỤC tên các bài
   (renderCurriculumLevel — không hạn chế, xem mọi trình độ), không xem được
   nội dung bên trong. Logic giống hệt canUsePracticeModes (đăng nhập + đúng
   trình độ) nên dùng chung. */
function canViewCurriculumDetail(levelId) {
  return canUsePracticeModes(levelId);
}

function curriculumLockedNote(levelId) {
  const info = levelInfo(levelId);
  const catalogUrl = `#/curriculum/${levelId}`;
  const crumbs = `<div class="crumbs"><a href="#/">Trang chủ</a> / <a href="#/curriculum">Giáo trình</a> / <a href="${catalogUrl}">${info ? info.label : levelId}</a></div>`;
  if (!isLoggedIn()) {
    return `${crumbs}
    <div class="empty-note">
      🔒 Xem chi tiết bài khóa (课文) và ngữ pháp cần có tài khoản học viên (do giáo viên cấp) hoặc giáo viên.<br>
      Khách vãng lai vẫn xem được <a href="${catalogUrl}">danh mục tên các bài</a> của ${info ? escapeHtml(info.label) : "trình độ này"}.<br><br>
      Tài khoản học viên do giáo viên cấp sẵn — liên hệ giáo viên phụ trách để được cấp tài khoản.<br><br>
      <a href="#/login" class="btn primary" style="display:inline-block;">Đăng nhập</a>
    </div>`;
  }
  const profile = window.HSKAuth && HSKAuth.profile;
  const myLevels = studentLevels(profile).map(levelInfo).filter(Boolean);
  return `${crumbs}
  <div class="empty-note">
    🔒 Tài khoản của bạn được phân vào lớp trình độ ${myLevels.length ? myLevels.map((l) => `<b>${escapeHtml(l.label)}</b>`).join(", ") : "—"},
    nên chỉ xem chi tiết giáo trình (bài khóa + ngữ pháp) được ở (các) trình độ đó.<br>
    Bạn vẫn xem được <a href="${catalogUrl}">danh mục tên các bài</a> của ${info ? escapeHtml(info.label) : "trình độ này"}.
    ${myLevels.length ? `<br><br>${myLevels.map((l) => `<a href="#/curriculum/${l.id}">Đến giáo trình ${escapeHtml(l.label)} →</a>`).join(" · ")}` : ""}
  </div>`;
}

async function renderUnit(app, id, unitIdx, mode) {
  const info = levelInfo(id);
  const data = await fetchLevelData(id);
  const units = getUnits(data);
  const isAll = unitIdx === "all";
  const unit = isAll ? null : units[Number(unitIdx)];
  const words = isAll ? allWords(data) : (unit && unit.words);

  if (!words) { app.innerHTML = `<p class="empty-note">Không tìm thấy bài học.</p>`; return; }

  const unitLabel = isAll ? `Ôn toàn bộ ${info.label}` : `${unit.title}${unit.sub ? ` — ${unit.sub}` : ""}`;
  const baseUrl = `#/level/${id}/unit/${unitIdx}`;
  const practiceAllowed = canUsePracticeModes(id);

  const canWriteQuiz = STROKE_ORDER_LEVELS.includes(id) && typeof HanziWriter !== "undefined";

  /* "Điền từ nâng cao" — bài tập điền nhiều chỗ trống (có ngân hàng từ) lấy
     từ đúng bài trong giáo trình. Chỉ có ở các trình độ có info.dienTu, và
     chỉ ở trang MỘT bài cụ thể (không áp dụng cho "Ôn toàn bộ" vì dữ liệu
     gắn theo từng bài riêng). Dữ liệu từ vựng HSK1-3 đã theo đúng thứ tự
     giáo trình nên unitIdx (0-based) ↔ lesson (1-based) = unitIdx + 1. */
  let dienTuBlocks = null;
  if (info.dienTu && !isAll) {
    const dienTuData = await fetchDienTuData(id);
    const lessonNum = Number(unitIdx) + 1;
    const lessonData = dienTuData && dienTuData.find((d) => d.lesson === lessonNum);
    if (lessonData && lessonData.blocks && lessonData.blocks.length) dienTuBlocks = lessonData.blocks;
  }

  const tabs = [
    ["list", "📋 Danh sách", false],
    ["flash", "🔄 Lật thẻ", false],
    ["quiz", "✏️ Trắc nghiệm", true],
    ["fill", "⌨️ Điền pinyin", true],
    ["cloze", "📝 Điền từ", true],
    ["translate", "🌐 Dịch câu", true],
    ...(canWriteQuiz ? [["write", "🖌️ Viết chữ", true]] : []),
    ...(dienTuBlocks ? [["advfill", "🧩 Điền từ nâng cao", true]] : []),
  ];

  const header = `
    <div class="crumbs"><a href="#/">Trang chủ</a> / <a href="#/level/${id}">${info.label}</a> / ${unitLabel}</div>
    <div class="section-title"><h2>${unitLabel}</h2></div>
    <p class="section-sub">${words.length.toLocaleString("vi-VN")} từ</p>
    <div class="tab-row">
      ${tabs.map(([m, label, isPractice]) =>
        `<a class="${mode === m ? "active" : ""}" href="${baseUrl}/${m}">${label}${isPractice && !practiceAllowed ? " 🔒" : ""}</a>`
      ).join("")}
    </div>
    <div id="unit-body"></div>
  `;
  app.innerHTML = header;
  const body = document.getElementById("unit-body");
  const ctx = { level: id, unitKey: unitIdx, unitLabel };

  if (window.HSKAuth && HSKAuth.user) {
    HSKAuth.recordUnitViewed(id, unitIdx, unitLabel);
    HSKAuth.startHeartbeat(id);
  }

  if (mode === "list") renderListMode(body, words, id);
  else if (mode === "flash") renderFlashMode(body, words);
  else if (PRACTICE_MODES.includes(mode) && !practiceAllowed) {
    body.innerHTML = practiceLockedNote(baseUrl, id);
  }
  else if (mode === "quiz") renderQuizMode(body, words, ctx);
  else if (mode === "fill") renderFillMode(body, words, ctx);
  else if (mode === "cloze") renderClozeMode(body, words, ctx);
  else if (mode === "translate") renderTranslateMode(body, words, ctx);
  else if (mode === "write") {
    if (canWriteQuiz) renderWriteQuizMode(body, words, ctx);
    else body.innerHTML = `<div class="empty-note">Luyện viết chữ hiện chỉ hỗ trợ HSK 1-3.</div>`;
  }
  else if (mode === "advfill") {
    if (dienTuBlocks) renderAdvFillMode(body, dienTuBlocks, ctx);
    else body.innerHTML = `<div class="empty-note">Bài này chưa có bài tập điền từ nâng cao.</div>`;
  }
  else body.innerHTML = `<p class="empty-note">Chế độ không hợp lệ.</p>`;
}

/* Các cấp có nút "cách viết" (hoạt hình nét bút) — dùng thư viện HanziWriter,
   giống tính năng trên trang Meiday Chinese. */
const STROKE_ORDER_LEVELS = ["1", "2", "3"];
const HANZI_RE = /[一-鿿]/;

/* w.example = {zh, vi} lấy từ Meiday — có thể là 1 câu đầy đủ, hoặc (với một số
   từ HSK3) vài cụm ngắn nối bằng " / ". Hàm này ghép từng cặp zh/vi theo cụm. */
function exampleLines(example) {
  if (!example || !example.zh) return [];
  const zhParts = example.zh.split(" / ");
  const viParts = (example.vi || "").split(" / ");
  return zhParts.map((zh, i) => ({ zh: zh.trim(), vi: (viParts[i] || "").trim() }));
}

function exampleHtml(example) {
  const lines = exampleLines(example);
  if (!lines.length) return "";
  return `<div class="word-example">
    ${lines.map(l => `<div class="ex-line"><span class="ex-zh">${l.zh}</span>${l.vi ? `<span class="ex-vi">${l.vi}</span>` : ""}</div>`).join("")}
  </div>`;
}

function renderListMode(body, words, levelId) {
  const canWrite = STROKE_ORDER_LEVELS.includes(levelId) && typeof HanziWriter !== "undefined";

  body.innerHTML = `<div class="word-list">
    ${words.map((w, i) => {
      const m = meaningOf(w);
      const chars = canWrite ? [...w.hanzi].filter(ch => HANZI_RE.test(ch)) : [];
      return `
        <div class="word-item">
          <div class="word-row${canWrite ? " word-row-clickable" : ""}" ${canWrite ? `data-toggle-write="${i}"` : ""}>
            <button class="speak-btn" data-say="${encodeURIComponent(w.hanzi)}">🔊</button>
            <div class="hz">${w.hanzi}</div>
            <div class="py">${w.pinyin}</div>
            <div class="mn">
              ${m.text}${m.pending ? '<span class="vi-pending">EN · chưa dịch</span>' : ""}
            </div>
            ${posBadges(w.pos)}
            ${canWrite ? `<span class="write-toggle-hint">✏️ Cách viết</span>` : ""}
          </div>
          ${exampleHtml(w.example)}
          ${canWrite ? `
            <div class="write-panel" id="write-panel-${i}" hidden>
              ${chars.map((ch, ci) => `
                <div class="write-char">
                  <div class="write-target" id="write-target-${i}-${ci}" data-char="${ch}"></div>
                  <button class="write-play" data-play="${i}-${ci}">▶ Xem viết</button>
                </div>
              `).join("")}
            </div>
          ` : ""}
        </div>
      `;
    }).join("")}
  </div>`;

  body.querySelectorAll("[data-say]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      speak(decodeURIComponent(btn.dataset.say));
    });
  });

  if (!canWrite) return;

  const writers = {};
  body.querySelectorAll("[data-toggle-write]").forEach(row => {
    row.addEventListener("click", () => {
      const panel = document.getElementById(`write-panel-${row.dataset.toggleWrite}`);
      if (panel) panel.hidden = !panel.hidden;
    });
  });
  body.querySelectorAll("[data-play]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = btn.dataset.play;
      const target = document.getElementById(`write-target-${key}`);
      if (!target) return;
      if (!writers[key]) {
        writers[key] = HanziWriter.create(target, target.dataset.char, {
          width: 88, height: 88, padding: 4,
          strokeAnimationSpeed: 1,
          delayBetweenStrokes: 200,
          showOutline: true,
          strokeColor: "#2b3a55",
          outlineColor: "#d8dee5",
        });
      } else {
        writers[key].showCharacter({ duration: 0 });
      }
      writers[key].animateCharacter();
    });
  });
}

/* ---- Flashcard mode ---- */
function renderFlashMode(body, words) {
  let order = words.map((_, i) => i);
  let pos = 0;

  function draw() {
    const w = words[order[pos]];
    const m = meaningOf(w);
    body.innerHTML = `
      <div class="flash-wrap">
        <div class="flash-progress">${pos + 1} / ${order.length}</div>
        <div class="flashcard" id="fc">
          <div class="flashcard-inner">
            <div class="flash-face front">
              <div class="big-hz">${w.hanzi}</div>
              <div class="big-py">${w.pinyin}</div>
              ${posBadges(w.pos)}
            </div>
            <div class="flash-face back">
              <div class="big-mn">${m.text}</div>
              ${m.pending ? '<div class="small-mn">(nghĩa tiếng Anh — chưa có bản dịch tiếng Việt)</div>' : ""}
              <div class="big-py" style="margin-top:10px;">${w.pinyin}</div>
              ${w.example ? `<div class="flash-example">
                ${exampleLines(w.example).map(l => `<div class="ex-line"><span class="ex-zh">${l.zh}</span>${l.vi ? `<span class="ex-vi">${l.vi}</span>` : ""}</div>`).join("")}
              </div>` : ""}
            </div>
          </div>
        </div>
        <div class="flash-controls">
          <button class="btn" id="fc-prev" ${pos === 0 ? "disabled" : ""}>← Trước</button>
          <button class="btn amber" id="fc-shuffle">🔀 Trộn</button>
          <button class="btn primary" id="fc-next" ${pos === order.length - 1 ? "disabled" : ""}>Tiếp →</button>
        </div>
      </div>
    `;
    document.getElementById("fc").addEventListener("click", (e) => {
      document.getElementById("fc").classList.toggle("flipped");
    });
    document.getElementById("fc-prev").addEventListener("click", (e) => { e.stopPropagation(); if (pos > 0) { pos--; draw(); } });
    document.getElementById("fc-next").addEventListener("click", (e) => { e.stopPropagation(); if (pos < order.length - 1) { pos++; draw(); } });
    document.getElementById("fc-shuffle").addEventListener("click", (e) => {
      e.stopPropagation();
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      pos = 0;
      draw();
    });
  }
  draw();
}

/* ---- Quiz mode ---- */
/* direction: "zh2vi" (mặc định, xem Hán tự chọn nghĩa) hoặc "vi2zh" (xem nghĩa chọn Hán tự) */
function renderQuizMode(body, words, ctx, direction) {
  direction = direction === "vi2zh" ? "vi2zh" : "zh2vi";
  const pool = [...words];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const questions = pool.slice(0, Math.min(10, pool.length));
  let qi = 0, score = 0, answered = false;

  const dirToggle = (disabled) => `
    <div class="quiz-dir-toggle">
      <button class="${direction === "zh2vi" ? "active" : ""}" data-dir="zh2vi" ${disabled ? "disabled" : ""}>Hán tự → Nghĩa</button>
      <button class="${direction === "vi2zh" ? "active" : ""}" data-dir="vi2zh" ${disabled ? "disabled" : ""}>Nghĩa → Hán tự</button>
    </div>
  `;
  function bindDirToggle() {
    body.querySelectorAll("[data-dir]").forEach(btn => {
      btn.addEventListener("click", () => {
        const newDir = btn.dataset.dir;
        if (newDir !== direction) renderQuizMode(body, words, ctx, newDir);
      });
    });
  }

  function draw() {
    if (qi >= questions.length) {
      if (window.HSKAuth && HSKAuth.user && ctx) {
        HSKAuth.recordAttempt({ level: ctx.level, unitKey: ctx.unitKey, unitLabel: ctx.unitLabel, mode: "quiz", score, total: questions.length });
      }
      body.innerHTML = `
        ${dirToggle(false)}
        <div class="quiz-result-box">
          <div class="score-big">${score}/${questions.length}</div>
          <p>Bạn đã trả lời đúng ${score} trên ${questions.length} câu.</p>
          <button class="btn primary" id="q-retry">Làm lại</button>
        </div>`;
      document.getElementById("q-retry").addEventListener("click", () => renderQuizMode(body, words, ctx, direction));
      bindDirToggle();
      return;
    }
    const w = questions[qi];
    const zh2vi = direction === "zh2vi";
    const correct = zh2vi ? meaningOf(w).text : w.hanzi;
    const distractorPool = words.filter(x => x.hanzi !== w.hanzi);
    const distractors = [];
    const used = new Set([correct]);
    while (distractors.length < 3 && distractorPool.length) {
      const idx = Math.floor(Math.random() * distractorPool.length);
      const cand = zh2vi ? meaningOf(distractorPool[idx]).text : distractorPool[idx].hanzi;
      if (!used.has(cand)) { used.add(cand); distractors.push(cand); }
      distractorPool.splice(idx, 1);
    }
    const options = [correct, ...distractors];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    answered = false;

    body.innerHTML = `
      <div class="quiz-wrap">
        ${dirToggle(false)}
        <div class="quiz-progress">Câu ${qi + 1} / ${questions.length} · Điểm: ${score}</div>
        <div class="quiz-card">
          ${zh2vi ? `
            <div class="quiz-hz">${w.hanzi}</div>
            <div class="quiz-py">${w.pinyin}</div>
          ` : `
            <div class="quiz-vi">${meaningOf(w).text}</div>
          `}
          <div class="quiz-options">
            ${options.map(o => `<button class="quiz-option${zh2vi ? "" : " quiz-option-hz"}" data-val="${encodeURIComponent(o)}">${o}</button>`).join("")}
          </div>
        </div>
      </div>
    `;
    bindDirToggle();
    body.querySelectorAll(".quiz-option").forEach(btn => {
      btn.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const val = decodeURIComponent(btn.dataset.val);
        if (val === correct) { btn.classList.add("correct"); score++; }
        else {
          btn.classList.add("wrong");
          body.querySelectorAll(".quiz-option").forEach(b => {
            if (decodeURIComponent(b.dataset.val) === correct) b.classList.add("correct");
          });
          if (window.HSKAuth && HSKAuth.user && ctx) HSKAuth.recordWrongWord(w.hanzi, ctx.level);
        }
        setTimeout(() => { qi++; draw(); }, 900);
      });
    });
  }
  draw();
}

/* ---- Fill-in-pinyin mode ---- */
function renderFillMode(body, words, ctx) {
  const pool = [...words];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const questions = pool.slice(0, Math.min(15, pool.length));
  let qi = 0, score = 0;

  function draw() {
    if (qi >= questions.length) {
      if (window.HSKAuth && HSKAuth.user && ctx) {
        HSKAuth.recordAttempt({ level: ctx.level, unitKey: ctx.unitKey, unitLabel: ctx.unitLabel, mode: "fill", score, total: questions.length });
      }
      body.innerHTML = `
        <div class="quiz-result-box">
          <div class="score-big">${score}/${questions.length}</div>
          <p>Bạn đã điền đúng pinyin ${score} trên ${questions.length} từ.</p>
          <button class="btn primary" id="f-retry">Làm lại</button>
        </div>`;
      document.getElementById("f-retry").addEventListener("click", () => renderFillMode(body, words, ctx));
      return;
    }
    const w = questions[qi];
    const m = meaningOf(w);
    body.innerHTML = `
      <div class="quiz-progress" style="text-align:center;">Câu ${qi + 1} / ${questions.length} · Điểm: ${score}</div>
      <div class="fill-card">
        <div class="fill-hz">${w.hanzi}</div>
        <div class="fill-mn">${m.text}</div>
        <input type="text" id="f-input" placeholder="Nhập pinyin (không cần dấu thanh)" autocomplete="off">
        <div class="fill-hint" id="f-hint">Gõ pinyin rồi nhấn Enter hoặc bấm Kiểm tra.</div>
        <div class="flash-controls" style="justify-content:center; margin-top:10px;">
          <button class="btn primary" id="f-check">Kiểm tra</button>
          <button class="btn" id="f-skip">Bỏ qua →</button>
        </div>
      </div>
    `;
    const input = document.getElementById("f-input");
    input.focus();
    const hint = document.getElementById("f-hint");
    let checked = false;

    function check() {
      if (checked) return;
      checked = true;
      const ans = stripTones(input.value.trim());
      const target = stripTones(w.pinyin);
      if (ans && ans === target) {
        input.classList.add("correct");
        hint.textContent = "✓ Chính xác!";
        score++;
      } else {
        input.classList.add("wrong");
        hint.textContent = `✗ Đáp án đúng: ${w.pinyin}`;
        if (window.HSKAuth && HSKAuth.user && ctx) HSKAuth.recordWrongWord(w.hanzi, ctx.level);
      }
      setTimeout(() => { qi++; draw(); }, 1100);
    }
    document.getElementById("f-check").addEventListener("click", check);
    document.getElementById("f-skip").addEventListener("click", () => { qi++; draw(); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") check(); });
  }
  draw();
}

/* ---- Điền từ vào chỗ trống mode (câu ví dụ lấy từ Meiday) ---- */
function renderClozeMode(body, words, ctx) {
  const pool = words.filter(w => w.example && w.example.zh && w.example.zh.includes(w.hanzi));

  if (!pool.length) {
    body.innerHTML = `<div class="empty-note">Bài này chưa có câu ví dụ để tạo bài điền từ vào chỗ trống.</div>`;
    return;
  }

  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const questions = shuffled.slice(0, Math.min(10, shuffled.length));
  let qi = 0, score = 0, answered = false;

  function draw() {
    if (qi >= questions.length) {
      if (window.HSKAuth && HSKAuth.user && ctx) {
        HSKAuth.recordAttempt({ level: ctx.level, unitKey: ctx.unitKey, unitLabel: ctx.unitLabel, mode: "cloze", score, total: questions.length });
      }
      body.innerHTML = `
        <div class="quiz-result-box">
          <div class="score-big">${score}/${questions.length}</div>
          <p>Bạn đã điền đúng ${score} trên ${questions.length} câu.</p>
          <button class="btn primary" id="c-retry">Làm lại</button>
        </div>`;
      document.getElementById("c-retry").addEventListener("click", () => renderClozeMode(body, words, ctx));
      return;
    }
    const w = questions[qi];
    const blanked = w.example.zh.split(w.hanzi).join("______");
    const distractorPool = words.filter(x => x.hanzi !== w.hanzi);
    const distractors = [];
    const used = new Set([w.hanzi]);
    while (distractors.length < 3 && distractorPool.length) {
      const idx = Math.floor(Math.random() * distractorPool.length);
      const cand = distractorPool[idx].hanzi;
      if (!used.has(cand)) { used.add(cand); distractors.push(cand); }
      distractorPool.splice(idx, 1);
    }
    const options = [w.hanzi, ...distractors];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    answered = false;

    body.innerHTML = `
      <div class="quiz-wrap">
        <div class="quiz-progress">Câu ${qi + 1} / ${questions.length} · Điểm: ${score}</div>
        <div class="quiz-card">
          <div class="cloze-sentence">${blanked}</div>
          <div class="cloze-hint">(${w.example.vi})</div>
          <div class="quiz-options">
            ${options.map(o => `<button class="quiz-option quiz-option-hz" data-val="${encodeURIComponent(o)}">${o}</button>`).join("")}
          </div>
        </div>
      </div>
    `;
    body.querySelectorAll(".quiz-option").forEach(btn => {
      btn.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const val = decodeURIComponent(btn.dataset.val);
        if (val === w.hanzi) { btn.classList.add("correct"); score++; }
        else {
          btn.classList.add("wrong");
          body.querySelectorAll(".quiz-option").forEach(b => {
            if (decodeURIComponent(b.dataset.val) === w.hanzi) b.classList.add("correct");
          });
          if (window.HSKAuth && HSKAuth.user && ctx) HSKAuth.recordWrongWord(w.hanzi, ctx.level);
        }
        setTimeout(() => { qi++; draw(); }, 1000);
      });
    });
  }
  draw();
}

/* ---- Điền từ nâng cao — bài tập điền NHIỀU chỗ trống trong 1 đoạn hội
   thoại/đoạn văn, chọn đúng từ trong "ngân hàng từ" cho từng chỗ (không phải
   trắc nghiệm 1 từ như "cloze" ở trên) — lấy nguyên bài tập gốc trong sách,
   theo đúng bài học. Mỗi lesson có 1-2 "khối" (block), mỗi khối có wordBank +
   text (chứa các chuỗi gạch dưới/dấu chấm đánh dấu chỗ trống) + answers (đáp
   án đúng theo thứ tự chỗ trống xuất hiện trong text). */
const ADV_FILL_BLANK_RE = /([_]{2,}|[.]{2,})/g;

function renderAdvFillMode(body, blocks, ctx) {
  function draw() {
    const blockHtml = blocks.map((block, bi) => {
      const segments = block.text.split(ADV_FILL_BLANK_RE);
      let blankIdx = 0;
      const textHtml = segments.map((seg) => {
        if (/^([_]{2,}|[.]{2,})$/.test(seg)) {
          const bk = blankIdx++;
          const options = block.wordBank
            .map((w) => `<option value="${escapeHtml(w)}">${escapeHtml(w)}</option>`)
            .join("");
          return `<select class="af-blank" id="af-${bi}-${bk}" data-block="${bi}" data-blank="${bk}"><option value="">___</option>${options}</select>`;
        }
        return escapeHtml(seg).replace(/\n/g, "<br>");
      }).join("");
      return `
        <div class="af-block">
          <div class="af-bank"><b>Ngân hàng từ:</b> ${block.wordBank.map((w) => `<span class="af-bank-word">${escapeHtml(w)}</span>`).join(" ")}</div>
          <div class="af-text">${textHtml}</div>
        </div>
      `;
    }).join("");

    body.innerHTML = `
      <div class="af-wrap">
        <p class="section-sub">Chọn từ đúng trong ngân hàng từ cho mỗi chỗ trống, sau đó bấm "Nộp bài" để chấm điểm. Bài tập nguyên gốc theo đúng giáo trình — nâng cao hơn phần "Điền từ" cơ bản vì mỗi đoạn có nhiều chỗ trống liên quan đến nhau.</p>
        ${blockHtml}
        <div class="af-actions"><button class="btn primary" id="af-submit">✅ Nộp bài</button></div>
        <div id="af-result"></div>
      </div>
    `;

    document.getElementById("af-submit").addEventListener("click", () => {
      let score = 0, total = 0;
      blocks.forEach((block, bi) => {
        block.answers.forEach((ans, bk) => {
          total++;
          const sel = document.getElementById(`af-${bi}-${bk}`);
          if (!sel) return;
          sel.disabled = true;
          if (sel.value === ans) {
            score++;
            sel.classList.add("af-correct");
          } else {
            sel.classList.add("af-wrong");
            const hint = document.createElement("span");
            hint.className = "af-answer-hint";
            hint.textContent = `đúng: ${ans}`;
            sel.insertAdjacentElement("afterend", hint);
          }
        });
      });
      if (window.HSKAuth && HSKAuth.user && ctx) {
        HSKAuth.recordAttempt({ level: ctx.level, unitKey: ctx.unitKey, unitLabel: ctx.unitLabel, mode: "advfill", score, total });
      }
      document.getElementById("af-submit").disabled = true;
      const resultBox = document.getElementById("af-result");
      resultBox.innerHTML = `
        <div class="quiz-result-box">
          <div class="score-big">${score}/${total}</div>
          <p>Bạn đã điền đúng ${score} trên ${total} chỗ trống.</p>
          <button class="btn primary" id="af-retry">Làm lại</button>
        </div>`;
      document.getElementById("af-retry").addEventListener("click", draw);
      resultBox.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
  draw();
}

/* ---- Dịch câu mode — luyện dịch câu ví dụ (lấy từ dữ liệu word.example) cả
   2 chiều Trung→Việt và Việt→Trung. Vì dịch câu không có một đáp án "đúng
   duy nhất" để so khớp tự động (khác pinyin/điền từ), chế độ này để HỌC VIÊN
   TỰ CHẤM: gõ bản dịch của mình, bấm "Xem đáp án" để so với câu dịch tham
   khảo, rồi tự bấm Đúng/Chưa đúng — giống cách Anki/nhiều app ngoại ngữ xử lý
   bài dịch tự luận. */
function translateSentencePool(words) {
  const pairs = [];
  words.forEach((w) => {
    exampleLines(w.example).forEach((l) => {
      if (l.zh && l.vi) pairs.push({ hanzi: w.hanzi, zh: l.zh, vi: l.vi });
    });
  });
  return pairs;
}

function renderTranslateMode(body, words, ctx, direction) {
  direction = direction === "vi2zh" ? "vi2zh" : "zh2vi";
  const pool = translateSentencePool(words);
  if (!pool.length) {
    body.innerHTML = `<div class="empty-note">Bài này chưa có câu ví dụ để luyện dịch.</div>`;
    return;
  }
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const questions = shuffled.slice(0, Math.min(10, shuffled.length));
  let qi = 0, score = 0;

  const dirToggle = (disabled) => `
    <div class="quiz-dir-toggle">
      <button class="${direction === "zh2vi" ? "active" : ""}" data-dir="zh2vi" ${disabled ? "disabled" : ""}>Trung → Việt</button>
      <button class="${direction === "vi2zh" ? "active" : ""}" data-dir="vi2zh" ${disabled ? "disabled" : ""}>Việt → Trung</button>
    </div>
  `;
  function bindDirToggle() {
    body.querySelectorAll("[data-dir]").forEach(btn => {
      btn.addEventListener("click", () => {
        const newDir = btn.dataset.dir;
        if (newDir !== direction) renderTranslateMode(body, words, ctx, newDir);
      });
    });
  }

  function draw() {
    if (qi >= questions.length) {
      if (window.HSKAuth && HSKAuth.user && ctx) {
        HSKAuth.recordAttempt({ level: ctx.level, unitKey: ctx.unitKey, unitLabel: ctx.unitLabel, mode: "translate", score, total: questions.length });
      }
      body.innerHTML = `
        ${dirToggle(false)}
        <div class="quiz-result-box">
          <div class="score-big">${score}/${questions.length}</div>
          <p>Bạn tự chấm đúng ${score} trên ${questions.length} câu.</p>
          <button class="btn primary" id="t-retry">Làm lại</button>
        </div>`;
      document.getElementById("t-retry").addEventListener("click", () => renderTranslateMode(body, words, ctx, direction));
      bindDirToggle();
      return;
    }
    const q = questions[qi];
    const sourceText = direction === "zh2vi" ? q.zh : q.vi;
    const answerText = direction === "zh2vi" ? q.vi : q.zh;

    body.innerHTML = `
      <div class="quiz-wrap">
        ${dirToggle(false)}
        <div class="quiz-progress">Câu ${qi + 1} / ${questions.length} · Điểm: ${score}</div>
        <div class="translate-card">
          <div class="translate-source ${direction === "zh2vi" ? "zh" : "vi"}">${sourceText}</div>
          <textarea id="t-input" rows="2" placeholder="Nhập bản dịch của bạn..." autocomplete="off"></textarea>
          <div class="flash-controls" style="justify-content:center;">
            <button class="btn primary" id="t-check">Xem đáp án</button>
            <button class="btn" id="t-skip">Bỏ qua →</button>
          </div>
          <div class="translate-answer" id="t-answer" style="display:none;">
            <div class="translate-answer-label">Câu dịch tham khảo:</div>
            <div class="translate-answer-text ${direction === "zh2vi" ? "vi" : "zh"}">${answerText}</div>
            <p class="translate-self-grade-q">Bản dịch của bạn đúng ý chưa?</p>
            <div class="flash-controls" style="justify-content:center;">
              <button class="btn ok" id="t-correct">✓ Đúng</button>
              <button class="btn err" id="t-wrong">✗ Chưa đúng</button>
            </div>
          </div>
        </div>
      </div>
    `;
    bindDirToggle();

    function revealAnswer() {
      document.getElementById("t-check").disabled = true;
      document.getElementById("t-answer").style.display = "";
      document.getElementById("t-input").disabled = true;
    }
    function next(correct, recordWrong) {
      if (correct) score++;
      else if (recordWrong && window.HSKAuth && HSKAuth.user && ctx) HSKAuth.recordWrongWord(q.hanzi, ctx.level);
      qi++;
      draw();
    }

    document.getElementById("t-check").addEventListener("click", revealAnswer);
    document.getElementById("t-skip").addEventListener("click", () => next(false, false));
    document.getElementById("t-correct").addEventListener("click", () => next(true, false));
    document.getElementById("t-wrong").addEventListener("click", () => next(false, true));
    document.getElementById("t-input").focus();
  }
  draw();
}

/* ---- Viết chữ (kiểm tra viết tay) mode — cho xem nghĩa tiếng Việt, yêu cầu
   thư viện HanziWriter (thư viện tự nhận diện nét vẽ đúng/sai theo dữ liệu
   nét chuẩn — không phải Claude tự chấm). Chỉ có ở HSK1-3 (đúng những cấp đã
   có dữ liệu nét bút cho tính năng "✏️ Cách viết"). */
function renderWriteQuizMode(body, words, ctx) {
  if (typeof HanziWriter === "undefined") {
    body.innerHTML = `<div class="empty-note">Không tải được thư viện luyện viết — hãy thử tải lại trang.</div>`;
    return;
  }
  const pool = words.filter(w => [...w.hanzi].some(ch => HANZI_RE.test(ch)));
  if (!pool.length) {
    body.innerHTML = `<div class="empty-note">Bài này chưa có từ nào để luyện viết.</div>`;
    return;
  }
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const questions = shuffled.slice(0, Math.min(10, shuffled.length));
  let qi = 0, score = 0;

  function draw() {
    if (qi >= questions.length) {
      if (window.HSKAuth && HSKAuth.user && ctx) {
        HSKAuth.recordAttempt({ level: ctx.level, unitKey: ctx.unitKey, unitLabel: ctx.unitLabel, mode: "write", score, total: questions.length });
      }
      body.innerHTML = `
        <div class="quiz-result-box">
          <div class="score-big">${score}/${questions.length}</div>
          <p>Bạn đã viết đúng ngay từ lần đầu ${score} trên ${questions.length} từ.</p>
          <button class="btn primary" id="w-retry">Làm lại</button>
        </div>`;
      document.getElementById("w-retry").addEventListener("click", () => renderWriteQuizMode(body, words, ctx));
      return;
    }
    const w = questions[qi];
    const m = meaningOf(w);
    const chars = [...w.hanzi].filter(ch => HANZI_RE.test(ch));
    let charsLeft = chars.length;
    let wordMistakes = 0;
    let finished = false;
    const writers = [];

    body.innerHTML = `
      <div class="quiz-progress" style="text-align:center;">Câu ${qi + 1} / ${questions.length} · Điểm: ${score}</div>
      <div class="write-quiz-card">
        <div class="write-quiz-mn">${m.text}</div>
        <div class="write-quiz-hint-row">
          <button class="btn btn-sm" id="w-hint-btn">💡 Gợi ý pinyin</button>
          <span class="write-quiz-hint-text" id="w-hint-text"></span>
          <button class="btn btn-sm" id="w-outline-btn">👁️ Hiện nét mờ</button>
        </div>
        <div class="write-quiz-targets">
          ${chars.map((ch, i) => `<div class="write-quiz-target" id="w-quiz-target-${i}"></div>`).join("")}
        </div>
        <div class="write-quiz-feedback" id="w-feedback">Viết từng chữ theo trí nhớ — quên nét thì bấm "Hiện nét mờ" để xem gợi ý.</div>
        <div class="flash-controls" style="justify-content:center; margin-top:14px;">
          <button class="btn" id="w-skip">Bỏ qua →</button>
        </div>
      </div>
    `;

    document.getElementById("w-hint-btn").addEventListener("click", () => {
      document.getElementById("w-hint-text").textContent = w.pinyin;
    });

    let outlineVisible = false;
    const outlineBtn = document.getElementById("w-outline-btn");
    outlineBtn.addEventListener("click", () => {
      outlineVisible = !outlineVisible;
      writers.forEach((wr) => {
        try { outlineVisible ? wr.showOutline() : wr.hideOutline(); } catch (e) {}
      });
      outlineBtn.textContent = outlineVisible ? "🙈 Ẩn nét mờ" : "👁️ Hiện nét mờ";
    });

    const feedback = document.getElementById("w-feedback");

    function finishWord(skipped) {
      if (finished) return;
      finished = true;
      writers.forEach((wr) => { try { wr.cancelQuiz(); } catch (e) {} });
      const correct = !skipped && wordMistakes === 0;
      if (correct) {
        score++;
      } else if (window.HSKAuth && HSKAuth.user && ctx) {
        HSKAuth.recordWrongWord(w.hanzi, ctx.level);
      }
      feedback.textContent = skipped
        ? `Đã bỏ qua — đáp án: ${w.hanzi}`
        : (correct ? "✓ Viết đúng ngay từ lần đầu!" : `✗ Có ${wordMistakes} nét viết sai — nhưng đã viết đúng ở lần cuối.`);
      feedback.className = "write-quiz-feedback " + (skipped ? "" : (correct ? "ok" : "err"));
      setTimeout(() => { qi++; draw(); }, 1300);
    }

    chars.forEach((ch, i) => {
      const writer = HanziWriter.create(`w-quiz-target-${i}`, ch, {
        width: 150, height: 150, padding: 6,
        showOutline: false,
        strokeColor: "#2b3a55",
        outlineColor: "#d8dee5",
        highlightColor: "#e2984a",
      });
      writers.push(writer);
      writer.quiz({
        onMistake: () => { wordMistakes++; },
        onComplete: () => {
          charsLeft--;
          if (charsLeft <= 0) finishWord(false);
        },
      });
    });

    document.getElementById("w-skip").addEventListener("click", () => finishWord(true));
  }
  draw();
}

/* ---------------- Grammar page ---------------- */

async function renderGrammar(app, id) {
  const info = levelInfo(id);
  const lessons = await fetchGrammarData(id);
  const totalPoints = lessons ? lessons.reduce((sum, l) => sum + l.points.length, 0) : 0;
  const groupLabel = info.grammarGroupLabel || "Bài";
  const groupNoun = groupLabel === "Nhóm" ? "nhóm" : "bài";

  app.innerHTML = `
    <div class="crumbs"><a href="#/">Trang chủ</a> / <a href="#/level/${id}">${info.label}</a> / Ngữ pháp</div>
    <div class="section-title"><h2>Ngữ pháp ${info.label}</h2></div>
    <p class="section-sub">${lessons ? `${totalPoints} điểm ngữ pháp · ${lessons.length} ${groupNoun}` : ""}</p>
    <div id="gram-body"></div>
  `;
  const gbody = document.getElementById("gram-body");

  if (!lessons) {
    gbody.innerHTML = `<div class="empty-note">Phần ngữ pháp cho ${info.label} đang được biên soạn, sẽ cập nhật sau.</div>`;
    return;
  }

  gbody.innerHTML = lessons.map(l => `
    <div class="gram-lesson">
      <h3 class="gram-lesson-title">${groupLabel} ${l.lesson}</h3>
      <div class="grammar-list">
        ${l.points.map(p => `
          <div class="gram-card">
            <h4 class="gram-name">${p.hanzi}${p.pinyin ? ` <span class="gram-py">(${p.pinyin})</span>` : ""}</h4>
            ${p.vi ? `<div class="gram-vi">${p.vi}</div>` : ""}
            ${p.structure ? `<div class="gram-struct">${p.structure}</div>` : ""}
            ${p.examples.map(ex => `
              <div class="gram-ex">
                <div class="zh">${ex.zh}</div>
                ${ex.py ? `<div class="py">${ex.py}</div>` : ""}
                ${ex.vi ? `<div class="vi">${ex.vi}</div>` : ""}
              </div>
            `).join("")}
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");
}

/* ---------------- Đăng nhập / đăng ký / trang giáo viên ---------------- */

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function authNotConfiguredNote() {
  return `<div class="empty-note">
    Tính năng đăng nhập / theo dõi tiến độ chưa được bật.<br>
    Chủ trang cần làm theo hướng dẫn trong file <code>FIREBASE_SETUP.md</code> đi kèm để bật (miễn phí, khoảng 10 phút).
  </div>`;
}

async function renderLogin(app) {
  if (!window.HSKAuth || !HSKAuth.isConfigured) { app.innerHTML = authNotConfiguredNote(); return; }
  await HSKAuth.ready;
  if (HSKAuth.user) {
    app.innerHTML = `<div class="empty-note">Bạn đã đăng nhập rồi. <a href="#/">Về trang chủ</a></div>`;
    return;
  }
  app.innerHTML = `
    <div class="auth-page">
      <h2>Đăng nhập</h2>
      <form id="login-form" class="auth-form">
        <label>Email<input type="email" name="email" required autocomplete="email"></label>
        <label>Mật khẩu<input type="password" name="password" required autocomplete="current-password"></label>
        <div id="login-err" class="auth-err"></div>
        <button class="btn primary" type="submit">Đăng nhập</button>
      </form>
      <p class="auth-links">
        <a href="#" id="reset-pw-link">Quên mật khẩu?</a>
      </p>
      <p class="auth-note-small">Chưa có tài khoản? Tài khoản học viên do giáo viên tạo sẵn — liên hệ giáo viên phụ trách để được cấp.</p>
    </div>
  `;
  const form = document.getElementById("login-form");
  const errBox = document.getElementById("login-err");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errBox.className = "auth-err";
    errBox.textContent = "";
    const fd = new FormData(form);
    try {
      await HSKAuth.logIn(fd.get("email"), fd.get("password"));
      location.hash = "#/";
    } catch (err) {
      errBox.textContent = HSKAuth.friendlyError(err);
    }
  });
  document.getElementById("reset-pw-link").addEventListener("click", async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    if (!email) { errBox.textContent = 'Nhập email trước, rồi bấm lại "Quên mật khẩu?".'; return; }
    try {
      await HSKAuth.resetPassword(email);
      errBox.className = "auth-err ok";
      errBox.textContent = "Đã gửi email đặt lại mật khẩu — kiểm tra hộp thư của bạn.";
    } catch (err) {
      errBox.className = "auth-err";
      errBox.textContent = HSKAuth.friendlyError(err);
    }
  });
}

async function renderSignup(app) {
  // Không còn đường tự đăng ký công khai — chỉ giáo viên mới tạo được tài
  // khoản học viên (từ Trang giáo viên), để đảm bảo mỗi học viên luôn được
  // gán sẵn vào đúng lớp/trình độ ngay từ khi có tài khoản.
  app.innerHTML = `<div class="empty-note">
    Trang này không còn được dùng để tự đăng ký.<br>
    Tài khoản học viên do <b>giáo viên</b> tạo sẵn (kèm phân lớp) — vui lòng liên hệ giáo viên phụ trách để được cấp tài khoản.<br><br>
    Đã có tài khoản? <a href="#/login">Đăng nhập tại đây</a>.
  </div>`;
}

let teacherFlash = null; // thông báo ngắn hạn hiển thị lại sau khi trang giáo viên tự tải lại

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function renderTeacherPage(app) {
  if (!window.HSKAuth || !HSKAuth.isConfigured) { app.innerHTML = authNotConfiguredNote(); return; }
  await HSKAuth.ready;
  if (!HSKAuth.user) {
    app.innerHTML = `<div class="empty-note">Bạn cần <a href="#/login">đăng nhập</a> để xem trang này.</div>`;
    return;
  }
  if (!HSKAuth.profile || HSKAuth.profile.role !== "teacher") {
    app.innerHTML = `<div class="empty-note">Tài khoản này chưa có quyền giáo viên.<br>Xem hướng dẫn nâng quyền trong file <code>FIREBASE_SETUP.md</code>.</div>`;
    return;
  }

  app.innerHTML = `<div class="section-title"><h2>📊 Trang giáo viên</h2></div>
    <p class="section-sub">Đang tải dữ liệu...</p>`;

  let students, classes;
  try {
    [students, classes] = await Promise.all([HSKAuth.fetchAllStudents(), HSKAuth.fetchClasses()]);
  } catch (err) {
    app.innerHTML = `<p class="empty-note">Không tải được dữ liệu: ${HSKAuth.friendlyError(err)}</p>`;
    return;
  }

  const flash = teacherFlash;
  teacherFlash = null;

  app.innerHTML = `
    <div class="section-title"><h2>📊 Trang giáo viên</h2></div>
    <p class="section-sub">Quản lý lớp học, tạo tài khoản học viên (đã gán sẵn trình độ), và theo dõi tiến độ ôn tập.</p>
    ${flash ? `<div class="auth-err ok flash-note">${flash}</div>` : ""}

    <div class="teacher-panels">
      <div class="teacher-panel">
        <h3>➕ Tạo lớp mới</h3>
        <form id="class-form" class="inline-form">
          <input type="text" name="name" placeholder="Tên lớp, ví dụ: HSK1 - Tối 2/4/6" required>
          <select name="level" required>${LEVELS.map(l => `<option value="${l.id}">${l.label}</option>`).join("")}</select>
          <button class="btn primary" type="submit">Tạo lớp</button>
        </form>
        <div id="class-err" class="auth-err"></div>
        ${classes.length === 0 ? `<p class="section-sub" style="margin-top:10px;">Chưa có lớp nào — tạo lớp trước khi thêm học viên.</p>` : ""}
      </div>

      <div class="teacher-panel">
        <h3>➕ Tạo tài khoản học viên</h3>
        ${classes.length === 0 ? `<p class="section-sub">Hãy tạo ít nhất một lớp ở khung bên trái trước.</p>` : `
        <form id="student-form" class="inline-form">
          <input type="text" name="name" placeholder="Họ tên học viên" required>
          <input type="email" name="email" placeholder="Email học viên" required>
          <input type="text" name="password" placeholder="Mật khẩu tạm (bỏ trống để tự sinh)">
          <div class="class-checkbox-group">
            <div class="class-checkbox-label">Lớp (được chọn nhiều lớp cùng lúc):</div>
            ${classes.map(c => `
              <label class="class-checkbox-item">
                <input type="checkbox" name="classId" value="${c.id}">
                ${escapeHtml(c.name)} — ${(levelInfo(c.level) || {}).label || c.level}
              </label>
            `).join("")}
          </div>
          <button class="btn primary" type="submit">Tạo tài khoản</button>
        </form>
        <div id="student-err" class="auth-err"></div>
        `}
      </div>
    </div>

    <div class="section-title" style="margin-top:8px;"><h3>📚 Danh sách lớp</h3></div>
    <p class="section-sub">Chọn một trình độ để xem các lớp thuộc trình độ đó.</p>
    <div id="teacher-level-grid"></div>

    <div class="section-title" style="margin-top:28px;"><h3>👥 Danh sách học viên</h3></div>
    <div id="teacher-table-container"></div>
  `;

  const refresh = () => renderTeacherPage(app);

  renderTeacherLevelGrid(document.getElementById("teacher-level-grid"), classes, students);
  renderStudentTable(document.getElementById("teacher-table-container"), students, classes, refresh);

  const classForm = document.getElementById("class-form");
  if (classForm) {
    const err = document.getElementById("class-err");
    classForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.textContent = "";
      const fd = new FormData(classForm);
      const name = (fd.get("name") || "").trim();
      try {
        await HSKAuth.createClass(name, fd.get("level"));
        teacherFlash = `Đã tạo lớp "${escapeHtml(name)}".`;
        await renderTeacherPage(app);
      } catch (ex) {
        err.textContent = HSKAuth.friendlyError(ex);
      }
    });
  }

  const studentForm = document.getElementById("student-form");
  if (studentForm) {
    const err = document.getElementById("student-err");
    studentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.textContent = "";
      const fd = new FormData(studentForm);
      const name = (fd.get("name") || "").trim();
      const email = (fd.get("email") || "").trim();
      let password = (fd.get("password") || "").trim();
      if (!password) password = randomPassword();
      if (password.length < 6) { err.textContent = "Mật khẩu cần ít nhất 6 ký tự."; return; }
      const checkedIds = [...studentForm.querySelectorAll('input[name="classId"]:checked')].map((el) => el.value);
      const selectedClasses = checkedIds.map((id) => classes.find((c) => c.id === id)).filter(Boolean)
        .map((c) => ({ classId: c.id, name: c.name, level: c.level }));
      if (!selectedClasses.length) { err.textContent = "Hãy chọn ít nhất một lớp."; return; }
      const submitBtn = studentForm.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      try {
        await HSKAuth.createStudentAccount({ name, email, password, classes: selectedClasses });
        teacherFlash = `Đã tạo tài khoản cho <b>${escapeHtml(name)}</b> — Email: <b>${escapeHtml(email)}</b> · Mật khẩu tạm: <b>${escapeHtml(password)}</b>. Hãy gửi thông tin này cho học viên (học viên có thể tự đổi mật khẩu bằng "Quên mật khẩu?" ở trang đăng nhập).`;
        await renderTeacherPage(app);
      } catch (ex) {
        err.textContent = HSKAuth.friendlyError(ex);
        submitBtn.disabled = false;
      }
    });
  }
}

function dateKey(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* Tổng hợp điểm/tiến độ của tất cả học viên thuộc một lớp — dùng cho cả
   bảng danh sách lớp (tổng quan) và trang chi tiết lớp. */
function classAggStats(students, classId) {
  const inClass = students.filter((s) => Array.isArray(s.classIds) && s.classIds.includes(classId));
  let quizC = 0, quizQ = 0, fillC = 0, fillQ = 0, clozeC = 0, clozeQ = 0, writeC = 0, writeQ = 0, advfillC = 0, advfillQ = 0;
  inClass.forEach((s) => {
    const st = (s.classStats && s.classStats[classId]) || {};
    quizC += st.quizCorrectTotal || 0; quizQ += st.quizQuestionsTotal || 0;
    fillC += st.fillCorrectTotal || 0; fillQ += st.fillQuestionsTotal || 0;
    clozeC += st.clozeCorrectTotal || 0; clozeQ += st.clozeQuestionsTotal || 0;
    writeC += st.writeCorrectTotal || 0; writeQ += st.writeQuestionsTotal || 0;
    advfillC += st.advfillCorrectTotal || 0; advfillQ += st.advfillQuestionsTotal || 0;
  });
  return {
    count: inClass.length,
    quizAvg: quizQ ? Math.round((100 * quizC) / quizQ) : null,
    fillAvg: fillQ ? Math.round((100 * fillC) / fillQ) : null,
    clozeAvg: clozeQ ? Math.round((100 * clozeC) / clozeQ) : null,
    writeAvg: writeQ ? Math.round((100 * writeC) / writeQ) : null,
    advfillAvg: advfillQ ? Math.round((100 * advfillC) / advfillQ) : null,
  };
}

/* Lưới thẻ trình độ HSK trong trang giáo viên — bấm vào 1 thẻ để xem danh
   sách lớp thuộc đúng trình độ đó, thay vì dồn hết mọi lớp (mọi trình độ)
   vào một bảng dài, dễ rối khi có nhiều trình độ/nhiều lớp. */
function renderTeacherLevelGrid(container, classes, students) {
  if (!classes.length) {
    container.innerHTML = `<p class="empty-note">Chưa có lớp nào — tạo lớp ở khung bên trên trước.</p>`;
    return;
  }
  container.innerHTML = `
    <div class="level-grid teacher-level-grid">
      ${LEVELS.map((l) => {
        const levelClasses = classes.filter((c) => c.level === l.id);
        const classIds = new Set(levelClasses.map((c) => c.id));
        const studentCount = students.filter((s) =>
          Array.isArray(s.classIds) && s.classIds.some((cid) => classIds.has(cid))
        ).length;
        const inner = `
          <div class="lc-top"><span class="badge">${l.label}</span></div>
          <h3>${l.label}</h3>
          <p>${levelClasses.length} lớp · ${studentCount} học viên</p>
        `;
        return levelClasses.length
          ? `<a class="level-card" href="#/teacher/level/${l.id}">${inner}</a>`
          : `<div class="level-card locked" title="Chưa có lớp nào ở trình độ này">${inner}</div>`;
      }).join("")}
    </div>
  `;
}

/* Trang "Danh sách lớp" của MỘT trình độ — chỉ hiện các lớp thuộc trình độ
   đó; bấm vào 1 lớp vẫn dẫn tới trang chi tiết lớp như cũ (#/teacher/class/:id). */
async function renderTeacherLevelPage(app, levelId) {
  if (!window.HSKAuth || !HSKAuth.isConfigured) { app.innerHTML = authNotConfiguredNote(); return; }
  await HSKAuth.ready;
  if (!HSKAuth.user) {
    app.innerHTML = `<div class="empty-note">Bạn cần <a href="#/login">đăng nhập</a> để xem trang này.</div>`;
    return;
  }
  if (!HSKAuth.profile || HSKAuth.profile.role !== "teacher") {
    app.innerHTML = `<div class="empty-note">Tài khoản này chưa có quyền giáo viên.</div>`;
    return;
  }
  const info = levelInfo(levelId);
  if (!info) { app.innerHTML = `<p class="empty-note">Trình độ không tồn tại.</p>`; return; }

  app.innerHTML = `<p class="section-sub">Đang tải dữ liệu...</p>`;

  let students, classes;
  try {
    [students, classes] = await Promise.all([HSKAuth.fetchAllStudents(), HSKAuth.fetchClasses()]);
  } catch (err) {
    app.innerHTML = `<p class="empty-note">Không tải được dữ liệu: ${HSKAuth.friendlyError(err)}</p>`;
    return;
  }

  const levelClasses = classes.filter((c) => c.level === levelId);

  app.innerHTML = `
    <div class="crumbs"><a href="#/teacher">📊 Trang giáo viên</a> / ${info.label}</div>
    <div class="section-title"><h2>Danh sách lớp — ${info.label}</h2></div>
    <p class="section-sub">${levelClasses.length} lớp</p>
    <div id="teacher-level-class-table"></div>
  `;

  renderClassTable(
    document.getElementById("teacher-level-class-table"),
    levelClasses,
    students,
    () => renderTeacherLevelPage(app, levelId)
  );
}

/* onRefresh: hàm async gọi lại sau khi sửa/xóa lớp thành công, để tải lại
   toàn bộ trang (danh sách lớp + học viên đều có thể bị ảnh hưởng). */
function renderClassTable(container, classes, students, onRefresh) {
  container.innerHTML = `
    ${classes.length === 0 ? `<p class="empty-note">Chưa có lớp nào.</p>` : `
    <div class="teacher-table-wrap">
      <table class="teacher-table">
        <thead><tr>
          <th>Tên lớp</th><th>Trình độ</th><th>Số học viên</th>
          <th>Điểm TB trắc nghiệm</th><th>Điểm TB điền pinyin</th><th>Điểm TB điền từ</th><th>Điểm TB điền từ nâng cao</th><th>Điểm TB viết chữ</th><th>Thao tác</th>
        </tr></thead>
        <tbody>
          ${classes.map((c) => {
            const agg = classAggStats(students, c.id);
            return `
            <tr data-class-id="${c.id}">
              <td class="class-name-cell">
                <span class="class-name-display">${escapeHtml(c.name)}</span>
                <div class="class-edit-form" hidden>
                  <input type="text" class="class-edit-name" value="${escapeHtml(c.name)}">
                  <select class="class-edit-level">
                    ${LEVELS.map(l => `<option value="${l.id}" ${l.id === c.level ? "selected" : ""}>${l.label}</option>`).join("")}
                  </select>
                  <div class="class-edit-actions">
                    <button class="btn primary btn-sm class-save-btn">💾 Lưu</button>
                    <button class="btn btn-sm class-cancel-btn">✕ Hủy</button>
                  </div>
                  <div class="class-edit-err auth-err"></div>
                </div>
              </td>
              <td class="class-level-display">${(levelInfo(c.level) || {}).label || c.level}</td>
              <td>${agg.count} học viên</td>
              <td>${agg.quizAvg === null ? "—" : agg.quizAvg + "%"}</td>
              <td>${agg.fillAvg === null ? "—" : agg.fillAvg + "%"}</td>
              <td>${agg.clozeAvg === null ? "—" : agg.clozeAvg + "%"}</td>
              <td>${agg.advfillAvg === null ? "—" : agg.advfillAvg + "%"}</td>
              <td>${agg.writeAvg === null ? "—" : agg.writeAvg + "%"}</td>
              <td class="row-actions">
                <a class="btn btn-sm" href="#/teacher/class/${c.id}">Xem chi tiết →</a>
                <button class="btn btn-sm class-edit-btn">✏️ Sửa</button>
                <button class="btn btn-sm danger class-delete-btn">🗑 Xóa</button>
              </td>
            </tr>
          `;
          }).join("")}
        </tbody>
      </table>
    </div>`}
  `;

  container.querySelectorAll("tr[data-class-id]").forEach((row) => {
    const classId = row.dataset.classId;
    const cls = classes.find((c) => c.id === classId);
    const nameDisplay = row.querySelector(".class-name-display");
    const editForm = row.querySelector(".class-edit-form");
    const editErr = row.querySelector(".class-edit-err");

    row.querySelector(".class-edit-btn").addEventListener("click", () => {
      nameDisplay.hidden = true;
      editForm.hidden = false;
    });
    row.querySelector(".class-cancel-btn").addEventListener("click", () => {
      editForm.hidden = true;
      nameDisplay.hidden = false;
      editErr.textContent = "";
    });
    row.querySelector(".class-save-btn").addEventListener("click", async () => {
      const newName = row.querySelector(".class-edit-name").value.trim();
      const newLevel = row.querySelector(".class-edit-level").value;
      if (!newName) { editErr.textContent = "Tên lớp không được để trống."; return; }
      const btn = row.querySelector(".class-save-btn");
      btn.disabled = true;
      editErr.textContent = "";
      try {
        await HSKAuth.updateClass(classId, { name: newName, level: newLevel });
        await onRefresh();
      } catch (ex) {
        editErr.textContent = HSKAuth.friendlyError(ex);
        btn.disabled = false;
      }
    });
    row.querySelector(".class-delete-btn").addEventListener("click", async () => {
      if (!confirm(`Xóa lớp "${cls ? cls.name : ""}"? Thao tác này không thể hoàn tác.`)) return;
      const btn = row.querySelector(".class-delete-btn");
      btn.disabled = true;
      try {
        await HSKAuth.deleteClass(classId);
        await onRefresh();
      } catch (ex) {
        alert(HSKAuth.friendlyError(ex));
        btn.disabled = false;
      }
    });
  });
}

/* Gộp classStats của một học viên lại thành 1 bộ số liệu để hiển thị.
   - scopedClassId có giá trị (đang xem trang chi tiết MỘT lớp): chỉ lấy số
     liệu của đúng lớp đó.
   - scopedClassId để trống (đang xem danh sách TOÀN BỘ học viên): cộng dồn
     số liệu của TẤT CẢ các lớp học viên đang thuộc, để vẫn có một con số
     tổng quan (tiến độ ôn tập được lưu tách riêng theo từng lớp ở tầng dữ
     liệu — classStats.{classId} — nhưng khi xem "mọi học viên" thì gộp lại
     cho dễ nhìn). */
function mergedStatsForStudent(s, scopedClassId) {
  const classStats = s.classStats || {};
  const buckets = scopedClassId ? [classStats[scopedClassId] || {}] : Object.values(classStats);
  const merged = {
    quizCorrectTotal: 0, quizQuestionsTotal: 0, fillCorrectTotal: 0, fillQuestionsTotal: 0,
    clozeCorrectTotal: 0, clozeQuestionsTotal: 0, writeCorrectTotal: 0, writeQuestionsTotal: 0,
    advfillCorrectTotal: 0, advfillQuestionsTotal: 0,
    viewedUnitKeys: [], wrongWords: {}, studyDays: {},
  };
  buckets.forEach((b) => {
    merged.quizCorrectTotal += b.quizCorrectTotal || 0;
    merged.quizQuestionsTotal += b.quizQuestionsTotal || 0;
    merged.fillCorrectTotal += b.fillCorrectTotal || 0;
    merged.fillQuestionsTotal += b.fillQuestionsTotal || 0;
    merged.clozeCorrectTotal += b.clozeCorrectTotal || 0;
    merged.clozeQuestionsTotal += b.clozeQuestionsTotal || 0;
    merged.writeCorrectTotal += b.writeCorrectTotal || 0;
    merged.writeQuestionsTotal += b.writeQuestionsTotal || 0;
    merged.advfillCorrectTotal += b.advfillCorrectTotal || 0;
    merged.advfillQuestionsTotal += b.advfillQuestionsTotal || 0;
    merged.viewedUnitKeys.push(...(b.viewedUnitKeys || []));
    Object.entries(b.wrongWords || {}).forEach(([w, c]) => { merged.wrongWords[w] = (merged.wrongWords[w] || 0) + c; });
    Object.entries(b.studyDays || {}).forEach(([d, m]) => { merged.studyDays[d] = (merged.studyDays[d] || 0) + m; });
  });
  merged.viewedUnitKeys = [...new Set(merged.viewedUnitKeys)];
  return merged;
}

/* Gom điểm theo từng BÀI HỌC (không theo classStats.scores.{mode}_{level_unitKey}
   phẳng) — mỗi bài học ra 1 dòng gồm cả 3 cột trắc nghiệm/điền pinyin/điền từ,
   để xem "học viên A làm bài 1 HSK1 được bao nhiêu điểm mỗi chế độ" trong 1
   bảng duy nhất. Dùng cho cả trang chi tiết học viên (giáo viên xem) và trang
   "Tiến độ của tôi" (học viên tự xem). */
/* Dữ liệu cũ (trước khi đổi sang lưu lịch sử) lưu MỘT object điểm duy nhất
   (lần gần nhất, bị ghi đè mỗi lần làm lại) thay vì một mảng. Chuẩn hoá về
   dạng mảng để mã hiển thị dùng chung một kiểu dữ liệu, coi bản ghi cũ đó là
   "1 lần làm" (không có lịch sử đầy đủ hơn vì dữ liệu cũ không lưu). */
function normalizeAttempts(val) {
  if (!val) return [];
  const list = Array.isArray(val) ? val : [val];
  return list.map((a) => ({
    score: a.score, total: a.total,
    ts: a.ts && a.ts.toDate ? a.ts.toDate() : (a.ts instanceof Date ? a.ts : null),
  })).sort((a, b) => (a.ts ? a.ts.getTime() : 0) - (b.ts ? b.ts.getTime() : 0));
}

function unitBreakdownRows(bucket) {
  const scores = (bucket && bucket.scores) || {};
  const labels = (bucket && bucket.unitLabels) || {};
  const rows = {};
  Object.entries(scores).forEach(([fullKey, val]) => {
    const sep = fullKey.indexOf("_");
    if (sep < 0) return;
    const mode = fullKey.slice(0, sep);
    const key = fullKey.slice(sep + 1);
    if (!rows[key]) rows[key] = { key, label: labels[key] || key, quiz: [], fill: [], cloze: [], write: [], advfill: [], lastTs: null };
    if (mode === "quiz" || mode === "fill" || mode === "cloze" || mode === "write" || mode === "advfill") {
      const attempts = normalizeAttempts(val);
      rows[key][mode] = attempts;
      attempts.forEach((a) => { if (a.ts && (!rows[key].lastTs || a.ts > rows[key].lastTs)) rows[key].lastTs = a.ts; });
    }
  });
  return Object.values(rows).sort((a, b) => (b.lastTs ? b.lastTs.getTime() : 0) - (a.lastTs ? a.lastTs.getTime() : 0));
}

/* attempts: mảng {score,total,ts} theo THỨ TỰ THỜI GIAN (cũ→mới) — hiện đủ
   "làm mấy lần, điểm từng lần" thay vì chỉ điểm lần gần nhất. */
function scoreCell(attempts) {
  if (!attempts || !attempts.length) return "—";
  const list = attempts.map((a) => {
    const pct = a.total ? Math.round((100 * a.score) / a.total) : 0;
    return `${a.score}/${a.total} (${pct}%)`;
  });
  return `<div class="attempt-count">${attempts.length} lần</div><div class="attempt-list">${escapeHtml(list.join(", "))}</div>`;
}

function unitBreakdownTableHtml(bucket) {
  const rows = unitBreakdownRows(bucket);
  if (!rows.length) return `<p class="empty-note" style="padding:16px;">Chưa có bài nào được làm.</p>`;
  return `
    <div class="teacher-table-wrap">
      <table class="teacher-table">
        <thead><tr>
          <th>Bài học</th><th>Trắc nghiệm</th><th>Điền pinyin</th><th>Điền từ</th><th>Điền từ nâng cao</th><th>Viết chữ</th><th>Lần làm gần nhất</th>
        </tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td>${escapeHtml(r.label)}</td>
              <td>${scoreCell(r.quiz)}</td>
              <td>${scoreCell(r.fill)}</td>
              <td>${scoreCell(r.cloze)}</td>
              <td>${scoreCell(r.advfill)}</td>
              <td>${scoreCell(r.write)}</td>
              <td>${r.lastTs ? r.lastTs.toLocaleString("vi-VN") : "—"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

/* onRefresh: hàm async gọi lại sau khi sửa tên/xóa học viên hoặc đổi lớp
   thành công. Trang giáo viên và trang chi tiết lớp cùng dùng hàm này, mỗi
   trang truyền vào cách tự tải lại của mình. scopedClassId: truyền vào khi
   gọi từ trang chi tiết MỘT lớp, để các cột điểm/hoạt động chỉ tính riêng
   cho lớp đó thay vì gộp tất cả các lớp của học viên. */
function renderStudentTable(container, students, classes, onRefresh, scopedClassId) {
  const todayK = dateKey(0);

  const rows = students.map((s) => {
    const stats = mergedStatsForStudent(s, scopedClassId);
    const viewedCount = stats.viewedUnitKeys.length;
    const quizAvg = stats.quizQuestionsTotal ? Math.round((100 * stats.quizCorrectTotal) / stats.quizQuestionsTotal) : null;
    const fillAvg = stats.fillQuestionsTotal ? Math.round((100 * stats.fillCorrectTotal) / stats.fillQuestionsTotal) : null;
    const clozeAvg = stats.clozeQuestionsTotal ? Math.round((100 * stats.clozeCorrectTotal) / stats.clozeQuestionsTotal) : null;
    const writeAvg = stats.writeQuestionsTotal ? Math.round((100 * stats.writeCorrectTotal) / stats.writeQuestionsTotal) : null;
    const advfillAvg = stats.advfillQuestionsTotal ? Math.round((100 * stats.advfillCorrectTotal) / stats.advfillQuestionsTotal) : null;
    const wrongEntries = Object.entries(stats.wrongWords).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const minsToday = stats.studyDays[todayK] || 0;
    let minsWeek = 0;
    for (let i = 0; i < 7; i++) minsWeek += stats.studyDays[dateKey(i)] || 0;
    const lastActive = s.lastActiveTs && s.lastActiveTs.toDate ? s.lastActiveTs.toDate() : null;
    return { s, viewedCount, quizAvg, fillAvg, clozeAvg, writeAvg, advfillAvg, wrongEntries, minsToday, minsWeek, lastActive };
  }).sort((a, b) => (b.lastActive ? b.lastActive.getTime() : 0) - (a.lastActive ? a.lastActive.getTime() : 0));

  container.innerHTML = `
    <p class="section-sub">${students.length} học viên đã có tài khoản · dữ liệu cập nhật theo thời gian thực từ Firestore${scopedClassId ? " · điểm/hoạt động chỉ tính riêng cho lớp này" : " · điểm/hoạt động là tổng của tất cả các lớp học viên đang tham gia"} · bấm vào tên học viên để xem chi tiết từng lần làm bài</p>
    ${students.length === 0 ? `<p class="empty-note">Chưa có học viên nào. Hãy tạo tài khoản ở khung phía trên.</p>` : `
    <div class="teacher-table-wrap">
      <table class="teacher-table">
        <thead><tr>
          <th>Học viên</th><th>Lớp</th><th>Hoạt động gần nhất</th><th>Bài đã ôn</th>
          <th>Điểm TB trắc nghiệm</th><th>Điểm TB điền pinyin</th><th>Điểm TB điền từ</th><th>Điểm TB điền từ nâng cao</th><th>Điểm TB viết chữ</th>
          <th>Từ hay sai</th><th>Học hôm nay</th><th>Học 7 ngày qua</th><th>Thao tác</th>
        </tr></thead>
        <tbody>
          ${rows.map((r) => {
            const myClasses = r.s.classes || [];
            const myClassIds = r.s.classIds || [];
            return `
            <tr data-uid="${r.s.uid}">
              <td>
                <a href="#/teacher/student/${r.s.uid}" class="student-name-display" title="Xem chi tiết học viên này">${escapeHtml(r.s.name || "(chưa đặt tên)")}</a>
                <input type="text" class="student-name-edit" value="${escapeHtml(r.s.name || "")}" hidden>
                <br><span class="tt-sub">${escapeHtml(r.s.email || "")}</span>
                <div class="student-edit-err auth-err"></div>
              </td>
              <td class="class-cell">
                <div class="student-class-display">
                  ${myClasses.length ? myClasses.map((c) => `<span class="class-tag">${escapeHtml(c.name)}</span>`).join(" ") : `<span class="tt-sub">— chưa có lớp —</span>`}
                  <button class="btn btn-sm student-class-edit-btn">✏️ Sửa lớp</button>
                </div>
                <div class="student-class-edit" hidden>
                  ${classes.map((c) => `
                    <label class="class-checkbox-item">
                      <input type="checkbox" class="student-class-checkbox" value="${c.id}" ${myClassIds.includes(c.id) ? "checked" : ""}>
                      ${escapeHtml(c.name)} — ${(levelInfo(c.level) || {}).label || c.level}
                    </label>
                  `).join("")}
                  <div class="class-edit-actions">
                    <button class="btn primary btn-sm student-class-save-btn">💾 Lưu</button>
                    <button class="btn btn-sm student-class-cancel-btn">✕ Hủy</button>
                  </div>
                  <div class="student-class-err auth-err"></div>
                </div>
              </td>
              <td>${r.lastActive ? r.lastActive.toLocaleString("vi-VN") : "chưa hoạt động"}</td>
              <td>${r.viewedCount} bài</td>
              <td>${r.quizAvg === null ? "—" : r.quizAvg + "%"}</td>
              <td>${r.fillAvg === null ? "—" : r.fillAvg + "%"}</td>
              <td>${r.clozeAvg === null ? "—" : r.clozeAvg + "%"}</td>
              <td>${r.advfillAvg === null ? "—" : r.advfillAvg + "%"}</td>
              <td>${r.writeAvg === null ? "—" : r.writeAvg + "%"}</td>
              <td>${r.wrongEntries.length ? escapeHtml(r.wrongEntries.map(([w, c]) => `${w} (${c})`).join(", ")) : "—"}</td>
              <td>${r.minsToday.toFixed(1)} phút</td>
              <td>${r.minsWeek.toFixed(1)} phút</td>
              <td class="row-actions">
                <a class="btn btn-sm" href="#/teacher/student/${r.s.uid}">📖 Chi tiết</a>
                <button class="btn btn-sm student-edit-btn">✏️ Sửa tên</button>
                <button class="btn primary btn-sm student-save-btn" hidden>💾 Lưu</button>
                <button class="btn btn-sm student-cancel-btn" hidden>✕ Hủy</button>
                <button class="btn btn-sm danger student-delete-btn">🗑 Xóa</button>
              </td>
            </tr>
          `;
          }).join("")}
        </tbody>
      </table>
    </div>`}
  `;

  container.querySelectorAll("tr[data-uid]").forEach((row) => {
    const uid = row.dataset.uid;
    const nameDisplay = row.querySelector(".student-name-display");
    const nameEdit = row.querySelector(".student-name-edit");
    const editErr = row.querySelector(".student-edit-err");
    const editBtn = row.querySelector(".student-edit-btn");
    const saveBtn = row.querySelector(".student-save-btn");
    const cancelBtn = row.querySelector(".student-cancel-btn");
    const deleteBtn = row.querySelector(".student-delete-btn");

    editBtn.addEventListener("click", () => {
      nameDisplay.hidden = true; nameEdit.hidden = false;
      editBtn.hidden = true; deleteBtn.hidden = true;
      saveBtn.hidden = false; cancelBtn.hidden = false;
      nameEdit.focus();
    });
    cancelBtn.addEventListener("click", () => {
      nameEdit.value = nameDisplay.textContent;
      nameDisplay.hidden = false; nameEdit.hidden = true;
      editBtn.hidden = false; deleteBtn.hidden = false;
      saveBtn.hidden = true; cancelBtn.hidden = true;
      editErr.textContent = "";
    });
    saveBtn.addEventListener("click", async () => {
      const newName = nameEdit.value.trim();
      if (!newName) { editErr.textContent = "Tên không được để trống."; return; }
      saveBtn.disabled = true;
      editErr.textContent = "";
      try {
        await HSKAuth.updateStudent(uid, { name: newName });
        await onRefresh();
      } catch (ex) {
        editErr.textContent = HSKAuth.friendlyError(ex);
        saveBtn.disabled = false;
      }
    });
    deleteBtn.addEventListener("click", async () => {
      const name = nameDisplay.textContent;
      if (!confirm(`Xóa hồ sơ học viên "${name}"? Học viên sẽ không đăng nhập/xem được nội dung nữa. Thao tác này không thể hoàn tác.`)) return;
      deleteBtn.disabled = true;
      try {
        await HSKAuth.deleteStudent(uid);
        await onRefresh();
      } catch (ex) {
        alert(HSKAuth.friendlyError(ex));
        deleteBtn.disabled = false;
      }
    });

    const classDisplay = row.querySelector(".student-class-display");
    const classEdit = row.querySelector(".student-class-edit");
    const classEditErr = row.querySelector(".student-class-err");
    const classEditBtn = row.querySelector(".student-class-edit-btn");
    const classSaveBtn = row.querySelector(".student-class-save-btn");
    const classCancelBtn = row.querySelector(".student-class-cancel-btn");
    const classCheckboxes = () => [...row.querySelectorAll(".student-class-checkbox")];

    classEditBtn.addEventListener("click", () => {
      classDisplay.hidden = true;
      classEdit.hidden = false;
    });
    classCancelBtn.addEventListener("click", () => {
      // defaultChecked phản ánh đúng thuộc tính "checked" lúc dựng HTML ban
      // đầu (danh sách lớp gốc của học viên), không đổi theo thao tác click
      // của người dùng — dùng để khôi phục lại trạng thái khi bấm Hủy.
      classCheckboxes().forEach((cb) => { cb.checked = cb.defaultChecked; });
      classEdit.hidden = true;
      classDisplay.hidden = false;
      classEditErr.textContent = "";
    });
    classSaveBtn.addEventListener("click", async () => {
      const checkedIds = classCheckboxes().filter((cb) => cb.checked).map((cb) => cb.value);
      const selectedClasses = checkedIds.map((id) => classes.find((c) => c.id === id)).filter(Boolean)
        .map((c) => ({ classId: c.id, name: c.name, level: c.level }));
      classSaveBtn.disabled = true;
      classEditErr.textContent = "";
      try {
        await HSKAuth.setStudentClasses(uid, selectedClasses);
        await onRefresh();
      } catch (ex) {
        classEditErr.textContent = HSKAuth.friendlyError(ex);
        classSaveBtn.disabled = false;
      }
    });
  });
}

/* ---------------- Trang chi tiết một lớp (theo dõi riêng từng lớp) ---------------- */
async function renderClassDetailPage(app, classId) {
  if (!window.HSKAuth || !HSKAuth.isConfigured) { app.innerHTML = authNotConfiguredNote(); return; }
  await HSKAuth.ready;
  if (!HSKAuth.user) {
    app.innerHTML = `<div class="empty-note">Bạn cần <a href="#/login">đăng nhập</a> để xem trang này.</div>`;
    return;
  }
  if (!HSKAuth.profile || HSKAuth.profile.role !== "teacher") {
    app.innerHTML = `<div class="empty-note">Tài khoản này chưa có quyền giáo viên.</div>`;
    return;
  }

  app.innerHTML = `<p class="section-sub">Đang tải dữ liệu...</p>`;

  let students, classes;
  try {
    [students, classes] = await Promise.all([HSKAuth.fetchAllStudents(), HSKAuth.fetchClasses()]);
  } catch (err) {
    app.innerHTML = `<p class="empty-note">Không tải được dữ liệu: ${HSKAuth.friendlyError(err)}</p>`;
    return;
  }

  const cls = classes.find((c) => c.id === classId);
  if (!cls) {
    app.innerHTML = `<div class="empty-note">Không tìm thấy lớp này (có thể đã bị xóa).<br><a href="#/teacher">← Về trang giáo viên</a></div>`;
    return;
  }

  const classStudents = students.filter((s) => Array.isArray(s.classIds) && s.classIds.includes(classId));
  const agg = classAggStats(students, classId);

  app.innerHTML = `
    <div class="crumbs"><a href="#/teacher">📊 Trang giáo viên</a> / ${escapeHtml(cls.name)}</div>
    <div class="section-title"><h2>${escapeHtml(cls.name)}</h2></div>
    <p class="section-sub">
      ${(levelInfo(cls.level) || {}).label || cls.level} · ${agg.count} học viên ·
      Điểm TB trắc nghiệm ${agg.quizAvg === null ? "—" : agg.quizAvg + "%"} ·
      Điểm TB điền pinyin ${agg.fillAvg === null ? "—" : agg.fillAvg + "%"} ·
      Điểm TB điền từ ${agg.clozeAvg === null ? "—" : agg.clozeAvg + "%"} ·
      Điểm TB điền từ nâng cao ${agg.advfillAvg === null ? "—" : agg.advfillAvg + "%"} ·
      Điểm TB viết chữ ${agg.writeAvg === null ? "—" : agg.writeAvg + "%"}
    </p>
    <div id="class-detail-table"></div>
  `;

  renderStudentTable(
    document.getElementById("class-detail-table"),
    classStudents,
    classes,
    () => renderClassDetailPage(app, classId),
    classId
  );
}

/* ---------------- Trang chi tiết một học viên (giáo viên xem, theo từng bài học) ---------------- */
async function renderStudentDetailPage(app, uid) {
  if (!window.HSKAuth || !HSKAuth.isConfigured) { app.innerHTML = authNotConfiguredNote(); return; }
  await HSKAuth.ready;
  if (!HSKAuth.user) {
    app.innerHTML = `<div class="empty-note">Bạn cần <a href="#/login">đăng nhập</a> để xem trang này.</div>`;
    return;
  }
  if (!HSKAuth.profile || HSKAuth.profile.role !== "teacher") {
    app.innerHTML = `<div class="empty-note">Tài khoản này chưa có quyền giáo viên.</div>`;
    return;
  }

  app.innerHTML = `<p class="section-sub">Đang tải dữ liệu...</p>`;

  let students;
  try {
    students = await HSKAuth.fetchAllStudents();
  } catch (err) {
    app.innerHTML = `<p class="empty-note">Không tải được dữ liệu: ${HSKAuth.friendlyError(err)}</p>`;
    return;
  }

  const s = students.find((x) => x.uid === uid);
  if (!s) {
    app.innerHTML = `<div class="empty-note">Không tìm thấy học viên này (có thể đã bị xóa).<br><a href="#/teacher">← Về trang giáo viên</a></div>`;
    return;
  }

  const myClasses = s.classes || [];
  const overall = mergedStatsForStudent(s, null);
  const overallQuizAvg = overall.quizQuestionsTotal ? Math.round((100 * overall.quizCorrectTotal) / overall.quizQuestionsTotal) : null;
  const overallFillAvg = overall.fillQuestionsTotal ? Math.round((100 * overall.fillCorrectTotal) / overall.fillQuestionsTotal) : null;
  const overallClozeAvg = overall.clozeQuestionsTotal ? Math.round((100 * overall.clozeCorrectTotal) / overall.clozeQuestionsTotal) : null;
  const overallWriteAvg = overall.writeQuestionsTotal ? Math.round((100 * overall.writeCorrectTotal) / overall.writeQuestionsTotal) : null;
  const overallAdvFillAvg = overall.advfillQuestionsTotal ? Math.round((100 * overall.advfillCorrectTotal) / overall.advfillQuestionsTotal) : null;

  app.innerHTML = `
    <div class="crumbs"><a href="#/teacher">📊 Trang giáo viên</a> / ${escapeHtml(s.name || "(chưa đặt tên)")}</div>
    <div class="section-title"><h2>${escapeHtml(s.name || "(chưa đặt tên)")}</h2></div>
    <p class="section-sub">
      ${escapeHtml(s.email || "")} ·
      ${myClasses.length ? myClasses.map((c) => escapeHtml(c.name)).join(", ") : "chưa có lớp nào"}
    </p>
    <p class="section-sub">
      Tổng tất cả các lớp — Trắc nghiệm ${overallQuizAvg === null ? "—" : overallQuizAvg + "%"} ·
      Điền pinyin ${overallFillAvg === null ? "—" : overallFillAvg + "%"} ·
      Điền từ ${overallClozeAvg === null ? "—" : overallClozeAvg + "%"} ·
      Điền từ nâng cao ${overallAdvFillAvg === null ? "—" : overallAdvFillAvg + "%"} ·
      Viết chữ ${overallWriteAvg === null ? "—" : overallWriteAvg + "%"}
    </p>
    ${myClasses.length === 0 ? `<p class="empty-note">Học viên chưa thuộc lớp nào nên chưa có bài nào để hiện chi tiết.</p>` : myClasses.map((c) => {
      const bucket = (s.classStats && s.classStats[c.classId]) || {};
      return `
        <div class="section-title" style="margin-top:22px;"><h3>${escapeHtml(c.name)}</h3></div>
        ${unitBreakdownTableHtml(bucket)}
      `;
    }).join("")}
  `;
}

/* ---------------- Trang "Tiến độ của tôi" (học viên tự xem kết quả luyện tập) ---------------- */
async function renderMyProgressPage(app) {
  if (!window.HSKAuth || !HSKAuth.isConfigured) { app.innerHTML = authNotConfiguredNote(); return; }
  await HSKAuth.ready;
  if (!HSKAuth.user) {
    app.innerHTML = `<div class="empty-note">Bạn cần <a href="#/login">đăng nhập</a> để xem trang này.</div>`;
    return;
  }
  if (!HSKAuth.profile || HSKAuth.profile.role !== "student") {
    app.innerHTML = `<div class="empty-note">Trang này dành cho tài khoản học viên.</div>`;
    return;
  }

  app.innerHTML = `<p class="section-sub">Đang tải dữ liệu...</p>`;

  // Hồ sơ nạp lúc đăng nhập có thể đã cũ (điểm mới ghi trong lúc đang ở trang
  // khác của cùng phiên chưa được cập nhật) — tải lại để chắc chắn mới nhất.
  const profile = await HSKAuth.refreshProfile();
  if (!profile) {
    app.innerHTML = `<div class="empty-note">Không tải được hồ sơ của bạn.</div>`;
    return;
  }

  const myClasses = profile.classes || [];
  const overall = mergedStatsForStudent(profile, null);
  const overallQuizAvg = overall.quizQuestionsTotal ? Math.round((100 * overall.quizCorrectTotal) / overall.quizQuestionsTotal) : null;
  const overallFillAvg = overall.fillQuestionsTotal ? Math.round((100 * overall.fillCorrectTotal) / overall.fillQuestionsTotal) : null;
  const overallClozeAvg = overall.clozeQuestionsTotal ? Math.round((100 * overall.clozeCorrectTotal) / overall.clozeQuestionsTotal) : null;
  const overallWriteAvg = overall.writeQuestionsTotal ? Math.round((100 * overall.writeCorrectTotal) / overall.writeQuestionsTotal) : null;
  const overallAdvFillAvg = overall.advfillQuestionsTotal ? Math.round((100 * overall.advfillCorrectTotal) / overall.advfillQuestionsTotal) : null;
  const wrongEntries = Object.entries(overall.wrongWords).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const todayK = dateKey(0);
  const minsToday = overall.studyDays[todayK] || 0;
  let minsWeek = 0;
  for (let i = 0; i < 7; i++) minsWeek += overall.studyDays[dateKey(i)] || 0;

  app.innerHTML = `
    <div class="section-title"><h2>📈 Tiến độ của tôi</h2></div>
    <p class="section-sub">
      ${myClasses.length ? myClasses.map((c) => `<span class="class-tag">${escapeHtml(c.name)}</span>`).join(" ") : "Bạn chưa thuộc lớp nào."}
    </p>

    <div class="progress-stat-row">
      <div class="progress-stat"><b>${overall.viewedUnitKeys.length}</b><span>Bài đã ôn</span></div>
      <div class="progress-stat"><b>${overallQuizAvg === null ? "—" : overallQuizAvg + "%"}</b><span>Điểm TB trắc nghiệm</span></div>
      <div class="progress-stat"><b>${overallFillAvg === null ? "—" : overallFillAvg + "%"}</b><span>Điểm TB điền pinyin</span></div>
      <div class="progress-stat"><b>${overallClozeAvg === null ? "—" : overallClozeAvg + "%"}</b><span>Điểm TB điền từ</span></div>
      <div class="progress-stat"><b>${overallAdvFillAvg === null ? "—" : overallAdvFillAvg + "%"}</b><span>Điểm TB điền từ nâng cao</span></div>
      <div class="progress-stat"><b>${overallWriteAvg === null ? "—" : overallWriteAvg + "%"}</b><span>Điểm TB viết chữ</span></div>
      <div class="progress-stat"><b>${minsToday.toFixed(1)}</b><span>Phút học hôm nay</span></div>
      <div class="progress-stat"><b>${minsWeek.toFixed(1)}</b><span>Phút học 7 ngày qua</span></div>
    </div>

    <p class="section-sub" style="margin-top:18px;">
      <b>Từ hay sai nhất:</b> ${wrongEntries.length ? escapeHtml(wrongEntries.map(([w, c]) => `${w} (${c})`).join(", ")) : "Chưa có từ nào bị sai — cố lên!"}
    </p>

    ${myClasses.length === 0 ? "" : myClasses.map((c) => {
      const bucket = (profile.classStats && profile.classStats[c.classId]) || {};
      return `
        <div class="section-title" style="margin-top:22px;"><h3>${escapeHtml(c.name)} <span class="tt-sub">(${(levelInfo(c.level) || {}).label || c.level})</span></h3></div>
        ${unitBreakdownTableHtml(bucket)}
      `;
    }).join("")}
  `;
}
