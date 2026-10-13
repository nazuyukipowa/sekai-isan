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
  });
  let state;
  try { state = Object.assign(empty(), JSON.parse(localStorage.getItem(KEY) || "{}")); }
  catch (e) { state = empty(); }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 保存不可でも続行 */ }
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
    reset() { state = empty(); save(); },
  };
})();
