/* UI building blocks styled with 5etools' own CSS: modal, filterable list (with the site's filter pills), rendering helpers */
(function () {
	const CS = globalThis.CS5E;
	const {h} = CS;
	const K = CS.key;
	const U = (CS.uiCore = {});
	const state = (CS.uiState = CS.uiState || {lists: {}, filters: {}, open: {}});

	/* ---------------- CSS ---------------- */

	U.injectCss = async () => {
		if (document.getElementById("cs5e-css")) return;
		const style = h("style", {id: "cs5e-css"}, CS.APP_CSS || "");
		document.head.append(style);
		// class-table rules live in classes.css, only loaded on the classes page: import just those rules
		try {
			const txt = await (await fetch("/css/classes.css")).text();
			const sheet = new CSSStyleSheet();
			await sheet.replace(txt.replace(/@import[^;]+;/g, ""));
			const keep = [];
			const walk = rules => {
				for (const r of rules) {
					if (r.cssRules && !r.selectorText) { if (!/print/.test(r.media?.mediaText || r.conditionText || "")) walk(r.cssRules); continue; }
					if (r.selectorText && /ve-cls-tbl/.test(r.selectorText) && !/faux-print/.test(r.selectorText)) keep.push(r.cssText);
				}
			};
			walk(sheet.cssRules);
			document.head.append(h("style", {id: "cs5e-css-cls"}, keep.join("\n")));
		} catch (e) { /* not critical */ }
	};

	/* ---------------- helpers ---------------- */

	U.html = (html, cls = "", tag = "div") => h(tag, {class: cls, html});
	U.rd = (entries, cls = "") => U.html(CS.rd.entries(entries), `ve-rd__b ${cls}`);
	U.str = (s, tag = "span", cls = "") => U.html(CS.rd.str(s), cls, tag);
	U.link = (tag, ent, display) => U.html(CS.rd.link(tag, ent.name, ent.source, display), "", "span");
	U.srcSpan = src => h("span", {class: `${CS.srcClass(src)} ve-help-subtle`, title: CS.srcFull(src)}, CS.srcAbv(src));
	U.btn = (label, onClick, cls = "ve-btn-default", attrs = {}) => h("button", {type: "button", class: `ve-btn ${cls}`, ...attrs, on: {click: onClick}}, label);
	U.sel = (options, value, onChange, attrs = {}) => h("select", {class: "ve-form-control ve-input-xs", ...attrs, on: {change: e => onChange(e.target.value)}},
		options.map(o => {
			const [v, l, dis] = Array.isArray(o) ? o : [o, o];
			return h("option", {value: v, selected: String(v) === String(value ?? ""), disabled: !!dis}, l);
		}));
	U.badge = (n, title) => n ? h("span", {class: "cs5e-badge", title: title || `${n} choice${n > 1 ? "s" : ""} to make`}, n) : null;

	/** Collapsible block with remembered open state */
	U.details = (id, summary, body, {open = false, cls = ""} = {}) => {
		const isOpen = state.open[id] ?? open;
		const d = h("details", {class: `cs5e-acc ${cls}`, open: isOpen},
			h("summary", null, summary),
			h("div", {class: "cs5e-acc__body"}, typeof body === "function" ? (isOpen ? body() : null) : body));
		d.addEventListener("toggle", () => {
			state.open[id] = d.open;
			if (d.open && typeof body === "function" && !d.querySelector(".cs5e-acc__body").childNodes.length) d.querySelector(".cs5e-acc__body").append(body());
		});
		return d;
	};

	/* ---------------- Modal (the site's modal when available) ---------------- */

	U.modal = (title, {wide = true, onClose} = {}) => {
		const UiUtil = globalThis.UiUtil;
		if (UiUtil?.getShowModal) {
			try {
				const m = UiUtil.getShowModal({title, isHeight100: wide, isWidth100: wide, isUncappedHeight: true, isUncappedWidth: wide, cbClose: () => onClose?.()});
				const inner = m.eleModalInner?.[0] || m.eleModalInner || m.$modalInner?.[0];
				inner.classList.add("cs5e-modal-inner");
				return {inner, close: () => m.doClose(true)};
			} catch (e) { console.warn("[5etools Characters] modal", e); }
		}
		const overlay = h("div", {class: "ve-ui-modal__overlay"});
		const inner = h("div", {class: "ve-ui-modal__scroller ve-flex-col cs5e-modal-inner"});
		const close = () => { overlay.remove(); onClose?.(); };
		overlay.append(h("div", {class: `ve-ui-modal__inner ve-flex-col ${wide ? "ve-w-100 ve-h-100 ve-ui-modal__inner--uncap-height ve-ui-modal__inner--uncap-width" : ""}`},
			h("div", {class: "ve-split-v-center ve-no-shrink"}, h("h4", {class: "ve-my-2"}, title), U.btn(h("span", {class: "glyphicon glyphicon-remove"}), close, "ve-btn-danger ve-btn-xs")),
			inner));
		overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(); });
		document.body.append(overlay);
		return {inner, close};
	};

	/* ---------------- Filters (5etools pill semantics: ignore / yes / no) ---------------- */

	const STATES = ["ignore", "yes", "no"];
	const GROUP_ORDER = ["", "Core/Supplements", "Partnered", "Other"];

	function sourceGroup (src) {
		try {
			const SU = globalThis.SourceUtil;
			if (SU?.isNonstandardSource?.(src)) return "Other";
			if (SU?.isPartneredSourceWotc?.(src)) return "Partnered";
		} catch (e) { /* ignore */ }
		return /^UA/.test(src) ? "Other" : "Core/Supplements";
	}

	/** Build the filter definitions for a list: Source is shared across every list */
	U.sourceFilter = sourceOf => ({key: "source", shared: true, header: "Source", values: it => [sourceOf(it)], display: s => CS.srcFull(s), mini: s => CS.srcAbv(s), group: sourceGroup, sort: (a, b) => CS.srcFull(a).localeCompare(CS.srcFull(b))});

	function fState (listId, f) {
		const k = f.shared ? `shared:${f.key}` : `${listId}:${f.key}`;
		return (state.filters[k] = state.filters[k] || {});
	}

	function passes (it, listId, filters) {
		for (const f of filters) {
			const st = fState(listId, f);
			const yes = []; const no = [];
			for (const [v, s] of Object.entries(st)) { if (s === 1) yes.push(v); else if (s === 2) no.push(v); }
			if (!yes.length && !no.length) continue;
			const vals = (f.values(it) || []).map(String);
			if (yes.length && !vals.some(v => yes.includes(v))) return false;
			if (no.length && vals.some(v => no.includes(v))) return false;
		}
		return true;
	}

	function openFilterModal (listId, filters, items, onSave) {
		const m = U.modal("Filters", {onClose: onSave});
		const backup = filters.map(f => ({...fState(listId, f)}));
		const draw = () => {
			m.inner.replaceChildren();
			m.inner.append(h("div", {class: "ve-flex-v-center ve-mb-2 cs5e-gap"},
				U.btn("Reset", () => { filters.forEach(f => { const s = fState(listId, f); for (const k of Object.keys(s)) delete s[k]; }); draw(); }, "ve-btn-default ve-btn-xs"),
				U.btn("Cancel", () => { filters.forEach((f, i) => { const s = fState(listId, f); for (const k of Object.keys(s)) delete s[k]; Object.assign(s, backup[i]); }); m.close(); }, "ve-btn-default ve-btn-xs"),
				U.btn(h("span", {class: "glyphicon glyphicon-ok"}), () => m.close(), "ve-btn-primary ve-btn-xs", {title: "Save"}),
				h("span", {class: "ve-muted ve-small ve-ml-2"}, "Click: include → exclude → ignore. Right click: reverse."),
			));
			for (const f of filters) {
				const st = fState(listId, f);
				const vals = new Set();
				for (const it of items) for (const v of f.values(it) || []) if (v != null && v !== "") vals.add(String(v));
				const list = [...vals].sort(f.sort || ((a, b) => a.localeCompare(b, undefined, {numeric: true})));
				const setAll = s => { for (const v of list) { if (s) st[v] = s; else delete st[v]; } draw(); };
				const pill = v => {
					const p = h("div", {class: "ve-fltr__pill", "data-state": STATES[st[v] || 0], title: f.display ? f.display(v) : v}, f.display ? f.display(v) : v);
					p.addEventListener("click", () => { st[v] = ((st[v] || 0) + 1) % 3; if (!st[v]) delete st[v]; p.dataset.state = STATES[st[v] || 0]; });
					p.addEventListener("contextmenu", e => { e.preventDefault(); st[v] = ((st[v] || 0) + 2) % 3; if (!st[v]) delete st[v]; p.dataset.state = STATES[st[v] || 0]; });
					return p;
				};
				const groups = {};
				for (const v of list) (groups[f.group ? f.group(v) : ""] = groups[f.group ? f.group(v) : ""] || []).push(v);
				m.inner.append(
					h("div", {class: "ve-split ve-fltr__h ve-mb-1"},
						h("div", {class: "ve-fltr__h-text ve-flex-h-center"}, h("span", null, f.header)),
						h("div", {class: "ve-btn-group ve-flex-v-center"},
							U.btn("All", () => setAll(1), "ve-btn-default ve-btn-xs"),
							U.btn("Clear", () => setAll(0), "ve-btn-default ve-btn-xs"),
							U.btn("None", () => setAll(2), "ve-btn-default ve-btn-xs"))),
					...Object.entries(groups).sort(([a], [b]) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b)).map(([g, vs]) => h("div", {class: "ve-mb-2"},
						g ? h("div", {class: "ve-italic ve-muted ve-mb-1"}, g) : null,
						h("div", {class: "ve-fltr__container-pills cs5e-pills"}, vs.map(pill)))),
					h("hr", {class: "ve-w-100 ve-m-0 ve-mb-2"}),
				);
			}
		};
		draw();
	}

	/**
	 * Filterable, sortable list in the style of the 5etools list pages.
	 * cfg: {id, items, keyOf, columns:[{key,label,cls,render,sort}], filters, sourceOf, defaultSort:[key,dir],
	 *       onRow(it), previewOf(it) -> Node|html, actionOf(it) -> Node, rowClass(it), height}
	 */
	U.filterList = cfg => {
		const ls = (state.lists[cfg.id] = state.lists[cfg.id] || {});
		ls.sort = ls.sort || cfg.defaultSort || ["name", 1];
		const keyOf = cfg.keyOf || (it => K(it.name, it.source));
		const filters = [...(cfg.sourceOf ? [U.sourceFilter(cfg.sourceOf)] : []), ...(cfg.filters || [])];
		const wrap = h("div", {class: `cs5e-fl ${cfg.previewOf ? "cs5e-fl--split" : ""}`});
		const colList = h("div", {class: "cs5e-fl__list ve-flex-col"});
		const preview = cfg.previewOf ? h("div", {class: "cs5e-fl__preview"}) : null;
		const search = h("input", {type: "search", class: "search ve-form-control ve-lst__search ve-lst__search--no-border-h", placeholder: cfg.placeholder || "Search...", autocomplete: "off", value: ls.search || ""});
		const count = h("div", {class: "ve-lst__wrp-search-visible ve-no-events ve-flex-vh-center"});
		const mini = h("div", {class: "ve-fltr__mini-view ve-btn-group cs5e-mini"});
		const head = h("div", {class: "ve-input-group ve-input-group--bottom ve-flex ve-no-shrink"});
		const list = h("div", {class: "ve-list cs5e-fl__rows", style: cfg.height ? {height: cfg.height} : null});
		let rows = []; let shown = 0;

		colList.append(
			h("div", {class: "ve-lst__form-top"},
				U.btn("Filter", () => openFilterModal(cfg.id, filters, cfg.items, () => { refresh(); U.onFiltersChanged?.(); }), "ve-btn-default"),
				h("div", {class: "ve-w-100 ve-relative"}, search, count),
				U.btn("Reset", () => {
					ls.search = ""; search.value = "";
					filters.filter(f => !f.shared).forEach(f => { const s = fState(cfg.id, f); for (const k of Object.keys(s)) delete s[k]; });
					refresh();
				}, "ve-btn-default"),
			),
			mini, head, list,
		);
		wrap.append(colList);
		if (preview) wrap.append(preview);

		const drawHead = () => {
			head.replaceChildren(...cfg.columns.map(c => {
				const active = ls.sort[0] === c.key;
				const b = U.btn([c.label, h("span", {class: `ve-lst__caret ${active ? "ve-lst__caret--active" : ""} ${active && ls.sort[1] < 0 ? "ve-lst__caret--reverse" : ""}`})],
					() => { ls.sort = [c.key, active ? -ls.sort[1] : 1]; refresh(); }, `sort ve-btn-default ve-btn-xs ${c.cls || "ve-grow"}`);
				if (c.sort === false) b.disabled = true;
				return b;
			}));
		};

		const drawMini = () => {
			mini.replaceChildren();
			for (const f of filters) {
				const st = fState(cfg.id, f);
				for (const [v, s] of Object.entries(st)) {
					if (!s) continue;
					mini.append(h("div", {class: "ve-fltr__mini-pill", "data-state": STATES[s], title: `${f.display ? f.display(v) : v} (Filter: ${f.header})`, on: {click: () => { delete st[v]; refresh(); U.onFiltersChanged?.(); }}},
						f.key === "source" ? h("span", {class: "glyphicon glyphicon-book"}) : null, " ", f.mini ? f.mini(v) : (f.display ? f.display(v) : v)));
				}
			}
		};

		const sortFn = () => {
			const col = cfg.columns.find(c => c.key === ls.sort[0]) || cfg.columns[0];
			const val = it => (col.sortVal ? col.sortVal(it) : (typeof col.render === "function" ? null : it[col.key]));
			const dir = ls.sort[1];
			return (a, b) => {
				const va = val(a); const vb = val(b);
				let r = 0;
				if (va != null && vb != null) r = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), undefined, {numeric: true});
				if (r === 0 && cfg.tiebreak) r = cfg.tiebreak(a, b);
				if (r === 0) r = String(a.name ?? a.spell?.name ?? "").localeCompare(String(b.name ?? b.spell?.name ?? ""));
				return r * dir;
			};
		};

		const drawRow = it => {
			const k = keyOf(it);
			const sel = cfg.isSelected?.(it);
			const row = h("div", {class: `ve-lst__row ve-flex-col ${sel ? "list-multi-selected" : ""} ${ls.preview === k ? "cs5e-row--active" : ""} ${cfg.rowClass?.(it) || ""}`, "data-k": k});
			const inner = h("a", {class: "ve-lst__row-border ve-lst__row-inner", href: "#"});
			inner.addEventListener("click", e => {
				e.preventDefault();
				if (preview) { ls.preview = k; list.querySelectorAll(".cs5e-row--active").forEach(x => x.classList.remove("cs5e-row--active")); row.classList.add("cs5e-row--active"); drawPreview(it); }
				cfg.onRow?.(it);
			});
			for (const c of cfg.columns) {
				const v = c.render ? c.render(it) : it[c.key];
				const cell = h("span", {class: `${c.cls || "ve-grow"} ${c.cellCls || "ve-px-1"}`});
				if (v instanceof Node) cell.append(v); else if (c.html) cell.innerHTML = v ?? ""; else cell.textContent = v ?? "";
				inner.append(cell);
			}
			row.append(inner);
			if (cfg.actionOf) { const a = cfg.actionOf(it); if (a) inner.append(h("span", {class: "cs5e-fl__act", on: {click: e => { e.preventDefault(); e.stopPropagation(); }}}, a)); }
			return row;
		};

		const more = () => {
			const next = rows.slice(shown, shown + 150);
			list.append(...next.map(drawRow));
			shown += next.length;
		};

		const drawPreview = it => {
			if (!preview) return;
			preview.replaceChildren();
			if (!it) { preview.append(h("div", {class: "ve-muted ve-p-2"}, cfg.emptyPreview || "Select an entry from the list to view it here")); return; }
			const p = cfg.previewOf(it);
			if (p instanceof Node) preview.append(p); else preview.innerHTML = p;
		};

		const refresh = (keepScroll = false) => {
			const q = (ls.search || "").toLowerCase().trim();
			const base = cfg.items.filter(it => passes(it, cfg.id, filters));
			rows = (q ? base.filter(it => (cfg.searchText ? cfg.searchText(it) : String(it.name ?? it.spell?.name ?? "")).toLowerCase().includes(q)) : base).sort(sortFn());
			count.textContent = `${rows.length}/${cfg.items.length}`;
			drawHead(); drawMini();
			const st = keepScroll ? (ls.scroll || 0) : 0;
			list.replaceChildren(); shown = 0;
			do more(); while (shown < rows.length && shown * 22 < st + 800);
			if (!rows.length) list.append(h("div", {class: "ve-muted ve-p-2 ve-italic"}, "No results"));
			list.scrollTop = st;
			if (!keepScroll) ls.scroll = 0;
		};

		search.addEventListener("input", () => { ls.search = search.value; refresh(); });
		list.addEventListener("scroll", () => {
			ls.scroll = list.scrollTop;
			if (list.scrollTop + list.clientHeight > list.scrollHeight - 200 && shown < rows.length) more();
		});

		refresh(true);
		if (preview) drawPreview(ls.preview ? cfg.items.find(it => keyOf(it) === ls.preview) : null);
		// restore scroll once attached
		requestAnimationFrame(() => { list.scrollTop = ls.scroll || 0; });
		wrap.refresh = () => refresh(true);
		return wrap;
	};

	/* ---------------- Common list definitions (same columns/filters as the site's pages) ---------------- */

	const TIME = {action: "Action", bonus: "Bonus", reaction: "Reaction", minute: "Minute", hour: "Hour", round: "Round"};
	U.spellTime = s => (s.time || []).map(t => `${t.number > 1 ? t.number + " " : ""}${TIME[t.unit] || t.unit}${t.number > 1 && /Minute|Hour|Round/.test(TIME[t.unit] || "") ? "s" : ""}`).join("/");
	U.spellRange = s => {
		const r = s.range; if (!r) return "";
		if (r.type === "special") return "Special";
		const d = r.distance || {};
		if (["self", "touch", "sight", "unlimited"].includes(d.type)) {
			const base = CS.cap(d.type);
			if (["radius", "sphere", "cone", "line", "cube", "emanation", "hemisphere", "cylinder"].includes(r.type)) return `Self (${d.amount ?? ""}-${d.type === "self" ? "ft." : ""} ${r.type})`;
			return base;
		}
		if (["radius", "sphere", "cone", "line", "cube", "emanation", "hemisphere", "cylinder"].includes(r.type)) return `Self (${d.amount}-${d.type === "feet" ? "foot" : d.type} ${r.type})`;
		return `${d.amount ?? ""} ${d.type === "feet" ? "feet" : d.type}`.trim();
	};
	U.isConc = s => (s.duration || []).some(d => d.concentration);
	U.rangeCat = s => {
		const r = s.range; const d = r?.distance?.type;
		if (!r) return "Special";
		if (r.type === "special") return "Special";
		if (d === "self" && r.type === "point") return "Self";
		if (["radius", "sphere", "cone", "line", "cube", "emanation", "hemisphere", "cylinder"].includes(r.type)) return "Self (Area)";
		return {touch: "Touch", sight: "Sight", unlimited: "Unlimited", feet: "Point", miles: "Point", self: "Self"}[d] || "Special";
	};

	const P = () => globalThis.Parser;
	const tryP = (fn, fb) => { try { const v = fn(); return v == null ? fb() : v; } catch (e) { return fb(); } };
	U.spLevel = sp => tryP(() => `${P().spLevelToFull(sp.level)}${sp.meta?.ritual ? " (rit.)" : ""}`, () => `${sp.level === 0 ? "Cantrip" : CS.ordinal(sp.level)}${sp.meta?.ritual ? " (rit.)" : ""}`);
	U.spTime = sp => tryP(() => { const t = sp.time[0]; return (t.number === 1 && P().SP_TIME_SINGLETONS.includes(t.unit)) ? CS.cap(t.unit) : `${t.number ? `${t.number} ` : ""}${CS.cap(P().spTimeUnitToShort(t.unit))}`; }, () => U.spellTime(sp));
	U.spSchool = sp => tryP(() => P().spSchoolAndSubschoolsAbvsShort(sp.school, sp.subschools), () => (CS.SCHOOL[sp.school] || "").slice(0, 4) + ".");
	U.spSchoolCls = sp => tryP(() => P().spSchoolAbvToStyleClass(sp.school), () => `ve-sp__school--${sp.school}`);
	U.spRange = sp => tryP(() => P().spRangeToFull(sp.range, {isDisplaySelfArea: true}), () => U.spellRange(sp));
	const sp_ = s => s.spell || s;

	U.spellColumns = (extra = []) => [
		{key: "name", label: "Name", cls: "ve-col-2-9", cellCls: "ve-bold ve-pl-0 ve-pr-1", sortVal: s => sp_(s).name, render: s => sp_(s).name},
		{key: "level", label: "Level", cls: "ve-col-1-5", cellCls: "ve-px-1 ve-text-center", sortVal: s => sp_(s).level, render: s => U.spLevel(sp_(s))},
		{key: "time", label: "Time", cls: "ve-col-1-7", cellCls: "ve-px-1 ve-text-center", sortVal: s => U.spTime(sp_(s)), render: s => U.spTime(sp_(s))},
		{key: "school", label: "School", cls: "ve-col-1-2", cellCls: "ve-px-1 ve-text-center", sortVal: s => CS.SCHOOL[sp_(s).school], render: s => h("span", {class: U.spSchoolCls(sp_(s)), title: CS.SCHOOL[sp_(s).school]}, U.spSchool(sp_(s)))},
		{key: "conc", label: "C.", cls: "ve-col-0-6", cellCls: "ve-px-1 ve-text-center", sortVal: s => U.isConc(sp_(s)) ? 1 : 0, render: s => U.isConc(sp_(s)) ? "\u00d7" : ""},
		{key: "range", label: "Range", cls: "ve-col-2-4", cellCls: "ve-px-1 ve-text-right", sortVal: s => U.spRange(sp_(s)), render: s => U.spRange(sp_(s))},
		...extra,
		{key: "source", label: "Source", cls: "ve-grow", cellCls: "ve-text-center ve-pl-1 ve-pr-0", sortVal: s => CS.srcAbv(sp_(s).source), render: s => U.srcSpan(sp_(s).source)},
	];

	U.spellFilters = get => [
		{key: "level", header: "Level", values: s => [String(get(s).level)], display: v => v === "0" ? "Cantrip" : `${CS.ordinal(v)} level`, sort: (a, b) => a - b},
		{key: "school", header: "School", values: s => [CS.SCHOOL[get(s).school] || get(s).school]},
		{key: "conc", header: "Concentration", values: s => [U.isConc(get(s)) ? "Yes" : "No"]},
		{key: "ritual", header: "Ritual", values: s => [get(s).meta?.ritual ? "Yes" : "No"]},
		{key: "comp", header: "Components", values: s => { const c = get(s).components || {}; return [c.v && "V", c.s && "S", c.m && "M", c.r && "R"].filter(Boolean); }},
		{key: "time", header: "Cast Time", values: s => (get(s).time || []).map(t => TIME[t.unit] || t.unit)},
		{key: "range", header: "Range", values: s => [U.rangeCat(get(s))]},
		{key: "dmg", header: "Damage Type", values: s => (get(s).damageInflict || []).map(CS.cap)},
		{key: "save", header: "Saving Throw", values: s => (get(s).savingThrow || []).map(CS.cap)},
		{key: "cond", header: "Conditions Inflicted", values: s => (get(s).conditionInflict || []).map(CS.cap)},
	];
	U.spellTiebreak = (a, b) => ((a.spell || a).level - (b.spell || b).level) || (a.spell || a).name.localeCompare((b.spell || b).name);
	U.spellPreview = s => U.html(CS.rd.compact("spell", s.spell || s));

	const RARITY_ORDER = ["none", "common", "uncommon", "rare", "very rare", "legendary", "artifact", "varies", "unknown", "unknown (magic)"];
	const ITEM_TYPE = {
		LA: "Light Armor", MA: "Medium Armor", HA: "Heavy Armor", S: "Shield", M: "Melee Weapon", R: "Ranged Weapon", A: "Ammunition", AF: "Ammunition (Futuristic)",
		G: "Adventuring Gear", AT: "Artisan's Tools", T: "Tools", GS: "Gaming Set", INS: "Instrument", SCF: "Spellcasting Focus", P: "Potion", RG: "Ring", RD: "Rod",
		SC: "Scroll", WD: "Wand", ST: "Staff", MNT: "Mount", VEH: "Vehicle (Land)", SHP: "Vehicle (Water)", AIR: "Vehicle (Air)", TAH: "Tack and Harness", TG: "Trade Good",
		FD: "Food and Drink", EXP: "Explosive", "$C": "Treasure (Coinage)", "$G": "Treasure (Gemstone)", "$A": "Treasure (Art Object)", OTH: "Other", GV: "Generic Variant",
	};
	U.itemType = it => {
		const t = CS.rules.typeCode(it.type);
		if (t) return ITEM_TYPE[t] || t;
		if (it.wondrous) return "Wondrous Item";
		if (it.poison) return "Poison";
		return "Other";
	};
	U.itemFilters = () => [
		{key: "type", header: "Type", values: it => [U.itemType(it)]},
		{key: "rarity", header: "Rarity", values: it => [it.rarity || "none"], display: CS.cap, sort: (a, b) => RARITY_ORDER.indexOf(a) - RARITY_ORDER.indexOf(b)},
		{key: "attune", header: "Attunement", values: it => [it.reqAttune ? "Requires Attunement" : "No Attunement"]},
		{key: "magic", header: "Category", values: it => [it._base ? "Basic" : (it.rarity && it.rarity !== "none" ? "Magic" : "Mundane")]},
		{key: "prop", header: "Property", values: it => (it.property || []).map(p => CS.data.propName(typeof p === "object" ? p.uid : p, it.source))},
	];
	U.itemColumns = (extra = []) => [
		{key: "name", label: "Name", cls: "ve-col-4", cellCls: "ve-bold ve-pl-0 ve-pr-1"},
		{key: "type", label: "Type", cls: "ve-col-3", cellCls: "ve-px-1 ve-text-center", sortVal: U.itemType, render: U.itemType},
		{key: "weight", label: "Weight", cls: "ve-col-1-5", cellCls: "ve-px-1 ve-text-center", sortVal: it => Number(it.weight || 0), render: it => it.weight ? `${it.weight} lb.` : "—"},
		{key: "value", label: "Cost", cls: "ve-col-1-5", cellCls: "ve-px-1 ve-text-center", sortVal: it => Number(it.value || 0), render: it => it.value ? CS.uiCore.cost(it.value) : "—"},
		...extra,
		{key: "source", label: "Source", cls: "ve-grow", cellCls: "ve-text-center ve-pl-1 ve-pr-0", sortVal: it => CS.srcAbv(it.source), render: it => U.srcSpan(it.source)},
	];
	U.cost = cp => cp >= 100 && cp % 100 === 0 ? `${cp / 100} gp` : cp >= 10 && cp % 10 === 0 ? `${cp / 10} sp` : `${cp} cp`;
	U.itemPreview = it => {
		let html = "";
		try {
			const R = globalThis.Renderer;
			if (R?.item?.getCompactRenderedString) {
				const copy = CS.clone(it);
				try { R.item.enhanceItem?.(copy); } catch (e) { /* ignore */ }
				html = CS.rd.compact("item", copy);
			}
		} catch (e) { /* fallback */ }
		return U.html(html || CS.rd.compact("_none", it));
	};

	U.featFilters = () => [
		{key: "cat", header: "Category", values: f => [FEAT_CAT[f.category] || f.category || "Other"]},
		{key: "abil", header: "Ability Bonus", values: f => (f.ability || []).flatMap(o => [...CS.ABIL.filter(a => o[a]), ...(o.choose?.from || (o.choose ? CS.ABIL : []))]).map(a => CS.ABIL_FULL[a])},
		{key: "prereq", header: "Prerequisite", values: f => [f.prerequisite ? "Has Prerequisite" : "No Prerequisite"]},
	];
	const FEAT_CAT = {G: "General", O: "Origin", FS: "Fighting Style", "FS:P": "Fighting Style (Paladin)", "FS:R": "Fighting Style (Ranger)", EB: "Epic Boon", D: "Dragonmark", DG: "Dragonmark"};
	U.FEAT_CAT = FEAT_CAT;
	U.prereqText = p => {
		if (!p) return "";
		try { if (globalThis.Renderer?.utils?.prerequisite?.getHtml) return CS.render.strip(globalThis.Renderer.utils.prerequisite.getHtml(p, {isListMode: true})); } catch (e) { /* fallback */ }
		return p.map(o => Object.entries(o).map(([k, v]) => {
			if (k === "level") return `Level ${typeof v === "object" ? v.level : v}`;
			if (k === "ability") return v.map(a => Object.entries(a).map(([ab, n]) => `${CS.ABIL_SHORT[ab] || ab} ${n}`).join(" or ")).join(", ");
			if (k === "race") return v.map(r => CS.cap(r.name)).join(" or ");
			if (/spellcasting/.test(k)) return "Spellcasting";
			if (k === "feat") return v.map(f => CS.cap(String(f).split("|")[0])).join(", ");
			if (k === "other") return v;
			return CS.cap(k);
		}).filter(Boolean).join(", ")).join(" or ");
	};
})();
