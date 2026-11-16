/* Inline choice widgets (D&D Beyond style): every option is chosen where it is granted */
(function () {
	const CS = globalThis.CS5E;
	const {h} = CS;
	const D = CS.data; const R = CS.rules; const U = CS.uiCore;
	const K = CS.key;
	const C = (CS.uiChoices = {});

	/** app hooks: set by ui-app.js */
	C.app = {commit: () => {}, calc: () => null, char: () => null};

	const setChoice = (id, value) => C.app.commit(c => {
		// clear nested choices of the old value
		for (const k of Object.keys(c.choices)) if (k.startsWith(id + ">")) delete c.choices[k];
		if (value == null) delete c.choices[id]; else c.choices[id] = value;
	});
	C.setChoice = setChoice;

	const childrenOf = (calc, id) => calc.choices.filter(x => x.parent === id && x.id !== id);

	/** Render a choice and its nested choices */
	C.render = (c, calc) => {
		const pending = R.isPending(c, calc);
		const box = h("div", {class: `cs5e-choice ${pending ? "cs5e-choice--pending" : ""}`, "data-choice": c.id});
		const widget = WIDGETS[c.kind]?.(c, calc);
		if (!widget) return null;
		box.append(h("div", {class: "cs5e-choice__head"}, h("span", {class: "cs5e-choice__label"}, c.label), pending ? h("span", {class: "cs5e-choice__todo"}, "Choose") : null), widget);
		const kids = childrenOf(calc, c.id).map(k => C.render(k, calc)).filter(Boolean);
		if (kids.length) box.append(h("div", {class: "cs5e-choice__kids"}, kids));
		return box;
	};

	C.renderList = (choices, calc) => choices.map(c => C.render(c, calc)).filter(Boolean);

	/* ---------------- simple multi-select ("pick N from list") ---------------- */

	function multiSelect (c, options, {taken = new Set()} = {}) {
		const val = Array.isArray(c.value) ? c.value : [];
		const wrap = h("div", {class: "cs5e-choice__row"});
		for (let i = 0; i < c.count; i++) {
			const cur = val[i] || "";
			const opts = [["", "— Choose —"]];
			let group = null; let og = null;
			const sel = h("select", {class: "ve-form-control ve-input-xs cs5e-choice__sel", on: {change: e => {
				const next = [...val]; next[i] = e.target.value || null;
				setChoice(c.id, next.slice(0, c.count));
			}}}, h("option", {value: ""}, "— Choose —"));
			for (const o of options) {
				const [v, l, g] = o;
				const dis = (val.includes(v) && cur !== v) || (taken.has(v) && cur !== v);
				const opt = h("option", {value: v, selected: cur === v, disabled: dis}, l + (taken.has(v) && cur !== v ? " (already proficient)" : ""));
				if (g) { if (g !== group) { og = h("optgroup", {label: g}); sel.append(og); group = g; } og.append(opt); } else sel.append(opt);
			}
			void opts;
			wrap.append(sel);
		}
		return wrap;
	}

	const skillOptions = (from) => (from && from.length ? from : CS.SKILLS.map(s => s.key)).filter(k => CS.SKILL_BY_KEY[k]).map(k => [k, CS.skillName(k)]);

	function langOptions (c) {
		const all = D.languages.filter(l => D.isAllowed(l));
		const uniq = new Map();
		for (const l of all) if (!uniq.has(l.name)) uniq.set(l.name, l);
		let list = [...uniq.values()];
		if (c.from) return c.from.map(x => [CS.cap(x), CS.cap(x)]);
		if (c.pool === "anyStandard") list = list.filter(l => !l.type || l.type === "standard");
		if (c.pool === "anyExotic" || c.pool === "anyRare") list = list.filter(l => l.type === "exotic" || l.type === "rare");
		return list.map(l => [l.name, l.name, CS.cap(l.type || "standard")]).sort((a, b) => a[2].localeCompare(b[2]) || a[1].localeCompare(b[1]));
	}

	function toolOptions (c) {
		if (c.from) return c.from.map(x => [CS.cap(String(x).split("|")[0]), CS.cap(String(x).split("|")[0])]);
		const want = {anyArtisansTool: ["AT"], anyMusicalInstrument: ["INS"], anyGamingSet: ["GS"], anyTool: ["AT", "T", "GS", "INS"], any: ["AT", "T", "GS", "INS"]}[c.pool] || ["AT", "T", "GS", "INS"];
		const names = new Map();
		for (const it of D.items) {
			if (!it._base && it.rarity && it.rarity !== "none") continue;
			const t = R.typeCode(it.type);
			if (want.includes(t) && D.isAllowed(it) && !names.has(it.name)) names.set(it.name, [it.name, it.name, U.itemType(it)]);
		}
		return [...names.values()].sort((a, b) => a[2].localeCompare(b[2]) || a[1].localeCompare(b[1]));
	}

	function weaponOptions () {
		const names = new Map();
		for (const it of D.items) if (it._base && it.weapon && D.isAllowed(it) && !names.has(it.name)) names.set(it.name, [it.name, it.name]);
		return [...names.values()].sort((a, b) => a[1].localeCompare(b[1]));
	}

	/** skills already proficient from other sources */
	function takenSkills (c, calc) {
		const mine = new Set(Array.isArray(c.value) ? c.value : []);
		return new Set(calc.skills.filter(s => s.prof >= 1 && !mine.has(s.key)).map(s => s.key));
	}

	/* ---------------- entity pickers (modal with the 5etools list) ---------------- */

	C.pick = ({title, id, items, columns, filters, sourceOf = it => it.source, previewOf, multi = 0, chosen = [], onDone, tiebreak, defaultSort}) => {
		let sel = [...chosen];
		const m = U.modal(title);
		const footer = h("div", {class: "ve-flex-v-center ve-mt-2 cs5e-gap"});
		const keyOf = it => K(it.name, it.source);
		const draw = () => {
			const list = U.filterList({
				id, items, columns, filters, sourceOf, previewOf: it => {
					const isSel = sel.includes(keyOf(it));
					return h("div", null,
						h("div", {class: "ve-flex-v-center ve-mb-2 cs5e-gap"},
							multi
								? U.btn(isSel ? "Remove" : "Select", () => { sel = isSel ? sel.filter(x => x !== keyOf(it)) : [...sel, keyOf(it)].slice(-multi); draw(); }, isSel ? "ve-btn-danger" : "ve-btn-primary", {disabled: !isSel && sel.length >= multi && multi > 1})
								: U.btn("Choose", () => { onDone([it]); m.close(); }, "ve-btn-primary")),
						previewOf(it));
				},
				isSelected: it => sel.includes(keyOf(it)),
				actionOf: multi ? it => {
					const isSel = sel.includes(keyOf(it));
					return U.btn(isSel ? "−" : "+", () => { sel = isSel ? sel.filter(x => x !== keyOf(it)) : [...sel, keyOf(it)]; if (multi === 1) sel = sel.slice(-1); if (sel.length > multi) sel = sel.slice(-multi); draw(); }, `${isSel ? "ve-btn-danger" : "ve-btn-success"} ve-btn-xxs ve-btn-xs`, {title: isSel ? "Remove" : "Select"});
				} : it => U.btn("Choose", () => { onDone([it]); m.close(); }, "ve-btn-primary ve-btn-xs"),
				tiebreak, defaultSort,
				height: "calc(100vh - 260px)",
			});
			footer.replaceChildren(
				multi ? h("span", {class: sel.length > multi ? "ve-text-danger" : ""}, `${sel.length}/${multi} selected`) : null,
				multi ? U.btn("Save", () => { onDone(sel.map(k => items.find(it => keyOf(it) === k)).filter(Boolean)); m.close(); }, "ve-btn-primary") : null,
				U.btn("Cancel", () => m.close(), "ve-btn-default"),
			);
			m.inner.replaceChildren(list, footer);
		};
		draw();
	};

	const featColumns = () => [
		{key: "name", label: "Name", cls: "ve-col-3-5", cellCls: "ve-bold ve-pl-0 ve-pr-1"},
		{key: "cat", label: "Category", cls: "ve-col-2", cellCls: "ve-px-1 ve-text-center", sortVal: f => U.FEAT_CAT[f.category] || "", render: f => U.FEAT_CAT[f.category] || "—"},
		{key: "abil", label: "Ability", cls: "ve-col-2", cellCls: "ve-px-1 ve-text-center", sortVal: f => R.describeOption(f.ability?.[0] || {}), render: f => f.ability ? R.describeOption(f.ability[0]).replace("No bonus", "—") : "—"},
		{key: "prereq", label: "Prerequisite", cls: "ve-col-3", cellCls: "ve-px-1 ve-small", sortVal: f => U.prereqText(f.prerequisite), render: f => U.prereqText(f.prerequisite) || "—"},
		{key: "source", label: "Source", cls: "ve-grow", cellCls: "ve-text-center", sortVal: f => CS.srcAbv(f.source), render: f => U.srcSpan(f.source)},
	];

	C.pickFeat = ({category, title = "Choose a Feat", current, onDone}) => {
		const cats = category ? (Array.isArray(category) ? category : [category]) : null;
		const items = D.feats.filter(f => D.isAllowed(f) && (!cats || cats.includes(f.category) || cats.some(c => String(f.category || "").startsWith(c + ":"))));
		C.pick({title, id: "pick:feat", items, columns: featColumns(), filters: U.featFilters(), previewOf: f => U.html(CS.rd.compact("feat", f)), chosen: current ? [K(current.name, current.source)] : [], onDone});
	};

	/* ---------------- widgets per kind ---------------- */

	const WIDGETS = {
		ability (c) {
			const v = c.value || {opt: 0, picks: []};
			const optIdx = Math.min(Number(v.opt || 0), c.options.length - 1);
			const opt = c.options[optIdx];
			const wrap = h("div", {class: "cs5e-choice__row"});
			if (c.options.length > 1) {
				wrap.append(U.sel(c.options.map((o, i) => [i, R.describeOption(o)]), optIdx, val => setChoice(c.id, {opt: Number(val), picks: []})));
			}
			R.optionSlots(opt).forEach((s, i) => {
				if (s.from.length === 1) { wrap.append(h("span", {class: "ve-small"}, `${CS.fmtMod(s.amount)} ${CS.ABIL_FULL[s.from[0]]}`)); return; }
				const picks = v.picks || [];
				wrap.append(h("label", {class: "ve-flex-v-center cs5e-gap-s"}, h("b", null, CS.fmtMod(s.amount)),
					U.sel([["", "— Choose —"], ...s.from.map(a => [a, CS.ABIL_FULL[a], picks.includes(a) && picks[i] !== a])], picks[i] || "",
						val => { const p = [...picks]; p[i] = val || null; setChoice(c.id, {opt: optIdx, picks: p}); })));
			});
			if (!R.optionSlots(opt).length) wrap.append(h("span", {class: "ve-small"}, R.describeOption(opt)));
			return wrap;
		},
		skill (c, calc) { return multiSelect(c, skillOptions(c.from && c.from.length ? c.from : null), {taken: takenSkills(c, calc)}); },
		expertise (c, calc) {
			const mine = new Set(Array.isArray(c.value) ? c.value : []);
			const prof = calc.skills.filter(s => s.prof >= 1 || mine.has(s.key));
			const taken = new Set(calc.skills.filter(s => s.prof >= 2 && !mine.has(s.key)).map(s => s.key));
			return multiSelect(c, prof.map(s => [s.key, s.name]), {taken});
		},
		lang (c, calc) { return multiSelect(c, langOptions(c), {taken: new Set(calc.proficiencies.languages.filter(l => !(c.value || []).includes(l)))}); },
		tool (c, calc) { return multiSelect(c, toolOptions(c), {taken: new Set(calc.proficiencies.tools.filter(t => !(c.value || []).includes(t)))}); },
		weapon (c) { return multiSelect(c, weaponOptions()); },
		armor (c) { return multiSelect(c, ["Light armor", "Medium armor", "Heavy armor", "Shields"].map(x => [x, x])); },
		stl (c, calc) {
			const opts = [];
			if (c.allow.skill) opts.push(...CS.SKILLS.map(s => [`skill:${s.key}`, s.name, "Skills"]));
			if (c.allow.tool) opts.push(...toolOptions({pool: "anyTool"}).map(([v, l]) => [`tool:${v}`, l, "Tools"]));
			if (c.allow.lang) opts.push(...langOptions({pool: "any"}).map(([v, l]) => [`lang:${v}`, l, "Languages"]));
			const taken = new Set([...takenSkills({value: (c.value || []).filter(x => x?.startsWith("skill:")).map(x => x.slice(6))}, calc)].map(k => `skill:${k}`));
			return multiSelect(c, opts, {taken});
		},
		save (c, calc) {
			return h("div", {class: "cs5e-choice__row"}, U.sel([["", "— Choose —"], ...c.from.map(a => [a, CS.ABIL_FULL[a], calc.saves[a]?.prof && c.value !== a])], c.value || "", v => setChoice(c.id, v || null)));
		},
		spellAbility (c) {
			return h("div", {class: "cs5e-choice__row"}, U.sel([["", "— Choose —"], ...c.from.map(a => [a, CS.ABIL_FULL[a]])], c.value || "", v => setChoice(c.id, v || null)));
		},
		size (c) {
			return h("div", {class: "cs5e-choice__row"}, U.sel(c.options.map(s => [s, CS.SIZE[s] || s]), c.value || c.options[0], v => setChoice(c.id, v)));
		},
		spellOpt (c) {
			const cur = c.value == null ? c.def || 0 : Number(c.value);
			return h("div", {class: "cs5e-choice__row"}, U.sel(c.options.map((o, i) => [i, o]), cur, v => setChoice(c.id, Number(v))));
		},
		asi (c) {
			const mode = c.value?.mode || "asi";
			return h("div", {class: "cs5e-choice__row"}, h("div", {class: "ve-btn-group"},
				U.btn("Ability Score Improvement", () => setChoice(c.id, {mode: "asi"}), `ve-btn-xs ${mode === "asi" ? "ve-btn-primary" : "ve-btn-default"}`),
				U.btn("Feat", () => setChoice(c.id, {mode: "feat"}), `ve-btn-xs ${mode === "feat" ? "ve-btn-primary" : "ve-btn-default"}`)));
		},
		feat (c) {
			const feat = c.value && D.getFeat(c.value);
			const row = h("div", {class: "cs5e-choice__row"});
			if (feat) {
				row.append(U.link("feat", feat), U.srcSpan(feat.source),
					U.btn("Change", () => C.pickFeat({category: c.category, current: c.value, onDone: ([f]) => setChoice(c.id, {name: f.name, source: f.source})}), "ve-btn-default ve-btn-xs"),
					U.btn("Remove", () => setChoice(c.id, null), "ve-btn-danger ve-btn-xs"));
				row.append(U.details(`feat:${c.id}`, "Description", () => U.rd(feat.entries), {cls: "cs5e-acc--inline"}));
			} else {
				row.append(U.btn(`Choose a ${c.category ? (Array.isArray(c.category) ? c.category : [c.category]).map(x => U.FEAT_CAT[x] || x).join("/") + " " : ""}Feat`, () => C.pickFeat({category: c.category, onDone: ([f]) => setChoice(c.id, {name: f.name, source: f.source})}), "ve-btn-primary ve-btn-xs"));
			}
			return row;
		},
		grantedFeat (c) {
			const f = c.feat;
			return h("div", {class: "cs5e-choice__row"}, U.link("feat", f), c.note ? h("span", {class: "ve-muted"}, `(${CS.cap(c.note)})`) : null, U.srcSpan(f.source),
				U.details(`feat:${c.id}`, "Description", () => U.rd(f.entries), {cls: "cs5e-acc--inline"}));
		},
		optfeature (c) {
			const val = Array.isArray(c.value) ? c.value : [];
			const chosen = val.map(r => D.getOptFeature(r)).filter(Boolean);
			const row = h("div", {class: "cs5e-choice__col"});
			for (const of of chosen) {
				row.append(h("div", {class: "cs5e-choice__row"}, U.link("optfeature", of), U.srcSpan(of.source),
					of.prerequisite ? h("span", {class: "ve-muted ve-small"}, `Prerequisite: ${U.prereqText(of.prerequisite)}`) : null,
					U.btn("−", () => setChoice(c.id, val.filter(r => K(r.name, r.source) !== K(of.name, of.source))), "ve-btn-danger ve-btn-xs", {title: "Remove"})));
			}
			row.append(h("div", null, U.btn(`${chosen.length ? "Change" : "Choose"} ${c.label} (${chosen.length}/${c.count})`, () => {
				const types = new Set(c.featureType);
				const items = D.optfeatures.filter(o => D.isAllowed(o) && (o.featureType || []).some(t => types.has(t)));
				C.pick({
					title: `Choose ${c.label} (${c.count})`, id: `pick:opt:${[...types].join(",")}`, items, multi: c.count, chosen: val.map(r => K(r.name, r.source)),
					columns: [
						{key: "name", label: "Name", cls: "ve-col-4", cellCls: "ve-bold ve-pl-0 ve-pr-1"},
						{key: "prereq", label: "Prerequisite", cls: "ve-col-5", cellCls: "ve-px-1 ve-small", sortVal: o => U.prereqText(o.prerequisite), render: o => U.prereqText(o.prerequisite) || "—"},
						{key: "source", label: "Source", cls: "ve-grow", cellCls: "ve-text-center", sortVal: o => CS.srcAbv(o.source), render: o => U.srcSpan(o.source)},
					],
					filters: [{key: "prereq", header: "Prerequisite", values: o => [o.prerequisite ? "Has Prerequisite" : "No Prerequisite"]}],
					previewOf: o => U.html(CS.rd.compact("optionalfeature", o)),
					onDone: arr => setChoice(c.id, arr.map(o => ({name: o.name, source: o.source}))),
				});
			}, chosen.length < c.count ? "ve-btn-primary ve-btn-xs" : "ve-btn-default ve-btn-xs")));
			return row;
		},
		spell (c) {
			const val = Array.isArray(c.value) ? c.value : [];
			const chosen = val.map(u => D.findByUid(D.spells, u)).filter(Boolean);
			const row = h("div", {class: "cs5e-choice__col"});
			for (const sp of chosen) {
				row.append(h("div", {class: "cs5e-choice__row"}, U.link("spell", sp), h("span", {class: "ve-muted ve-small"}, `${CS.levelName(sp.level)} ${CS.SCHOOL[sp.school] || ""}`), U.srcSpan(sp.source),
					U.btn("−", () => setChoice(c.id, val.filter(u => u !== `${sp.name}|${sp.source}`)), "ve-btn-danger ve-btn-xs", {title: "Remove"})));
			}
			row.append(h("div", null, U.btn(`${chosen.length ? "Change" : "Choose"} spell${c.count > 1 ? "s" : ""} (${chosen.length}/${c.count})`, () => {
				const items = D.spells.filter(sp => D.isAllowed(sp) && D.matchSpellFilter(sp, c.filter));
				C.pick({
					title: `Choose ${c.count} spell${c.count > 1 ? "s" : ""}`, id: "pick:spell", items, multi: c.count,
					chosen: val.map(u => { const sp = D.findByUid(D.spells, u); return sp ? K(sp.name, sp.source) : u; }),
					columns: U.spellColumns(), filters: U.spellFilters(s => s), tiebreak: U.spellTiebreak, defaultSort: ["level", 1],
					previewOf: s => U.spellPreview(s),
					onDone: arr => setChoice(c.id, arr.map(s => `${s.name}|${s.source}`)),
				});
			}, chosen.length < c.count ? "ve-btn-primary ve-btn-xs" : "ve-btn-default ve-btn-xs")),
			h("div", {class: "ve-muted ve-small"}, `Options: ${describeFilter(c.filter)}`));
			return row;
		},
	};

	function describeFilter (f) {
		return String(f).split("|").map(p => {
			const [k, v] = p.split("=");
			if (k === "level") return v.split(";").map(l => l === "0" ? "cantrip" : `${CS.ordinal(l)}-level`).join(" or ");
			if (k === "class") return `${v.split(";").join("/")} list`;
			if (k === "school") return v.split(";").map(x => CS.SCHOOL[x] || x).join("/");
			return p;
		}).join(", ");
	}
})();
