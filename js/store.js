// 学習進捗の保存（localStorage）。読めない環境でもメモリ上で動く。
(function () {
  const KEY = "whStudy.v1";
  const empty = () => ({
    learned: {},      // siteId -> true
    flash: {},        // siteId -> 習熟度 0..3
    wrong: {},        // qid -> {q, miss, streak, last}
    answered: 0,
    correct: 0,
    exams: [],        // {date, level, total, correct, sec}
    plan: null,       // 今日のメニュー {date, ids, flash, quiz, review, quizScore}
    settings: { daily: 5, furigana: true },
    streak: { last: null, count: 0 },
  });
  const normalize = (s) => {
    const n = Object.assign(empty(), s || {});
    n.settings = Object.assign(empty().settings, n.settings);
    n.streak = Object.assign(empty().streak, n.streak);
    return n;
  };
  let state;
  try { state = normalize(JSON.parse(localStorage.getItem(KEY) || "{}")); }
  catch (e) { state = empty(); }

  // listeners: 保存のたびに呼ぶ（クラウド同期が登録する）
  const listeners = [];
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 保存不可でも続行 */ }
  }
  function save() {
    state.updatedAt = Date.now();
    persist();
    listeners.forEach((fn) => fn(state));
  }

  window.Store = {
    get state() { return state; },
    isLearned: (id) => !!state.learned[id],
    toggleLearned(id) {
      if (state.learned[id]) delete state.learned[id]; else state.learned[id] = true;
      save();
    },
    // 解答記録。間違えたら苦手リストへ、苦手は2連続正解で卒業。
    record(q, ok) {
      state.answered++;
      if (ok) state.correct++;
      const w = state.wrong[q.id];
      if (!ok) {
        state.wrong[q.id] = { q, miss: (w ? w.miss : 0) + 1, streak: 0, last: Date.now() };
      } else if (w) {
        w.streak++;
        if (w.streak >= 2) delete state.wrong[q.id];
      }
      save();
    },
    setFlash(id, lv) { state.flash[id] = lv; save(); },
    addExam(r) { state.exams.unshift(r); state.exams = state.exams.slice(0, 30); save(); },
    setPlan(p) { state.plan = p; save(); },
    setDaily(n) { state.settings.daily = n; save(); },
    setFurigana(on) { state.settings.furigana = on; save(); },
    // 今日のメニューを全部終えた日に連続日数を更新
    markDayDone(today, yesterday) {
      if (state.streak.last === today) return;
      state.streak.count = state.streak.last === yesterday ? state.streak.count + 1 : 1;
      state.streak.last = today;
      save();
    },
    save,
    reset() { state = empty(); save(); },
    onSave(fn) { listeners.push(fn); },
    // クラウドから受け取った記録で置き換える（同期ループを避けるため listeners は呼ばない）
    replace(s) { state = normalize(s); persist(); },
  };
})();
