/* Start-up: wait for the site's own scripts (Renderer, Parser, UiUtil), then mount the UI */
(async function () {
	const CS = globalThis.CS5E;
	if (window.top !== window) return;
	// hide the ad slots (the ad scripts themselves are blocked by the extension's network rules)
	CS.applyAdCss = () => {
		let st = document.getElementById("cs5e-adblock");
		if (CS.data.settings.adBlock === false) { st?.remove(); return; }
		if (!st) { st = document.createElement("style"); st.id = "cs5e-adblock"; (document.head || document.documentElement).append(st); }
		st.textContent = ".cancer__wrp-leaderboard,.cancer__wrp-sidebar,.cancer__anchor,#video-sticky,#takeover-desktop,.vm-close-takeover,[id^='vm-'],[class^='vm-placement'],iframe[id^='google_ads'],ins.adsbygoogle{display:none!important}";
	};
	const t0 = Date.now();
	while (!(globalThis.Renderer && globalThis.Parser) && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 150));
	try {
		const s = await CS.store.getSettings();
		CS.data.settings = {edition: s.edition || "all", hoverDelay: s.hoverDelay !== false, roll20: s.roll20 !== false, adBlock: s.adBlock !== false};
		CS.render.hoverDelay = CS.data.settings.hoverDelay;
	} catch (e) { /* defaults */ }
	CS.applyAdCss();
	await CS.app.mount();
	window.addEventListener("message", e => { if (e.source === window && e.data?.__cs5e === "evt" && e.data.type === "ui.toggle") CS.app.toggleDrawer(); });
	if (location.hash === "#characters") CS.app.toggleDrawer(true);
})();
