/* HSK Ôn Từ — đăng nhập, tài khoản & theo dõi tiến độ học viên.
   Dùng Firebase Authentication (email/mật khẩu) + Cloud Firestore.
   Tự viết toàn bộ; chỉ gọi SDK chính thức của Firebase (Google).

   File này tạo ra `window.HSKAuth`, một API nhỏ để app.js gọi vào,
   để phần định tuyến/hiển thị (app.js) không cần biết chi tiết Firebase. */

(function () {
  const isPlaceholder = !firebaseConfig || String(firebaseConfig.apiKey || "").startsWith("DÁN_");

  const listeners = [];
  const state = { user: null, profile: null, ready: false };

  let auth = null;
  let db = null;

  if (!isPlaceholder) {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
  }

  function notify() {
    renderAuthSlot();
    listeners.forEach((cb) => { try { cb(state); } catch (e) { console.error(e); } });
  }

  async function loadOrCreateProfile(user) {
    const ref = db.collection("users").doc(user.uid);
    const snap = await ref.get();
    if (snap.exists) return snap.data();
    // Không tự tạo hồ sơ ở đây nữa — tài khoản học viên luôn được giáo viên
    // tạo sẵn hồ sơ (users/{uid}) cùng lúc với tài khoản đăng nhập. Nếu thiếu
    // hồ sơ nghĩa là tài khoản chưa được cấp đầy đủ (hoặc là tài khoản giáo
    // viên đầu tiên chưa được thêm hồ sơ thủ công — xem FIREBASE_SETUP.md).
    return null;
  }

  let readyResolve;
  const readyPromise = new Promise((res) => { readyResolve = res; });

  if (auth) {
    auth.onAuthStateChanged(async (user) => {
      state.user = user;
      state.profile = user ? await loadOrCreateProfile(user) : null;
      state.ready = true;
      readyResolve();
      notify();
    });
  } else {
    state.ready = true;
    readyResolve();
  }

  function todayKey() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function requireConfigured() {
    if (isPlaceholder) {
      const err = new Error("Chưa cấu hình Firebase — xem file FIREBASE_SETUP.md để bật đăng nhập.");
      err.code = "not-configured";
      throw err;
    }
  }

  const FRIENDLY_ERR = {
    "auth/email-already-in-use": "Email này đã có tài khoản rồi.",
    "auth/invalid-email": "Email không hợp lệ.",
    "auth/weak-password": "Mật khẩu quá ngắn (cần ít nhất 6 ký tự).",
    "auth/user-not-found": "Không tìm thấy tài khoản với email này.",
    "auth/wrong-password": "Sai mật khẩu.",
    "auth/invalid-credential": "Email hoặc mật khẩu không đúng.",
    "auth/too-many-requests": "Bạn thử sai quá nhiều lần, hãy đợi một lát rồi thử lại.",
  };
  function friendlyError(err) {
    if (err && err.code === "not-configured") return err.message;
    return (err && FRIENDLY_ERR[err.code]) || (err && err.message) || "Có lỗi xảy ra.";
  }

  /* ---- App Firebase phụ, chỉ để tạo tài khoản Auth cho học viên mà không
     làm mất phiên đăng nhập hiện tại của giáo viên (kỹ thuật chuẩn của
     Firebase khi cần "admin tạo tài khoản người khác" ở phía trình duyệt,
     không cần máy chủ/Cloud Functions riêng). ---- */
  function getSecondaryAuth() {
    let secApp = firebase.apps.find((a) => a.name === "Secondary");
    if (!secApp) secApp = firebase.initializeApp(firebaseConfig, "Secondary");
    return secApp.auth();
  }

  function requireTeacher() {
    if (!state.profile || state.profile.role !== "teacher") {
      throw new Error("Chỉ tài khoản giáo viên mới thực hiện được thao tác này.");
    }
  }

  /* Giáo viên tạo một lớp học (tên + trình độ HSK). */
  async function createClass(name, level) {
    requireConfigured();
    requireTeacher();
    const ref = await db.collection("classes").add({
      name, level, teacherUid: state.user.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
  }

  async function fetchClasses() {
    requireConfigured();
    requireTeacher();
    const snap = await db.collection("classes").get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  /* Giáo viên tạo tài khoản đăng nhập cho một học viên, gán sẵn vào MỘT HOẶC
     NHIỀU lớp cùng lúc (và do đó gán sẵn (các) trình độ HSK học viên đó được
     phép ôn tập — hợp của trình độ tất cả các lớp). `classes` là mảng
     [{classId, name, level}, ...] do trang giáo viên tra từ danh sách lớp đã
     tải sẵn. Không có đường nào để học viên tự đăng ký tài khoản trong ứng
     dụng này nữa. */
  async function createStudentAccount({ name, email, password, classes }) {
    requireConfigured();
    requireTeacher();
    const selected = classes || [];
    const secAuth = getSecondaryAuth();
    const cred = await secAuth.createUserWithEmailAndPassword(email, password);
    try {
      await cred.user.updateProfile({ displayName: name });
      // Ghi hồ sơ Firestore bằng phiên của GIÁO VIÊN (db mặc định) — không
      // phải phiên tạm vừa tạo — để khớp với luật bảo mật "chỉ giáo viên
      // mới được tạo document users/* cho người khác".
      await db.collection("users").doc(cred.user.uid).set({
        name, email, role: "student",
        classIds: selected.map((c) => c.classId),
        classes: selected,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastActiveTs: firebase.firestore.FieldValue.serverTimestamp(),
        classStats: {},
      });
    } finally {
      await secAuth.signOut().catch(() => {});
    }
    return { uid: cred.user.uid, email, password };
  }

  /* Giáo viên đổi TOÀN BỘ danh sách lớp của một học viên cùng lúc (thêm/bớt
     lớp) — `classes` là mảng đầy đủ [{classId, name, level}, ...] học viên
     nên thuộc SAU khi lưu (không phải chỉ phần thêm/bớt). Tiến độ ôn tập của
     từng lớp (classStats.{classId}) không bị xóa khi gỡ khỏi lớp đó — nếu
     sau này thêm lại đúng lớp, số liệu cũ vẫn còn. */
  async function setStudentClasses(uid, classes) {
    requireConfigured();
    requireTeacher();
    const selected = classes || [];
    await db.collection("users").doc(uid).update({
      classIds: selected.map((c) => c.classId),
      classes: selected,
      lastActiveTs: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  /* Giáo viên sửa hồ sơ học viên — hiện chỉ cho sửa tên hiển thị (đổi lớp
     dùng setStudentClasses ở trên). Không cho sửa vai trò ở đây. */
  async function updateStudent(uid, { name }) {
    requireConfigured();
    requireTeacher();
    const payload = { lastActiveTs: firebase.firestore.FieldValue.serverTimestamp() };
    if (name !== undefined) payload.name = name;
    await db.collection("users").doc(uid).update(payload);
  }

  /* Giáo viên xóa hồ sơ học viên khỏi hệ thống. Vì đây là trang tĩnh không có
     máy chủ riêng (Cloud Functions/Admin SDK), Firebase KHÔNG cho phép một
     tài khoản (giáo viên) xóa tài khoản ĐĂNG NHẬP (Firebase Authentication)
     của người khác từ trình duyệt — chỉ chủ tài khoản mới tự xóa được tài
     khoản đăng nhập của chính mình. Hàm này xóa hồ sơ Firestore
     (users/{uid}), có tác dụng thu hồi quyền xem nội dung ngay lập tức (mọi
     trang đều yêu cầu hồ sơ hợp lệ mới cho xem). Nếu muốn xóa hẳn cả tài
     khoản đăng nhập gốc, giáo viên cần vào Firebase Console →
     Authentication → xóa thủ công (xem FIREBASE_SETUP.md). */
  async function deleteStudent(uid) {
    requireConfigured();
    requireTeacher();
    await db.collection("users").doc(uid).delete();
  }

  /* Giáo viên đổi tên/trình độ một lớp — đồng thời cập nhật lại đúng mục
     tương ứng trong mảng `classes` (kèm `classIds`) của MỌI học viên đang
     thuộc lớp đó (một học viên có thể đang thuộc thêm các lớp khác nữa —
     những lớp khác giữ nguyên, chỉ mục ứng với `classId` này được cập nhật),
     để dữ liệu không bị lệch (nếu không, học viên cũ vẫn giữ tên/trình độ
     lớp trước khi đổi). */
  async function updateClass(classId, { name, level }) {
    requireConfigured();
    requireTeacher();
    await db.collection("classes").doc(classId).update({ name, level });
    const snap = await db.collection("users").where("classIds", "array-contains", classId).get();
    if (!snap.empty) {
      const batch = db.batch();
      snap.docs.forEach((d) => {
        const data = d.data();
        const newClasses = (data.classes || []).map((c) =>
          c.classId === classId ? { ...c, name, level } : c
        );
        batch.update(d.ref, { classes: newClasses });
      });
      await batch.commit();
    }
  }

  /* Giáo viên xóa một lớp — chỉ cho phép khi lớp không còn học viên nào (kể
     cả học viên đang thuộc lớp này CÙNG VỚI các lớp khác), để tránh mất dấu
     một liên kết học viên-lớp mà giáo viên không để ý. */
  async function deleteClass(classId) {
    requireConfigured();
    requireTeacher();
    const snap = await db.collection("users").where("classIds", "array-contains", classId).get();
    if (!snap.empty) {
      const err = new Error(`Lớp này còn ${snap.size} học viên — hãy gỡ hết học viên khỏi lớp này (sửa lớp cho từng học viên) trước khi xóa lớp.`);
      err.code = "class-not-empty";
      throw err;
    }
    await db.collection("classes").doc(classId).delete();
  }

  async function logIn(email, password) {
    requireConfigured();
    const cred = await auth.signInWithEmailAndPassword(email, password);
    return cred.user;
  }

  async function logOut() {
    requireConfigured();
    stopHeartbeat();
    await auth.signOut();
  }

  async function resetPassword(email) {
    requireConfigured();
    await auth.sendPasswordResetEmail(email);
  }

  function userRef() {
    if (!state.user) return null;
    return db.collection("users").doc(state.user.uid);
  }

  function unitKeyOf(level, unitKey) {
    return `${level}_${unitKey}`;
  }

  /* Một học viên có thể thuộc NHIỀU lớp cùng lúc, có thể cùng trình độ. Khi
     học viên ôn tập ở một trình độ nào đó, kết quả được cộng vào TẤT CẢ các
     lớp của học viên đang có đúng trình độ đó (không có khái niệm "đang chọn
     lớp nào" khi ôn bài — ôn theo trình độ, không theo lớp). Nếu học viên
     chưa thuộc lớp nào ở trình độ đang ôn (trường hợp lẽ ra không xảy ra vì
     canAccessLevel đã chặn trước), không ghi gì cả. */
  function classIdsForLevel(level) {
    const profile = state.profile;
    if (!profile || !Array.isArray(profile.classes)) return [];
    return profile.classes.filter((c) => c.level === level).map((c) => c.classId);
  }

  function recordUnitViewed(level, unitKey, unitLabel) {
    const ref = userRef();
    const cids = classIdsForLevel(level);
    if (!ref || !cids.length) return;
    const key = unitKeyOf(level, unitKey);
    const payload = { lastActiveTs: firebase.firestore.FieldValue.serverTimestamp() };
    cids.forEach((cid) => {
      payload[`classStats.${cid}.viewedUnitKeys`] = firebase.firestore.FieldValue.arrayUnion(key);
      payload[`classStats.${cid}.unitLabels.${key}`] = unitLabel;
    });
    ref.update(payload).catch((e) => console.warn("recordUnitViewed:", e.message));
  }

  /* prefix dùng làm tiền tố tên trường lưu điểm trong classStats — TÁCH RIÊNG
     6 chế độ: "quiz" (trắc nghiệm Hán tự↔nghĩa), "fill" (điền pinyin),
     "cloze" (điền từ vào chỗ trống), "translate" (dịch câu, học viên tự
     chấm), "write" (viết chữ tay), và "advfill" (điền từ nâng cao — nhiều chỗ
     trống/đoạn, chỉ có ở HSK3 hiện tại). Trước đây "cloze" từng bị gộp chung
     vào "quiz" (một sơ suất cũ) — từ bản có điểm điền từ riêng, các chế độ
     được tính tách biệt hoàn toàn. Lưu ý: "translate" hiện chỉ được LƯU vào
     Firestore (classStats.{cid}.translate*), CHƯA có cột hiển thị riêng
     trên trang giáo viên/trang tiến độ học viên — xem README.md. */
  function statPrefix(mode) {
    if (mode === "fill") return "fill";
    if (mode === "cloze") return "cloze";
    if (mode === "translate") return "translate";
    if (mode === "write") return "write";
    if (mode === "advfill") return "advfill";
    return "quiz";
  }

  function recordAttempt({ level, unitKey, unitLabel, mode, score, total }) {
    const ref = userRef();
    const cids = classIdsForLevel(level);
    if (!ref || !cids.length) return;
    const key = unitKeyOf(level, unitKey);
    const prefix = statPrefix(mode);
    const payload = { lastActiveTs: firebase.firestore.FieldValue.serverTimestamp() };
    // Lưu LỊCH SỬ từng lần làm (mảng, không ghi đè) để giáo viên/học viên xem
    // được đã làm bao nhiêu lần và điểm của từng lần — không chỉ lần gần
    // nhất. Bên trong một mảng arrayUnion, Firestore KHÔNG cho dùng sentinel
    // serverTimestamp() nên phải dùng giờ máy khách (new Date()); sai lệch vài
    // giây so với giờ máy chủ là chấp nhận được cho mục đích hiển thị lịch sử.
    const attempt = { score, total, unitLabel, ts: new Date() };
    cids.forEach((cid) => {
      payload[`classStats.${cid}.${prefix}Attempts`] = firebase.firestore.FieldValue.increment(1);
      payload[`classStats.${cid}.${prefix}CorrectTotal`] = firebase.firestore.FieldValue.increment(score);
      payload[`classStats.${cid}.${prefix}QuestionsTotal`] = firebase.firestore.FieldValue.increment(total);
      payload[`classStats.${cid}.scores.${mode}_${key}`] = firebase.firestore.FieldValue.arrayUnion(attempt);
      payload[`classStats.${cid}.viewedUnitKeys`] = firebase.firestore.FieldValue.arrayUnion(key);
      payload[`classStats.${cid}.unitLabels.${key}`] = unitLabel;
    });
    ref.update(payload).catch((e) => console.warn("recordAttempt:", e.message));
  }

  function recordWrongWord(hanzi, level) {
    const ref = userRef();
    const cids = classIdsForLevel(level);
    if (!ref || !hanzi || !cids.length) return;
    const payload = { lastActiveTs: firebase.firestore.FieldValue.serverTimestamp() };
    cids.forEach((cid) => {
      payload[`classStats.${cid}.wrongWords.${hanzi}`] = firebase.firestore.FieldValue.increment(1);
    });
    ref.update(payload).catch((e) => console.warn("recordWrongWord:", e.message));
  }

  let heartbeatTimer = null;
  function startHeartbeat(level) {
    stopHeartbeat();
    const ref = userRef();
    const cids = classIdsForLevel(level);
    if (!ref || !cids.length) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const today = todayKey();
      const payload = { lastActiveTs: firebase.firestore.FieldValue.serverTimestamp() };
      cids.forEach((cid) => {
        payload[`classStats.${cid}.studyDays.${today}`] = firebase.firestore.FieldValue.increment(0.5);
      });
      ref.update(payload).catch((e) => console.warn("heartbeat:", e.message));
    };
    heartbeatTimer = setInterval(tick, 30000);
  }
  function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  }

  /* Tải lại hồ sơ của CHÍNH người đang đăng nhập từ Firestore (bỏ qua bản đã
     lưu trong bộ nhớ) — dùng cho trang "Tiến độ của tôi" của học viên, vì
     `state.profile` chỉ được nạp một lần lúc đăng nhập (onAuthStateChanged),
     không tự cập nhật realtime khi có điểm mới được ghi trong lúc học viên
     đang ở một trang khác của cùng phiên làm việc. */
  async function refreshProfile() {
    if (!state.user) return null;
    const snap = await db.collection("users").doc(state.user.uid).get();
    state.profile = snap.exists ? snap.data() : null;
    return state.profile;
  }

  async function fetchAllStudents() {
    requireConfigured();
    requireTeacher();
    const snap = await db.collection("users").where("role", "==", "student").get();
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  }

  function onChange(cb) {
    listeners.push(cb);
    return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  /* ---- Thanh trạng thái đăng nhập trên header ---- */
  function renderAuthSlot() {
    const slot = document.getElementById("auth-slot");
    if (!slot) return;
    if (isPlaceholder) {
      slot.innerHTML = `<a href="#/login" class="auth-note">Đăng nhập (chưa cấu hình)</a>`;
      return;
    }
    if (!state.user) {
      slot.innerHTML = `<a href="#/login">Đăng nhập</a>`;
      return;
    }
    const name = escapeHtml((state.profile && state.profile.name) || state.user.email);
    const isTeacher = state.profile && state.profile.role === "teacher";
    const isStudent = state.profile && state.profile.role === "student";
    slot.innerHTML = `
      <span class="auth-hello">Xin chào, <b>${name}</b></span>
      ${isTeacher ? `<a href="#/teacher">📊 Trang giáo viên</a>` : ""}
      ${isStudent ? `<a href="#/progress">📈 Tiến độ của tôi</a>` : ""}
      <a href="#" id="auth-logout-btn">Đăng xuất</a>
    `;
    const btn = document.getElementById("auth-logout-btn");
    if (btn) btn.addEventListener("click", (e) => { e.preventDefault(); logOut(); location.hash = "#/"; });
  }

  window.HSKAuth = {
    isConfigured: !isPlaceholder,
    ready: readyPromise,
    get user() { return state.user; },
    get profile() { return state.profile; },
    friendlyError,
    logIn, logOut, resetPassword,
    onChange,
    recordUnitViewed, recordAttempt, recordWrongWord,
    startHeartbeat, stopHeartbeat,
    refreshProfile,
    fetchAllStudents,
    createClass, fetchClasses, createStudentAccount, setStudentClasses,
    updateStudent, deleteStudent, updateClass, deleteClass,
  };

  document.addEventListener("DOMContentLoaded", renderAuthSlot);
})();
