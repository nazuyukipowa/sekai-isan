// フリガナ: 読み辞書（window.FURIGANA）にある語へ <ruby> を自動で付ける。
// 画面の描画方法に関係なく効くよう、DOM に追加された文字を MutationObserver で拾って変換する。
(function () {
  const DICT = window.FURIGANA || {};
  const words = Object.keys(DICT).sort((a, b) => b.length - a.length);
  if (!words.length) { window.Ruby = { refresh() {} }; return; }
  // 1文字の語（棲・祠など）は前後に漢字が続かない単独のときだけ。「捕捉」の「捉」に「とら」を付けないため
  const K = "\\u4e00-\\u9fff\\u3005\\u30f6\\u3400-\\u4dbf";
  const escRe = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(words.map((w) => (w.length === 1 ? `(?<![${K}])${escRe(w)}(?![${K}])` : escRe(w))).join("|"), "g");
  const SKIP = new Set(["RUBY", "RT", "RP", "OPTION", "SELECT", "SCRIPT", "STYLE", "TEXTAREA", "INPUT", "TITLE"]);
  const HAS_KANJI = /[一-鿿々㐀-䶿]/;

  function skip(node) {
    for (let el = node.parentElement; el; el = el.parentElement) {
      if (SKIP.has(el.tagName) || el.isContentEditable) return true;
    }
    return false;
  }
  function convert(textNode) {
    const text = textNode.nodeValue;
    if (!HAS_KANJI.test(text) || skip(textNode)) return;
    re.lastIndex = 0;
    if (!re.test(text)) return;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const r = document.createElement("ruby");
      r.appendChild(document.createTextNode(m[0]));
      const rt = document.createElement("rt");
      rt.textContent = DICT[m[0]];
      r.appendChild(rt);
      frag.appendChild(r);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    textNode.parentNode.replaceChild(frag, textNode);
  }
  function walk(root) {
    if (root.nodeType === Node.TEXT_NODE) { convert(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE || SKIP.has(root.tagName)) return;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (tw.nextNode()) nodes.push(tw.currentNode);
    nodes.forEach(convert);
  }

  let busy = false;
  const obs = new MutationObserver((muts) => {
    if (busy) return;
    busy = true;
    for (const m of muts) {
      if (m.type === "characterData") convert(m.target);
      else m.addedNodes.forEach(walk);
    }
    obs.takeRecords(); // 自分で入れた <ruby> の変更は無視
    busy = false;
  });

  function start() {
    walk(document.body);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.Ruby = { refresh: () => walk(document.body) };
})();
