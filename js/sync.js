// クラウド同期: Firebase の Google ログインでログインし、学習記録を Firestore の users/{uid} に保存する。
// js/firebase-config.js の FIREBASE_CONFIG が空なら何もしない（今まで通り端末内だけで動く）。
(function () {
  const CONFIG = window.FIREBASE_CONFIG;
  const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
  const DEVICE = Math.random().toString(36).slice(2);
  const listeners = [];
  const S = {
    enabled: !!(CONFIG && CONFIG.apiKey),
    ready: false,
    user: null,
    status: "off",        // off | signing | syncing | synced | error
    message: "",
    lastSync: null,
  };
  const emit = () => listeners.forEach((fn) => fn(S));
  const set = (patch) => { Object.assign(S, patch); emit(); };

  let auth, db, unsubDoc = null, pushTimer = null, pending = false, lastRemoteAt = 0;

  function load(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = SDK + src; s.onload = res; s.onerror = () => rej(new Error(src));
      document.head.appendChild(s);
    });
  }

  // 2台の記録を合体する（初回ログイン時と、書き込みがぶつかったとき）
  function merge(a, b) {
    const m = JSON.parse(JSON.stringify((b.updatedAt || 0) >= (a.updatedAt || 0) ? b : a));
    m.learned = Object.assign({}, a.learned, b.learned);
    m.flash = { ...a.flash };
    for (const [k, v] of Object.entries(b.flash || {})) m.flash[k] = Math.max(v, m.flash[k] ?? 0);
    m.wrong = { ...a.wrong };
    for (const [k, v] of Object.entries(b.wrong || {})) if (!m.wrong[k] || (v.last || 0) > (m.wrong[k].last || 0)) m.wrong[k] = v;
    m.answered = Math.max(a.answered || 0, b.answered || 0);
    m.correct = Math.max(a.correct || 0, b.correct || 0);
    const ex = new Map([...(a.exams || []), ...(b.exams || [])].map((e) => [e.date, e]));
    m.exams = [...ex.values()].sort((x, y) => y.date - x.date).slice(0, 30);
    const done = (p) => (p ? [p.flash, p.quiz, p.review].filter(Boolean).length : -1);
    const pa = a.plan, pb = b.plan;
    m.plan = !pa ? pb : !pb ? pa : pa.date !== pb.date ? (pa.date > pb.date ? pa : pb) : done(pa) >= done(pb) ? pa : pb;
    const sa = a.streak || {}, sb = b.streak || {};
    m.streak = (sa.last || "") > (sb.last || "") ? sa : (sb.last || "") > (sa.last || "") ? sb : (sa.count || 0) >= (sb.count || 0) ? sa : sb;
    m.updatedAt = Date.now();
    return m;
  }
  const isEmpty = (s) => !s || (!Object.keys(s.learned || {}).length && !s.answered);

  const docRef = () => db.collection("users").doc(S.user.uid);

  // 端末の記録をクラウドへ。他の端末が先に書いていたら合体してから書く
  async function push() {
    pending = false;
    if (!S.user) return;
    set({ status: "syncing" });
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(docRef());
        let state = Store.state;
        if (snap.exists) {
          const remote = JSON.parse(snap.data().state || "{}");
          if ((snap.data().updatedAt || 0) > lastRemoteAt && snap.data().device !== DEVICE) {
            state = merge(state, remote);
            Store.replace(state);
            window.dispatchEvent(new Event("store:remote"));
          }
        }
        const now = Date.now();
        tx.set(docRef(), { state: JSON.stringify(state), updatedAt: now, device: DEVICE });
        lastRemoteAt = now;
      });
      set({ status: "synced", lastSync: new Date() });
    } catch (e) {
      console.error(e);
      set({ status: "error", message: "同期に失敗しました。通信状況を確認してください。" });
    }
  }
  const schedulePush = () => { pending = true; clearTimeout(pushTimer); pushTimer = setTimeout(push, 1500); };

  async function startSync() {
    set({ status: "syncing" });
    const snap = await docRef().get();
    if (snap.exists) {
      const remote = JSON.parse(snap.data().state || "{}");
      const local = Store.state;
      const next = isEmpty(local) ? remote : isEmpty(remote) ? local : merge(local, remote);
      Store.replace(next);
      lastRemoteAt = snap.data().updatedAt || 0;
      window.dispatchEvent(new Event("store:remote"));
    }
    await push();
    // 他の端末での変更をリアルタイムに受け取る
    unsubDoc = docRef().onSnapshot((d) => {
      if (!d.exists || d.metadata.hasPendingWrites) return;
      const data = d.data();
      if (data.device === DEVICE || (data.updatedAt || 0) <= lastRemoteAt) return;
      lastRemoteAt = data.updatedAt;
      const remote = JSON.parse(data.state || "{}");
      // まだ送っていない変更があれば消さないよう合体する
      Store.replace(pending ? merge(Store.state, remote) : remote);
      set({ status: "synced", lastSync: new Date() });
      window.dispatchEvent(new Event("store:remote"));
    });
  }

  async function init() {
    if (!S.enabled) { emit(); return; }
    try {
      await load("firebase-app-compat.js");
      await Promise.all([load("firebase-auth-compat.js"), load("firebase-firestore-compat.js")]);
    } catch (e) {
      set({ status: "error", message: "同期の部品を読み込めませんでした（オフライン？）。端末内の記録だけで動きます。" });
      return;
    }
    firebase.initializeApp(CONFIG);
    auth = firebase.auth();
    db = firebase.firestore();
    auth.languageCode = "ja";

    // リダイレクト方式でログインして戻ってきたときの結果（失敗時のメッセージ用）
    auth.getRedirectResult().catch((e) => { console.error(e); set({ status: "error", message: "ログインに失敗しました。もう一度試してください。" }); });
    auth.onAuthStateChanged(async (user) => {
      if (unsubDoc) { unsubDoc(); unsubDoc = null; }
      set({ user, ready: true, status: user ? "syncing" : S.status === "error" ? "error" : "off" });
      if (user) {
        try { await startSync(); } catch (e) { console.error(e); set({ status: "error", message: "同期を開始できませんでした。" }); }
      }
    });
    Store.onSave(() => { if (S.user) schedulePush(); });
  }

  window.Sync = {
    get state() { return S; },
    onChange(fn) { listeners.push(fn); },
    // Google でログイン。ポップアップが使えない環境（ブロックなど）はページ移動方式に切り替える
    async signIn() {
      set({ status: "signing", message: "" });
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      try {
        await auth.signInWithPopup(provider);
      } catch (e) {
        if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") return auth.signInWithRedirect(provider);
        if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") { set({ status: "off" }); return; }
        console.error(e);
        set({ status: "error", message: e.code === "auth/unauthorized-domain" ? "このURLはログインが許可されていません（Firebase の承認済みドメインを確認）。" : "ログインに失敗しました。もう一度試してください。" });
      }
    },
    async signOut() { await auth.signOut(); set({ status: "off" }); },
    syncNow: push,
  };
  init();
})();
