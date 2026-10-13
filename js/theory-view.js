// 理論ページ: 章ごとの表示、図解、登録基準カード、用語ハイライト
(function () {
  const SITES = window.SITES || [];
  const THEORY = window.THEORY || {};
  const SECS = THEORY.sections || [];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const count = (fn) => SITES.filter(fn).length;
  const CULTURAL = ["i", "ii", "iii", "iv", "v", "vi"];

  // ---------- 用語ハイライト ----------
  // 「顕著な普遍的価値（OUV）」→「顕著な普遍的価値」でも当たるように基本形も登録
  const TERMS = [];
  (THEORY.glossary || []).forEach((g) => {
    const base = g.term.replace(/（.*?）|\(.*?\)/g, "").trim();
    [g.term, base].filter((t, i, a) => t.length >= 2 && a.indexOf(t) === i).forEach((t) => TERMS.push({ t, g }));
  });
  TERMS.sort((a, b) => b.t.length - a.t.length);
  const termRe = TERMS.length ? new RegExp(TERMS.map((x) => esc(x.t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g") : null;
  const termOf = new Map(TERMS.map((x) => [esc(x.t), x.g]));

  // テキスト1行を装飾（年号を太字、各用語は章内の初出だけハイライト）
  function decorate(text, seen) {
    let html = esc(text);
    if (termRe) {
      html = html.replace(termRe, (m) => {
        const g = termOf.get(m);
        if (!g || seen.has(g.term)) return m;
        seen.add(g.term);
        return `<span class="term" tabindex="0">${m}<span class="tip"><b>${esc(g.term)}</b>${esc(g.desc)}</span></span>`;
      });
    }
    // タグの外側だけ年号を装飾
    return html.replace(/(^|>)([^<]*)/g, (all, gt, txt) => gt + txt.replace(/(\d{4})年/g, '<span class="yr">$1</span>年'));
  }

  // ---------- 本文パース ----------
  function prose(body) {
    const seen = new Set();
    const blocks = String(body || "").split(/\n{2,}/);
    const out = [];
    blocks.forEach((block) => {
      const lines = block.split("\n").filter((l) => l.trim());
      let buf = [];
      const flush = () => { if (buf.length) { out.push(listHtml(buf, seen)); buf = []; } };
      lines.forEach((l) => {
        if (l.startsWith("- ")) { buf.push(l.slice(2)); return; }
        flush();
        if (l.startsWith("## ")) out.push(`<h3>${esc(l.slice(3).replace(/^\d+[.．]\s*/, ""))}</h3>`);
        else out.push(`<p>${decorate(l, seen)}</p>`);
      });
      flush();
    });
    return out.join("");
  }
  function listHtml(items, seen) {
    // 「2015年：〜」が並ぶ → 年表
    const yearItems = items.map((x) => x.match(/^(\d{4})年?[：:]\s*(.+)$/));
    if (items.length >= 3 && yearItems.every(Boolean)) {
      return `<ol class="timeline">${yearItems.map((m) => `<li><span class="y">${m[1]}</span><span class="rail"></span><span class="ev">${decorate(m[2], seen)}</span></li>`).join("")}</ol>`;
    }
    // 「用語：説明」が並ぶ → 定義リスト
    const defs = items.map((x) => x.match(/^([^：:]{1,28})[：:]\s*(.+)$/));
    if (items.length >= 2 && defs.every(Boolean)) {
      return `<dl class="defs">${defs.map((m) => `<div><dt>${decorate(m[1], seen)}</dt><dd>${decorate(m[2], seen)}</dd></div>`).join("")}</dl>`;
    }
    return `<ul>${items.map((x) => `<li>${decorate(x, seen)}</li>`).join("")}</ul>`;
  }

  // ---------- 章ごとの図解 ----------
  const FIGS = {
    convention: () => `<div class="fig"><div class="fig-cap">条約の基本データ</div><div class="numbers">
      <div><div class="big">1972<small>年</small></div><div class="sub">ユネスコ総会で採択</div></div>
      <div><div class="big">1975<small>年</small></div><div class="sub">発効</div></div>
      <div><div class="big">1978<small>年</small></div><div class="sub">最初の12件を記載</div></div>
      <div><div class="big">1992<small>年</small></div><div class="sub">日本が締約</div></div></div></div>`,
    committee: () => `<div class="fig"><div class="fig-cap">運営体制</div><div class="cards">
      <div class="card dark"><div class="sub">締約国会議</div><div class="big">全締約国</div><p>2年に1度、ユネスコ総会の会期中に開催。委員国を選出する。</p></div>
      <div class="card"><div class="sub">世界遺産委員会</div><div class="big">21か国</div><p>年1回開催。記載・危機遺産・基金の使途などを決議する。</p></div>
      <div class="card"><div class="sub">世界遺産センター</div><div class="big">1992年</div><p>ユネスコ内の事務局。推薦書の受付や委員会の準備を担う。</p></div></div></div>`,
    advisory: () => `<div class="fig"><div class="fig-cap">3つの諮問機関</div><div class="cards">
      <div class="card cul"><div class="big">ICOMOS</div><div class="sub">国際記念物遺跡会議</div>
        <dl><dt>設立</dt><dd>1965年</dd><dt>本部</dt><dd>パリ（フランス）</dd><dt>役割</dt><dd>文化遺産の評価</dd></dl></div>
      <div class="card nat"><div class="big">IUCN</div><div class="sub">国際自然保護連合</div>
        <dl><dt>設立</dt><dd>1948年</dd><dt>本部</dt><dd>グラン（スイス）</dd><dt>役割</dt><dd>自然遺産の評価</dd></dl></div>
      <div class="card"><div class="big">ICCROM</div><div class="sub">文化財保存修復研究国際センター</div>
        <dl><dt>設立</dt><dd>1956年決定</dd><dt>本部</dt><dd>ローマ（イタリア）</dd><dt>役割</dt><dd>研修・技術支援（登録審査はしない）</dd></dl></div>
      </div><p class="small muted" style="margin-top:10px">複合遺産は ICOMOS と IUCN の両方が評価する。</p></div>`,
    integrity: () => `<div class="fig"><div class="fig-cap">資産と緩衝地帯</div><div class="zones">
      <svg viewBox="0 0 220 160" role="img" aria-label="緩衝地帯が資産を取り囲む図">
        <rect x="4" y="4" width="212" height="152" rx="14" fill="none" stroke="var(--line-strong)" stroke-dasharray="4 4"/>
        <rect x="26" y="26" width="168" height="108" rx="12" fill="var(--surface-2)" stroke="var(--ink-3)"/>
        <rect x="66" y="52" width="88" height="56" rx="8" fill="var(--ink)"/>
        <text x="110" y="85" text-anchor="middle" font-size="12" fill="var(--bg)">資産</text>
        <text x="110" y="44" text-anchor="middle" font-size="11" fill="var(--ink-2)">緩衝地帯</text>
        <text x="110" y="150" text-anchor="middle" font-size="10" fill="var(--ink-3)">周辺環境</text>
      </svg>
      <div class="cards"><div class="card"><div class="big">真正性</div><div class="sub">Authenticity ／ 文化遺産</div><p>形態・素材・技術・機能・立地などが本物であること。奈良ドキュメントで文化の多様性に応じた判断が示された。</p></div>
      <div class="card"><div class="big">完全性</div><div class="sub">Integrity ／ すべての遺産</div><p>価値を示す要素がすべて含まれ、十分な規模があり、開発などの悪影響を受けていないこと。</p></div></div></div></div>`,
    process: () => `<div class="fig"><div class="fig-cap">登録までの流れ</div><div class="flow">
      <div><b>暫定リスト</b><span>推薦の少なくとも1年前までに記載</span></div>
      <div><b>推薦書の提出</b><span>原則 2月1日締切。世界遺産センターへ</span></div>
      <div><b>諮問機関の評価</b><span>文化=ICOMOS／自然=IUCN。約1年半</span></div>
      <div><b>委員会で決議</b><span>勧告を参考に4区分で決定</span></div></div>
      <div class="outcomes"><div><b>記載</b>一覧表に記載</div><div><b>情報照会</b>追加情報で翌年以降に再審議</div>
      <div><b>記載延期</b>推薦書の再提出が必要</div><div><b>不記載</b>原則として再推薦不可</div></div></div>`,
    types: () => {
      const c = count((s) => s.category === "文化"), n = count((s) => s.category === "自然"), m = count((s) => s.category === "複合");
      return `<div class="fig"><div class="fig-cap">3つの種別（このアプリの収録データより）</div><div class="cards">
        <div class="card cul"><div class="sub">文化遺産</div><div class="big">${c}<small class="sub"> 件</small></div><p>登録基準 (i)〜(vi) のいずれか</p></div>
        <div class="card nat"><div class="sub">自然遺産</div><div class="big">${n}<small class="sub"> 件</small></div><p>登録基準 (vii)〜(x) のいずれか</p></div>
        <div class="card mix"><div class="sub">複合遺産</div><div class="big">${m}<small class="sub"> 件</small></div><p>文化・自然の両方の基準を満たす</p></div></div>
        <div class="numbers" style="margin-top:12px"><div><div class="big">${count((s) => s.transboundary)}<small>件</small></div><div class="sub">国境をまたぐ遺産</div></div>
        <div><div class="big">${count((s) => s.components > 1)}<small>件</small></div><div class="sub">構成資産が複数（シリアル）</div></div></div></div>`;
    },
    danger: () => `<div class="fig"><div class="fig-cap">危機遺産の現状と抹消事例</div>
      <div class="numbers"><div><div class="big">${count((s) => s.danger)}<small>件</small></div><div class="sub">現在の危機遺産（収録データ）</div></div>
      <div><div class="big">3<small>件</small></div><div class="sub">登録抹消された遺産</div></div></div>
      <div class="cards" style="margin-top:12px">
        <div class="card"><div class="sub">2007年 抹消 ／ オマーン</div><b>アラビアオリックスの保護区</b><p>保護区の大幅な縮小</p></div>
        <div class="card"><div class="sub">2009年 抹消 ／ ドイツ</div><b>ドレスデン・エルベ渓谷</b><p>渓谷への橋の建設</p></div>
        <div class="card"><div class="sub">2021年 抹消 ／ イギリス</div><b>リヴァプール海商都市</b><p>再開発による景観の喪失</p></div></div></div>`,
    fund: () => `<div class="fig"><div class="fig-cap">戦略目標「5つのC」</div><div class="cs">
      <div><div class="l">C</div><b>Credibility</b><span>信頼性</span></div>
      <div><div class="l">C</div><b>Conservation</b><span>保全</span></div>
      <div><div class="l">C</div><b>Capacity-building</b><span>能力開発</span></div>
      <div><div class="l">C</div><b>Communication</b><span>伝達</span></div>
      <div class="added"><div class="l">C</div><b>Community</b><span>地域社会（2007年追加）</span></div></div>
      <p class="small muted" style="margin-top:10px">2002年のブダペスト宣言で4つのCが示され、2007年に5つ目が加わった。</p></div>`,
    japan: () => {
      const jp = SITES.filter((s) => s.states_ja.includes("日本"));
      return `<div class="fig"><div class="fig-cap">日本の世界遺産（収録データより）</div><div class="numbers">
        <div><div class="big">${jp.length}<small>件</small></div><div class="sub">合計</div></div>
        <div><div class="big">${jp.filter((s) => s.category === "文化").length}<small>件</small></div><div class="sub">文化遺産</div></div>
        <div><div class="big">${jp.filter((s) => s.category === "自然").length}<small>件</small></div><div class="sub">自然遺産</div></div>
        <div><div class="big">${jp.filter((s) => s.danger).length}<small>件</small></div><div class="sub">危機遺産</div></div></div></div>`;
    },
  };

  // ---------- ページ ----------
  const quizCount = (id) => (THEORY.quiz || []).filter((q) => q.section === id).length;
  const ENTRIES = SECS.map((s, i) => ({ id: s.id, title: s.title, n: pad(i + 1) }))
    .concat([{ id: "criteria", title: "登録基準 (i)〜(x)", n: "§" }, { id: "glossary", title: "用語集", n: "§" }]);

  function toc(cur) {
    const links = ENTRIES.map((e, i) => `${i === SECS.length ? '<div class="sep"></div>' : ""}<a href="#/theory/${e.id}" class="${e.id === cur ? "on" : ""}"><span class="n">${e.n}</span><span>${esc(e.title)}</span></a>`).join("");
    const opts = ENTRIES.map((e) => `<option value="${e.id}" ${e.id === cur ? "selected" : ""}>${e.n}　${esc(e.title)}</option>`).join("");
    return { nav: `<nav class="toc">${links}</nav>`, select: `<select class="toc-select" id="toc-select"><option value="">目次</option>${opts}</select>` };
  }

  function indexPage() {
    return `<div class="page-head"><div class="eyebrow">Theory</div><h1>理論</h1>
      <p class="lede">世界遺産条約のしくみ、登録の流れ、危機遺産、関連条約まで。全${SECS.length}章と登録基準・用語集。用語にカーソルを合わせると意味が出る。</p>
      <div class="row"><a class="btn" href="#/theory/${SECS[0]?.id}">第1章から読む</a><a class="btn ghost" href="#/quiz/theory">理論問題を解く（${(THEORY.quiz || []).length}問）</a></div></div>
      <div class="chapters">${ENTRIES.map((e) => `<a href="#/theory/${e.id}"><span class="n">${e.n === "§" ? "資料" : "Chapter " + e.n}</span><b>${esc(e.title)}</b>
        <span>${e.id === "criteria" ? "10の基準と代表例" : e.id === "glossary" ? `${(THEORY.glossary || []).length}語` : `問題 ${quizCount(e.id)}問`}</span></a>`).join("")}</div>`;
  }

  function chapterPage(id) {
    const i = ENTRIES.findIndex((e) => e.id === id);
    const e = ENTRIES[i];
    const prev = ENTRIES[i - 1], next = ENTRIES[i + 1];
    let body;
    if (id === "criteria") body = criteriaPage();
    else if (id === "glossary") body = glossaryPage();
    else {
      const s = SECS.find((x) => x.id === id);
      const qn = quizCount(id);
      body = `${FIGS[id] ? FIGS[id]() : ""}<div class="prose">${prose(s.body)}</div>
        ${qn ? `<div class="chapter-quiz"><div class="spacer"><b>この章の確認問題</b><span class="small muted">${qn}問</span></div><a class="btn" href="#/quiz/theory/${id}">解いてみる</a></div>` : ""}`;
    }
    const t = toc(id);
    return `<div class="theory">${t.nav}<article class="chapter">${t.select}
      <div class="chapter-no">${e.n}</div><h1>${esc(e.title)}</h1><div style="height:28px"></div>
      ${body}
      <div class="chapter-nav">${prev ? `<a href="#/theory/${prev.id}"><small>← 前へ</small>${esc(prev.title)}</a>` : "<span></span>"}
        ${next ? `<a class="next" href="#/theory/${next.id}"><small>次へ →</small>${esc(next.title)}</a>` : "<span></span>"}</div></article></div>`;
  }

  function findSite(name) {
    const key = name.replace(/[（(].*$/, "").trim();
    return SITES.find((s) => s.name_ja === name) || SITES.find((s) => key.length >= 2 && s.name_ja.includes(key));
  }
  function criteriaPage() {
    return `<p class="lede">文化遺産は (i)〜(vi)、自然遺産は (vii)〜(x)。複合遺産は両方から1つ以上を満たす。件数はこのアプリの収録データから集計。</p>
      <div class="crit-grid">${(THEORY.criteria || []).map((c) => {
        const isC = CULTURAL.includes(c.no);
        const ex = (c.examples || []).map((x) => { const s = findSite(x); return s ? `<a href="#/site/${s.id}">${esc(x)}</a>` : `<span>${esc(x)}</span>`; }).join("");
        return `<div class="crit-card ${isC ? "c" : "n"}"><span class="kind">${isC ? "文化" : "自然"}</span><div class="roman">${c.no}</div>
          <h3>${esc(c.short)}</h3><p>${esc(c.text)}</p><div class="ex">${ex}</div>
          <div class="count"><b>${count((s) => s.criteria.includes(c.no))}</b> 件が該当 ・ <a class="link" href="#/sites?crit=${c.no}">一覧で見る</a></div></div>`;
      }).join("")}</div>`;
  }
  function glossaryPage() {
    return `<div class="toolbar"><label class="search"><span class="muted">⌕</span><input id="gq" placeholder="用語を絞り込む"></label></div>
      <dl class="gloss" id="gloss">${(THEORY.glossary || []).map((g) => `<div data-k="${esc((g.term + g.desc).toLowerCase())}"><dt>${esc(g.term)}</dt><dd>${esc(g.desc)}</dd></div>`).join("")}</dl>`;
  }

  function render(app, id) {
    if (!SECS.length) { app.innerHTML = '<div class="empty">理論データがありません</div>'; return; }
    if (!id || !ENTRIES.some((e) => e.id === id)) { app.innerHTML = indexPage(); return; }
    app.innerHTML = chapterPage(id);
    const sel = app.querySelector("#toc-select");
    if (sel) sel.onchange = () => { if (sel.value) location.hash = `#/theory/${sel.value}`; };
    const gq = app.querySelector("#gq");
    if (gq) gq.oninput = () => {
      const q = gq.value.trim().toLowerCase();
      app.querySelectorAll("#gloss > div").forEach((d) => { d.hidden = q && !d.dataset.k.includes(q); });
    };
  }

  // 用語ツールチップ: 画面端ではみ出さないよう1つの固定要素を位置合わせして使う
  const tip = document.createElement("div");
  tip.id = "tip";
  document.body.appendChild(tip);
  function showTip(term) {
    tip.innerHTML = term.querySelector(".tip").innerHTML;
    const r = term.getBoundingClientRect();
    tip.classList.add("on");
    const w = tip.offsetWidth, hgt = tip.offsetHeight;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const top = r.top - hgt - 8 < 8 ? r.bottom + 8 : r.top - hgt - 8;
    tip.style.left = left + "px"; tip.style.top = top + "px";
  }
  const hideTip = () => tip.classList.remove("on");
  document.addEventListener("mouseover", (e) => { const t = e.target.closest(".term"); if (t) showTip(t); else hideTip(); });
  document.addEventListener("focusin", (e) => { const t = e.target.closest(".term"); if (t) showTip(t); else hideTip(); });
  window.addEventListener("scroll", hideTip, { passive: true });
  window.addEventListener("hashchange", hideTip);

  window.TheoryView = { render };
})();
