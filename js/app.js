(function () {
  const SITES = window.SITES || [];
  const THEORY = window.THEORY || {};
  const { generate, AUTO_TYPES, byId, shuffle } = window.QuizGen;
  const app = document.getElementById("app");
  const REGIONS = ["アジア・太平洋", "ヨーロッパ・北米", "アフリカ", "アラブ諸国", "ラテンアメリカ・カリブ"];
  const CRITERIA = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
  const CULTURAL = CRITERIA.slice(0, 6);
  const COUNTRIES = [...new Set(SITES.flatMap((s) => s.states_ja))].sort((a, b) => a.localeCompare(b, "ja"));
  let cleanup = null; // 画面離脱時の後始末（タイマー・地図・キー操作）

  // ---------- 小物 ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const h = (html) => { app.innerHTML = html; };
  const $ = (sel, root = app) => root.querySelector(sel);
  const $$ = (sel, root = app) => [...root.querySelectorAll(sel)];
  const critTags = (s) => `<span class="crit">${s.criteria.map((c) => `<i class="${CULTURAL.includes(c) ? "c" : "n"}">${c}</i>`).join("")}</span>`;
  const critStr = (s) => s.criteria.map((c) => `(${c})`).join("");
  const cat = (s) => `<span class="cat"><span class="dot ${s.category}"></span>${s.category}</span>`;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const fmtSec = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const hasLeaflet = () => typeof window.L !== "undefined";
  const head = (eyebrow, title, lede) => `<div class="page-head"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}</div>`;

  function makeMap(el, lat, lon, zoom) {
    if (!hasLeaflet()) { el.innerHTML = '<div class="empty">地図はネット接続時のみ表示</div>'; return null; }
    const m = L.map(el, { scrollWheelZoom: false, minZoom: 2, worldCopyJump: true }).setView([lat, lon], zoom);
    // 縮尺8までは地理院タイル（世界の地名が日本語）、それより拡大したら OpenStreetMap
    L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png", {
      minZoom: 2, maxZoom: 8, attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>',
    }).addTo(m);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      minZoom: 9, maxZoom: 18, attribution: "&copy; OpenStreetMap contributors",
    }).addTo(m);
    return m;
  }
  const pinIcon = (s) => L.divIcon({
    className: "", iconSize: [24, 32], iconAnchor: [12, 31], popupAnchor: [0, -28],
    html: `<span class="pin ${s ? s.category : ""} ${s && s.danger ? "danger" : ""}"></span>`,
  });
  const pin = (m, lat, lon, s) => L.marker([lat, lon], { icon: pinIcon(s) }).addTo(m);
  const popupCard = (s) => `<div class="pop">${s.image ? `<img src="${esc(s.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
    <div class="pop-body"><div class="pop-meta"><span class="dot ${s.category}"></span>${s.category} ・ ${s.year}${s.danger ? ' ・ <span style="color:var(--ng)">危機遺産</span>' : ""}</div>
    <b>${esc(s.name_ja)}</b><div class="pop-sub">${esc(s.states_ja.join("・"))}</div>
    <div class="pop-foot">${critTags(s)}<a href="#/site/${s.id}">詳細 →</a></div></div></div>`;

  function refreshSide() {
    const n = Object.keys(Store.state.learned).length;
    document.getElementById("side-learned").textContent = n;
    document.getElementById("side-meter").style.width = pct(n, SITES.length) + "%";
    const w = Object.keys(Store.state.wrong).length;
    document.getElementById("nav-wrong").textContent = w || "";
  }

  // ---------- 範囲フィルタ（一覧・地図・演習・カードで共用） ----------
  const defaultFilter = () => ({ q: "", region: "", country: "", category: "", criterion: "", danger: "", learned: "", from: "", to: "" });
  const isFiltered = (f) => Object.entries(f).some(([k, v]) => k !== "q" && v);
  function filterSites(f) {
    const q = f.q.trim().toLowerCase();
    return SITES.filter((s) =>
      (!q || (s.name_ja + s.name_en + s.states_ja.join("") + s.keywords.join("")).toLowerCase().includes(q)) &&
      (!f.region || s.region === f.region) &&
      (!f.country || s.states_ja.includes(f.country)) &&
      (!f.category || s.category === f.category) &&
      (!f.criterion || s.criteria.includes(f.criterion)) &&
      (!f.danger || s.danger) &&
      (!f.learned || (f.learned === "yes") === Store.isLearned(s.id)) &&
      (!f.from || s.year >= +f.from) &&
      (!f.to || s.year <= +f.to));
  }
  function filterForm(f, withSearch) {
    const sel = (key, all, list) => `<select data-f="${key}" class="${f[key] ? "on" : ""}"><option value="">${all}</option>${list.map(([v, l]) => `<option value="${esc(v)}" ${v === f[key] ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    const same = (arr) => arr.map((x) => [x, x]);
    return `<div class="toolbar">
      ${withSearch ? `<label class="search"><span class="muted">⌕</span><input data-f="q" value="${esc(f.q)}" placeholder="名称・国・キーワードで検索"></label>` : ""}
      <div class="filters">
        ${sel("region", "地域", same(REGIONS))}
        ${sel("country", "国", same(COUNTRIES))}
        ${sel("category", "種別", same(["文化", "自然", "複合"]))}
        ${sel("criterion", "登録基準", CRITERIA.map((c) => [c, `基準 (${c})`]))}
        ${sel("danger", "危機遺産", [["1", "危機遺産のみ"]])}
        ${sel("learned", "学習状態", [["yes", "学習済み"], ["no", "未学習"]])}
        <input data-f="from" type="number" min="1978" max="2026" value="${esc(f.from)}" placeholder="登録年〜" class="${f.from ? "on" : ""}">
        <input data-f="to" type="number" min="1978" max="2026" value="${esc(f.to)}" placeholder="〜登録年" class="${f.to ? "on" : ""}">
      </div></div>`;
  }
  function bindFilter(f, onChange) {
    $$("[data-f]").forEach((el) => el.addEventListener(el.tagName === "INPUT" ? "input" : "change", () => {
      f[el.dataset.f] = el.value;
      if (el.dataset.f !== "q") el.classList.toggle("on", !!el.value);
      onChange();
    }));
  }
  function bindClear(f, rerender) {
    const b = $("#clear");
    if (b) b.onclick = () => { Object.assign(f, defaultFilter(), { q: f.q }); rerender(); };
  }

  // ---------- ホーム ----------
  function viewHome() {
    const st = Store.state;
    const learned = Object.keys(st.learned).length;
    const jp = SITES.filter((s) => s.states_ja.includes("日本"));
    const jpLearned = jp.filter((s) => Store.isLearned(s.id)).length;
    const wrongN = Object.keys(st.wrong).length;
    const byRegion = REGIONS.map((r) => {
      const all = SITES.filter((s) => s.region === r);
      return { r, n: all.length, l: all.filter((s) => Store.isLearned(s.id)).length };
    });
    const next = pickUnlearned();
    h(`${head("Dashboard", "今日も一歩ずつ。", `全${SITES.length}件の世界遺産と理論を、読んで・解いて・覚える。`)}
      <div class="stats">
        <div><div class="lbl">学習済みの遺産</div><div class="num">${learned}<small> / ${SITES.length}</small></div></div>
        <div><div class="lbl">日本の遺産</div><div class="num">${jpLearned}<small> / ${jp.length}</small></div></div>
        <div><div class="lbl">累計正答率</div><div class="num">${pct(st.correct, st.answered)}<small>%</small></div><div class="small muted">${st.correct} / ${st.answered} 問</div></div>
        <div><div class="lbl">苦手問題</div><div class="num">${wrongN}<small> 問</small></div></div>
      </div>
      <h2>はじめる</h2>
      <div class="actions">
        <a href="#/site/${next.id}"><b>次の遺産を学ぶ</b><span>${esc(next.name_ja)}</span></a>
        <a href="#/quiz"><b>問題演習</b><span>範囲と種類を選んで解く</span></a>
        <a href="#/flash"><b>暗記カード</b><span>名称・キーワード・地図から</span></a>
        <a href="#/theory"><b>理論を読む</b><span>${(THEORY.sections || []).length}章と登録基準・用語集</span></a>
        <a href="#/exam"><b>模擬試験</b><span>時間制限つきで実力確認</span></a>
        ${wrongN ? `<a href="#/review"><b>苦手を復習</b><span>${wrongN}問が待っている</span></a>` : ""}
      </div>
      <h2>地域別の進み具合</h2>
      <div class="region-bars">${byRegion.map((x) => `<div class="rb"><span>${x.r}</span><div class="meter"><i style="width:${pct(x.l, x.n)}%"></i></div><span class="mono">${x.l} / ${x.n}</span></div>`).join("")}</div>
      ${st.exams.length ? `<h2>模擬試験の記録</h2><div class="table-wrap"><table class="sites"><thead><tr><th>日時</th><th>級</th><th>得点</th><th>時間</th></tr></thead><tbody>
        ${st.exams.slice(0, 10).map((e) => `<tr style="cursor:default"><td class="mono">${new Date(e.date).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })}</td><td>${esc(e.level)}</td><td class="mono"><b>${pct(e.correct, e.total)}%</b> <span class="muted">${e.correct}/${e.total}</span></td><td class="mono muted">${fmtSec(e.sec)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <h2>データ</h2>
      <p class="small muted">遺産 ${SITES.length}件 ／ 遺産ごとの問題 ${SITES.reduce((a, s) => a + s.quiz.length, 0)}問 ／ 理論問題 ${(THEORY.quiz || []).length}問 ／ 自動生成問題 ${Object.keys(AUTO_TYPES).length}種。
        <button class="clear" id="reset">学習記録をリセット</button></p>`);
    $("#reset").onclick = (e) => {
      if (e.target.dataset.armed) { Store.reset(); refreshSide(); viewHome(); }
      else { e.target.dataset.armed = 1; e.target.textContent = "本当にリセットする（もう一度クリック）"; }
    };
  }
  function pickUnlearned() {
    const rest = SITES.filter((s) => !Store.isLearned(s.id));
    return QuizGen.pick(rest.length ? rest : SITES);
  }

  // ---------- 一覧 ----------
  const listFilter = defaultFilter();
  let listSort = "id";
  function viewSites(_, query) {
    if (query && query.crit) Object.assign(listFilter, defaultFilter(), { criterion: query.crit });
    h(`${head("Sites", "遺産一覧")}${filterForm(listFilter, true)}
      <div class="result-line"><span id="count"></span><button class="clear" id="clear">条件をクリア</button><span class="spacer"></span>
        <select id="sort"><option value="id">登録番号順</option><option value="year">登録年順</option><option value="name">名称順</option><option value="country">国順</option></select></div>
      <div class="table-wrap"><table class="sites"><thead><tr><th>No.</th><th>名称</th><th class="st">国</th><th>登録</th><th class="crit-col">基準</th></tr></thead><tbody id="list"></tbody></table></div>
      <div class="more"><button class="btn ghost" id="more" hidden>さらに表示</button></div>`);
    $("#sort").value = listSort;
    let shown = 100;
    const render = () => {
      const cmp = { id: (a, b) => a.id - b.id, year: (a, b) => a.year - b.year || a.id - b.id,
        name: (a, b) => a.name_ja.localeCompare(b.name_ja, "ja"), country: (a, b) => a.states_ja[0].localeCompare(b.states_ja[0], "ja") }[listSort];
      const res = filterSites(listFilter).sort(cmp);
      $("#count").textContent = `${res.length}件`;
      $("#clear").hidden = !isFiltered(listFilter);
      $("#list").innerHTML = res.slice(0, shown).map((s) => `<tr data-id="${s.id}">
        <td class="no mono">${s.id}</td>
        <td class="nm"><span class="dot ${s.category}"></span> <b>${esc(s.name_ja)}</b> ${s.danger ? '<span class="tag danger">危機</span>' : ""} ${Store.isLearned(s.id) ? '<span class="tag done">済</span>' : ""}<span class="en">${esc(s.name_en)}</span></td>
        <td class="st">${esc(s.states_ja.join("・"))}</td><td class="mono">${s.year}</td><td class="crit-col">${critTags(s)}</td></tr>`).join("")
        || '<tr><td colspan="5" class="empty">該当する遺産はありません</td></tr>';
      $("#more").hidden = res.length <= shown;
    };
    $("#list").onclick = (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) location.hash = `#/site/${tr.dataset.id}`; };
    bindFilter(listFilter, () => { shown = 100; render(); });
    bindClear(listFilter, () => viewSites());
    $("#sort").onchange = (e) => { listSort = e.target.value; render(); };
    $("#more").onclick = () => { shown += 200; render(); };
    render();
  }

  // ---------- 詳細 ----------
  function viewSite(id) {
    const s = byId.get(+id);
    if (!s) return h('<div class="empty">見つかりません</div>');
    const idx = SITES.indexOf(s);
    const prev = SITES[idx - 1], next = SITES[idx + 1];
    const crit = (THEORY.criteria || []);
    const learned = Store.isLearned(s.id);
    h(`<div class="crumbs"><a href="#/sites">← 遺産一覧</a><span>${prev ? `<a href="#/site/${prev.id}">前へ</a>` : ""}　${next ? `<a href="#/site/${next.id}">次へ</a>` : ""}</span></div>
      ${s.image ? `<figure class="hero"><img src="${esc(s.image)}" alt="${esc(s.name_ja)}" referrerpolicy="no-referrer" onerror="this.parentNode.remove()">${s.image_credit ? `<figcaption>© ${esc(s.image_credit)}</figcaption>` : ""}</figure>` : ""}
      <div class="detail-title"><div class="eyebrow">No. ${s.id} ・ ${esc(s.region)}</div><h1>${esc(s.name_ja)}</h1><p class="en">${esc(s.name_en)}</p></div>
      <dl class="meta-grid">
        <div><dt>国</dt><dd>${esc(s.states_ja.join("・"))}</dd></div>
        <div><dt>種別</dt><dd>${cat(s)}</dd></div>
        <div><dt>登録年</dt><dd class="mono">${s.year}${s.ext_years.length ? `<span class="small muted"> ／ 変更 ${s.ext_years.join(", ")}</span>` : ""}</dd></div>
        <div><dt>登録基準</dt><dd>${critTags(s)}${s.criteria_supplemented ? ' <span class="small muted">AI補完</span>' : ""}</dd></div>
        <div><dt>危機遺産</dt><dd>${s.danger ? `<span class="tag danger">記載中</span> <span class="mono small">${s.danger_years.join(", ")}</span>` : '<span class="muted">—</span>'}</dd></div>
        <div><dt>面積</dt><dd class="mono">${s.area_ha ? `${Number(s.area_ha).toLocaleString()} ha` : '<span class="muted">—</span>'}</dd></div>
        <div><dt>構成資産</dt><dd class="mono">${s.components}</dd></div>
        <div><dt>その他</dt><dd>${s.transboundary ? '<span class="tag">国境をまたぐ</span> ' : ""}<a class="link small" href="https://whc.unesco.org/en/list/${s.id}" target="_blank" rel="noopener">UNESCO ↗</a></dd></div>
      </dl>
      <div class="row detail-actions"><button class="btn ${learned ? "ghost" : ""}" id="learn">${learned ? "✓ 学習済み" : "学習済みにする"}</button><a class="btn ghost" href="#/quiz/site/${s.id}">この遺産の問題を解く</a></div>
      ${s.summary ? `<section class="block"><div class="lbl">概要</div><p>${esc(s.summary)}</p></section>` : ""}
      ${s.history ? `<section class="block"><div class="lbl">歴史・背景</div><p>${esc(s.history)}</p></section>` : ""}
      ${s.criteria.length ? `<section class="block"><div class="lbl">登録基準</div><div class="crit-list">${s.criteria.map((c) => {
        const t = crit.find((x) => x.no === c); return `<div><b>${c}</b><span>${t ? esc(t.short) : ""}</span></div>`; }).join("")}</div></section>` : ""}
      ${s.keywords.length ? `<section class="block"><div class="lbl">キーワード</div><div class="kw">${s.keywords.map((k) => `<span>${esc(k)}</span>`).join("")}</div></section>` : ""}
      ${s.points.length ? `<section class="block"><div class="lbl">頻出ポイント</div><ol class="points">${s.points.map((p) => `<li><span>${esc(p)}</span></li>`).join("")}</ol></section>` : ""}
      ${s.lat != null ? `<section class="block"><div class="lbl">位置</div><div class="map" id="map"></div></section>` : ""}`);
    $("#learn").onclick = () => { Store.toggleLearned(s.id); refreshSide(); viewSite(id); };
    if (s.lat != null) {
      const m = makeMap($("#map"), s.lat, s.lon, 6);
      if (m) { pin(m, s.lat, s.lon, s); cleanup = () => m.remove(); }
    }
  }

  // ---------- 全体地図 ----------
  const mapFilter = defaultFilter();
  const JUMPS = [
    ["世界", [[-50, -170], [70, 190]]], ["日本", [[24, 123], [46, 146]]], ["東アジア", [[18, 73], [53, 146]]],
    ["東南・南アジア", [[-11, 60], [36, 141]]], ["ヨーロッパ", [[35, -12], [65, 42]]], ["中東・北アフリカ", [[12, -18], [42, 63]]],
    ["アフリカ", [[-35, -20], [20, 52]]], ["北米", [[14, -170], [72, -50]]], ["中南米・カリブ", [[-56, -118], [33, -33]]], ["オセアニア", [[-48, 110], [10, 180]]],
  ];
  function viewMap() {
    h(`${head("Map", "世界遺産マップ")}${filterForm(mapFilter, true)}
      <div class="result-line"><span id="count"></span><button class="clear" id="clear">条件をクリア</button></div>
      <div class="jumps" id="jumps">${JUMPS.map(([n], i) => `<button data-j="${i}">${n}</button>`).join("")}</div>
      <div class="map-layout">
        <div class="map big" id="map"></div>
        <aside class="map-list"><div class="map-list-head"><span id="inview"></span><span class="small muted">表示範囲内</span></div><ul id="mlist"></ul></aside>
      </div>
      <div class="legend"><span class="cat"><span class="pin-mini 文化"></span>文化</span><span class="cat"><span class="pin-mini 自然"></span>自然</span><span class="cat"><span class="pin-mini 複合"></span>複合</span><span class="cat"><span class="pin-mini danger"></span>危機遺産</span><span>数字の丸はまとまり（クリックで拡大）</span></div>`);
    bindClear(mapFilter, viewMap);
    const m = makeMap($("#map"), 30, 20, 2);
    if (!m) return;
    m.scrollWheelZoom.enable();
    cleanup = () => m.remove();
    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false, maxClusterRadius: 45, spiderfyOnMaxZoom: true,
      iconCreateFunction: (c) => {
        const n = c.getChildCount(), size = n < 10 ? 30 : n < 50 ? 36 : n < 200 ? 44 : 52;
        return L.divIcon({ className: "", iconSize: [size, size], html: `<span class="cluster" style="width:${size}px;height:${size}px">${n}</span>` });
      },
    }).addTo(m);
    const markers = new Map();
    let shown = [];
    const renderList = () => {
      const b = m.getBounds();
      const inView = shown.filter((s) => b.contains([s.lat, s.lon]));
      $("#inview").textContent = `${inView.length}件`;
      $("#mlist").innerHTML = inView.slice(0, 150).map((s) => `<li data-id="${s.id}"><span class="pin-mini ${s.category} ${s.danger ? "danger" : ""}"></span>
        <span><b>${esc(s.name_ja)}</b><span class="small muted">${esc(s.states_ja.join("・"))} ・ ${s.year}</span></span></li>`).join("")
        + (inView.length > 150 ? `<li class="small muted" style="cursor:default">ほか ${inView.length - 150}件。拡大すると絞り込まれる</li>` : "");
    };
    const render = () => {
      cluster.clearLayers(); markers.clear();
      shown = filterSites(mapFilter).filter((s) => s.lat != null).sort((a, b) => a.name_ja.localeCompare(b.name_ja, "ja"));
      $("#count").textContent = `${shown.length}件`;
      $("#clear").hidden = !isFiltered(mapFilter);
      cluster.addLayers(shown.map((s) => {
        const mk = L.marker([s.lat, s.lon], { icon: pinIcon(s), title: s.name_ja }).bindPopup(popupCard(s), { maxWidth: 260, minWidth: 240, className: "pop-wrap" });
        markers.set(s.id, mk);
        return mk;
      }));
      renderList();
    };
    m.on("moveend", renderList);
    $("#mlist").onclick = (e) => {
      const li = e.target.closest("li[data-id]");
      if (li) { const mk = markers.get(+li.dataset.id); cluster.zoomToShowLayer(mk, () => { m.panTo(mk.getLatLng()); mk.openPopup(); }); }
    };
    $("#jumps").onclick = (e) => { const b = e.target.closest("[data-j]"); if (b) m.flyToBounds(JUMPS[+b.dataset.j][1], { duration: 0.8 }); };
    bindFilter(mapFilter, render);
    render();
  }

  // ---------- 1問ずつ解く（演習・復習で共用） ----------
  function runQuiz(questions, title, onAgain) {
    let i = 0, ok = 0, qmap = null;
    const wrongs = [];
    const finish = () => {
      if (qmap) { qmap.remove(); qmap = null; }
      refreshSide();
      h(`<div class="quiz">${head("Result", esc(title))}
        <div class="result-big">${pct(ok, questions.length)}<small>%</small></div><p class="muted">${ok} / ${questions.length} 問正解</p>
        <div class="row" style="margin:24px 0 8px"><button class="btn" id="again">もう一度</button><a class="btn ghost" href="#/review">苦手復習へ</a></div>
        ${wrongs.length ? `<h2>間違えた問題</h2>${wrongs.map((q) => `<div class="review-item"><div class="q">${esc(q.q)}</div>
          正解 <b>${esc(q.choices[q.answer])}</b><div class="muted">${esc(q.exp)}</div>${q.siteId ? `<a class="link small" href="#/site/${q.siteId}">遺産ページへ</a>` : ""}</div>`).join("")}` : ""}</div>`);
      $("#again").onclick = onAgain;
    };
    const show = () => {
      if (qmap) { qmap.remove(); qmap = null; }
      if (i >= questions.length) return finish();
      const q = questions[i];
      h(`<div class="quiz"><div class="quiz-top"><span>${esc(title)}</span><div class="meter"><i style="width:${pct(i, questions.length)}%"></i></div><span class="mono">${i + 1} / ${questions.length}</span></div>
        <div class="q-no">Q${i + 1}</div>${q.map ? '<div class="qmap" id="qmap"></div>' : ""}
        <p class="q-text">${esc(q.q)}</p>
        <div class="choices">${q.choices.map((c, k) => `<button class="choice" data-k="${k}"><span class="k">${"ABCD"[k]}</span><span>${esc(c)}</span></button>`).join("")}</div>
        <div id="fb"></div>
        <div class="row small muted" style="margin-top:28px"><span><span class="kbd">1</span>〜<span class="kbd">4</span> で解答　<span class="kbd">Enter</span> で次へ</span><span class="spacer"></span><button class="clear" id="quit">ここで終了する</button></div></div>`);
      if (q.map) { qmap = makeMap($("#qmap"), q.map.lat, q.map.lon, 3); if (qmap) pin(qmap, q.map.lat, q.map.lon, null); }
      $$(".choice").forEach((b) => b.onclick = () => {
        const k = +b.dataset.k, right = k === q.answer;
        if (right) ok++; else wrongs.push(q);
        Store.record(q, right);
        $$(".choice").forEach((x) => { x.disabled = true; });
        $$(".choice")[q.answer].classList.add("correct");
        if (!right) b.classList.add("wrong");
        const s = q.siteId ? byId.get(q.siteId) : null;
        $("#fb").innerHTML = `<div class="feedback ${right ? "ok" : "ng"}"><div class="verdict">${right ? "正解" : "不正解"}</div>${esc(q.exp)}
          ${s ? `<div class="small muted" style="margin-top:8px"><a class="link" href="#/site/${s.id}" target="_blank">${esc(s.name_ja)}</a>　${esc(s.states_ja.join("・"))} ・ ${s.year} ・ ${critStr(s)}</div>` : ""}
          <div style="margin-top:14px"><button class="btn" id="next">次へ</button></div></div>`;
        $("#next").onclick = () => { i++; show(); };
        $("#next").focus();
      });
      $("#quit").onclick = () => { questions = questions.slice(0, i); finish(); };
    };
    const onKey = (e) => { if (/^[1-4]$/.test(e.key)) $$(".choice")[+e.key - 1]?.click(); };
    document.addEventListener("keydown", onKey);
    cleanup = () => { document.removeEventListener("keydown", onKey); if (qmap) qmap.remove(); };
    show();
  }

  // ---------- 問題演習 ----------
  const quizFilter = defaultFilter();
  const quizOpts = { sources: new Set(["auto", "hand"]), autoTypes: Object.keys(AUTO_TYPES), count: 20 };
  function viewQuiz(arg, arg2) {
    if (arg === "site") {
      const s = byId.get(+arg2);
      const qs = generate({ sites: [s], sources: new Set(["hand"]), count: 10 })
        .concat(generate({ sites: [s], sources: new Set(["auto"]), count: 6 }));
      return runQuiz(shuffle(qs), s.name_ja, () => viewQuiz("site", arg2));
    }
    if (arg === "theory") {
      if (arg2) { // 章ごとの確認問題
        const sec = (THEORY.sections || []).find((x) => x.id === arg2);
        const qs = shuffle((THEORY.quiz || []).map((t, i) => ({ t, i })).filter((x) => x.t.section === arg2)).map(({ t, i }) => {
          const choices = shuffle(t.choices);
          return { id: `theory:${i}`, q: t.q, choices, answer: choices.indexOf(t.choices[t.answer]), exp: t.exp || "", section: t.section };
        });
        return runQuiz(qs, sec ? sec.title : "理論", () => viewQuiz("theory", arg2));
      }
      return runQuiz(generate({ sites: [], sources: new Set(["theory"]), count: 20 }), "理論問題", () => viewQuiz("theory"));
    }
    const tg = (attr, k, label, on) => `<label class="toggle"><input type="checkbox" ${attr}="${k}" ${on ? "checked" : ""}><span>${label}</span></label>`;
    h(`${head("Practice", "問題演習", "範囲と問題の種類を選んで、1問ずつ解く。間違えた問題は苦手リストに入る。")}
      <div class="setup">
        <section><div class="lbl">出題範囲</div><div>${filterForm(quizFilter, false)}<div class="result-line" style="margin:6px 0 0"><span id="count"></span><button class="clear" id="clear">条件をクリア</button></div></div></section>
        <section><div class="lbl">問題の種類</div><div class="toggles">${tg("data-src", "hand", "遺産ごとの知識問題", quizOpts.sources.has("hand"))}${tg("data-src", "auto", "データ自動生成", quizOpts.sources.has("auto"))}${tg("data-src", "theory", "理論", quizOpts.sources.has("theory"))}</div></section>
        <section><div class="lbl">自動生成の内訳</div><div class="toggles">${Object.entries(AUTO_TYPES).map(([k, v]) => tg("data-type", k, v, quizOpts.autoTypes.includes(k))).join("")}</div></section>
        <section><div class="lbl">問題数</div><div class="seg" id="cnt">${[10, 20, 30, 50, 100].map((n) => `<button data-n="${n}" class="${n === quizOpts.count ? "on" : ""}">${n}</button>`).join("")}</div></section>
      </div>
      <div class="row" style="margin-top:28px"><button class="btn" id="start">開始する</button><span class="small muted" id="msg"></span></div>`);
    const upd = () => { $("#count").textContent = `範囲内の遺産 ${filterSites(quizFilter).length}件`; $("#clear").hidden = !isFiltered(quizFilter); };
    bindFilter(quizFilter, upd); bindClear(quizFilter, () => viewQuiz()); upd();
    $$("[data-src]").forEach((c) => c.onchange = () => { c.checked ? quizOpts.sources.add(c.dataset.src) : quizOpts.sources.delete(c.dataset.src); });
    $$("[data-type]").forEach((c) => c.onchange = () => { quizOpts.autoTypes = $$("[data-type]").filter((x) => x.checked).map((x) => x.dataset.type); });
    $$("#cnt button").forEach((b) => b.onclick = () => { quizOpts.count = +b.dataset.n; $$("#cnt button").forEach((x) => x.classList.toggle("on", x === b)); });
    $("#start").onclick = () => {
      const sites = filterSites(quizFilter);
      if (!quizOpts.sources.size || !sites.length) { $("#msg").textContent = "種類か範囲を選んでください"; return; }
      const qs = generate({ sites, sources: quizOpts.sources, autoTypes: quizOpts.autoTypes, count: quizOpts.count });
      if (!qs.length) { $("#msg").textContent = "この条件では問題を作れません"; return; }
      runQuiz(qs, "問題演習", () => viewQuiz());
    };
  }

  // ---------- 苦手復習 ----------
  function viewReview() {
    const items = Object.values(Store.state.wrong).sort((a, b) => b.miss - a.miss);
    h(`${head("Review", "苦手復習", "間違えた問題がここに溜まる。2回続けて正解すると卒業。")}
      <div class="row" style="margin-bottom:24px"><button class="btn" id="go" ${items.length ? "" : "disabled"}>苦手問題を解く（最大30問）</button><span class="small muted">${items.length}問</span></div>
      ${items.length ? items.slice(0, 100).map((w) => `<div class="review-item"><div class="row"><span class="tag danger">×${w.miss}</span>${w.streak ? `<span class="tag done">連続正解 ${w.streak}</span>` : ""}</div>
        <div class="q" style="margin-top:6px">${esc(w.q.q)}</div><span class="muted">正解 </span>${esc(w.q.choices[w.q.answer])}</div>`).join("") : '<div class="empty">苦手問題はまだない。いい調子。</div>'}`);
    if (items.length) $("#go").onclick = () => runQuiz(shuffle(items.slice(0, 60)).slice(0, 30).map((w) => w.q), "苦手復習", viewReview);
  }

  // ---------- 暗記カード ----------
  const flashFilter = defaultFilter();
  const flashOpts = { mode: "name", onlyWeak: true };
  function viewFlash() {
    h(`${head("Flashcards", "暗記カード", "表を見て思い出し、めくって確認。覚えた度合いを3段階で記録する。")}
      <div class="setup">
        <section><div class="lbl">範囲</div><div>${filterForm(flashFilter, false)}</div></section>
        <section><div class="lbl">表面</div><div class="seg" id="mode"><button data-m="name">遺産名</button><button data-m="keyword">キーワード</button><button data-m="map">地図の位置</button></div></section>
        <section><div class="lbl">オプション</div><div class="toggles"><label class="toggle"><input type="checkbox" id="weak" ${flashOpts.onlyWeak ? "checked" : ""}><span>「覚えた」カードを除く</span></label></div></section>
      </div>
      <div class="row" style="margin-top:28px"><button class="btn" id="start">開始する</button><span class="small muted" id="count"></span></div>`);
    const deck = () => filterSites(flashFilter).filter((s) => !flashOpts.onlyWeak || (Store.state.flash[s.id] || 0) < 2)
      .filter((s) => flashOpts.mode !== "keyword" || s.keywords.length).filter((s) => flashOpts.mode !== "map" || s.lat != null);
    const upd = () => {
      $("#count").textContent = `${deck().length}枚`;
      $$("#mode button").forEach((b) => b.classList.toggle("on", b.dataset.m === flashOpts.mode));
    };
    bindFilter(flashFilter, upd); upd();
    $$("#mode button").forEach((b) => b.onclick = () => { flashOpts.mode = b.dataset.m; upd(); });
    $("#weak").onchange = (e) => { flashOpts.onlyWeak = e.target.checked; upd(); };
    $("#start").onclick = () => { const d = shuffle(deck()); if (d.length) runFlash(d); };
  }
  function runFlash(cards) {
    let i = 0, flipped = false, fmap = null;
    const show = () => {
      if (fmap) { fmap.remove(); fmap = null; }
      if (i >= cards.length) return h(`<div class="empty"><div class="result-big">${cards.length}<small> 枚</small></div><p>おつかれさま。</p><a class="btn" href="#/flash">戻る</a></div>`);
      const s = cards[i];
      const front = flashOpts.mode === "keyword" ? `<div class="front">${shuffle(s.keywords).slice(0, 3).map(esc).join("<br>")}</div><div class="hint">この遺産は？</div>`
        : flashOpts.mode === "map" ? `<div class="qmap" id="fmap"></div><div class="hint">この位置にある遺産は？</div>`
        : `<div class="front">${esc(s.name_ja)}</div><div class="hint">${esc(s.name_en)}</div>`;
      const back = `<div class="eyebrow">No. ${s.id}</div><h3 style="font-size:22px">${esc(s.name_ja)}</h3>
        <div class="row small" style="margin:6px 0 14px">${cat(s)}<span>${esc(s.states_ja.join("・"))}</span><span class="mono">${s.year}</span>${critTags(s)}${s.danger ? '<span class="tag danger">危機</span>' : ""}</div>
        <p style="margin:0 0 14px;font-size:14px;color:var(--ink-2)">${esc(s.summary)}</p><div class="kw">${s.keywords.map((k) => `<span>${esc(k)}</span>`).join("")}</div>`;
      h(`<div class="flash-wrap"><div class="quiz-top"><span>暗記カード</span><div class="meter"><i style="width:${pct(i, cards.length)}%"></i></div><span class="mono">${i + 1} / ${cards.length}</span></div>
        <div class="flash ${flipped ? "back" : ""}" id="card">${flipped ? back : front + '<div class="hint"><span class="kbd">Space</span> またはクリックでめくる</div>'}</div>
        ${flipped ? `<div class="rate"><button class="btn ghost" data-lv="0">まだ <span class="kbd">1</span></button><button class="btn ghost" data-lv="1">あいまい <span class="kbd">2</span></button><button class="btn" data-lv="2">覚えた <span class="kbd">3</span></button></div>` : ""}
        <div class="row" style="justify-content:center;margin-top:16px"><a class="link small" href="#/site/${s.id}" target="_blank">詳細ページ ↗</a></div></div>`);
      if (!flipped && flashOpts.mode === "map") { fmap = makeMap($("#fmap"), s.lat, s.lon, 4); if (fmap) pin(fmap, s.lat, s.lon, null); }
      $("#card").onclick = () => { if (!flipped) { flipped = true; show(); } };
      $$("[data-lv]").forEach((b) => b.onclick = () => rate(+b.dataset.lv));
    };
    const rate = (lv) => {
      const s = cards[i];
      Store.setFlash(s.id, lv);
      if (lv === 0) cards.splice(Math.min(cards.length, i + 5), 0, s); // 「まだ」は少し後で再出題
      i++; flipped = false; show();
    };
    const onKey = (e) => {
      if (e.key === " " && !flipped) { e.preventDefault(); flipped = true; show(); }
      else if (flipped && /^[1-3]$/.test(e.key)) rate(+e.key - 1);
    };
    document.addEventListener("keydown", onKey);
    cleanup = () => { document.removeEventListener("keydown", onKey); if (fmap) fmap.remove(); };
    show();
  }

  // ---------- 模擬試験 ----------
  const EXAM_LEVELS = {
    "1級": { count: 90, min: 90, desc: "全範囲", meta: "90問 ・ 90分" },
    "2級": { count: 60, min: 50, desc: "全範囲", meta: "60問 ・ 50分" },
    "3級": { count: 60, min: 50, desc: "日本の遺産を多めに", meta: "60問 ・ 50分" },
    "ミニ": { count: 20, min: 15, desc: "すきま時間に", meta: "20問 ・ 15分" },
  };
  function viewExam() {
    h(`${head("Mock exam", "模擬試験", "解答中は正誤を表示しない本番形式。時間切れで自動採点。問題数・時間はおおよその目安（正確な実施要項は公式サイトで確認）。")}
      <div class="levels">${Object.entries(EXAM_LEVELS).map(([k, v]) => `<div><div class="lv">${k}</div><div class="small muted">${v.desc}</div><div class="mono small">${v.meta}</div>
        <button class="btn" data-lv="${k}">開始する</button></div>`).join("")}</div>`);
    $$("[data-lv]").forEach((b) => b.onclick = () => startExam(b.dataset.lv));
  }
  function startExam(level) {
    const cfg = EXAM_LEVELS[level];
    let qs;
    if (level === "3級") {
      const jp = SITES.filter((s) => s.states_ja.includes("日本"));
      qs = generate({ sites: jp, sources: new Set(["hand", "auto"]), count: 20 })
        .concat(generate({ sites: SITES, sources: new Set(["hand", "auto", "theory"]), count: cfg.count - 20 }));
    } else {
      const nT = Math.round(cfg.count * 0.2); // 理論 約2割
      qs = generate({ sites: [], sources: new Set(["theory"]), count: nT })
        .concat(generate({ sites: SITES, sources: new Set(["hand", "auto"]), count: cfg.count - nT }));
    }
    if (qs.length < cfg.count) { // 足りない分は自動生成で補う
      const ids = new Set(qs.map((q) => q.id));
      qs = qs.concat(generate({ sites: SITES, sources: new Set(["auto"]), count: cfg.count * 2 }).filter((q) => !ids.has(q.id)).slice(0, cfg.count - qs.length));
    }
    qs = shuffle(qs);
    const ans = new Array(qs.length).fill(null);
    let cur = 0, left = cfg.min * 60, done = false, qmap = null;
    const started = Date.now();
    const timer = setInterval(() => {
      left--;
      const t = $("#timer");
      if (t) { t.textContent = fmtSec(Math.max(0, left)); t.classList.toggle("low", left < 300); }
      if (left <= 0) grade();
    }, 1000);
    const show = () => {
      if (qmap) { qmap.remove(); qmap = null; }
      const q = qs[cur];
      const answered = ans.filter((a) => a != null).length;
      h(`<div class="quiz"><div class="quiz-top"><span>模擬試験 ${level}</span><div class="meter"><i style="width:${pct(answered, qs.length)}%"></i></div><span class="timer" id="timer">${fmtSec(left)}</span></div>
        <div class="q-no">問 ${cur + 1} <span class="muted">/ ${qs.length}</span></div>${q.map ? '<div class="qmap" id="qmap"></div>' : ""}
        <p class="q-text">${esc(q.q)}</p>
        <div class="choices">${q.choices.map((c, k) => `<button class="choice ${ans[cur] === k ? "picked" : ""}" data-k="${k}"><span class="k">${"ABCD"[k]}</span><span>${esc(c)}</span></button>`).join("")}</div>
        <div class="row" style="margin-top:24px"><button class="btn ghost" id="prev" ${cur ? "" : "disabled"}>← 前</button><button class="btn ghost" id="nxt" ${cur < qs.length - 1 ? "" : "disabled"}>次 →</button>
          <span class="spacer"></span><button class="btn" id="submit">提出して採点</button></div>
        <div class="exam-nav">${qs.map((_, k) => `<button data-go="${k}" class="${ans[k] != null ? "done" : ""} ${k === cur ? "cur" : ""}">${k + 1}</button>`).join("")}</div></div>`);
      if (q.map) { qmap = makeMap($("#qmap"), q.map.lat, q.map.lon, 3); if (qmap) pin(qmap, q.map.lat, q.map.lon, null); }
      $$(".choice").forEach((b) => b.onclick = () => { ans[cur] = +b.dataset.k; if (cur < qs.length - 1) cur++; show(); });
      $("#prev").onclick = () => { cur--; show(); };
      $("#nxt").onclick = () => { cur++; show(); };
      $$("[data-go]").forEach((b) => b.onclick = () => { cur = +b.dataset.go; show(); });
      $("#submit").onclick = (e) => {
        const un = ans.filter((a) => a == null).length;
        if (un && !e.target.dataset.armed) { e.target.dataset.armed = 1; e.target.textContent = `未回答 ${un}問。もう一度押すと提出`; return; }
        grade();
      };
    };
    const grade = () => {
      if (done) return;
      done = true; clearInterval(timer);
      if (qmap) { qmap.remove(); qmap = null; }
      const sec = Math.round((Date.now() - started) / 1000);
      let ok = 0;
      qs.forEach((q, k) => { const r = ans[k] === q.answer; if (r) ok++; Store.record(q, r); });
      Store.addExam({ date: Date.now(), level, total: qs.length, correct: ok, sec });
      refreshSide();
      const p = pct(ok, qs.length);
      h(`<div class="quiz">${head("Result", `模擬試験 ${level}`)}
        <div class="result-big">${p}<small>%</small></div>
        <p class="muted">${ok} / ${qs.length} 問正解 ・ ${fmtSec(sec)} ・ ${p >= 60 ? "合格ライン（目安60%）を突破" : `合格ライン（目安60%）まであと ${Math.ceil(qs.length * 0.6) - ok}問`}</p>
        <div class="row" style="margin:20px 0"><a class="btn" href="#/exam">模擬試験トップへ</a><a class="btn ghost" href="#/review">苦手復習へ</a></div>
        <h2>全問の解説</h2>${qs.map((q, k) => `<div class="review-item"><div class="q"><span class="mark ${ans[k] === q.answer ? "o" : "x"}">${ans[k] === q.answer ? "○" : "×"}</span>問${k + 1}. ${esc(q.q)}</div>
          <span class="muted">あなた</span> ${ans[k] == null ? "未回答" : esc(q.choices[ans[k]])}　<span class="muted">正解</span> <b>${esc(q.choices[q.answer])}</b>
          <div class="muted">${esc(q.exp)}</div>${q.siteId ? `<a class="link small" href="#/site/${q.siteId}">遺産ページへ</a>` : ""}</div>`).join("")}</div>`);
      window.scrollTo(0, 0);
    };
    cleanup = () => { clearInterval(timer); if (qmap) qmap.remove(); };
    show();
  }

  // ---------- 理論 ----------
  function viewTheory(id) { TheoryView.render(app, id); }

  // ---------- ルーター ----------
  function route() {
    if (cleanup) { try { cleanup(); } catch (e) { /* noop */ } cleanup = null; }
    const [path, qs] = location.hash.replace(/^#\/?/, "").split("?");
    const query = Object.fromEntries(new URLSearchParams(qs || ""));
    const [name, a, b] = path.split("/");
    $$("#nav a", document).forEach((x) => x.classList.toggle("active", x.dataset.route === (name === "site" ? "sites" : name || "")));
    window.scrollTo(0, 0);
    const views = { "": viewHome, sites: viewSites, site: viewSite, map: viewMap, theory: viewTheory, quiz: viewQuiz,
      flash: viewFlash, review: viewReview, exam: viewExam };
    if (name === "sites") viewSites(a, query);
    else (views[name] || viewHome)(a, b);
    refreshSide();
  }
  window.addEventListener("hashchange", route);
  route();
})();
