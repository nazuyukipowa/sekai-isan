// 問題生成。auto（データから機械生成）・handmade（各遺産の手作り問題）・theory（理論分野）。
(function () {
  const SITES = window.SITES || [];
  const THEORY = window.THEORY || {};
  const byId = new Map(SITES.map((s) => [s.id, s]));

  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[rand(arr.length)];
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  // 正解1つ + 誤答候補から重複なく3つ選び、シャッフルして answer を求める
  function build(id, q, correct, candidates, exp, extra) {
    const seen = new Set([correct]);
    const wrong = [];
    for (const c of shuffle(candidates)) {
      if (!seen.has(c)) { seen.add(c); wrong.push(c); }
      if (wrong.length === 3) break;
    }
    if (wrong.length < 2) return null;
    const choices = shuffle([correct, ...wrong]);
    return Object.assign({ id, q, choices, answer: choices.indexOf(correct), exp }, extra || {});
  }

  const crit = (s) => s.criteria.length ? s.criteria.map((c) => `(${c})`).join("") : "";
  const statesStr = (s) => s.states_ja.join("・");
  const sameRegion = (s) => SITES.filter((x) => x.region === s.region && x.id !== s.id);
  const lbl = (s) => `「${s.name_ja}」`;

  const AUTO = {
    country(s) {
      const own = statesStr(s);
      // 正解国を含む組み合わせは誤答にしない。単独国の遺産なら誤答も単独国に揃える
      const cands = [...new Set(sameRegion(s)
        .filter((x) => !x.states_ja.some((c) => s.states_ja.includes(c)))
        .filter((x) => s.states_ja.length > 1 || x.states_ja.length === 1)
        .map(statesStr))];
      return build(`country:${s.id}`, `${lbl(s)}がある国はどこか。`, own, cands,
        `${s.name_ja}は${own}の世界遺産。`, { siteId: s.id });
    },
    year(s) {
      const cands = [];
      for (let d = -6; d <= 6; d++) if (d && s.year + d >= 1978 && s.year + d <= 2026) cands.push(String(s.year + d));
      return build(`year:${s.id}`, `${lbl(s)}が世界遺産に登録された年はいつか。`, String(s.year), cands,
        `${s.year}年登録${s.ext_years.length ? `（拡大・変更: ${s.ext_years.join(", ")}年）` : ""}。`, { siteId: s.id });
    },
    criteria(s) {
      if (!s.criteria.length) return null;
      const own = crit(s);
      const cands = [...new Set(SITES.filter((x) => x.category === s.category).map(crit))].filter(Boolean);
      return build(`criteria:${s.id}`, `${lbl(s)}の登録基準の組み合わせとして正しいものはどれか。`, own, cands,
        `登録基準は${own}。`, { siteId: s.id });
    },
    category(s) {
      const q = build(`category:${s.id}`, `${lbl(s)}の遺産の種別はどれか。`, s.category + "遺産",
        ["文化遺産", "自然遺産", "複合遺産"], `${s.category}遺産（基準${crit(s)}）。`, { siteId: s.id });
      return q;
    },
    whichInCountry(s) {
      const st = s.states_ja[0];
      const others = SITES.filter((x) => x.region === s.region && !x.states_ja.includes(st) && x.name_ja !== s.name_ja).map((x) => x.name_ja);
      return build(`whichIn:${s.id}`, `次のうち、${st}にある世界遺産はどれか。`, s.name_ja, others,
        `${s.name_ja}は${statesStr(s)}の遺産。`, { siteId: s.id });
    },
    english(s) {
      if (s.name_ja === s.name_en) return null;
      const others = sameRegion(s).map((x) => x.name_ja);
      return build(`english:${s.id}`, `英語名 “${s.name_en}” の世界遺産はどれか。`, s.name_ja, others,
        `${s.name_en} = ${s.name_ja}（${statesStr(s)}）。`, { siteId: s.id });
    },
    keyword(s) {
      if (!s.keywords.length) return null;
      const kws = shuffle(s.keywords).slice(0, 2).join("」「");
      const others = sameRegion(s).map((x) => x.name_ja);
      return build(`keyword:${s.id}`, `「${kws}」と最も関係の深い世界遺産はどれか。`, s.name_ja, others,
        `${s.name_ja}のキーワード: ${s.keywords.join("、")}`, { siteId: s.id });
    },
    danger(s) {
      if (!s.danger) return null;
      const safe = SITES.filter((x) => !x.danger && x.region === s.region).map((x) => x.name_ja);
      return build(`danger:${s.id}`, "次のうち、現在危機遺産リストに記載されている世界遺産はどれか。", s.name_ja, safe,
        `${s.name_ja}（${statesStr(s)}）は危機遺産${s.danger_years.length ? `（${s.danger_years.join(", ")}年記載）` : ""}。`,
        { siteId: s.id });
    },
    hasCriterion(s) {
      if (!s.criteria.length) return null;
      const c = pick(s.criteria);
      const others = SITES.filter((x) => x.criteria.length && !x.criteria.includes(c) && x.region === s.region)
        .map((x) => x.name_ja);
      return build(`hasCrit:${s.id}:${c}`, `次のうち、登録基準(${c})で登録されている世界遺産はどれか。`, s.name_ja, others,
        `${s.name_ja}の登録基準は${crit(s)}。`, { siteId: s.id });
    },
    map(s) {
      if (s.lat == null) return null;
      const others = sameRegion(s).map((x) => x.name_ja);
      return build(`map:${s.id}`, "地図の印の位置にある世界遺産はどれか。", s.name_ja, others,
        `${s.name_ja}（${statesStr(s)}）。`, { siteId: s.id, map: { lat: s.lat, lon: s.lon } });
    },
  };
  // 登録基準の内容（理論）
  function criterionText() {
    const list = THEORY.criteria || [];
    if (list.length < 4) return null;
    const c = pick(list);
    return build(`critText:${c.no}`, `登録基準(${c.no})の内容として正しいものはどれか。`, c.short,
      list.map((x) => x.short), `基準(${c.no}): ${c.text}`);
  }

  const AUTO_TYPES = {
    country: "国名", year: "登録年", criteria: "登録基準", category: "種別", whichInCountry: "国→遺産",
    english: "英語名", keyword: "キーワード", danger: "危機遺産", hasCriterion: "基準→遺産", map: "地図",
  };

  function handmade(s, i) {
    const h = s.quiz[i];
    // 生成データの正解位置に偏りがあるので出題ごとに並べ替える
    const choices = shuffle(h.choices);
    return { id: `hand:${s.id}:${i}`, q: h.q, choices, answer: choices.indexOf(h.choices[h.answer]), exp: h.exp || "", siteId: s.id };
  }
  function theoryQ(i) {
    const t = THEORY.quiz[i];
    return { id: `theory:${i}`, q: t.q, choices: t.choices, answer: t.answer, exp: t.exp || "", section: t.section };
  }

  // opts: {sites: 範囲の遺産配列, sources: Set(auto|hand|theory), autoTypes: [..], count}
  function generate(opts) {
    const pool = opts.sites.length ? opts.sites : SITES;
    const types = opts.autoTypes && opts.autoTypes.length ? opts.autoTypes : Object.keys(AUTO_TYPES);
    const out = [];
    const used = new Set();
    // 手作り・理論は候補一覧から重複なく取る
    const handList = opts.sources.has("hand") ? shuffle(pool.flatMap((s) => s.quiz.map((_, i) => [s, i]))) : [];
    const theoryList = opts.sources.has("theory") && THEORY.quiz ? shuffle(THEORY.quiz.map((_, i) => i)) : [];
    const srcs = [...opts.sources];
    let guard = 0;
    while (out.length < opts.count && guard++ < opts.count * 30) {
      const src = pick(srcs);
      let q = null;
      if (src === "hand" && handList.length) q = handmade(...handList.pop());
      else if (src === "theory" && (Math.random() < 0.15 || !theoryList.length)) q = criterionText();
      else if (src === "theory") q = theoryQ(theoryList.pop());
      else if (src === "auto") {
        const t = pick(types);
        const cand = t === "danger" ? pool.filter((s) => s.danger) : pool;
        if (cand.length) q = AUTO[t](pick(cand));
      }
      if (q && !used.has(q.id)) { used.add(q.id); out.push(q); }
      if (!handList.length && !theoryList.length && !srcs.includes("auto") && guard > opts.count * 5) break;
    }
    return out;
  }

  window.QuizGen = { generate, AUTO_TYPES, byId, shuffle, pick };
})();
