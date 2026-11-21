/* Test kit: the few helpers both test chapters share. Everything is driven by ONE paused GSAP timeline, so a frame
   depends only on its time (no timers, no random numbers, no clock) and any slice renders the same picture. */
(function () {
  var T = (window.T = {});
  T.root = document.getElementById("root");
  T.dur = parseFloat(T.root.getAttribute("data-duration"));
  T.fps = 30;
  T.frames = Math.ceil(T.dur * T.fps);
  T.tl = gsap.timeline({ paused: true });

  T.mk = function (cls, css, text, parent) {
    var el = document.createElement("div");
    el.className = "abs " + (cls || "");
    if (css) el.style.cssText = css;
    if (text != null) el.innerHTML = text;
    (parent || T.root).appendChild(el);
    return el;
  };
  /* fromTo that never renders early, so a seek to any frame gives the same state */
  T.ft = function (el, from, to, t) {
    to.immediateRender = false;
    gsap.set(el, from);
    return T.tl.fromTo(el, from, to, t);
  };
  T.pad = function (n, w) { n = String(n); while (n.length < w) n = "0" + n; return n; };

  /* bottom band: chapter id, a frame counter and a progress bar, all functions of the timeline time */
  T.hud = function (id) {
    T.mk("label", "left:96px;top:60px", "Render pipeline test");
    var count = T.mk("mono", "right:96px;bottom:74px", "");
    T.mk("track", "left:96px;right:96px;bottom:54px");
    var fill = T.mk("fill", "left:96px;right:96px;bottom:54px");
    var p = { f: 0 };
    var show = function () { count.textContent = id + "  frame " + T.pad(Math.min(T.frames - 1, Math.floor(p.f + 1e-6)), 4) + " of " + T.pad(T.frames, 4); };
    show();
    T.tl.fromTo(p, { f: 0 }, { f: T.frames, duration: T.dur, ease: "none", onUpdate: show, immediateRender: false }, 0);
    T.ft(fill, { scaleX: 0 }, { scaleX: 1, duration: T.dur, ease: "none" }, 0);
  };
  T.end = function () {
    window.__timelines = window.__timelines || {};
    window.__timelines[T.root.getAttribute("data-composition-id") || "main"] = T.tl;
  };
})();
