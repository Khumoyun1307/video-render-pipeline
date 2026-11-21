/* Pipeline test, chapter 2 (26 s). It is longer than sliceSeconds, so GitHub renders it as three slices
   (0-10, 10-20, 20-26 s) on three runners. A dot travels along a one-tick-per-second track and a big
   seconds counter runs, so a bad join at 10 s or 20 s would show as a jump. Placeholder content only. */
(function () {
  T.hud("ch02");
  var X0 = 180, W = 1560, Y = 760, D = T.dur;

  var sub = T.mk("sub", "left:180px;top:170px;width:1560px", "chapter two of two, rendered as three slices");
  T.ft(sub, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power1.out" }, 0.2);

  var big = T.mk("big", "left:180px;top:290px;width:700px", "00.0");
  var unit = T.mk("sub", "left:900px;top:480px", "seconds");
  var p = { t: 0 };
  var show = function () { big.textContent = (p.t < 10 ? "0" : "") + (Math.floor(p.t * 10 + 1e-6) / 10).toFixed(1); };
  T.tl.fromTo(p, { t: 0 }, { t: D, duration: D, ease: "none", onUpdate: show, immediateRender: false }, 0);

  T.mk("track", "left:" + X0 + "px;top:" + Y + "px;width:" + W + "px");
  for (var s = 0; s <= D; s++) T.mk("tick", "left:" + (X0 + (W * s) / D - 1) + "px;top:" + (Y - 8) + "px");
  [10, 20].forEach(function (s) {
    var x = X0 + (W * s) / D;
    T.mk("mark", "left:" + (x - 2) + "px;top:" + (Y - 27) + "px");
    var lab = T.mk("label", "left:" + (x - 200) + "px;top:" + (Y + 56) + "px;width:400px;text-align:center", "slice join, " + s + " s");
    T.ft(lab, { opacity: 0.45 }, { opacity: 1, duration: 0.3, ease: "none" }, s - 0.3);
  });
  var dot = T.mk("dot", "left:" + (X0 - 18) + "px;top:" + (Y - 15) + "px");
  T.ft(dot, { x: 0 }, { x: W, duration: D, ease: "none" }, 0);

  T.tl.to([sub, big, unit], { opacity: 0, duration: 0.4, ease: "power1.in" }, D - 0.5);
  T.end();
})();
