/* App shell: "My Characters" drawer, full-screen builder/sheet, saving */
(function () {
	const CS = globalThis.CS5E;
	const {h} = CS;
	const D = CS.data; const R = CS.rules; const S = CS.store; const U = CS.uiCore;
	const B = CS.uiBuilder; const SH = CS.uiSheet; const C = CS.uiChoices;

	const st = {char: null, calc: null, mode: "closed", step: "home", sheetTab: "actions", status: ""};
	const app = (CS.app = {st});
	let drawer; let tab; let shell;

	/* ---------------- mount ---------------- */

	app.mount = async () => {
		await U.injectCss();
		try { CS.uiState.filters = (await S.getUi()).filters || {}; } catch (e) { /* defaults */ }
		U.onFiltersChanged = CS.debounce(() => S.setUi({filters: CS.uiState.filters}).catch(() => {}), 500);
		tab = h("button", {type: "button", class: "ve-btn ve-btn-primary cs5e-pull", title: "My Characters", on: {click: () => app.toggleDrawer()}}, "My Characters");
		drawer = h("div", {class: "cs5e-drawer"});
		shell = h("div", {class: "cs5e-shell cs5e-hidden"});
		document.body.append(tab, drawer, shell);
		S.onChange(what => { if (what === "auth" || what === "list") renderDrawer(); });
		B.init(app); SH.init(app);
		C.app = {commit: app.commit};
		document.addEventListener("keydown", e => { if (e.key === "Escape" && drawer.classList.contains("cs5e-drawer--open") && !document.querySelector(".ve-ui-modal__overlay")) app.toggleDrawer(false); });
	};

	async function ensureData () {
		if (D.loaded) return true;
		drawer.querySelector(".cs5e-drawer__list")?.replaceChildren(h("div", {class: "ve-muted ve-p-2"}, "Loading 5etools data..."));
		try { await D.load(); return true; } catch (e) { alert("Could not load 5etools data: " + e.message); return false; }
	}

	/* ---------------- drawer ---------------- */

	app.toggleDrawer = async (open = !drawer.classList.contains("cs5e-drawer--open")) => {
		drawer.classList.toggle("cs5e-drawer--open", open);
		if (open) {
			renderDrawer();
			if (await ensureData()) renderDrawer();
			S.authStatus().then(a => { if (a.signedIn) sync(true); });
		}
	};

	function summary (c) {
		const race = D.loaded ? D.getRace(c.race) : null;
		const sub = race ? D.getSubrace(race, c.subrace) : null;
		const cls = (c.classes || []).map(x => `${x.name} ${x.level}`).join(" / ");
		const lvl = (c.classes || []).reduce((s, x) => s + Number(x.level || 0), 0);
		return [lvl ? `Level ${lvl}` : null, sub?.name ? `${race.name} (${sub.name})` : (race?.name || c.race?.name), cls].filter(Boolean).join(" · ") || "New character";
	}

	async function renderDrawer () {
		const a = S.auth;
		const list = h("div", {class: "cs5e-drawer__list"});
		const fileIn = h("input", {type: "file", accept: ".json,application/json", class: "cs5e-hidden", on: {change: importFile}});
		drawer.replaceChildren(
			h("div", {class: "cs5e-drawer__head"},
				h("h4", {class: "ve-m-0"}, "My Characters"),
				U.btn(h("span", {class: "glyphicon glyphicon-remove"}), () => app.toggleDrawer(false), "ve-btn-default ve-btn-xs", {title: "Close"})),
			h("div", {class: "cs5e-drawer__auth"},
				a.signedIn
					? [a.user?.picture ? h("img", {src: a.user.picture, class: "cs5e-avatar", referrerpolicy: "no-referrer"}) : null,
						h("span", {class: "ve-small ve-muted cs5e-ellipsis"}, a.user?.email || "Signed in"),
						U.btn(h("span", {class: "glyphicon glyphicon-refresh"}), () => sync(false), "ve-btn-default ve-btn-xs", {title: "Sync with Google Drive"}),
						U.btn("Sign out", signOut, "ve-btn-default ve-btn-xs")]
					: [U.btn("Sign in with Google", signIn, "ve-btn-default ve-btn-xs"), h("span", {class: "ve-muted ve-small"}, "Saved in this browser only")]),
			h("div", {class: "ve-flex-v-center cs5e-gap ve-mb-2"},
				U.btn("+ Create a Character", newCharacter, "ve-btn-primary"),
				U.btn("Import", () => fileIn.click(), "ve-btn-default"), fileIn),
			list,
			settingsBox(),
		);
		const chars = await S.list();
		list.replaceChildren();
		if (!chars.length) list.append(h("div", {class: "ve-muted ve-p-2 ve-italic"}, "No characters yet."));
		for (const c of chars) {
			list.append(h("div", {class: "cs5e-crow"},
				c.portrait ? h("img", {class: "cs5e-crow__img", src: c.portrait, referrerpolicy: "no-referrer"}) : h("div", {class: "cs5e-crow__img cs5e-crow__img--ph"}, (c.name || "?")[0]),
				h("div", {class: "cs5e-crow__main", on: {click: () => openChar(c, "sheet")}},
					h("div", {class: "ve-bold"}, c.name || "Unnamed"),
					h("div", {class: "ve-small ve-muted"}, summary(c)),
					h("div", {class: "ve-small ve-muted"}, c._driveId && !c._dirty ? "☁ Google Drive" : S.auth.signedIn ? "Not synced yet" : "This browser")),
				h("div", {class: "cs5e-crow__act"},
					U.btn("View", () => openChar(c, "sheet"), "ve-btn-default ve-btn-xs"),
					U.btn("Edit", () => openChar(c, "builder"), "ve-btn-default ve-btn-xs"),
					h("div", {class: "ve-btn-group"},
						U.btn("⎘", () => duplicate(c), "ve-btn-default ve-btn-xs", {title: "Duplicate"}),
						U.btn("⤓", () => exportJson(c), "ve-btn-default ve-btn-xs", {title: "Export JSON"}),
						U.btn(h("span", {class: "glyphicon glyphicon-trash"}), () => del(c), "ve-btn-danger ve-btn-xs", {title: "Delete"}))),
			));
		}
	}

	function settingsBox () {
		const s = D.settings;
		const d = h("details", {class: "cs5e-drawer__settings"}, h("summary", null, "Settings"));
		d.append(
			h("label", {class: "cs5e-field"}, h("span", null, "Rules"), U.sel([["all", "All (2014 + 2024)"], ["one", "2024 only"], ["classic", "2014 only"]], s.edition, v => app.setSetting("edition", v))),
			h("label", {class: "ve-flex-v-center cs5e-gap-s ve-small"}, h("input", {type: "checkbox", checked: s.hoverDelay !== false, on: {change: e => app.setSetting("hoverDelay", e.target.checked)}}), "Delay hover popups (~1 second)"),
			h("label", {class: "ve-flex-v-center cs5e-gap-s ve-small"}, h("input", {type: "checkbox", checked: s.roll20 !== false, on: {change: e => app.setSetting("roll20", e.target.checked)}}), "Send rolls to Roll20 when a Roll20 game tab is open"),
			h("label", {class: "ve-flex-v-center cs5e-gap-s ve-small"}, h("input", {type: "checkbox", checked: s.adBlock !== false, on: {change: e => app.setSetting("adBlock", e.target.checked)}}), "Block ads on 5e.tools"),
			h("hr"),
			h("div", {class: "ve-small ve-muted"}, "Google sign-in in Edge/Brave/other Chromium browsers: create a “Web application” OAuth client with this redirect URI and paste its ID below."),
			h("code", {class: "cs5e-code"}, "…"),
			h("input", {type: "text", class: "ve-form-control ve-input-xs", placeholder: "Web client ID (optional)", on: {change: async e => { const all = await S.getSettings(); all.webClientId = e.target.value.trim(); all.authMode = all.webClientId ? "web" : "chrome"; await S.setSettings(all); }}}),
		);
		S.redirectUrl().then(u => { d.querySelector("code").textContent = u; }).catch(() => {});
		S.getSettings().then(all => { d.querySelector('input[type="text"]').value = all.webClientId || ""; });
		return d;
	}

	app.setSetting = async (k, v) => {
		D.settings[k] = v;
		CS.render.hoverDelay = D.settings.hoverDelay !== false;
		const all = await S.getSettings();
		all[k] = v;
		await S.setSettings(all);
		if (k === "adBlock") { S.notifySettings().catch(() => {}); CS.applyAdCss?.(); }
		if (st.char) { recalc(); app.rerender(); }
	};

	async function signIn () { try { await S.signIn(); await sync(false); } catch (e) { alert("Sign-in failed: " + e.message); } }
	async function signOut () { try { await S.signOut(); } catch (e) { alert(e.message); } }
	async function sync (silent) {
		try { const r = await S.sync(); if (!silent) toast(`Synced (${r.pulled} downloaded, ${r.pushed} uploaded)`); renderDrawer(); } catch (e) { if (!silent) alert("Sync failed: " + e.message); }
	}

	function toast (msg) {
		try { if (globalThis.JqueryUtil?.doToast) { globalThis.JqueryUtil.doToast(msg); return; } } catch (e) { /* fallback */ }
		const t = h("div", {class: "cs5e-toast"}, msg);
		document.body.append(t);
		setTimeout(() => t.remove(), 3000);
	}
	app.toast = toast;

	async function newCharacter () {
		if (!await ensureData()) return;
		const c = R.newChar();
		c.name = "New Character";
		await S.saveLocal(c);
		openChar(c, "builder", "home");
	}
	async function duplicate (c) {
		const n = CS.clone(c);
		n.id = CS.uid(); n.name = (c.name || "") + " (copy)"; delete n._driveId; n.createdAt = Date.now();
		await S.save(n).catch(e => alert(e.message));
		renderDrawer();
	}
	async function del (c) {
		if (!confirm(`Delete “${c.name || "Unnamed"}”? On Google Drive the file is moved to the trash.`)) return;
		await S.remove(c).catch(e => alert(e.message));
		if (st.char?.id === c.id) app.close();
		renderDrawer();
	}
	function exportJson (c) {
		const clean = CS.clone(c); delete clean._driveId; delete clean._dirty; delete clean._driveModified;
		const a = h("a", {href: URL.createObjectURL(new Blob([JSON.stringify(clean, null, 2)], {type: "application/json"})), download: `${(c.name || "character").replace(/[^\w\- ]/g, "_")}.json`});
		document.body.append(a); a.click(); a.remove();
	}
	async function importFile (e) {
		const f = e.target.files?.[0];
		if (!f) return;
		try {
			const c = JSON.parse(await f.text());
			if (!c || typeof c !== "object" || !("classes" in c)) throw new Error("This file is not a character from this extension.");
			const merged = R.migrate({...c, id: CS.uid(), updatedAt: Date.now()});
			delete merged._driveId;
			await S.save(merged);
			renderDrawer();
		} catch (err) { alert("Import failed: " + err.message); }
	}

	/* ---------------- shell ---------------- */

	async function openChar (c, mode = "sheet", step = null) {
		if (!await ensureData()) return;
		st.char = R.migrate(CS.clone(c));
		st.mode = mode;
		st.step = step || (st.char.classes?.length ? "class" : "home");
		st.status = "";
		recalc();
		app.toggleDrawer(false);
		shell.classList.remove("cs5e-hidden");
		document.body.classList.add("cs5e-noscroll");
		renderShell();
	}
	app.openSheet = () => { st.mode = "sheet"; renderShell(); };
	app.openBuilder = (step) => { st.mode = "builder"; if (step) st.step = step; renderShell(); };
	app.goStep = step => { st.step = step; renderShell(true); };
	app.close = () => {
		saveNow();
		st.mode = "closed"; st.char = null;
		shell.classList.add("cs5e-hidden");
		document.body.classList.remove("cs5e-noscroll");
		renderDrawer();
	};

	function recalc () { st.calc = R.compute(st.char); }

	function renderShell (scrollTop = false) {
		const c = st.char; const k = st.calc;
		const prevY = document.getElementById("cs5e-content")?.scrollTop || 0;
		const steps = h("div", {class: "cs5e-steps"}, B.STEPS.map(([id, l], i) => {
			const n = id === "class" ? B.pendingFor("class") : id === "background" ? B.pendingFor("bg") : id === "species" ? B.pendingFor("race") : id === "spells" ? spellsPending() : 0;
			return h("button", {type: "button", class: `cs5e-step ${st.step === id ? "cs5e-step--on" : ""}`, on: {click: () => app.goStep(id)}}, h("span", {class: "cs5e-step__n"}, i + 1), l, U.badge(n));
		}));
		shell.replaceChildren(
			h("div", {class: "cs5e-bar"},
				U.btn([h("span", {class: "glyphicon glyphicon-menu-left"}), " My Characters"], () => { app.close(); app.toggleDrawer(true); }, "ve-btn-default ve-btn-xs"),
				h("div", {class: "cs5e-bar__title"}, h("span", {class: "ve-bold"}, c.name || "Unnamed"), h("span", {class: "ve-muted ve-small"}, ` ${k.pending ? `• ${k.pending} choice${k.pending > 1 ? "s" : ""} to make` : ""}`)),
				h("span", {class: "ve-muted ve-small cs5e-bar__status", id: "cs5e-status"}, st.status),
				st.mode === "builder" ? U.btn("View Sheet", () => app.openSheet(), "ve-btn-primary ve-btn-xs") : U.btn("Edit", () => app.openBuilder(), "ve-btn-default ve-btn-xs"),
				U.btn(h("span", {class: "glyphicon glyphicon-remove"}), () => app.close(), "ve-btn-danger ve-btn-xs", {title: "Close"})),
			...(st.mode === "builder" ? [steps] : []),
			h("div", {class: "cs5e-content", id: "cs5e-content"}),
		);
		renderContent(scrollTop ? 0 : prevY);
	}

	function spellsPending () {
		const k = st.calc; const c = st.char;
		let n = 0;
		for (const pc of k.spellcasting.perClass) {
			const mine = c.spells.filter(s => s.cls === pc.cls);
			if (pc.cantrips && mine.filter(s => s.level === 0).length < pc.cantrips) n++;
			if (pc.prepared && !pc.spellbook && mine.filter(s => s.level > 0).length < pc.prepared) n++;
		}
		return n;
	}

	function renderContent (y = 0) {
		const el = document.getElementById("cs5e-content");
		if (!el) return;
		try {
			el.replaceChildren(st.mode === "builder" ? B.render(st.step) : SH.render());
		} catch (e) {
			console.error(e);
			el.replaceChildren(h("div", {class: "ve-text-danger ve-p-3"}, "Error: " + e.message));
		}
		el.scrollTop = y;
		requestAnimationFrame(() => { el.scrollTop = y; });
	}

	/** re-render keeping scroll positions */
	app.rerender = () => { if (st.char) renderShell(false); };

	/* ---------------- saving ---------------- */

	const saveLocalD = CS.debounce(async () => {
		if (!st.char) return;
		await S.saveLocal(CS.clone(st.char));
		setStatus(S.auth.signedIn ? "Saved · syncing…" : "Saved in this browser");
	}, 300);
	const saveDriveD = CS.debounce(async () => {
		const c = st.char; if (!c || !S.auth.signedIn) return;
		try {
			const copy = CS.clone(c);
			await S.pushDrive(copy);
			if (st.char && st.char.id === copy.id) { st.char._driveId = copy._driveId; st.char._dirty = false; }
			setStatus("☁ Saved to Google Drive");
		} catch (e) { setStatus("⚠ Drive: " + e.message); }
	}, 2500);
	function saveNow () { saveLocalD.flush(); if (S.auth.signedIn && st.char?._dirty) saveDriveD.flush(); }
	function setStatus (s) { st.status = s; const el = document.getElementById("cs5e-status"); if (el) el.textContent = s; }

	/** Apply a change, recompute, save, re-render */
	app.commit = (fn, {rerender = true} = {}) => {
		fn(st.char);
		st.char.updatedAt = Date.now();
		st.char._dirty = true;
		recalc();
		setStatus("Saving…");
		saveLocalD(); saveDriveD();
		if (rerender) app.rerender();
	};

	app.openFromHash = () => { if (location.hash === "#characters") app.toggleDrawer(true); };
})();
