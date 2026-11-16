/* Character builder (D&D Beyond flow, 5etools look): Home, Class, Background, Species, Abilities, Spells, Equipment, Description */
(function () {
	const CS = globalThis.CS5E;
	const {h} = CS;
	const D = CS.data; const R = CS.rules; const U = CS.uiCore; const C = CS.uiChoices;
	const K = CS.key;
	const B = (CS.uiBuilder = {});

	B.STEPS = [
		["home", "Home"], ["class", "Class"], ["background", "Background"], ["species", "Species"],
		["abilities", "Abilities"], ["spells", "Spells"], ["equipment", "Equipment"], ["description", "Description"],
	];

	let app; // set by ui-app
	B.init = a => { app = a; };
	const char = () => app.st.char;
	const calc = () => app.st.calc;
	const commit = (fn, o) => app.commit(fn, o);

	const section = (title, ...kids) => h("div", {class: "cs5e-sec"}, h("div", {class: "cs5e-sec__h"}, title), ...kids);
	const statHead = (title, right) => h("div", {class: "cs5e-hdr"}, h("h1", {class: "ve-stats__h-name ve-m-0"}, title), right ? h("div", {class: "ve-flex-v-center cs5e-gap"}, right) : null);

	/** pending choices of a section (counted for step badges) */
	B.pendingFor = (sec, k = calc()) => {
		let n = k.choices.filter(c => (sec === "class" ? /^cls\d+$/.test(c.section) : c.section === sec) && R.isPending(c, k)).length;
		if (sec === "class") n += k.classes.filter(ce => !ce.sc && ce.level >= D.subclassLevel(ce.cls) && ce.cls._subclasses.length).length;
		return n;
	};

	B.render = step => ({home, class: classStep, background, species, abilities, spells, equipment, description}[step] || home)();

	/* =============================== HOME =============================== */

	function home () {
		const c = char();
		const s = c.settings;
		const txt = (path, ph = "") => {
			const parts = path.split(".");
			const get = o => parts.reduce((x, p) => x?.[p], o);
			return h("input", {type: "text", class: "ve-form-control ve-input-xs", value: get(c) ?? "", placeholder: ph, on: {input: e => commit(x => { let o = x; for (const p of parts.slice(0, -1)) o = o[p] = o[p] || {}; o[parts.at(-1)] = e.target.value; }, {rerender: false})}});
		};
		return h("div", {class: "cs5e-page"},
			statHead("Character Preferences"),
			section("Basics",
				h("div", {class: "cs5e-grid2"},
					field("Character Name", txt("name", "Name")),
					field("Player", txt("player")),
					field("Avatar (image URL)", txt("portrait", "https://...")),
				)),
			section("Sources",
				h("p", {class: "ve-small"}, "Choose which books to use. The same Source filter is shared by every list in the builder (species, classes, backgrounds, feats, spells, items) and works like the filters on 5etools: click a book to include it, again to exclude it, again to ignore it."),
				h("div", {class: "ve-flex-v-center cs5e-gap"},
					U.sel([["all", "All rules (2014 + 2024)"], ["one", "2024 rules only"], ["classic", "2014 rules only"]], D.settings.edition, v => app.setSetting("edition", v)),
					U.btn("Choose sources...", () => openSourceFilter(), "ve-btn-default ve-btn-xs"))),
			section("Ability Score Generation",
				U.sel([["standard", "Standard Array"], ["pointbuy", "Point Buy"], ["roll", "Rolled (4d6, drop lowest)"], ["manual", "Manual"]], s.abilityMethod, v => commit(x => { x.settings.abilityMethod = v; if (v === "standard") x.base = Object.fromEntries(CS.ABIL.map((a, i) => [a, R.STANDARD_ARRAY[i]])); if (v === "pointbuy") x.base = Object.fromEntries(CS.ABIL.map(a => [a, 8])); }))),
			section("Hit Point Type",
				U.sel([["fixed", "Fixed (average)"], ["manual", "Manual (rolled)"]], s.hpMethod, v => commit(x => { x.settings.hpMethod = v; }))),
			section("Ability Score Improvements",
				h("label", {class: "ve-flex-v-center cs5e-gap-s"}, h("input", {type: "checkbox", checked: !!s.asiByCharLevel, on: {change: e => commit(x => { x.settings.asiByCharLevel = e.target.checked; })}}),
					"House rule: gain ASIs/feats at character levels 4, 8, 12, 16 and 19 (instead of per class level, as in the rules)")),
			section("Optional Class Features",
				h("label", {class: "ve-flex-v-center cs5e-gap-s"}, h("input", {type: "checkbox", checked: s.optionalFeatures !== false, on: {change: e => commit(x => { x.settings.optionalFeatures = e.target.checked; })}}),
					"Use optional class features and expanded spell lists (Tasha's Cauldron of Everything)")),
			section("Species Ability Scores",
				h("p", {class: "ve-small"}, "Tasha's Custom Origin is always available: the species' ability increases can be assigned to any ability (e.g. +2/+1 or +1/+1/+1). You can still select the standard increases.")),
			h("div", {class: "cs5e-next"}, U.btn("Next: Class →", () => app.goStep("class"), "ve-btn-primary")),
		);
	}

	const field = (label, input) => h("label", {class: "cs5e-field"}, h("span", null, label), input);

	function openSourceFilter () {
		// open the filter modal of any list: the Source filter is shared
		const tmp = U.filterList({id: "sources", items: [...D.races, ...D.classes, ...D.backgrounds, ...D.feats, ...D.spells, ...D.items], columns: [{key: "name", label: "Name"}], sourceOf: it => it.source});
		tmp.querySelector(".ve-lst__form-top button").click();
	}

	/* =============================== CLASS =============================== */

	function classTable (cls, sc, level, {short = false} = {}) {
		const groups = R.tableGroups({cls, sc});
		const features = {};
		for (const f of cls.classFeatures || []) {
			const p = D.parseClassFeatureRef(typeof f === "string" ? f : f.classFeature);
			(features[p.level] = features[p.level] || []).push(CS.rd.str(`{@classFeature ${p.name}|${cls.name}|${cls.source}|${p.level}${p.source !== cls.source ? "|" + p.source : ""}}`));
		}
		const head1 = []; const head2 = [];
		for (const g of groups) {
			const cols = g.rowsSpellProgression ? g.rowsSpellProgression[g.rowsSpellProgression.length - 1].map((_, i) => String(i + 1)) : (g.colLabels || []);
			const n = g.rowsSpellProgression ? 9 : cols.length;
			head1.push(`<th class="${g.title ? "ve-cls-tbl__col-group" : ""}" colspan="${n}">${g.title ? CS.rd.str(g.title) : ""}</th>`);
			if (g.rowsSpellProgression) for (let i = 1; i <= 9; i++) head2.push(`<th class="ve-cls-tbl__col-generic-center">${i}</th>`);
			else for (const l of cols) head2.push(`<th class="ve-cls-tbl__col-generic-center">${CS.rd.str(l)}</th>`);
		}
		const rows = [];
		for (let l = 1; l <= 20; l++) {
			if (short && l !== level) continue;
			const cells = [];
			for (const g of groups) {
				if (g.rowsSpellProgression) { const r = g.rowsSpellProgression[l - 1] || []; for (let i = 0; i < 9; i++) cells.push(`<td class="ve-cls-tbl__col-generic-center">${r[i] ? r[i] : "—"}</td>`); } else (g.colLabels || []).forEach((_, i) => cells.push(`<td class="ve-cls-tbl__col-generic-center">${CS.esc(R.cellValue(g.rows?.[l - 1]?.[i]))}</td>`));
			}
			rows.push(`<tr class="${l % 2 ? "ve-cls-tbl__stripe-odd" : ""} ${l === level ? "cs5e-cls-cur" : ""}"><td class="ve-cls-tbl__col-level">${CS.ordinal(l)}</td><td class="ve-cls-tbl__col-prof-bonus">+${R.profBonus(l)}</td><td>${(features[l] || []).join(", ") || "—"}</td>${cells.join("")}</tr>`);
		}
		return U.html(`<table class="ve-cls-tbl ve-shadow-big ve-w-100 ve-mb-2"><tbody>
			<tr><th class="ve-tbl-border" colspan="999"></th></tr>
			<tr><th class="ve-text-left ve-cls-tbl__disp-name" colspan="999">${CS.esc(cls.name)}${sc ? ` <span class="ve-muted">(${CS.esc(sc.name)})</span>` : ""}</th></tr>
			<tr><th colspan="3"></th>${head1.join("")}</tr>
			<tr><th class="ve-cls-tbl__col-level">Level</th><th class="ve-cls-tbl__col-prof-bonus">Proficiency Bonus</th><th class="ve-text-left">Features</th>${head2.join("")}</tr>
			${rows.join("")}
			<tr><th class="ve-tbl-border" colspan="999"></th></tr></tbody></table>`, "cs5e-cls-wrap");
	}
	B.classTable = classTable;

	function classInfo (cls) {
		const sp = cls.startingProficiencies || {};
		const line = (l, v) => v ? `<div><b>${l}:</b> ${v}</div>` : "";
		const skills = (sp.skills || []).map(s => s.choose ? `Choose ${s.choose.count} from ${s.choose.from.map(CS.skillName).join(", ")}` : s.any ? `Any ${s.any}` : Object.keys(s).map(CS.skillName).join(", ")).join("; ");
		const req = cls.multiclassing?.requirements;
		const reqTxt = req ? (req.or ? req.or.map(o => Object.entries(o).map(([a, n]) => `${CS.ABIL_FULL[a]} ${n}`).join(", ")).join(" or ") : Object.entries(req).map(([a, n]) => `${CS.ABIL_FULL[a]} ${n}`).join(", ")) : "";
		return `<div class="ve-rd__b">${line("Hit Die", `d${cls.hd?.faces}`)}${line("Primary Ability", (cls.primaryAbility || []).map(o => Object.keys(o).map(a => CS.ABIL_FULL[a]).join(" or ")).join("; "))}${line("Saving Throws", (cls.proficiency || []).map(a => CS.ABIL_FULL[a]).join(", "))}${line("Armor", (sp.armor || []).map(a => typeof a === "object" ? CS.rd.str(a.full || a.proficiency) : CS.cap(a)).join(", "))}${line("Weapons", (sp.weapons || []).map(w => typeof w === "object" ? CS.rd.str(w.full || w.proficiency) : CS.rd.str(w)).join(", "))}${line("Tools", (sp.tools || []).map(t => CS.rd.str(t)).join(", "))}${line("Skills", skills)}${line("Multiclass Requirements", reqTxt)}</div>`;
	}

	function pickClass (onDone, title = "Choose a Class") {
		const items = D.classes.filter(D.isAllowed);
		C.pick({
			title, id: "pick:class", items,
			columns: [{key: "name", label: "Name", cls: "ve-col-8", cellCls: "ve-bold ve-pl-0"}, {key: "source", label: "Source", cls: "ve-grow", cellCls: "ve-text-center", sortVal: c => CS.srcAbv(c.source), render: c => U.srcSpan(c.source)}],
			previewOf: cls => h("div", null, statHead(cls.name, U.srcSpan(cls.source)), U.html(classInfo(cls)), classTable(cls, null, 0)),
			onDone: ([cls]) => onDone(cls),
		});
	}

	function pickSubclass (cls, onDone) {
		const items = cls._subclasses.filter(D.isAllowed);
		C.pick({
			title: `Choose a ${cls.subclassTitle || "Subclass"}`, id: "pick:subclass", items,
			columns: [{key: "name", label: "Name", cls: "ve-col-8", cellCls: "ve-bold ve-pl-0"}, {key: "source", label: "Source", cls: "ve-grow", cellCls: "ve-text-center", sortVal: c => CS.srcAbv(c.source), render: c => U.srcSpan(c.source)}],
			previewOf: sc => {
				const first = sc.subclassFeatures?.[0] && D.getSubclassFeature(sc.subclassFeatures[0]);
				return h("div", null, statHead(sc.name, U.srcSpan(sc.source)), first ? U.rd(first.entries) : null);
			},
			onDone: ([sc]) => onDone(sc),
		});
	}

	function classStep () {
		const c = char(); const k = calc();
		const page = h("div", {class: "cs5e-page"});
		if (!c.classes.length) {
			page.append(statHead("Choose a Class"));
			const items = D.classes.filter(D.isAllowed);
			page.append(U.filterList({
				id: "step:class", items, sourceOf: x => x.source,
				columns: [{key: "name", label: "Name", cls: "ve-col-8", cellCls: "ve-bold ve-pl-0"}, {key: "source", label: "Source", cls: "ve-grow", cellCls: "ve-text-center", sortVal: x => CS.srcAbv(x.source), render: x => U.srcSpan(x.source)}],
				previewOf: cls => h("div", null,
					h("div", {class: "ve-mb-2"}, U.btn(`Add ${cls.name}`, () => commit(x => { x.classes.push({name: cls.name, source: cls.source, level: 1, subclass: null}); }), "ve-btn-primary")),
					statHead(cls.name, U.srcSpan(cls.source)), U.html(classInfo(cls)), classTable(cls, null, 1)),
				height: "calc(100vh - 290px)",
			}));
			return page;
		}
		k.classes.forEach(ce => page.append(classCard(ce)));
		const totalLevel = R.classLevel(c);
		page.append(h("div", {class: "ve-flex-v-center cs5e-gap ve-mt-2"},
			totalLevel < 20 ? U.btn("+ Add Another Class (Multiclass)", () => pickClass(cls => commit(x => { x.classes.push({name: cls.name, source: cls.source, level: 1, subclass: null}); }), "Choose a Class to Multiclass Into"), "ve-btn-default") : null,
			h("span", {class: "ve-muted"}, `Character level ${totalLevel}`)));
		page.append(hpSection());
		page.append(h("div", {class: "cs5e-next"}, U.btn("Next: Background →", () => app.goStep("background"), "ve-btn-primary")));
		return page;
	}

	function classCard (ce) {
		const c = char(); const k = calc();
		const {cls, sc, i} = ce;
		const sec = `cls${i}`;
		const otherLevels = R.classLevel(c) - ce.level;
		const feats = R.classFeatureList(ce, c.settings);
		const mine = k.choices.filter(x => x.section === sec && !x.parent);
		const scLevel = D.subclassLevel(cls);
		const levelSel = U.sel(Array.from({length: 20 - otherLevels}, (_, j) => [j + 1, `Level ${j + 1}`]), ce.level, v => commit(x => { x.classes[i].level = Number(v); }));
		const card = h("div", {class: "cs5e-card"});
		card.append(statHead([cls.name, " ", U.srcSpan(cls.source)], [levelSel, U.btn("Remove Class", () => { if (confirm(`Remove ${cls.name}?`)) commit(x => { x.classes.splice(i, 1); for (const key of Object.keys(x.choices)) if (key.startsWith(sec + ":")) delete x.choices[key]; x.spells = x.spells.filter(s => s.cls !== cls.name); }); }, "ve-btn-danger ve-btn-xs")]));
		if (i > 0 && cls.multiclassing?.requirements) {
			const req = cls.multiclassing.requirements;
			const ok = req.or ? req.or.some(o => Object.entries(o).every(([a, n]) => k.scores[a]?.total >= n)) : Object.entries(req).every(([a, n]) => k.scores[a]?.total >= n);
			if (!ok) card.append(h("div", {class: "cs5e-warn"}, "Multiclass prerequisites not met: ", U.html(classInfo(cls).match(/Multiclass Requirements:<\/b> ([^<]*)/)?.[1] || "", "", "span")));
		}
		card.append(U.details(`ctbl:${sec}`, "Class Table", () => classTable(cls, sc, ce.level), {open: false}));

		// group features by level, with the choices anchored to each feature
		const used = new Set();
		const list = h("div", {class: "cs5e-features"});
		const featureBlock = (title, lvl, entries, anchorChoices, extra, src, extraPending = 0) => {
			anchorChoices.forEach(x => used.add(x.id));
			const pending = anchorChoices.reduce((n, x) => n + countPending(x, k), 0) + (extraPending || 0);
			return U.details(`feat:${sec}:${lvl}:${title}`, [h("span", {class: "cs5e-lvl"}, `Level ${lvl}`), h("span", {class: "cs5e-acc__t"}, title), src ? h("span", {class: "ve-muted ve-small"}, ` ${src}`) : null, U.badge(pending)],
				() => h("div", null, extra || null, C.renderList(anchorChoices, k), entries ? U.rd(entries) : null), {open: pending > 0});
		};
		const profChoices = mine.filter(x => x.feature === "Proficiencies");
		list.append(featureBlock(i === 0 ? "Proficiencies" : "Multiclass Proficiencies", 1, null, profChoices, U.html(classInfo(cls))));
		for (const f of feats) {
			const anchored = mine.filter(x => x.level === f.level && x.feature?.toLowerCase() === f.name.toLowerCase() && !used.has(x.id));
			let extra = null;
			if (f.gainSubclass) {
				extra = h("div", {class: "cs5e-choice"},
					h("div", {class: "cs5e-choice__head"}, h("span", {class: "cs5e-choice__label"}, cls.subclassTitle || "Subclass"), !sc ? h("span", {class: "cs5e-choice__todo"}, "Choose") : null),
					h("div", {class: "cs5e-choice__row"},
						sc ? [U.html(CS.rd.str(`{@class ${cls.name}|${cls.source}|${sc.name}|${sc.shortName}|${sc.source}}`), "", "span"), U.srcSpan(sc.source)] : null,
						U.btn(sc ? "Change" : `Choose ${cls.subclassTitle || "Subclass"}`, () => pickSubclass(cls, s => commit(x => {
							x.classes[i].subclass = {name: s.name, source: s.source, shortName: s.shortName};
							for (const key of Object.keys(x.choices)) if (key.startsWith(`${sec}:sc`)) delete x.choices[key];
						})), sc ? "ve-btn-default ve-btn-xs" : "ve-btn-primary ve-btn-xs")));
			}
			list.append(featureBlock(f.name, f.level, f.entries, anchored, extra, [f.kind === "subclass" ? f.sub : null, f.optional ? "(optional)" : null].filter(Boolean).join(" "), f.gainSubclass && !sc ? 1 : 0));
		}
		const rest = mine.filter(x => !used.has(x.id));
		if (rest.length) list.append(featureBlock("Other Choices", "—", null, rest));
		card.append(list);
		return card;
	}

	function countPending (c, k) {
		return (R.isPending(c, k) ? 1 : 0) + k.choices.filter(x => x.parent === c.id && x.id !== c.id).reduce((n, x) => n + countPending(x, k), 0);
	}
	B.countPending = countPending;

	function hpSection () {
		const c = char(); const k = calc();
		const box = section("Hit Points",
			h("div", {class: "ve-flex-v-center cs5e-gap"},
				h("span", {class: "cs5e-big"}, k.hp.max), h("span", {class: "ve-muted ve-small"}, `Max HP (${c.settings.hpMethod === "manual" ? "rolled" : "fixed"}${k.hp.parts.length ? ", includes " + k.hp.parts.join(", ") : ""})`),
				field("Bonus HP", h("input", {type: "number", class: "ve-form-control ve-input-xs cs5e-num", value: c.hp.bonus || 0, on: {change: e => commit(x => { x.hp.bonus = Number(e.target.value) || 0; })}})),
				field("Override Max", h("input", {type: "number", class: "ve-form-control ve-input-xs cs5e-num", value: c.hp.maxOverride ?? "", on: {change: e => commit(x => { x.hp.maxOverride = e.target.value ? Number(e.target.value) : null; })}}))));
		if (c.settings.hpMethod === "manual") {
			const grid = h("div", {class: "cs5e-grid6"});
			k.classes.forEach(ce => {
				for (let l = (ce.i === 0 ? 2 : 1); l <= ce.level; l++) {
					const key = `${ce.i}:${l}`;
					grid.append(field(`${ce.cls.name} ${l} (d${ce.cls.hd.faces})`, h("input", {type: "number", class: "ve-form-control ve-input-xs", min: 1, max: ce.cls.hd.faces, value: c.hp.rolls?.[key] ?? "", placeholder: String(Math.floor(ce.cls.hd.faces / 2) + 1),
						on: {change: e => commit(x => { x.hp.rolls = x.hp.rolls || {}; const v = Number(e.target.value); if (v) x.hp.rolls[key] = Math.min(ce.cls.hd.faces, v); else delete x.hp.rolls[key]; })}})));
				}
			});
			box.append(grid);
		}
		return box;
	}

	/* =============================== BACKGROUND =============================== */

	function background () {
		const c = char(); const k = calc();
		const page = h("div", {class: "cs5e-page"});
		const bg = k.background;
		if (!bg) {
			page.append(statHead("Choose a Background"));
			page.append(U.filterList({
				id: "step:bg", items: D.backgrounds.filter(D.isAllowed), sourceOf: x => x.source,
				columns: [
					{key: "name", label: "Name", cls: "ve-col-4", cellCls: "ve-bold ve-pl-0"},
					{key: "skills", label: "Skills", cls: "ve-col-5", cellCls: "ve-px-1 ve-small", sortVal: b => bgSkills(b), render: bgSkills},
					{key: "source", label: "Source", cls: "ve-grow", cellCls: "ve-text-center", sortVal: x => CS.srcAbv(x.source), render: x => U.srcSpan(x.source)},
				],
				filters: [{key: "skills", header: "Skill Proficiencies", values: b => Object.keys(b.skillProficiencies?.[0] || {}).filter(x => CS.SKILL_BY_KEY[x]).map(CS.skillName)}, {key: "abil", header: "Ability Scores", values: b => (b.ability?.[0]?.choose?.weighted?.from || []).map(a => CS.ABIL_FULL[a])}],
				previewOf: b => h("div", null, h("div", {class: "ve-mb-2"}, U.btn(`Choose ${b.name}`, () => commit(x => { x.background = {name: b.name, source: b.source}; for (const key of Object.keys(x.choices)) if (key.startsWith("bg")) delete x.choices[key]; }), "ve-btn-primary")), U.html(CS.rd.compact("background", b))),
				height: "calc(100vh - 290px)",
			}));
			return page;
		}
		page.append(h("div", {class: "cs5e-card"},
			statHead([bg.name, " ", U.srcSpan(bg.source)], U.btn("Change Background", () => commit(x => { x.background = null; for (const key of Object.keys(x.choices)) if (key.startsWith("bg")) delete x.choices[key]; }), "ve-btn-default ve-btn-xs")),
			section("Choices", ...C.renderList(k.choices.filter(x => x.section === "bg" && !x.parent), k), k.choices.some(x => x.section === "bg") ? null : h("div", {class: "ve-muted ve-small"}, "No choices to make.")),
			U.details("bg:desc", "Description", () => U.html(CS.rd.compact("background", bg)), {open: true}),
		));
		page.append(h("div", {class: "cs5e-next"}, U.btn("Next: Species →", () => app.goStep("species"), "ve-btn-primary")));
		return page;
	}
	const bgSkills = b => Object.keys(b.skillProficiencies?.[0] || {}).filter(x => CS.SKILL_BY_KEY[x]).map(CS.skillName).join(", ") || CS.describeChoose?.(b) || "—";

	/* =============================== SPECIES =============================== */

	function speciesItems () {
		const out = [];
		for (const r of D.races.filter(D.isAllowed)) {
			const subs = r._subraces.filter(D.isAllowed);
			const named = subs.filter(s => s.name);
			if (!named.length) out.push({name: r.name, source: r.source, race: r, sub: subs[0] || null});
			for (const s of named) out.push({name: `${r.name} (${s.name})`, source: s.source || r.source, race: r, sub: s});
		}
		return out;
	}

	function species () {
		const c = char(); const k = calc();
		const page = h("div", {class: "cs5e-page"});
		const er = k.race;
		if (!er) {
			page.append(statHead("Choose a Species"));
			page.append(U.filterList({
				id: "step:race", items: speciesItems(), sourceOf: x => x.source,
				columns: [
					{key: "name", label: "Name", cls: "ve-col-4", cellCls: "ve-bold ve-pl-0"},
					{key: "abil", label: "Ability", cls: "ve-col-3", cellCls: "ve-px-1 ve-small", sortVal: x => abilTxt(x), render: abilTxt},
					{key: "size", label: "Size", cls: "ve-col-2", cellCls: "ve-px-1 ve-text-center", sortVal: x => sizeOf(x), render: sizeOf},
					{key: "source", label: "Source", cls: "ve-grow", cellCls: "ve-text-center", sortVal: x => CS.srcAbv(x.source), render: x => U.srcSpan(x.source)},
				],
				filters: [
					{key: "size", header: "Size", values: x => (mergedOf(x).size || []).map(s => CS.SIZE[s] || s)},
					{key: "speed", header: "Speed", values: x => { const s = mergedOf(x).speed; return typeof s === "object" ? Object.keys(s).map(CS.cap) : ["Walk"]; }},
					{key: "dv", header: "Darkvision", values: x => [mergedOf(x).darkvision ? "Darkvision" : "No Darkvision"]},
					{key: "creature", header: "Creature Type", values: x => (mergedOf(x).creatureTypes || ["humanoid"]).map(CS.cap)},
				],
				previewOf: x => h("div", null, h("div", {class: "ve-mb-2"}, U.btn(`Choose ${x.name}`, () => commit(ch => { ch.race = {name: x.race.name, source: x.race.source}; ch.subrace = x.sub ? {name: x.sub.name ?? "", source: x.sub.source} : null; for (const key of Object.keys(ch.choices)) if (key.startsWith("race")) delete ch.choices[key]; }), "ve-btn-primary")), U.html(CS.rd.compact("race", mergedOf(x)))),
				height: "calc(100vh - 290px)",
			}));
			return page;
		}
		const traits = (er.entries || []).filter(e => e && typeof e === "object" && e.name);
		page.append(h("div", {class: "cs5e-card"},
			statHead([er.displayName, " ", U.srcSpan(er._sub?.source || er.source)], U.btn("Change Species", () => commit(x => { x.race = null; x.subrace = null; for (const key of Object.keys(x.choices)) if (key.startsWith("race")) delete x.choices[key]; }), "ve-btn-default ve-btn-xs")),
			h("div", {class: "ve-rd__b ve-small ve-mb-2"},
				h("div", null, h("b", null, "Size: "), (er.size || []).map(s => CS.SIZE[s]).join(" or ")),
				h("div", null, h("b", null, "Speed: "), `${k.speed.walk} ft.`, ...Object.entries(k.speed).filter(([t]) => t !== "walk").map(([t, v]) => `, ${t} ${v} ft.`)),
				er.darkvision ? h("div", null, h("b", null, "Darkvision: "), `${er.darkvision} ft.`) : null,
				er.creatureTypes ? h("div", null, h("b", null, "Creature Type: "), er.creatureTypes.map(CS.cap).join(", ")) : null),
			section("Choices", ...C.renderList(k.choices.filter(x => x.section === "race" && !x.parent), k), k.choices.some(x => x.section === "race") ? null : h("div", {class: "ve-muted ve-small"}, "No choices to make.")),
			section("Species Traits", h("div", {class: "cs5e-features"}, traits.map((t, j) => U.details(`trait:${j}:${t.name}`, h("span", {class: "cs5e-acc__t"}, t.name), () => U.rd(t.entries || t.entry || []))))),
		));
		page.append(h("div", {class: "cs5e-next"}, U.btn("Next: Abilities →", () => app.goStep("abilities"), "ve-btn-primary")));
		return page;
	}
	const mergedCache = new WeakMap();
	const mergedOf = x => { if (!mergedCache.has(x)) mergedCache.set(x, R.effRace({race: {name: x.race.name, source: x.race.source}, subrace: x.sub ? {name: x.sub.name ?? "", source: x.sub.source} : null}) || x.race); return mergedCache.get(x); };
	const abilTxt = x => { const a = mergedOf(x).ability; return a ? R.describeOption(a[0]) : "—"; };
	const sizeOf = x => (mergedOf(x).size || []).map(s => CS.SIZE[s]).join("/");

	/* =============================== ABILITIES =============================== */

	function abilities () {
		const c = char(); const k = calc();
		const m = c.settings.abilityMethod;
		const page = h("div", {class: "cs5e-page"});
		page.append(statHead("Ability Scores", U.sel([["standard", "Standard Array"], ["pointbuy", "Point Buy"], ["roll", "Rolled"], ["manual", "Manual"]], m, v => commit(x => { x.settings.abilityMethod = v; if (v === "standard") x.base = Object.fromEntries(CS.ABIL.map((a, i) => [a, R.STANDARD_ARRAY[i]])); if (v === "pointbuy") x.base = Object.fromEntries(CS.ABIL.map(a => [a, Math.min(15, Math.max(8, x.base[a] || 8))])); }))));
		let info = null;
		if (m === "pointbuy") {
			const left = 27 - R.pointBuySpent(c.base);
			info = h("div", {class: `cs5e-pb ${left < 0 ? "ve-text-danger" : ""}`}, h("b", null, `Points Remaining: ${left}`), " / 27");
		} else if (m === "roll") {
			info = h("div", {class: "ve-flex-v-center cs5e-gap"}, U.btn("Roll 4d6 (drop lowest) × 6", () => commit(x => {
				x.rolls = Array.from({length: 6}, () => { const d = Array.from({length: 4}, () => 1 + Math.floor(Math.random() * 6)).sort((a, b) => b - a); return d[0] + d[1] + d[2]; }).sort((a, b) => b - a);
				x.base = Object.fromEntries(CS.ABIL.map((a, i) => [a, x.rolls[i]]));
			}), "ve-btn-primary ve-btn-xs"), c.rolls?.length ? h("span", null, "Results: ", h("b", null, c.rolls.join(", "))) : h("span", {class: "ve-muted"}, "No rolls yet"));
		}
		const pool = m === "standard" ? R.STANDARD_ARRAY : m === "roll" ? (c.rolls || []) : null;
		const baseInput = a => {
			if (m === "pointbuy") return U.sel([8, 9, 10, 11, 12, 13, 14, 15].map(v => [v, `${v} (${R.POINT_BUY_COST[v]} pt)`]), c.base[a], v => commit(x => { x.base[a] = Number(v); }));
			if (pool) {
				const cnt = {}; for (const v of pool) cnt[v] = (cnt[v] || 0) + 1;
				const used = {}; for (const b of CS.ABIL) if (b !== a) used[c.base[b]] = (used[c.base[b]] || 0) + 1;
				return U.sel([...new Set(pool)].map(v => [v, `${v}${(used[v] || 0) >= cnt[v] ? " (used)" : ""}`]), c.base[a], v => commit(x => { x.base[a] = Number(v); }));
			}
			return h("input", {type: "number", class: "ve-form-control ve-input-xs cs5e-num", min: 1, max: 30, value: c.base[a], on: {change: e => commit(x => { x.base[a] = Number(e.target.value) || 10; })}});
		};
		page.append(info || h("div"));
		const originChoices = k.choices.filter(x => x.kind === "ability" && ["race", "bg", "abil"].includes(x.section) && !x.parent);
		if (originChoices.length) page.append(section("Species & Background Bonuses", ...originChoices.map(x => C.render(x, k))));
		page.append(h("div", {class: "cs5e-abils"}, CS.ABIL.map(a => {
			const s = k.scores[a];
			return h("div", {class: "cs5e-abil-card"},
				h("div", {class: "cs5e-abil-card__n"}, CS.ABIL_FULL[a]),
				h("div", {class: "cs5e-final", title: "Final score"}, h("div", {class: "cs5e-final__s"}, s.total), h("div", {class: "cs5e-final__m"}, CS.fmtMod(s.mod)), h("div", {class: "cs5e-final__l"}, "Final Score")),
				baseInput(a),
				h("table", {class: "cs5e-abil-card__t"}, h("tbody", null,
					h("tr", null, h("td", null, "Base Score"), h("td", null, s.base)),
					h("tr", {title: s.parts.join("\n")}, h("td", null, "Bonuses"), h("td", null, s.bonus ? CS.fmtMod(s.bonus) : "—")),
					h("tr", null, h("td", null, "Other Modifier"), h("td", null, h("input", {type: "number", class: "ve-form-control ve-input-xs cs5e-num", value: c.extra[a] || 0, on: {change: e => commit(x => { x.extra[a] = Number(e.target.value) || 0; })}}))),
					h("tr", {class: "ve-bold cs5e-total"}, h("td", null, "Total Score"), h("td", null, s.total)),
					h("tr", {class: "ve-bold"}, h("td", null, "Modifier"), h("td", null, CS.fmtMod(s.mod))))),
				s.parts.length ? h("div", {class: "ve-muted ve-small"}, s.parts.map(p => h("div", null, p))) : null);
		})));
		const abilChoices = k.choices.filter(x => x.kind === "ability" && !originChoices.includes(x));
		if (abilChoices.length) page.append(section("Feats & Ability Score Improvements", h("p", {class: "ve-small ve-muted"}, "The same choices are shown where they are granted (Class, Species, Background)."), ...abilChoices.map(x => h("div", null, h("div", {class: "ve-small ve-bold"}, x.from), C.render(x, k)))));
		page.append(h("div", {class: "cs5e-next"}, U.btn("Next: Spells →", () => app.goStep("spells"), "ve-btn-primary")));
		return page;
	}

	/* =============================== SPELLS =============================== */

	function slotTable (slots, pact) {
		const max = Math.max(slots.length, 1);
		const th = []; const td = [];
		for (let i = 1; i <= 9; i++) { th.push(`<th class="ve-cls-tbl__col-generic-center">${i}</th>`); td.push(`<td class="ve-cls-tbl__col-generic-center">${slots[i - 1] || "—"}</td>`); }
		void max;
		return U.html(`<table class="ve-cls-tbl ve-shadow-big ve-mb-2 cs5e-slot-tbl"><tbody>
			<tr><th class="ve-tbl-border" colspan="999"></th></tr>
			<tr>${slots.length ? `<th class="ve-cls-tbl__col-group" colspan="9">Spell Slots per Spell Level</th>` : ""}${pact ? `<th class="ve-cls-tbl__col-group" colspan="2">Pact Magic</th>` : ""}</tr>
			<tr>${slots.length ? th.join("") : ""}${pact ? `<th class="ve-cls-tbl__col-generic-center">Spell Slots</th><th class="ve-cls-tbl__col-generic-center">Slot Level</th>` : ""}</tr>
			<tr class="ve-cls-tbl__stripe-odd">${slots.length ? td.join("") : ""}${pact ? `<td class="ve-cls-tbl__col-generic-center">${pact.count}</td><td class="ve-cls-tbl__col-generic-center">${CS.ordinal(pact.level)}</td>` : ""}</tr>
			<tr><th class="ve-tbl-border" colspan="999"></th></tr></tbody></table>`);
	}
	B.slotTable = slotTable;

	function grantedFor (k, pc) {
		return k.grants.spells.filter(g => {
			const sp = D.findByUid(D.spells, g.uid);
			return sp && (pc ? g.from === pc.cls || k.classes.find(ce => ce.i === pc.i)?.sc?.name === g.from : true);
		});
	}

	function spells () {
		const c = char(); const k = calc();
		const sc = k.spellcasting;
		const page = h("div", {class: "cs5e-page"});
		page.append(statHead("Spells"));
		if (sc.slots.length || sc.pact) page.append(slotTable(sc.slots, sc.pact));
		if (!sc.perClass.length) page.append(h("p", {class: "ve-muted"}, "Your classes don't have the Spellcasting or Pact Magic feature. Spells from species, backgrounds and feats are chosen where they are granted."));

		for (const pc of sc.perClass) {
			const mine = c.spells.filter(s => s.cls === pc.cls);
			const granted = grantedFor(k, pc);
			const grantedKeys = new Set(granted.map(g => { const sp = D.findByUid(D.spells, g.uid); return K(sp.name, sp.source); }));
			const nC = mine.filter(s => s.level === 0).length;
			const nL = mine.filter(s => s.level > 0 && (pc.spellbook ? s.prepared : true)).length;
			const nBook = mine.filter(s => s.level > 0).length;
			const prepLabel = pc.mode === "known" ? "Spells Known" : "Prepared Spells";
			const card = h("div", {class: "cs5e-card"});
			card.append(statHead(`${pc.cls} Spells`, h("span", {class: "ve-muted"}, `Level ${pc.level}`)));
			card.append(h("div", {class: "cs5e-chips"},
				chip("Spellcasting Ability", CS.ABIL_FULL[pc.abil]), chip("Spell Save DC", pc.dc), chip("Spell Attack", CS.fmtMod(pc.attack)),
				chip("Cantrips Known", `${nC} / ${pc.cantrips || 0}`, pc.cantrips && nC > pc.cantrips, pc.cantrips ? left(pc.cantrips - nC) : null),
				pc.prepared != null ? chip(prepLabel, `${nL} / ${pc.prepared}`, nL > pc.prepared, left(pc.prepared - nL)) : null,
				pc.spellbook ? chip("Spellbook", `${nBook} spells`, false, `${pc.spellbook} free from levels`) : null,
				granted.length ? chip("Granted (free)", granted.length, false, "don't count") : null,
				chip("Max Spell Level", pc.maxLevel ? CS.ordinal(pc.maxLevel) : "Cantrips only")));
			// level tabs: pick cantrips first, then 1st level, and so on (higher levels are shown locked)
			const allAvail = R.availableSpells(k, pc).filter(x => D.isAllowed(x.spell));
			const allSpellsAt = l => l <= 9 && allAvail.some(x => x.spell.level === l);
			const st = (CS.uiState.lists[`spells:${pc.cls}:opts`] = CS.uiState.lists[`spells:${pc.cls}:opts`] || {all: false, lvl: null});
			const levels = Array.from({length: 10}, (_, l) => l).filter(l => (l > 0 || pc.cantrips) && (st.all || l <= Math.max(pc.maxLevel, 0) || allSpellsAt(l)));
			if (st.lvl == null || !levels.includes(st.lvl)) st.lvl = (pc.cantrips && nC < pc.cantrips) || !levels.includes(1) ? levels[0] : 1;
			const has = sp => mine.some(s => K(s.name, s.source) === K(sp.name, sp.source));
			const isGranted = sp => grantedKeys.has(K(sp.name, sp.source));
			const full = sp => sp.level === 0 ? nC >= (pc.cantrips || 0) : pc.spellbook ? false : (pc.prepared != null && nL >= pc.prepared);
			const action = x => {
				const sp = x.spell;
				if (isGranted(sp)) return h("span", {class: "cs5e-tag"}, "Granted");
				if (has(sp)) return U.btn("Remove", () => commit(ch => { ch.spells = ch.spells.filter(q => !(q.cls === pc.cls && K(q.name, q.source) === K(sp.name, sp.source))); }), "ve-btn-danger ve-btn-xs");
				const label = sp.level === 0 ? "Learn" : pc.spellbook ? "Add" : pc.mode === "known" ? "Learn" : "Prepare";
				return U.btn(label, () => commit(ch => { ch.spells.push({name: sp.name, source: sp.source, level: sp.level, cls: pc.cls, prepared: !pc.spellbook || nL < (pc.prepared || 0)}); }), "ve-btn-primary ve-btn-xs", {disabled: full(sp) || sp.level > Math.max(pc.maxLevel, 0)});
			};
			const known = [
				...granted.map(g => ({spell: D.findByUid(D.spells, g.uid), tag: g.how, granted: true})),
				...mine.map(s => ({spell: D.getSpell(s), entry: s})).filter(x => x.spell),
			];
			const lvlTabs = h("div", {class: "cs5e-lvltabs"}, levels.map(l => {
				const n = known.filter(x => x.spell.level === l).length;
				const lim = l === 0 ? pc.cantrips : null;
				const short = l === 0 && pc.cantrips && nC < pc.cantrips;
				const locked = l > Math.max(pc.maxLevel, 0);
				const avail = allAvail.filter(x => x.spell.level === l).length;
				return h("button", {type: "button", class: `cs5e-lvltab ${st.lvl === l ? "cs5e-lvltab--on" : ""} ${short ? "cs5e-lvltab--todo" : ""} ${locked ? "cs5e-lvltab--locked" : ""}`,
					title: locked ? `Your ${pc.cls} level (${pc.level}) doesn't give ${CS.ordinal(l)}-level slots yet${k.classes.length > 1 ? " — with multiclassing, the spells you can learn depend on your level in this class" : ""}` : `${n} chosen of ${avail} available`,
					on: {click: () => { st.lvl = l; app.rerender(); }}},
					locked ? "\u{1F512} " : null, l === 0 ? "Cantrips" : `${CS.ordinal(l)} Level`, h("span", {class: "cs5e-lvltab__n"}, lim != null ? `${n}/${lim}` : `${n}`));
			}));
			const cur = known.filter(x => x.spell.level === st.lvl).sort((a, b) => a.spell.name.localeCompare(b.spell.name));
			const lockedNow = st.lvl > Math.max(pc.maxLevel, 0);
			const items = allAvail.filter(x => x.spell.level === st.lvl);
			card.append(
				h("div", {class: "ve-flex-v-center cs5e-gap ve-mt-2"}, lvlTabs,
					h("label", {class: "ve-flex-v-center ve-small cs5e-gap-s"}, h("input", {type: "checkbox", checked: st.all, on: {change: e => { st.all = e.target.checked; app.rerender(); }}}), "Show every spell level")),
				h("div", {class: "cs5e-sub"}, `${st.lvl === 0 ? "Cantrips" : `${CS.ordinal(st.lvl)}-Level Spells`} \u2014 ${pc.cls}`,
					h("span", {class: "ve-muted ve-small"}, `${cur.length} chosen \u00b7 ${items.length} available`)),
				lockedNow ? h("div", {class: "cs5e-warn ve-small"}, `Locked: you need a higher ${pc.cls} level to learn ${CS.ordinal(st.lvl)}-level spells (multiclass spell levels are based on each class's own level).`) : null,
				cur.length ? h("div", {class: "cs5e-spell-known"}, cur.map(x => h("div", {class: "cs5e-spell-row"},
					U.link("spell", x.spell),
					x.granted ? h("span", {class: "cs5e-tag"}, x.tag) : null,
					!x.granted && x.spell.level > 0 && pc.spellbook ? h("label", {class: "ve-flex-v-center ve-small cs5e-gap-s"}, h("input", {type: "checkbox", checked: x.entry.prepared, on: {change: e => commit(ch => { const t = ch.spells.find(q => q.cls === pc.cls && K(q.name, q.source) === K(x.spell.name, x.spell.source)); if (t) t.prepared = e.target.checked; })}}), "Prepared") : null,
					h("span", {class: "ve-grow"}),
					!x.granted ? U.btn("Remove", () => commit(ch => { ch.spells = ch.spells.filter(q => !(q.cls === pc.cls && K(q.name, q.source) === K(x.spell.name, x.spell.source))); }), "ve-btn-danger ve-btn-xs") : null,
				))) : h("div", {class: "ve-muted ve-small ve-mb-1"}, "None chosen yet."),
				U.filterList({
					id: `spells:${pc.cls}:${st.lvl}`, items, keyOf: x => K(x.spell.name, x.spell.source), sourceOf: x => x.spell.source,
					columns: U.spellColumns([{key: "tag", label: "Notes", cls: "ve-col-1-5", cellCls: "ve-px-1 ve-small ve-text-center", sortVal: x => x.tag || "", render: x => x.tag || (isGranted(x.spell) ? "Granted" : "")}]),
					filters: [...U.spellFilters(x => x.spell).filter(f => f.key !== "level"), {key: "list", header: "List", values: x => [x.tag || "Class list"]}],
					defaultSort: ["name", 1], tiebreak: U.spellTiebreak,
					isSelected: x => has(x.spell) || isGranted(x.spell),
					actionOf: action,
					previewOf: x => h("div", null, h("div", {class: "ve-mb-2"}, action(x)), U.spellPreview(x)),
					height: "380px",
				}),
			);
			page.append(card);
		}

		const other = k.grants.spells.filter(g => !sc.perClass.some(pc => g.from === pc.cls || k.classes.find(ce => ce.i === pc.i)?.sc?.name === g.from));
		if (other.length) {
			page.append(section("Spells from Species, Background and Feats",
				h("div", {class: "cs5e-spell-known"}, other.map(g => {
					const sp = D.findByUid(D.spells, g.uid);
					return sp ? h("div", {class: "cs5e-spell-row"}, h("span", {class: "cs5e-spell-row__lvl"}, sp.level === 0 ? "C" : sp.level), U.link("spell", sp), h("span", {class: "cs5e-tag"}, `${g.how}${g.uses ? ", " + g.uses : ""}`), h("span", {class: "ve-muted ve-small"}, g.from), g.ability ? h("span", {class: "ve-muted ve-small"}, `(${CS.ABIL_SHORT[g.ability]})`) : null) : null;
				}))));
		}
		page.append(h("div", {class: "cs5e-next"}, U.btn("Next: Equipment →", () => app.goStep("equipment"), "ve-btn-primary")));
		return page;
	}
	const chip = (l, v, warn, note) => h("div", {class: `cs5e-chip ${warn ? "cs5e-chip--warn" : ""}`}, h("div", {class: "cs5e-chip__v"}, v), h("div", {class: "cs5e-chip__l"}, l), note ? h("div", {class: "cs5e-chip__note"}, note) : null);
	const left = n => n > 0 ? `${n} left to choose` : n === 0 ? "complete" : `${-n} too many`;
	B.chip = chip;

	/* =============================== EQUIPMENT =============================== */

	const EQ_TYPES = {
		weaponSimple: it => it.weaponCategory === "simple", weaponMartial: it => it.weaponCategory === "martial",
		weaponSimpleMelee: it => it.weaponCategory === "simple" && R.typeCode(it.type) === "M", weaponMartialMelee: it => it.weaponCategory === "martial" && R.typeCode(it.type) === "M",
		weaponSimpleRanged: it => it.weaponCategory === "simple" && R.typeCode(it.type) === "R", weaponMartialRanged: it => it.weaponCategory === "martial" && R.typeCode(it.type) === "R",
		instrumentMusical: it => R.typeCode(it.type) === "INS", toolArtisan: it => R.typeCode(it.type) === "AT", setGaming: it => R.typeCode(it.type) === "GS",
		focusSpellcastingArcane: it => R.typeCode(it.type) === "SCF" && it.scfType === "arcane", focusSpellcastingDruidic: it => R.typeCode(it.type) === "SCF" && it.scfType === "druid",
		focusSpellcastingHoly: it => R.typeCode(it.type) === "SCF" && it.scfType === "holy", focusSpellcasting: it => R.typeCode(it.type) === "SCF",
	};

	const EQ_NAMES = {weaponSimple: "simple weapon", weaponMartial: "martial weapon", weaponSimpleMelee: "simple melee weapon", weaponMartialMelee: "martial melee weapon", weaponSimpleRanged: "simple ranged weapon", weaponMartialRanged: "martial ranged weapon", instrumentMusical: "musical instrument", toolArtisan: "artisan's tools", setGaming: "gaming set", focusSpellcastingArcane: "arcane focus", focusSpellcastingDruidic: "druidic focus", focusSpellcastingHoly: "holy symbol", focusSpellcasting: "spellcasting focus"};
	const eqTypeName = t => EQ_NAMES[t] || t.replace(/([A-Z])/g, " $1").toLowerCase();

	function eqLine (x, pickKey, picks, setPick, src) {
		if (typeof x === "string") return CS.rd.str(`{@item ${x}}`);
		if (x.item) return `${x.quantity > 1 ? x.quantity + " × " : ""}${CS.rd.str(`{@item ${x.item}${x.displayName ? "||" + x.displayName : ""}}`)}${x.containsValue ? ` (containing ${U.cost(x.containsValue)})` : ""}`;
		if (x.special) return `${x.quantity > 1 ? x.quantity + " × " : ""}${CS.esc(x.special)}`;
		if (x.value != null) return U.cost(x.value);
		if (x.equipmentType) return `${x.quantity > 1 ? x.quantity + " × " : ""}<i>any ${CS.esc(eqTypeName(x.equipmentType))}</i>`;
		void pickKey; void picks; void setPick; void src;
		return CS.esc(JSON.stringify(x));
	}

	function startingEquipment (label, data, key) {
		const c = char();
		if (!data?.length) return null;
		const st = (c.startingEquipment[key] = c.startingEquipment[key] || {opts: {}, picks: {}, applied: false});
		const box = section(`${label} Starting Equipment`);
		data.forEach((grp, gi) => {
			const opts = Object.keys(grp);
			const cur = st.opts[gi] ?? opts[0];
			const g = h("div", {class: "cs5e-eq-grp"});
			for (const o of opts) {
				const items = grp[o];
				g.append(h("label", {class: "cs5e-eq-opt"},
					opts.length > 1 ? h("input", {type: "radio", name: `eq:${key}:${gi}`, checked: cur === o, disabled: st.applied, on: {change: () => commit(x => { x.startingEquipment[key].opts[gi] = o; })}}) : null,
					o !== "_" ? h("b", null, `(${o.toUpperCase()}) `) : null,
					U.html(items.map(x => eqLine(x)).join(", "), "", "span")));
				// equipmentType selectors
				if (cur === o) items.forEach((x, xi) => {
					if (!x.equipmentType) return;
					const fn = EQ_TYPES[x.equipmentType] || (() => false);
					const pool = D.items.filter(it => it._base && D.isAllowed(it) && fn(it));
					const pk = `${gi}:${o}:${xi}`;
					g.append(h("div", {class: "ve-flex-v-center cs5e-gap-s ve-ml-4 ve-small"}, `Choose ${x.quantity > 1 ? x.quantity + " × " : ""}${x.equipmentType.replace(/([A-Z])/g, " $1").toLowerCase()}:`,
						U.sel([["", "— Choose —"], ...pool.map(it => [`${it.name}|${it.source}`, `${it.name} (${CS.srcAbv(it.source)})`])], st.picks[pk] || "", v => commit(ch => { ch.startingEquipment[key].picks[pk] = v; }), {disabled: st.applied})));
				});
			}
			box.append(g);
		});
		box.append(h("div", {class: "ve-flex-v-center cs5e-gap"},
			st.applied ? h("span", {class: "ve-muted"}, "Added to your inventory.") : U.btn("Add Starting Equipment", () => commit(ch => {
				const s2 = ch.startingEquipment[key];
				data.forEach((grp, gi) => {
					const o = s2.opts[gi] ?? Object.keys(grp)[0];
					(grp[o] || []).forEach((x, xi) => {
						if (typeof x === "string") addItem(ch, x, 1, null, true);
						else if (x.item) { addItem(ch, x.item, x.quantity || 1, x.displayName, true); if (x.containsValue) ch.currency.gp += Math.floor(x.containsValue / 100); }
						else if (x.special) ch.inventory.push({id: CS.uid(), name: CS.cap(x.special), source: null, qty: x.quantity || 1, equipped: false, snap: {}});
						else if (x.value != null) addCoins(ch, x.value);
						else if (x.equipmentType) { const pk = s2.picks[`${gi}:${o}:${xi}`]; if (pk) addItem(ch, pk, x.quantity || 1, null, true); }
					});
				});
				s2.applied = true;
			}), "ve-btn-primary ve-btn-xs"),
			st.applied ? U.btn("Allow again", () => commit(ch => { ch.startingEquipment[key].applied = false; }), "ve-btn-default ve-btn-xs") : null));
		return box;
	}

	function addCoins (ch, cp) {
		ch.currency.gp += Math.floor(cp / 100); cp %= 100;
		ch.currency.sp += Math.floor(cp / 10); ch.currency.cp += cp % 10;
	}

	function addItem (ch, uid, qty = 1, displayName, equip = false) {
		const it = D.findByUid(D.items, uid);
		if (!it) { ch.inventory.push({id: CS.uid(), name: CS.cap(String(uid).split("|")[0]), source: null, qty, equipped: false, snap: {}}); return; }
		const ex = ch.inventory.find(q => q.source && K(q.name, q.source) === K(it.name, it.source) && !it.weapon && !it.armor);
		if (ex) ex.qty += qty;
		else ch.inventory.push({id: CS.uid(), name: it.name, source: it.source, displayName: displayName || null, qty, equipped: !!equip && (!!it.weapon || ["LA", "MA", "HA", "S", "M", "R"].includes(R.typeCode(it.type))), attuned: false, snap: R.itemSnapshot(it)});
	}
	B.addItem = addItem;

	function equipment () {
		const c = char(); const k = calc();
		const page = h("div", {class: "cs5e-page"});
		page.append(statHead("Equipment"));
		const cls0 = k.classes[0]?.cls;
		const clsEq = cls0?.startingEquipment;
		if (clsEq?.defaultData) page.append(startingEquipment(cls0.name, clsEq.defaultData, `class:${K(cls0.name, cls0.source)}`));
		else if (clsEq?.default) page.append(section(`${cls0.name} Starting Equipment`, U.rd(clsEq.default.map(s => ({type: "item", name: "•", entry: s})))));
		if (k.background?.startingEquipment) page.append(startingEquipment(k.background.name, k.background.startingEquipment, `bg:${K(k.background.name, k.background.source)}`));
		page.append(inventoryEditor(c, k));
		page.append(section("Add Items", U.filterList({
			id: "step:items", items: D.items.filter(D.isAllowed), sourceOf: x => x.source,
			columns: U.itemColumns(), filters: U.itemFilters(),
			actionOf: it => U.btn("Add", () => commit(ch => addItem(ch, `${it.name}|${it.source}`, 1)), "ve-btn-success ve-btn-xs"),
			previewOf: it => h("div", null, h("div", {class: "ve-mb-2"}, U.btn("Add to Inventory", () => commit(ch => addItem(ch, `${it.name}|${it.source}`, 1)), "ve-btn-primary")), U.itemPreview(it)),
			height: "420px",
		})));
		page.append(h("div", {class: "cs5e-next"}, U.btn("Next: Description →", () => app.goStep("description"), "ve-btn-primary")));
		return page;
	}

	function inventoryEditor (c, k) {
		const att = c.inventory.filter(i => i.attuned).length;
		return section(`Inventory — ${k.weight.toFixed(1)} / ${k.carry} lb. · Attuned ${att}/3`,
			h("div", {class: "cs5e-coins"}, [["pp", "PP"], ["gp", "GP"], ["ep", "EP"], ["sp", "SP"], ["cp", "CP"]].map(([kk, l]) => field(l, h("input", {type: "number", class: "ve-form-control ve-input-xs cs5e-num", min: 0, value: c.currency[kk] || 0, on: {change: e => commit(x => { x.currency[kk] = Math.max(0, Number(e.target.value) || 0); }, {rerender: false})}})))),
			c.inventory.length ? h("table", {class: "ve-w-100 cs5e-tbl"},
				h("thead", null, h("tr", null, ["Equip", "Name", "Qty", "Weight", "Attune", ""].map(t => h("th", null, t)))),
				h("tbody", null, c.inventory.map((it, i) => h("tr", null,
					h("td", null, h("input", {type: "checkbox", checked: it.equipped, on: {change: e => commit(x => { x.inventory[i].equipped = e.target.checked; })}})),
					h("td", null, it.source ? U.link("item", it, it.displayName || it.name) : h("input", {type: "text", class: "ve-form-control ve-input-xs", value: it.name, on: {change: e => commit(x => { x.inventory[i].name = e.target.value; })}})),
					h("td", null, h("input", {type: "number", class: "ve-form-control ve-input-xs cs5e-num", min: 0, value: it.qty, on: {change: e => commit(x => { x.inventory[i].qty = Math.max(0, Number(e.target.value) || 0); })}})),
					h("td", {class: "ve-small"}, it.snap?.weight ? `${(it.snap.weight * it.qty).toFixed(1)} lb.` : "—"),
					h("td", null, it.snap?.reqAttune ? h("input", {type: "checkbox", checked: it.attuned, on: {change: e => commit(x => { x.inventory[i].attuned = e.target.checked; })}}) : ""),
					h("td", null, U.btn("✕", () => commit(x => { x.inventory.splice(i, 1); }), "ve-btn-danger ve-btn-xs")),
				)))) : h("div", {class: "ve-muted ve-small"}, "Your inventory is empty."),
			h("div", {class: "ve-flex-v-center cs5e-gap ve-mt-1"}, (() => { const inp = h("input", {type: "text", class: "ve-form-control ve-input-xs", placeholder: "Custom item"}); return [inp, U.btn("Add Custom Item", () => { if (inp.value.trim()) commit(x => { x.inventory.push({id: CS.uid(), name: inp.value.trim(), source: null, qty: 1, equipped: false, snap: {}}); }); }, "ve-btn-default ve-btn-xs")]; })()));
	}
	B.inventoryEditor = inventoryEditor;

	/* =============================== DESCRIPTION =============================== */

	function description () {
		const c = char();
		const ta = (path, rows = 3) => {
			const [a, b] = path.split(".");
			return h("textarea", {class: "ve-form-control", rows, on: {input: e => commit(x => { x[a][b] = e.target.value; }, {rerender: false})}}, c[a][b] || "");
		};
		const inp = path => { const [a, b] = path.split("."); return h("input", {type: "text", class: "ve-form-control ve-input-xs", value: c[a][b] || "", on: {input: e => commit(x => { x[a][b] = e.target.value; }, {rerender: false})}}); };
		return h("div", {class: "cs5e-page"},
			statHead("Description"),
			section("Character Details",
				h("div", {class: "cs5e-grid3"},
					field("Alignment", U.sel(CS.ALIGNMENTS.map(a => [a, a || "—"]), c.alignment, v => commit(x => { x.alignment = v; }, {rerender: false}))),
					field("Faith", inp("appearance.faith")), field("Gender", inp("appearance.gender")),
					field("Age", inp("appearance.age")), field("Height", inp("appearance.height")), field("Weight", inp("appearance.weight")),
					field("Eyes", inp("appearance.eyes")), field("Hair", inp("appearance.hair")), field("Skin", inp("appearance.skin")),
					field("Experience Points", h("input", {type: "number", class: "ve-form-control ve-input-xs", value: c.xp || 0, on: {input: e => commit(x => { x.xp = Number(e.target.value) || 0; }, {rerender: false})}})),
				)),
			section("Personal Characteristics",
				h("div", {class: "cs5e-grid2"},
					field("Personality Traits", ta("notes.traits")), field("Ideals", ta("notes.ideals")),
					field("Bonds", ta("notes.bonds")), field("Flaws", ta("notes.flaws")))),
			section("Backstory", ta("notes.backstory", 6)),
			section("Allies & Organizations", ta("notes.allies", 4)),
			section("Other Notes", ta("notes.other", 4)),
			h("div", {class: "cs5e-next"}, U.btn("View Character Sheet →", () => app.openSheet(), "ve-btn-primary")),
		);
	}
})();
