/* Start-up: wait for the site's own scripts (Renderer, Parser, UiUtil), then mount the UI */
(async function () {
	const CS = globalThis.CS5E;
	if (window.top !== window) return;
	const t0 = Date.now();
	while (!(globalThis.Renderer && globalThis.Parser) && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 150));
	try {
		const s = await CS.store.getSettings();
		CS.data.settings = {edition: s.edition || "all", hoverDelay: s.hoverDelay !== false};
		CS.render.hoverDelay = CS.data.settings.hoverDelay;
	} catch (e) { /* defaults */ }
	await CS.app.mount();
	window.addEventListener("message", e => { if (e.source === window && e.data?.__cs5e === "evt" && e.data.type === "ui.toggle") CS.app.toggleDrawer(); });
	if (location.hash === "#characters") CS.app.toggleDrawer(true);
})();
