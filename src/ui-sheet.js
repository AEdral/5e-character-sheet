/* Character sheet (D&D Beyond layout, 5etools look) */
(function () {
	const CS = globalThis.CS5E;
	const {h} = CS;
	const D = CS.data; const R = CS.rules; const U = CS.uiCore; const B = CS.uiBuilder;
	const K = CS.key;
	const S = (CS.uiSheet = {});

	let app;
	S.init = a => { app = a; };
	const commit = (fn, o) => app.commit(fn, o);

	const box = (title, ...kids) => h("div", {class: "cs5e-box"}, title ? h("div", {class: "cs5e-box__h"}, title) : null, ...kids);
	const TABS = [["actions", "Actions"], ["spells", "Spells"], ["inventory", "Inventory"], ["features", "Features & Traits"], ["background", "Background"], ["notes", "Notes"]];

	S.render = () => {
		const c = app.st.char; const k = app.st.calc;
		const tab = app.st.sheetTab || "actions";
		const t = c.tracking;
		const cur = c.hp.current ?? k.hp.max;
		const cls = k.classes.map(ce => `${ce.cls.name}${ce.sc ? ` (${ce.sc.shortName || ce.sc.name})` : ""} ${ce.level}`).join(" / ");

		const hpInput = h("input", {type: "number", class: "ve-form-control ve-input-xs cs5e-num", min: 0, placeholder: "0"});
		const applyHp = sign => {
			const n = Number(hpInput.value) || 0;
			if (!n) return;
			commit(x => {
				let hp = x.hp.current ?? k.hp.max;
				if (sign < 0) { let dmg = n; const tmp = Number(x.hp.temp || 0); const used = Math.min(tmp, dmg); x.hp.temp = tmp - used; dmg -= used; hp = Math.max(0, hp - dmg); } else { hp = Math.min(k.hp.max, hp + n); if (hp > 0) { x.tracking.deathSuccess = 0; x.tracking.deathFail = 0; } }
				x.hp.current = hp;
			});
		};

		const header = h("div", {class: "cs5e-sheet__head"},
			(() => {
				const fileIn = h("input", {type: "file", accept: "image/*", class: "cs5e-hidden", on: {change: async e => { const f = e.target.files?.[0]; if (f) { const url = await B.resizeImage(f, 192); commit(x => { x.portrait = url; }); } }}});
				const av = c.portrait ? h("img", {class: "cs5e-sheet__avatar", src: c.portrait, referrerpolicy: "no-referrer", title: "Click to change the portrait"}) : h("div", {class: "cs5e-sheet__avatar cs5e-sheet__avatar--ph", title: "Click to upload a portrait"}, (c.name || "?")[0]);
				av.addEventListener("click", () => fileIn.click());
				return h("span", null, av, fileIn);
			})(),
			h("div", {class: "cs5e-sheet__who"},
				h("h1", {class: "ve-stats__h-name ve-m-0"}, c.name || "Unnamed"),
				h("div", null, [k.race?.displayName, cls].filter(Boolean).join(" · ") || "—"),
				h("div", {class: "ve-muted ve-small"}, `Level ${k.level}${k.background ? " · " + k.background.name : ""}${c.alignment ? " · " + c.alignment : ""}`)),
			h("div", {class: "ve-flex-v-center cs5e-gap"},
				U.btn("Short Rest", () => shortRest(), "ve-btn-default ve-btn-xs"),
				U.btn("Long Rest", () => { if (confirm("Take a long rest? HP, spell slots and hit dice will be restored.")) commit(x => { x.hp.current = k.hp.max; x.hp.temp = 0; x.tracking.slotsUsed = {}; x.tracking.hitDiceUsed = Math.max(0, (x.tracking.hitDiceUsed || 0) - Math.max(1, Math.floor(k.level / 2))); x.tracking.deathSuccess = 0; x.tracking.deathFail = 0; }); }, "ve-btn-default ve-btn-xs"),
				U.btn("Print / PDF", () => S.print(), "ve-btn-default ve-btn-xs"),
				U.btn("Edit Character", () => app.openBuilder(), "ve-btn-primary ve-btn-xs")));

		const abil = h("div", {class: "cs5e-sheet__abils"}, CS.ABIL.map(a => h("div", {...CS.rollable(() => ({title: `${CS.ABIL_FULL[a]} Check`, rolls: [{label: "Check", d20: k.scores[a].mod}]})), class: "cs5e-abil cs5e-roll"},
			h("div", {class: "cs5e-abil__n"}, CS.ABIL_FULL[a]),
			h("div", {class: "cs5e-abil__m"}, CS.fmtMod(k.scores[a].mod)),
			h("div", {class: "cs5e-abil__s"}, k.scores[a].total))));

		const top = h("div", {class: "cs5e-sheet__top"}, abil,
			h("div", {class: "cs5e-stat"}, h("div", {class: "cs5e-stat__l"}, "Proficiency"), h("div", {class: "cs5e-stat__v"}, CS.fmtMod(k.pb)), h("div", {class: "cs5e-stat__l"}, "Bonus")),
			h("div", {class: "cs5e-stat"}, h("div", {class: "cs5e-stat__l"}, "Walking"), h("div", {class: "cs5e-stat__v"}, `${k.speed.walk} ft.`), h("div", {class: "cs5e-stat__l"}, "Speed")),
			h("div", {class: "cs5e-stat cs5e-stat--click", on: {click: () => commit(x => { x.tracking.inspiration = !x.tracking.inspiration; })}}, h("div", {class: "cs5e-stat__l"}, "Heroic"), h("div", {class: "cs5e-stat__v"}, t.inspiration ? "★" : "☆"), h("div", {class: "cs5e-stat__l"}, "Inspiration")),
			h("div", {class: "cs5e-hp"},
				h("div", {class: "cs5e-hp__ctl"}, U.btn("Heal", () => applyHp(1), "ve-btn-success ve-btn-xs"), hpInput, U.btn("Damage", () => applyHp(-1), "ve-btn-danger ve-btn-xs")),
				h("div", {class: "cs5e-hp__vals"},
					h("div", null, h("div", {class: "cs5e-stat__l"}, "Current"), h("div", {class: "cs5e-stat__v"}, cur)),
					h("div", {class: "cs5e-hp__sep"}, "/"),
					h("div", null, h("div", {class: "cs5e-stat__l"}, "Max"), h("div", {class: "cs5e-stat__v"}, k.hp.max)),
					h("div", null, h("div", {class: "cs5e-stat__l"}, "Temp"), h("input", {type: "number", class: "ve-form-control ve-input-xs cs5e-num", min: 0, value: c.hp.temp || 0, on: {change: e => commit(x => { x.hp.temp = Math.max(0, Number(e.target.value) || 0); })}}))),
				h("div", {class: "cs5e-stat__l ve-text-center"}, "Hit Points")));

		const saves = box("Saving Throws", h("div", {class: "cs5e-saves"}, CS.ABIL.map(a => h("div", {...CS.rollable(() => ({title: `${CS.ABIL_FULL[a]} Saving Throw`, rolls: [{label: "Save", d20: k.saves[a].value}]})), class: "cs5e-save cs5e-roll"}, h("span", {class: `cs5e-dot ${k.saves[a].prof ? "cs5e-dot--on" : ""}`}), h("span", {class: "cs5e-save__n"}, CS.ABIL_SHORT[a]), h("b", null, CS.fmtMod(k.saves[a].value))))),
			k.resist.length ? h("div", {class: "ve-small ve-mt-1"}, h("b", null, "Resistances: "), k.resist.map(CS.cap).join(", ")) : null);
		const senses = box("Senses",
			h("div", {class: "cs5e-sense"}, h("b", null, k.passive.perception), " Passive Perception"),
			h("div", {class: "cs5e-sense"}, h("b", null, k.passive.investigation), " Passive Investigation"),
			h("div", {class: "cs5e-sense"}, h("b", null, k.passive.insight), " Passive Insight"),
			k.darkvision ? h("div", {class: "ve-small ve-mt-1"}, U.str("{@sense Darkvision}"), ` ${k.darkvision} ft.`) : null);
		const pr = k.proficiencies;
		const profs = box("Proficiencies & Training",
			profLine("Armor", pr.armor), profLine("Weapons", pr.weapons), profLine("Tools", [...pr.tools, c.profsExtra].filter(Boolean)), profLine("Languages", [...pr.languages, c.languagesExtra].filter(Boolean)));
		const skills = box("Skills", h("table", {class: "cs5e-skills"}, h("tbody", null, k.skills.map(s => h("tr", CS.rollable(() => ({title: `${s.name} (${CS.ABIL_SHORT[s.abil]})`, rolls: [{label: "Check", d20: s.value}]})),
			h("td", null, h("span", {class: `cs5e-dot ${s.prof >= 1 ? "cs5e-dot--on" : ""} ${s.prof >= 2 ? "cs5e-dot--exp" : ""}`, title: s.prof >= 2 ? "Expertise" : s.prof ? "Proficient" : ""})),
			h("td", {class: "ve-muted ve-small"}, CS.ABIL_SHORT[s.abil]),
			h("td", null, U.str(`{@skill ${s.name}}`)),
			h("td", {class: "ve-bold ve-text-right"}, CS.fmtMod(s.value)))))));

		const combat = h("div", {class: "cs5e-sheet__combat"},
			h("div", {...CS.rollable(() => ({title: "Initiative", rolls: [{label: "Initiative", d20: k.initiative}]})), class: "cs5e-stat cs5e-roll"}, h("div", {class: "cs5e-stat__l"}, "Initiative"), h("div", {class: "cs5e-stat__v"}, CS.fmtMod(k.initiative))),
			h("div", {class: "cs5e-stat cs5e-stat--shield", title: k.ac.parts.join(" + ")}, h("div", {class: "cs5e-stat__l"}, "Armor"), h("div", {class: "cs5e-stat__v"}, k.ac.value), h("div", {class: "cs5e-stat__l"}, "Class")),
			h("div", {class: "cs5e-stat"}, h("div", {class: "cs5e-stat__l"}, "Hit Dice"), h("div", {class: "cs5e-stat__v cs5e-small-v"}, Object.entries(k.hitDice).map(([f, n]) => `${n}d${f}`).join(" + ") || "—"), h("div", {class: "cs5e-stat__l"}, `used ${t.hitDiceUsed || 0}`)),
			h("div", {class: "cs5e-stat"}, h("div", {...CS.rollable(() => ({title: "Death Saving Throw", rolls: [{label: "Death Save", d20: 0}]})), class: "cs5e-stat__l cs5e-roll"}, "Death Saves \u{1F3B2}"),
				h("div", {class: "ve-small"}, "S ", [0, 1, 2].map(j => h("input", {type: "checkbox", checked: t.deathSuccess > j, on: {change: e => commit(x => { x.tracking.deathSuccess = e.target.checked ? j + 1 : j; })}}))),
				h("div", {class: "ve-small"}, "F ", [0, 1, 2].map(j => h("input", {type: "checkbox", checked: t.deathFail > j, on: {change: e => commit(x => { x.tracking.deathFail = e.target.checked ? j + 1 : j; })}})))),
		);

		const tabs = h("div", {class: "cs5e-tabs"}, TABS.map(([id, l]) => h("button", {type: "button", class: `ve-btn ve-btn-xs ${tab === id ? "ve-btn-primary" : "ve-btn-default"}`, on: {click: () => { app.st.sheetTab = id; app.rerender(); }}}, l)));
		const body = h("div", {class: "cs5e-tabbody"}, ({actions, spells, inventory, features, background, notes}[tab] || actions)(c, k));

		return h("div", {class: "cs5e-sheet"}, header, top,
			h("div", {class: "cs5e-sheet__main"},
				h("div", {class: "cs5e-sheet__left"}, saves, senses, profs),
				h("div", {class: "cs5e-sheet__mid"}, skills),
				h("div", {class: "cs5e-sheet__right"}, combat, h("div", {class: "cs5e-box cs5e-box--tabs"}, tabs, body))));
	};

	const profLine = (l, arr) => h("div", {class: "cs5e-prof"}, h("div", {class: "cs5e-prof__l"}, l), h("div", null, arr.length ? arr.join(", ") : "—"));

	function shortRest () {
		const k = app.st.calc;
		const left = k.level - (app.st.char.tracking.hitDiceUsed || 0);
		const n = Number(prompt(`Short rest: how many Hit Dice do you spend? (${left} available)`, "0"));
		if (!n || n < 0) return;
		const faces = Number(Object.keys(k.hitDice)[0] || 8);
		let total = 0;
		for (let i = 0; i < Math.min(n, left); i++) total += Math.max(1, 1 + Math.floor(Math.random() * faces) + k.scores.con.mod);
		commit(x => { x.tracking.hitDiceUsed = (x.tracking.hitDiceUsed || 0) + Math.min(n, left); x.hp.current = Math.min(k.hp.max, (x.hp.current ?? k.hp.max) + total); if (k.spellcasting.pact) x.tracking.slotsUsed.pact = 0; });
		alert(`You regain ${total} hit points (rolled d${faces} + CON each).`);
	}

	/* ---------------- tabs ---------------- */

	function actions (c, k) {
		const rows = k.attacks.map(a => {
			const spec = CS.weaponRollSpec(a, k);
			return h("tr", CS.rollable(en => CS.weaponRollSpec(a, k, en), CS.conditionalRiders(k, "weapon", a)),
				h("td", null, a.source ? U.link("item", a.item, a.item.displayName || a.name) : a.name, h("div", {class: "ve-muted ve-small"}, [...a.props, ...a.mastery.map(m => `Mastery: ${m}`)].join(", "))),
				h("td", null, a.range), h("td", {class: "ve-bold"}, CS.fmtMod(spec.rolls[0].d20)),
				h("td", null, CS.damageText(spec), a.versatile ? h("div", {class: "ve-muted ve-small"}, `Two-handed: ${a.versatile} ${a.dmgType}`) : null));
		});
		const unarmed = h("tr", CS.rollable(() => ({title: "Unarmed Strike", rolls: [{label: "To Hit", d20: k.pb + k.scores.str.mod}, {label: "Damage (bludgeoning)", formula: String(Math.max(1, 1 + k.scores.str.mod))}]})), h("td", null, U.str("{@action Unarmed Strike|XPHB}")), h("td", null, "5 ft."), h("td", {class: "ve-bold"}, CS.fmtMod(k.pb + k.scores.str.mod)), h("td", null, `${Math.max(1, 1 + k.scores.str.mod)} `, h("span", {class: "ve-muted"}, "bludgeoning")));
		const spellAtk = k.spellcasting.perClass.length ? h("div", {class: "ve-mt-2"}, h("div", {class: "cs5e-sub"}, "Spellcasting"),
			...k.spellcasting.perClass.map(p => h("div", {class: "ve-small"}, h("b", null, p.cls), `: spell attack ${CS.fmtMod(p.attack)}, save DC ${p.dc} (${CS.ABIL_FULL[p.abil]})`))) : null;
		const cantrips = c.spells.filter(s => s.level === 0).map(s => D.getSpell(s)).filter(Boolean);
		return h("div", null,
			h("div", {class: "cs5e-sub"}, "Attacks"),
			h("table", {class: "ve-w-100 cs5e-tbl"}, h("thead", null, h("tr", null, ["Attack", "Range", "Hit", "Damage"].map(x => h("th", null, x)))), h("tbody", null, rows, unarmed)),
			cantrips.length ? h("div", {class: "ve-mt-2"}, h("div", {class: "cs5e-sub"}, "Cantrips"), h("div", null, cantrips.map(sp => h("span", {class: "cs5e-inline"}, U.link("spell", sp))))) : null,
			spellAtk,
			h("div", {class: "ve-mt-2"}, h("div", {class: "cs5e-sub"}, "Actions in Combat"),
				U.str("{@action Attack|XPHB}, {@action Dash|XPHB}, {@action Disengage|XPHB}, {@action Dodge|XPHB}, {@action Help|XPHB}, {@action Hide|XPHB}, {@action Influence|XPHB}, {@action Magic|XPHB}, {@action Ready|XPHB}, {@action Search|XPHB}, {@action Study|XPHB}, {@action Utilize|XPHB}", "div", "ve-small")));
	}

	function spells (c, k) {
		const sc = k.spellcasting; const t = c.tracking;
		const out = h("div");
		if (sc.perClass.length) out.append(h("div", {class: "cs5e-chips"}, sc.perClass.map(p => B.chip(`${p.cls} ${p.level} \u00b7 ${CS.ABIL_SHORT[p.abil]}`, `DC ${p.dc} / ${CS.fmtMod(p.attack)}`, false, p.prog === "pact" ? "Pact Magic" : null))));

		// slot trackers: shared Spellcasting slots (long rest) and Pact Magic slots (short rest)
		const boxes = (n, key) => Array.from({length: n}, (_, j) => h("input", {type: "checkbox", title: "Expended", checked: (t.slotsUsed[key] || 0) > j, on: {change: e => commit(x => { x.tracking.slotsUsed[key] = Math.max(0, Math.min(n, (x.tracking.slotsUsed[key] || 0) + (e.target.checked ? 1 : -1))); })}}));
		const casters = sc.perClass.filter(p => p.prog !== "pact").map(p => `${p.cls} ${p.level}`);
		if (sc.slots.length) {
			out.append(h("div", {class: "cs5e-slotbox"},
				h("div", {class: "cs5e-slotbox__h"}, "Spell Slots", h("span", {class: "ve-muted ve-small"}, ` ${casters.join(" + ")}${casters.length > 1 ? " (multiclass)" : ""} \u00b7 regain on a long rest`)),
				h("div", {class: "cs5e-slotbox__row"}, sc.slots.map((n, i) => n ? h("div", {class: "cs5e-slot"}, h("div", {class: "cs5e-slot__l"}, CS.ordinal(i + 1)), h("div", null, boxes(n, i + 1)), h("div", {class: "cs5e-slot__n"}, `${n - Math.min(n, t.slotsUsed[i + 1] || 0)}/${n}`)) : null))));
		}
		if (sc.pact) {
			out.append(h("div", {class: "cs5e-slotbox cs5e-slotbox--pact"},
				h("div", {class: "cs5e-slotbox__h"}, "Pact Magic", h("span", {class: "ve-muted ve-small"}, ` ${sc.pact.cls} \u00b7 ${CS.ordinal(sc.pact.level)}-level slots \u00b7 regain on a short or long rest`)),
				h("div", {class: "cs5e-slotbox__row"}, h("div", {class: "cs5e-slot"}, h("div", {class: "cs5e-slot__l"}, CS.ordinal(sc.pact.level)), h("div", null, boxes(sc.pact.count, "pact")), h("div", {class: "cs5e-slot__n"}, `${sc.pact.count - Math.min(sc.pact.count, t.slotsUsed.pact || 0)}/${sc.pact.count}`)))));
		}

		const byLvl = {};
		const add = (sp, meta) => { (byLvl[sp.level] = byLvl[sp.level] || []).push({sp, ...meta}); };
		for (const s of c.spells) { const sp = D.getSpell(s); if (sp && (sp.level === 0 || s.prepared)) add(sp, {from: s.cls, tag: sp.level ? "Prepared" : ""}); }
		for (const g of k.grants.spells) { const sp = D.findByUid(D.spells, g.uid); if (sp) add(sp, {from: g.from, tag: g.how + (g.uses ? `, ${g.uses}` : "")}); }
		const levels = Object.keys(byLvl).map(Number).sort((a, b) => a - b);
		for (const l of levels) {
			const list = byLvl[l].sort((a, b) => a.sp.name.localeCompare(b.sp.name));
			out.append(h("div", {class: "cs5e-sub"}, l === 0 ? "Cantrips" : `${CS.ordinal(l)} Level`));
			out.append(h("table", {class: "ve-w-100 cs5e-tbl"}, h("tbody", null, list.map(x => {
				const sp = x.sp;
				const pc = k.spellcasting.perClass.find(p => p.cls === x.from) || k.spellcasting.perClass[0];
				const isPact = pc?.prog === "pact";
				const saveAb = (sp.savingThrow || [])[0];
				const hit = (sp.spellAttack || []).length ? CS.fmtMod(pc?.attack ?? 0) : saveAb ? `${saveAb.slice(0, 3).toUpperCase()} ${pc?.dc ?? ""}` : "";
				const spec = CS.spellRollSpec(sp, pc, k);
				const dmg = spec ? CS.damageText(spec) : "";
				return h("tr", spec ? CS.rollable(en => CS.spellRollSpec(sp, pc, k, en), CS.conditionalRiders(k, "spell", sp)) : null,
					h("td", null, U.link("spell", sp), h("div", {class: "ve-muted ve-small"}, [x.from, x.tag, l > 0 && isPact && !/Arcanum/.test(x.tag || "") ? "Pact slot" : null].filter(Boolean).join(" \u00b7 "))),
					h("td", {class: "ve-small"}, U.spTime(sp)), h("td", {class: "ve-small"}, U.spRange(sp)),
					h("td", {class: "ve-bold ve-small"}, hit), h("td", {class: "ve-small"}, dmg),
					h("td", {class: "ve-small ve-muted"}, [U.isConc(sp) ? "C" : "", sp.meta?.ritual ? "R" : ""].filter(Boolean).join(" ")));
			}))));
		}
		if (!levels.length) out.append(h("div", {class: "ve-muted"}, "No spells. Add them in the builder (Spells step)."));
		return out;
	}

	function inventory (c, k) {
		return B.inventoryEditor(c, k);
	}

	function features (c, k) {
		const out = h("div");
		out.append(h("div", {class: "cs5e-sub"}, "Class Features"));
		for (const f of k.features) {
			const ce = k.classes.find(x => x.cls.name === f.cls);
			const tag = f.kind === "subclass"
				? `{@subclassFeature ${f.name}|${ce.cls.name}|${ce.cls.source}|${ce.sc.shortName}|${ce.sc.source}|${f.level}|${f.source}}`
				: `{@classFeature ${f.name}|${ce.cls.name}|${ce.cls.source}|${f.level}|${f.source}}`;
			out.append(U.details(`sf:${f.cls}:${f.level}:${f.name}`, [h("span", {class: "cs5e-lvl"}, `${f.cls} ${f.level}`), U.str(tag)], () => U.rd(f.entries)));
		}
		const traits = (k.race?.entries || []).filter(e => e?.name);
		if (traits.length) {
			out.append(h("div", {class: "cs5e-sub"}, `Species Traits — ${k.race.displayName}`));
			traits.forEach((t, j) => out.append(U.details(`st:${j}`, h("span", {class: "cs5e-acc__t"}, t.name), () => U.rd(t.entries || []))));
		}
		if (k.feats.length) {
			out.append(h("div", {class: "cs5e-sub"}, "Feats"));
			for (const f of k.feats) out.append(U.details(`sft:${f.prefix}`, [U.link("feat", f.feat), f.note ? ` (${CS.cap(f.note)})` : "", h("span", {class: "ve-muted ve-small"}, ` ${f.from}`)], () => U.rd(f.feat.entries)));
		}
		if (k.optfeatures.length) {
			out.append(h("div", {class: "cs5e-sub"}, "Class Options"));
			for (const o of k.optfeatures) out.append(U.details(`so:${o.of.name}`, [U.link("optfeature", o.of), h("span", {class: "ve-muted ve-small"}, ` ${o.group}`)], () => U.rd(o.of.entries)));
		}
		out.append(h("div", {class: "ve-mt-2"}, U.btn("+ Add Feat (DM award)", () => CS.uiChoices.pickFeat({onDone: ([f]) => commit(x => { x.extraFeats.push({id: CS.uid(), name: f.name, source: f.source}); })}), "ve-btn-default ve-btn-xs")));
		const extra = k.choices.filter(x => x.section === "xfeat" && x.parent === x.prefix && !x.parent?.includes(">"));
		void extra;
		for (const f of c.extraFeats || []) {
			const kids = k.choices.filter(x => x.parent === `xfeat:${f.id}`);
			out.append(h("div", {class: "cs5e-choice"}, h("div", {class: "cs5e-choice__head"}, h("span", {class: "cs5e-choice__label"}, `Extra feat: ${f.name}`), U.btn("Remove", () => commit(x => { x.extraFeats = x.extraFeats.filter(z => z.id !== f.id); for (const key of Object.keys(x.choices)) if (key.startsWith(`xfeat:${f.id}`)) delete x.choices[key]; }), "ve-btn-danger ve-btn-xs")),
				CS.uiChoices.renderList(kids, k)));
		}
		return out;
	}

	function background (c, k) {
		const bg = k.background;
		return h("div", null,
			bg ? U.html(CS.rd.compact("background", bg)) : h("div", {class: "ve-muted"}, "No background."),
			h("div", {class: "cs5e-sub"}, "Characteristics"),
			[["Personality Traits", c.notes.traits], ["Ideals", c.notes.ideals], ["Bonds", c.notes.bonds], ["Flaws", c.notes.flaws]].map(([l, v]) => h("div", {class: "ve-small"}, h("b", null, l + ": "), v || "—")),
			h("div", {class: "cs5e-sub"}, "Appearance"),
			h("div", {class: "ve-small"}, Object.entries(c.appearance).filter(([, v]) => v).map(([kk, v]) => `${CS.cap(kk)}: ${v}`).join(" · ") || "—"));
	}

	function notes (c) {
		const ta = (key, label, rows = 4) => h("label", {class: "cs5e-field"}, h("span", null, label), h("textarea", {class: "ve-form-control", rows, on: {input: e => commit(x => { x.notes[key] = e.target.value; }, {rerender: false})}}, c.notes[key] || ""));
		return h("div", null, ta("backstory", "Backstory", 6), ta("allies", "Allies & Organizations"), ta("other", "Other Notes", 6));
	}

	/* ---------------- print ---------------- */

	S.print = () => {
		const c = app.st.char;
		const w = window.open("", "_blank");
		if (!w) { alert("Popup blocked: allow popups for 5e.tools to print."); return; }
		const links = [...document.querySelectorAll('link[rel="stylesheet"]')].map(l => `<link rel="stylesheet" href="${l.href}">`).join("");
		const sheet = S.render();
		sheet.querySelectorAll("button, .cs5e-tabs").forEach(b => b.remove());
		const k = app.st.calc;
		const featDetails = k.features.map(f => `<div class="cs5e-pf"><h3>${CS.esc(f.name)} <small>(${CS.esc(f.sub || f.cls)} ${f.level})</small></h3>${CS.rd.entries(f.entries)}</div>`).join("");
		const spellDetails = [...c.spells.map(s => D.getSpell(s)), ...k.grants.spells.map(g => D.findByUid(D.spells, g.uid))].filter(Boolean).map(sp => `<div class="cs5e-pf">${CS.rd.compact("spell", sp)}</div>`).join("");
		w.document.write(`<!DOCTYPE html><html class="${document.documentElement.className.replace(/ve-night-mode\S*/g, "")}"><head><meta charset="utf-8"><title>${CS.esc(c.name || "Character")}</title>${links}<style>${CS.APP_CSS}
			body{padding:10mm!important;background:#fff} .cs5e-pf{break-inside:avoid;margin-bottom:8px} .cs5e-acc__body{display:none} @page{margin:8mm}</style></head>
			<body>${sheet.outerHTML}<h2>Features</h2>${featDetails}<h2>Spells</h2>${spellDetails}<script>setTimeout(()=>print(),800)<\/script></body></html>`);
		w.document.close();
	};
})();
