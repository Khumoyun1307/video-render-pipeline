/* Pipeline test, chapter 1 (8 s). Placeholder content only: nothing here is from any production. */
(function () {
  T.hud("ch01");

  var title = T.mk("title", "left:130px;top:250px;width:760px", "Render<br>pipeline <em>test</em>");
  T.ft(title, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, 0.3);
  var sub = T.mk("sub", "left:134px;top:540px;width:760px", "chapter one of two");
  T.ft(sub, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power1.out" }, 1.2);

  var sheet = T.mk("sheet", "left:980px;top:230px;width:800px;height:520px;transform:rotate(2deg)");
  T.ft(sheet, { opacity: 0, x: 420 }, { opacity: 1, x: 0, duration: 0.9, ease: "power3.out" }, 1.8);
  var l1 = T.mk("hand", "left:80px;top:130px", "open fonts", sheet);
  var l2 = T.mk("hand", "left:80px;top:290px", "on any machine", sheet);
  T.ft(l1, { clipPath: "inset(-20% 100% -20% 0)" }, { clipPath: "inset(-20% 0% -20% 0)", duration: 1.1, ease: "none" }, 3.0);
  T.ft(l2, { clipPath: "inset(-20% 100% -20% 0)" }, { clipPath: "inset(-20% 0% -20% 0)", duration: 1.4, ease: "none" }, 4.4);

  T.tl.to([title, sub, sheet], { opacity: 0, duration: 0.4, ease: "power1.in" }, 7.5);
  T.end();
})();
