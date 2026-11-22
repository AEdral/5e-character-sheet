/* Rules engine: walks species, background, classes and feats, collects every grant and every choice,
 * then computes the derived character. All rules data comes from 5etools' /data files. */
(function () {
	const CS = globalThis.CS5E;
	const D = CS.data;
	const K = CS.key;
	const strip = s => CS.render.strip(s);

	const POINT_BUY_COST = {8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9};
	const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
	const MULTI_SLOTS = [
		[], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
		[4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
		[4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
	];

	function newChar () {
		const now = Date.now();
		return {
			id: CS.uid(), schema: 2, name: "", player: "", alignment: "", xp: 0, portrait: "",
			appearance: {age: "", height: "", weight: "", eyes: "", hair: "", skin: "", gender: "", faith: ""},
			settings: {abilityMethod: "standard", hpMethod: "fixed", optionalFeatures: true},
			race: null, subrace: null, background: null, classes: [],
			base: {str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8},
			extra: {str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0},
			rolls: [], choices: {}, skills: {}, saveExtra: {},
			profsExtra: "", languagesExtra: "",
			extraFeats: [], spells: [],
			inventory: [], currency: {cp: 0, sp: 0, ep: 0, gp: 0, pp: 0}, startingEquipment: {},
			hp: {current: null, temp: 0, maxOverride: null, bonus: 0, rolls: {}},
			misc: {ac: 0, init: 0, speed: 0},
			tracking: {slotsUsed: {}, hitDiceUsed: 0, deathSuccess: 0, deathFail: 0, inspiration: false},
			notes: {traits: "", ideals: "", bonds: "", flaws: "", backstory: "", allies: "", other: ""},
			createdAt: now, updatedAt: now,
		};
	}

	/** Upgrade older saves */
	function migrate (c) {
		const base = newChar();
		for (const [k, v] of Object.entries(base)) if (c[k] == null) c[k] = CS.clone(v);
		c.settings = {...base.settings, ...(c.settings || {})};
		// the character-level ASI house rule was removed: ASIs follow the rules (class levels)
		if ("asiByCharLevel" in c.settings) { delete c.settings.asiByCharLevel; for (const k of Object.keys(c.choices || {})) if (k.startsWith("cl:asi@")) delete c.choices[k]; }
		if (!c.schema || c.schema < 2) {
			if (c.abilityMethod) c.settings.abilityMethod = c.abilityMethod;
			for (const f of c.feats || []) {
				c.extraFeats.push({id: f.id, name: f.name, source: f.source});
				if (c.choices?.["feat:" + f.id]) c.choices[`xfeat:${f.id}>ability`] = c.choices["feat:" + f.id];
			}
			if (c.choices?.race) c.choices["race:ability"] = c.choices.race;
			if (c.choices?.background) c.choices["bg:ability"] = c.choices.background;
			delete c.feats; delete c.optfeatures; delete c.abilityMethod;
			c.schema = 2;
		}
		c.hp = {...base.hp, ...(c.hp || {})};
		c.tracking = {...base.tracking, ...(c.tracking || {})};
		return c;
	}

	/** Species merged with its subrace/lineage */
	function effRace (char) {
		const race = D.getRace(char.race);
		if (!race) return null;
		const sub = D.getSubrace(race, char.subrace);
		if (!sub) return {...race, _race: race, _sub: null, displayName: race.name};
		const out = {...race, _race: race, _sub: sub, displayName: sub.name ? `${race.name} (${sub.name})` : race.name};
		for (const [k, v] of Object.entries(sub)) {
			if (["name", "source", "raceName", "raceSource", "entries", "ability", "page", "overwrite"].includes(k)) continue;
			out[k] = v;
		}
		if (sub.ability) {
			if (!race.ability || sub.overwrite?.ability) out.ability = sub.ability;
			else {
				out.ability = [];
				for (const a of race.ability) for (const b of sub.ability) {
					const m = {...a};
					for (const [k, v] of Object.entries(b)) m[k] = (k === "choose" ? v : (m[k] || 0) + v);
					out.ability.push(m);
				}
			}
		}
		const entries = CS.clone(race.entries || []);
		for (const e of sub.entries || []) {
			const ow = e?.data?.overwrite;
			const i = ow ? entries.findIndex(x => x?.name === ow) : -1;
			if (i >= 0) entries[i] = e; else entries.push(e);
		}
		out.entries = entries;
		return out;
	}

	/* ====================== Ability options ====================== */

	function optionSlots (opt) {
		const c = opt?.choose;
		if (!c) return [];
		if (c.weighted) return c.weighted.weights.map(w => ({amount: w, from: c.weighted.from}));
		return Array.from({length: c.count || 1}, () => ({amount: c.amount || 1, from: c.from || CS.ABIL}));
	}

	function describeOption (opt) {
		if (opt?._label) return opt._label;
		const parts = [];
		for (const a of CS.ABIL) if (opt[a]) parts.push(`${CS.ABIL_SHORT[a]} ${CS.fmtMod(opt[a])}`);
		const c = opt.choose;
		if (c) {
			if (c.weighted) parts.push(`${c.weighted.weights.map(CS.fmtMod).join(" and ")} to ${c.weighted.from.length === 6 ? "any" : c.weighted.from.map(a => CS.ABIL_SHORT[a]).join("/")}`);
			else {
				const from = c.from || CS.ABIL;
				parts.push(`${CS.fmtMod(c.amount || 1)} to ${c.count > 1 ? `${c.count} of ` : ""}${from.length === 6 ? "any" : from.map(a => CS.ABIL_SHORT[a]).join("/")}`);
			}
		}
		return parts.join(", ") || "No bonus";
	}

	function optionBonus (opt, choice) {
		const out = Object.fromEntries(CS.ABIL.map(a => [a, 0]));
		if (!opt) return out;
		for (const a of CS.ABIL) if (typeof opt[a] === "number") out[a] += opt[a];
		const used = new Set();
		optionSlots(opt).forEach((s, i) => {
			let p = choice?.picks?.[i];
			if (!p && s.from.length === 1) p = s.from[0];
			if (p && s.from.includes(p) && !used.has(p)) { out[p] += s.amount; used.add(p); }
		});
		return out;
	}

	/** Tasha's Custom Origin: the same increases, assignable to any ability */
	function tashaOptions (orig) {
		const first = orig[0] || {};
		const weights = [];
		for (const a of CS.ABIL) if (typeof first[a] === "number" && first[a] > 0) weights.push(first[a]);
		for (const s of optionSlots(first)) weights.push(s.amount);
		weights.sort((a, b) => b - a);
		const opts = [];
		const add = (w, label) => { if (w.length && !opts.some(o => o.choose.weighted.weights.join() === w.join())) opts.push({choose: {weighted: {from: [...CS.ABIL], weights: w}}, _label: label}); };
		if (weights.length && weights.every(w => w === 1) && weights.length === 6) {
			// e.g. standard Human (+1 to all): nothing to move
		} else {
			add(weights, `Tasha's: ${weights.map(CS.fmtMod).join(" / ")} to any`);
			const sum = weights.reduce((a, b) => a + b, 0);
			if (sum === 3) { add([2, 1], "Tasha's: +2 / +1 to any"); add([1, 1, 1], "Tasha's: +1 / +1 / +1 to any"); }
		}
		for (const o of orig) opts.push({...o, _label: `Standard: ${describeOption(o)}`});
		return opts;
	}

	/* ====================== Walker ====================== */

	function progAt (prog, level) {
		if (!prog) return 0;
		if (Array.isArray(prog)) return Number(prog[level - 1] || 0);
		if (prog["*"] != null) return Number(prog["*"]);
		let best = 0; let bestK = 0;
		for (const [k, v] of Object.entries(prog)) if (Number(k) <= level && Number(k) >= bestK) { best = v; bestK = Number(k); }
		return Number(best || 0);
	}

	const classLevel = char => Math.max(1, (char.classes || []).reduce((s, c) => s + Number(c.level || 0), 0));
	const profBonus = lvl => Math.ceil(lvl / 4) + 1;

	function classEntries (char) {
		return (char.classes || []).map((c, i) => {
			const cls = D.getClass(c);
			const sc = cls ? D.getSubclass(cls, c.subclass) : null;
			return {i, ref: c, cls, sc, level: Math.max(1, Math.min(20, Number(c.level || 1)))};
		}).filter(x => x.cls);
	}

	function findFeat (uid) {
		const [nm, src] = String(uid).split("|");
		const name = nm.split(";")[0].trim();
		const note = nm.includes(";") ? nm.split(";")[1].trim() : "";
		const feat = D.findByUid(D.feats, `${name}|${src || "PHB"}`);
		return feat ? {feat, note} : null;
	}

	class Walker {
		constructor (char) {
			this.char = char;
			this.choices = [];
			this.g = {skills: {}, expertise: {}, saves: {}, langs: [], tools: [], armor: [], weapons: [], feats: [], spells: [], ability: [], resist: [], optfeatures: [], expanded: {}, darkvision: 0};
			this.level = classLevel(char);
		}

		choice (c) {
			c.value = this.char.choices?.[c.id];
			this.choices.push(c);
			return c.value;
		}

		/* ---- ability increases ---- */
		ability (ctx, arr, {tasha = false, label} = {}) {
			if (!arr?.length) return;
			const options = tasha ? tashaOptions(arr) : arr;
			const needs = options.length > 1 || optionSlots(options[0]).some(s => s.from.length > 1);
			let opt = options[0]; let val = null;
			if (needs) {
				val = this.choice({...ctx, id: ctx.prefix + ">ability", kind: "ability", label: label || "Ability Score Increase", options});
				opt = options[Math.min(Number(val?.opt || 0), options.length - 1)];
			}
			const bonus = optionBonus(opt, val);
			for (const a of CS.ABIL) if (bonus[a]) this.g.ability.push({abil: a, amount: bonus[a], from: ctx.from});
		}

		/* ---- proficiencies ---- */
		profs (ctx, arr, type) {
			const obj = arr?.[0];
			if (!obj) return;
			let n = 0;
			for (const [k0, v] of Object.entries(obj)) {
				const k = k0.split("|")[0];
				const id = `${ctx.prefix}>${type}${n++ ? n : ""}`;
				if (k === "choose") {
					const from = (v.from || []).map(x => typeof x === "string" ? x.split("|")[0] : x);
					this.pickList(ctx, id, type, v.count || 1, {from});
				} else if (/^any/.test(k) && typeof v === "number") {
					this.pickList(ctx, id, type, v, {pool: k});
				} else if (v === true) {
					if (type === "skill" && CS.SKILL_BY_KEY[k]) this.g.skills[k] = this.g.skills[k] || ctx.from;
					else if (type === "lang") { if (k !== "other") this.g.langs.push(CS.cap(k)); }
					else if (type === "tool") this.g.tools.push(CS.cap(k));
					else if (type === "weapon") this.g.weapons.push(CS.cap(k));
					else if (type === "armor") this.g.armor.push({light: "Light armor", medium: "Medium armor", heavy: "Heavy armor", shield: "Shields"}[k] || CS.cap(k));
				}
			}
		}

		pickList (ctx, id, type, count, {from = null, pool = null} = {}) {
			const val = this.choice({...ctx, id, kind: type, count, from, pool, label: {skill: "Skill Proficiency", lang: "Language", tool: "Tool Proficiency", weapon: "Weapon Proficiency", armor: "Armor"}[type] || CS.cap(type)});
			for (const x of (Array.isArray(val) ? val : []).slice(0, count)) {
				if (type === "skill" && CS.SKILL_BY_KEY[x]) this.g.skills[x] = this.g.skills[x] || ctx.from;
				else if (type === "lang") this.g.langs.push(x);
				else if (type === "tool") this.g.tools.push(x);
				else if (type === "weapon") this.g.weapons.push(x);
			}
		}

		skillToolLang (ctx, arr) {
			const ch = arr?.[0]?.choose?.[0];
			if (!ch) return;
			const allow = {skill: ch.from.includes("anySkill"), tool: ch.from.includes("anyTool"), lang: ch.from.includes("anyLanguage")};
			const val = this.choice({...ctx, id: ctx.prefix + ">stl", kind: "stl", count: ch.count || 1, allow, label: `Skill${allow.tool ? ", Tool" : ""}${allow.lang ? " or Language" : ""} Proficiencies`});
			for (const x of (Array.isArray(val) ? val : []).slice(0, ch.count || 1)) {
				const [t, v] = String(x).split(":");
				if (t === "skill" && CS.SKILL_BY_KEY[v]) this.g.skills[v] = this.g.skills[v] || ctx.from;
				if (t === "tool") this.g.tools.push(v);
				if (t === "lang") this.g.langs.push(v);
			}
		}

		saves (ctx, arr) {
			const obj = arr?.[0];
			if (!obj) return;
			for (const [k, v] of Object.entries(obj)) {
				if (v === true) this.g.saves[k] = ctx.from;
				if (k === "choose") {
					const val = this.choice({...ctx, id: ctx.prefix + ">save", kind: "save", from: v.from || CS.ABIL, count: 1, label: "Saving Throw Proficiency"});
					if (val) this.g.saves[val] = ctx.from;
				}
			}
		}

		expertise (ctx, count, idSuffix = ">expertise") {
			const val = this.choice({...ctx, id: ctx.prefix + idSuffix, kind: "expertise", count, label: "Expertise"});
			for (const k of (Array.isArray(val) ? val : []).slice(0, count)) this.g.expertise[k] = ctx.from;
		}

		/* ---- feats ---- */
		feats (ctx, arr) {
			const obj = arr?.[0];
			if (!obj) return;
			let n = 0;
			for (const [k, v] of Object.entries(obj)) {
				if (k === "any") for (let j = 0; j < v; j++) this.featChoice({...ctx}, `${ctx.prefix}>feat${n++}`, null);
				else if (k === "anyFromCategory") for (let j = 0; j < (v.count || 1); j++) this.featChoice({...ctx}, `${ctx.prefix}>feat${n++}`, v.category);
				else if (v === true) {
					const f = findFeat(k);
					if (f) this.feat({...ctx, prefix: `${ctx.prefix}>feat:${K(f.feat.name, f.feat.source)}`, parent: ctx.parent}, f.feat, {note: f.note, granted: true});
				}
			}
		}

		featChoice (ctx, id, category, label = "Feat") {
			const val = this.choice({...ctx, id, kind: "feat", category, label});
			const feat = val && D.getFeat(val);
			if (feat) this.feat({...ctx, prefix: id, parent: id}, feat, {note: val.note});
			return feat;
		}

		feat (ctx, feat, {note = "", granted = false} = {}) {
			const from = `Feat: ${feat.name}`;
			const c = {...ctx, from, featOwner: ctx.prefix};
			this.g.feats.push({feat, prefix: ctx.prefix, from: ctx.from, note, granted, parent: ctx.parent});
			if (granted) {
				// a fixed feat has no choice of its own: nested choices hang from a virtual node
				c.parent = ctx.prefix;
				this.choices.push({...ctx, id: ctx.prefix, kind: "grantedFeat", feat, note, label: "Feat", value: {name: feat.name, source: feat.source}});
			}
			this.ability(c, feat.ability, {label: "Ability Score Increase"});
			this.profs(c, feat.skillProficiencies, "skill");
			this.profs(c, feat.languageProficiencies, "lang");
			this.profs(c, feat.toolProficiencies, "tool");
			this.profs(c, feat.weaponProficiencies, "weapon");
			this.profs(c, feat.armorProficiencies, "armor");
			this.skillToolLang(c, feat.skillToolLanguageProficiencies);
			this.saves(c, feat.savingThrowProficiencies);
			for (const ex of feat.expertise || []) for (const [k, v] of Object.entries(ex)) if (/anyProficientSkill/.test(k)) this.expertise(c, v);
			this.spells(c, feat.additionalSpells, this.level, {note});
			this.optFeatures(c, feat.optionalfeatureProgression, this.level);
			for (const r of feat.resist || []) if (typeof r === "string") this.g.resist.push(r);
		}

		/* ---- spells granted (additionalSpells) ---- */
		spells (ctx, list, level, {note = "", clsIdx = null} = {}) {
			if (!list?.length) return;
			let idx = 0;
			if (list.length > 1) {
				let def = 0;
				if (note) { const i = list.findIndex(o => (o.name || "").toLowerCase().startsWith(String(note).toLowerCase())); if (i >= 0) def = i; }
				const v = this.choice({...ctx, id: ctx.prefix + ">spellopt", kind: "spellOpt", options: list.map((o, i) => o.name || `Option ${i + 1}`), def, label: ctx.section === "race" ? "Lineage" : ctx.featOwner ? "Spell List" : "Option"});
				idx = v == null ? def : Number(v);
			}
			const o = list[Math.min(idx, list.length - 1)];
			let abil = typeof o.ability === "string" && o.ability !== "inherit" ? o.ability : null;
			if (o.ability?.choose) abil = this.choice({...ctx, id: ctx.prefix + ">spellabil", kind: "spellAbility", from: o.ability.choose, label: "Spellcasting Ability"}) || null;
			const HOW = {prepared: "Always prepared", known: "Known", innate: "Innate", expanded: "Expanded list"};
			let n = 0;
			for (const how of ["prepared", "known", "innate", "expanded"]) {
				for (const [k, v] of Object.entries(o[how] || {})) {
					// expanded lists are added whole: spell levels above the class's slots are shown locked in the Spells step
					if (/^\d+$/.test(k) && Number(k) > level && how !== "expanded") continue;
					const items = [];
					const flat = (x, tag) => {
						if (x == null) return;
						if (typeof x === "string" || x.choose || x.all) items.push({x, tag});
						else if (Array.isArray(x)) x.forEach(y => flat(y, tag));
						else if (typeof x === "object") for (const [kk, vv] of Object.entries(x)) flat(vv, tag || kk);
					};
					flat(v, null);
					for (const {x, tag} of items) {
						const uses = tag ? {will: "at will", ritual: "ritual", daily: "daily", rest: "per rest"}[tag] || (/^\d+e?$/.test(tag) ? `${tag.replace("e", "")}/day` : tag) : null;
						if (typeof x === "string") {
							const uid = x.split("#")[0];
							if (how === "expanded") { if (clsIdx != null) (this.g.expanded[clsIdx] = this.g.expanded[clsIdx] || []).push({uid}); } else this.g.spells.push({uid, how: HOW[how], from: ctx.from, ability: abil, uses, cantrip: x.includes("#c")});
						} else if (x.all) {
							if (how === "expanded" && clsIdx != null) (this.g.expanded[clsIdx] = this.g.expanded[clsIdx] || []).push({filter: x.all});
						} else if (x.choose) {
							const cnt = x.count || 1;
							const id = `${ctx.prefix}>spell${n++}`;
							const val = this.choice({...ctx, id, kind: "spell", filter: x.choose, count: cnt, how: HOW[how], label: `${HOW[how]} spell${cnt > 1 ? "s" : ""}`});
							for (const uid of (Array.isArray(val) ? val : []).slice(0, cnt)) this.g.spells.push({uid, how: HOW[how], from: ctx.from, ability: abil, uses});
						}
					}
				}
			}
		}

		/* ---- invocations, maneuvers, metamagic, fighting styles... ---- */
		optFeatures (ctx, progs, level, anchorFor) {
			for (const p of progs || []) {
				const n = progAt(p.progression, level);
				if (n <= 0) continue;
				const id = `${ctx.prefix}>opt:${p.name}`;
				const extra = anchorFor ? anchorFor(p) : {};
				const val = this.choice({...ctx, ...extra, id, kind: "optfeature", featureType: p.featureType || [], count: n, label: p.name});
				for (const ref of (Array.isArray(val) ? val : []).slice(0, n)) {
					const of = D.getOptFeature(ref);
					if (!of) continue;
					this.g.optfeatures.push({of, from: ctx.from, group: p.name});
					if (of.additionalSpells) this.spells({...ctx, ...extra, prefix: `${id}>${K(of.name, of.source)}`, parent: id, from: of.name}, of.additionalSpells, level);
				}
			}
		}

		/* ---- sections ---- */
		race () {
			const er = effRace(this.char);
			if (!er) return;
			const ctx = {section: "race", prefix: "race", from: er.displayName, parent: null};
			if ((er.size || []).length > 1) this.choice({...ctx, id: "race:size", kind: "size", options: er.size, label: "Size"});
			this.ability({...ctx, prefix: "race"}, er.ability, {tasha: true, label: "Ability Score Increase (Tasha's Custom Origin)"});
			this.profs(ctx, er.skillProficiencies, "skill");
			this.profs(ctx, er.languageProficiencies, "lang");
			this.profs(ctx, er.toolProficiencies, "tool");
			this.profs(ctx, er.weaponProficiencies, "weapon");
			this.profs(ctx, er.armorProficiencies, "armor");
			this.skillToolLang(ctx, er.skillToolLanguageProficiencies);
			this.feats(ctx, er.feats);
			this.spells(ctx, er.additionalSpells, this.level);
			for (const r of er.resist || []) if (typeof r === "string") this.g.resist.push(r);
			this.g.darkvision = Math.max(this.g.darkvision, er.darkvision || 0);
		}

		background () {
			const bg = D.getBackground(this.char.background);
			if (!bg) return;
			const ctx = {section: "bg", prefix: "bg", from: bg.name, parent: null};
			this.ability(ctx, bg.ability, {label: "Ability Scores"});
			this.profs(ctx, bg.skillProficiencies, "skill");
			this.profs(ctx, bg.languageProficiencies, "lang");
			this.profs(ctx, bg.toolProficiencies, "tool");
			this.profs(ctx, bg.weaponProficiencies, "weapon");
			this.skillToolLang(ctx, bg.skillToolLanguageProficiencies);
			this.feats(ctx, bg.feats);
			this.spells(ctx, bg.additionalSpells, this.level);
			// 2024 rules: languages come from character creation (Common + 2 standard languages)
			const er = effRace(this.char);
			if (bg.edition === "one" && !bg.languageProficiencies && !er?.languageProficiencies) {
				this.g.langs.push("Common");
				this.pickList({...ctx, prefix: "bg"}, "bg>lang2024", "lang", 2, {pool: "anyStandard"});
			}
		}

		classes () {
			const settings = this.char.settings || {};
			for (const ce of classEntries(this.char)) {
				const sec = `cls${ce.i}`;
				const from = ce.cls.name;
				const feats = classFeatureList(ce, settings);
				const featureAt = name => feats.find(f => f.name.toLowerCase() === String(name).toLowerCase());
				const anchor = (name, lvl) => { const f = featureAt(name); return f ? {level: f.level, feature: f.name} : {level: lvl || 1, feature: name}; };

				// proficiencies
				const sp = ce.i === 0 ? ce.cls.startingProficiencies : ce.cls.multiclassing?.proficienciesGained;
				const pctx = {section: sec, prefix: `${sec}:prof`, from, parent: null, level: 1, feature: "Proficiencies"};
				if (sp?.skills) {
					sp.skills.forEach((s, j) => {
						if (s.choose) this.pickList(pctx, `${sec}:prof>skill${j || ""}`, "skill", s.choose.count || 1, {from: s.choose.from});
						else if (s.any) this.pickList(pctx, `${sec}:prof>skill${j || ""}`, "skill", s.any, {pool: "any"});
						else for (const [k, v] of Object.entries(s)) if (v === true && CS.SKILL_BY_KEY[k]) this.g.skills[k] = from;
					});
				}
				this.profs(pctx, sp?.toolProficiencies, "tool");
				if (!sp?.toolProficiencies) for (const t of sp?.tools || []) this.g.tools.push(strip(typeof t === "string" ? t : t.full || ""));
				for (const a of sp?.armor || []) this.g.armor.push(typeof a === "object" ? strip(a.full || a.proficiency) : ({light: "Light armor", medium: "Medium armor", heavy: "Heavy armor", shield: "Shields"}[a] || strip(a)));
				for (const w of sp?.weapons || []) this.g.weapons.push(typeof w === "object" ? strip(w.full || w.proficiency) : ({simple: "Simple weapons", martial: "Martial weapons"}[w] || strip(w)));
				if (ce.i === 0) for (const a of ce.cls.proficiency || []) this.g.saves[a] = from;

				// ability score improvements: by class level, as in the rules
				for (const f of feats) {
					if (f.kind !== "class" || !/^Ability Score Improvement$/i.test(f.name)) continue;
					const id = `${sec}:asi@${f.level}`;
					const ctx = {section: sec, prefix: id, from: `${from} ${f.level}: Ability Score Improvement`, parent: null, level: f.level, feature: f.name};
					const val = this.choice({...ctx, id, kind: "asi", edition: ce.cls.edition, label: "Ability Score Improvement or Feat"});
					if (val?.mode === "feat") {
						this.featChoice({...ctx, parent: id}, id + ">feat", ce.cls.edition === "one" ? ["G"] : null, "Feat");
					} else {
						const opts = [
							{choose: {from: [...CS.ABIL], count: 1, amount: 2}, _label: "+2 to one ability score"},
							{choose: {from: [...CS.ABIL], count: 2, amount: 1}, _label: "+1 to two ability scores"},
						];
						this.ability({...ctx, prefix: id, parent: id}, opts, {label: "Ability Scores"});
					}
				}
				// feat progressions (2024 Fighting Style, Epic Boon...)
				for (const fp of ce.cls.featProgression || []) {
					const n = progAt(fp.progression, ce.level);
					const an = anchor(fp.name);
					for (let j = 0; j < n; j++) this.featChoice({section: sec, prefix: `${sec}:fp`, from, parent: null, ...an}, `${sec}:fp:${fp.name}:${j}`, fp.category, fp.name);
				}
				// Mystic Arcanum (warlock): one spell of 6th-9th level from the class list, cast once per long rest
				for (const f of feats) {
					if (f.kind !== "class" || !/^Mystic Arcanum/i.test(f.name)) continue;
					const m = f.name.match(/(\d)(?:st|nd|rd|th)/);
					const spLvl = m ? Number(m[1]) : ({11: 6, 13: 7, 15: 8, 17: 9})[f.level];
					if (!spLvl) continue;
					const id = `${sec}:arcanum@${f.level}`;
					const val = this.choice({section: sec, prefix: id, from, parent: null, level: f.level, feature: f.name, id, kind: "spell", filter: `level=${spLvl}|class=${ce.cls.name}`, count: 1, how: "Mystic Arcanum", label: `Mystic Arcanum (${CS.ordinal(spLvl)}-level spell)`});
					for (const uid of (Array.isArray(val) ? val : []).slice(0, 1)) this.g.spells.push({uid, how: "Mystic Arcanum", from, ability: ce.cls.spellcastingAbility, uses: "1/long rest"});
				}
				// Genie patron kind (decides the Genie's Wrath damage type) when the data doesn't offer it as spell options
				if (ce.sc?.shortName === "Genie" && !(ce.sc.additionalSpells || []).length) {
					this.choice({section: sec, prefix: `${sec}:geniekind`, from, parent: null, level: feats.find(f => f.kind === "subclass")?.level || 1, feature: feats.find(f => f.kind === "subclass")?.name || "Genie", id: `${sec}:geniekind`, kind: "select", options: ["Dao", "Djinni", "Efreeti", "Marid"], label: "Genie Kind"});
				}
				// expertise
				for (const f of feats) {
					if (/^Expertise$/i.test(f.name)) this.expertise({section: sec, prefix: `${sec}:exp@${f.level}`, from, parent: null, level: f.level, feature: f.name}, 2, "");
				}
				// optional features (class and subclass)
				const OPT_RE = {EI: /invocation/i, MV: /maneuver|combat superiority/i, MM: /metamagic/i, FS: /fighting style/i, AI: /infusion/i, PB: /pact boon/i, AS: /arcane shot/i, RN: /rune/i, ED: /elemental discipline/i};
				const firstLevel = p => (Array.isArray(p.progression) ? p.progression.findIndex(x => x > 0) + 1 : Math.min(...Object.keys(p.progression).map(Number).filter(x => !isNaN(x)))) || 1;
				const optAnchor = kind => p => {
					const pool = feats.filter(x => x.kind === kind && x.level >= firstLevel(p));
					const f = pool.find(x => x.name.toLowerCase() === p.name.toLowerCase())
						|| pool.find(x => (p.featureType || []).some(t => OPT_RE[String(t).split(":")[0]]?.test(x.name)))
						|| feats.find(x => x.kind === kind && x.name.toLowerCase() === p.name.toLowerCase());
					if (f) return {level: f.level, feature: f.name};
					return {level: firstLevel(p), feature: p.name};
				};
				this.optFeatures({section: sec, prefix: sec, from, parent: null}, ce.cls.optionalfeatureProgression, ce.level, optAnchor("class"));
				if (ce.sc) this.optFeatures({section: sec, prefix: `${sec}:sc`, from: ce.sc.name, parent: null}, ce.sc.optionalfeatureProgression, ce.level, optAnchor("subclass"));
				// spells from class / subclass
				const scFirst = feats.find(f => f.kind === "subclass");
				this.spells({section: sec, prefix: `${sec}:spells`, from, parent: null, level: 1, feature: "Spellcasting"}, ce.cls.additionalSpells, ce.level, {clsIdx: ce.i});
				if (ce.sc) this.spells({section: sec, prefix: `${sec}:scspells`, from: ce.sc.name, parent: null, level: scFirst?.level || 1, feature: scFirst?.name || ce.sc.name}, ce.sc.additionalSpells, ce.level, {clsIdx: ce.i});
			}
		}

		extraFeats () {
			for (const f of this.char.extraFeats || []) {
				const feat = D.getFeat(f);
				if (feat) this.feat({section: "xfeat", prefix: `xfeat:${f.id}`, from: "Other", parent: `xfeat:${f.id}`, xid: f.id}, feat, {note: f.note});
			}
		}

		/** Origin ability increases when neither species nor background grant any (Tasha's Custom Origin) */
		origin () {
			const er = effRace(this.char);
			const bg = D.getBackground(this.char.background);
			if (er?.ability?.length || bg?.ability?.length) return;
			this.ability({section: "abil", prefix: "origin", from: er ? `${er.displayName} (Tasha's)` : "Origin (Tasha's)", parent: null}, [
				{choose: {weighted: {from: [...CS.ABIL], weights: [2, 1]}}, _label: "Tasha's: +2 / +1 to any"},
				{choose: {weighted: {from: [...CS.ABIL], weights: [1, 1, 1]}}, _label: "Tasha's: +1 / +1 / +1 to any"},
			], {label: "Species Ability Score Increase (Tasha's Custom Origin)"});
		}

		run () {
			this.race();
			this.background();
			this.origin();
			this.classes();
			this.extraFeats();
			return this;
		}
	}

	/** Class + subclass features up to the class level */
	function classFeatureList (ce, settings = {}) {
		const out = [];
		for (const f of ce.cls.classFeatures || []) {
			const ref = typeof f === "string" ? f : f.classFeature;
			const p = D.parseClassFeatureRef(ref);
			if (p.level > ce.level) continue;
			const ent = D.getClassFeature(ref);
			if (ent?.isClassFeatureVariant && settings.optionalFeatures === false) continue;
			out.push({kind: "class", cls: ce.cls.name, level: p.level, name: ent?.name || p.name, entries: ent?.entries || [], source: ent?.source || p.source, optional: !!ent?.isClassFeatureVariant, gainSubclass: !!f.gainSubclassFeature});
		}
		if (ce.sc) {
			for (const ref of ce.sc.subclassFeatures || []) {
				const p = D.parseSubclassFeatureRef(ref);
				if (p.level > ce.level) continue;
				const ent = D.getSubclassFeature(ref);
				out.push({kind: "subclass", cls: ce.cls.name, sub: ce.sc.shortName || ce.sc.name, level: p.level, name: ent?.name || p.name, source: ent?.source || p.source, entries: ent?.entries || []});
			}
		}
		return out.sort((a, b) => a.level - b.level || (a.kind === "class" ? -1 : 1));
	}

	/* ====================== Class tables & spellcasting ====================== */

	function cellValue (v) {
		if (v == null) return "—";
		if (typeof v === "number") return v === 0 ? "—" : String(v);
		if (typeof v === "string") return strip(v);
		if (v.type === "dice") return (v.toRoll || []).map(d => `${d.number}d${d.faces}`).join("+");
		if (v.type === "bonus") return CS.fmtMod(v.value);
		if (v.type === "bonusSpeed") return `${CS.fmtMod(v.value)} ft.`;
		if (v.value != null) return String(v.value);
		return strip(JSON.stringify(v));
	}

	const tableGroups = ce => [...(ce.cls.classTableGroups || []), ...((ce.sc?.subclassTableGroups) || [])];

	function evalFormula (f, level, scores) {
		if (!f) return null;
		let s = String(f).replace(/<\$level\$>/g, level);
		s = s.replace(/<\$(\w+)_mod\$>/g, (m, a) => scores[a]?.mod ?? 0);
		if (!/^[\d\s+\-*/().]+$/.test(s)) return null;
		try { return Math.max(1, Math.floor(Function(`"use strict";return (${s})`)())); } catch (e) { return null; }
	}

	function spellcasting (char, scores, pb, ces) {
		const perClass = []; const multi = []; let pact = null;
		for (const ce of ces) {
			const prog = ce.cls.casterProgression || ce.sc?.casterProgression || null;
			const abil = ce.cls.spellcastingAbility || ce.sc?.spellcastingAbility || null;
			if (!prog || !abil) continue;
			const mod = scores[abil].mod;
			const groups = tableGroups(ce);
			const sp = groups.find(g => g.rowsSpellProgression);
			const ownSlots = sp ? (sp.rowsSpellProgression[ce.level - 1] || []) : [];
			let maxLevel = 0;
			ownSlots.forEach((n, i) => { if (n) maxLevel = i + 1; });
			if (prog === "pact") {
				for (const g of groups) {
					const labels = (g.colLabels || []).map(l => strip(l).toLowerCase());
					const iS = labels.indexOf("spell slots"); const iL = labels.indexOf("slot level");
					if (iS >= 0 && iL >= 0) {
						const row = g.rows?.[ce.level - 1] || [];
						const lvl = parseInt(cellValue(row[iL])) || 0;
						pact = {count: parseInt(cellValue(row[iS])) || 0, level: lvl, cls: ce.cls.name};
						maxLevel = lvl;
					}
				}
			} else multi.push({ce, prog});
			const src = [ce.cls, ce.sc].filter(Boolean);
			const pick = k => src.map(s => s[k]).find(Boolean);
			const cantrips = progAt(pick("cantripProgression"), ce.level);
			let prepared = progAt(pick("preparedSpellsProgression"), ce.level) || null;
			let mode = "prepared";
			if (!prepared && pick("preparedSpells")) prepared = evalFormula(pick("preparedSpells"), ce.level, scores);
			if (!prepared && pick("spellsKnownProgression")) { prepared = progAt(pick("spellsKnownProgression"), ce.level); mode = "known"; }
			const fixed = pick("spellsKnownProgressionFixed");
			let listClass = ce.cls;
			if (!ce.cls.casterProgression && ce.sc?.casterProgression) {
				listClass = D.classes.find(c => c.name === "Wizard" && c.source === ce.cls.source) || D.classes.find(c => c.name === "Wizard");
			}
			perClass.push({
				i: ce.i, cls: ce.cls.name, clsSource: ce.cls.source, listClass, level: ce.level, abil, mod,
				dc: 8 + pb + mod, attack: pb + mod, cantrips, prepared, mode,
				spellbook: fixed ? fixed.slice(0, ce.level).reduce((a, b) => a + b, 0) : null,
				maxLevel, prog, ownSlots,
			});
		}
		let slots = [];
		if (multi.length === 1) {
			const ce = multi[0].ce;
			const sp = tableGroups(ce).find(g => g.rowsSpellProgression);
			slots = sp ? [...(sp.rowsSpellProgression[ce.level - 1] || [])] : [];
		} else if (multi.length > 1) {
			let lvl = 0;
			for (const {ce, prog} of multi) {
				const newEd = ce.cls.edition === "one";
				if (prog === "full") lvl += ce.level;
				else if (prog === "1/2") lvl += newEd ? Math.ceil(ce.level / 2) : Math.floor(ce.level / 2);
				else if (prog === "1/3") lvl += Math.floor(ce.level / 3);
				else if (prog === "artificer") lvl += Math.ceil(ce.level / 2);
			}
			slots = [...(MULTI_SLOTS[Math.min(20, lvl)] || [])];
		}
		while (slots.length && !slots[slots.length - 1]) slots.pop();
		return {perClass, slots, pact};
	}

	/** Spells a class can learn: own list (+ optional expanded lists) + subclass expanded lists */
	function availableSpells (calc, pc) {
		const map = new Map();
		for (const {spell, variant} of D.spellsForClass(pc.listClass, {variants: calc.settings.optionalFeatures !== false})) {
			map.set(K(spell.name, spell.source), {spell, tag: variant ? "Optional list" : null});
		}
		for (const ex of calc.grants.expanded[pc.i] || []) {
			if (ex.uid) {
				const sp = D.findByUid(D.spells, ex.uid);
				if (sp && !map.has(K(sp.name, sp.source))) map.set(K(sp.name, sp.source), {spell: sp, tag: "Expanded list"});
			} else if (ex.filter) {
				const variants = calc.settings.optionalFeatures !== false;
				for (const sp of D.spells) if (D.matchSpellFilter(sp, ex.filter, {variants}) && !map.has(K(sp.name, sp.source))) map.set(K(sp.name, sp.source), {spell: sp, tag: "Expanded list"});
			}
		}
		return [...map.values()];
	}

	/* ====================== Items, AC, attacks ====================== */

	const typeCode = t => String(t || "").split("|")[0];
	const numBonus = v => parseInt(String(v || "0").replace(/\s/g, "")) || 0;

	function itemSnapshot (it) {
		const pick = ["type", "ac", "dmg1", "dmg2", "dmgType", "property", "weight", "value", "bonusAc", "bonusWeapon", "bonusWeaponAttack", "bonusWeaponDamage", "strength", "stealth", "range", "rarity", "reqAttune", "weaponCategory", "weapon", "armor", "mastery", "bonusSavingThrow", "bonusSpellAttack", "bonusSpellSaveDc"];
		const s = {};
		for (const k of pick) if (it[k] != null) s[k] = it[k];
		return s;
	}

	function armorClass (char, scores, ces) {
		const dex = scores.dex.mod;
		const eq = (char.inventory || []).filter(i => i.equipped);
		let armor = null; let shield = null; let bonus = 0;
		for (const i of eq) {
			const t = typeCode(i.snap?.type);
			if (["LA", "MA", "HA"].includes(t)) { if (!armor || (i.snap.ac || 0) > (armor.snap.ac || 0)) armor = i; } else if (t === "S") shield = i;
			else if (i.snap?.bonusAc && (!i.snap.reqAttune || i.attuned)) bonus += numBonus(i.snap.bonusAc);
		}
		const parts = []; let ac;
		if (armor) {
			const t = typeCode(armor.snap.type);
			const base = (armor.snap.ac || 10) + numBonus(armor.snap.bonusAc);
			ac = t === "LA" ? base + dex : t === "MA" ? base + Math.min(dex, 2) : base;
			parts.push(armor.name);
		} else {
			const opts = [{v: 10 + dex, l: "Unarmored"}];
			if (ces.some(c => c.cls.name === "Barbarian")) opts.push({v: 10 + dex + scores.con.mod, l: "Unarmored Defense (Barbarian)"});
			if (ces.some(c => c.cls.name === "Monk") && !shield) opts.push({v: 10 + dex + scores.wis.mod, l: "Unarmored Defense (Monk)"});
			if (ces.some(c => c.cls.name === "Sorcerer" && /draconic/i.test(c.sc?.name || ""))) opts.push({v: 13 + dex, l: "Draconic Resilience"});
			const best = opts.sort((a, b) => b.v - a.v)[0];
			ac = best.v; parts.push(best.l);
		}
		if (shield) { ac += (shield.snap.ac || 2) + numBonus(shield.snap.bonusAc); parts.push(shield.name); }
		ac += bonus + Number(char.misc?.ac || 0);
		return {value: ac, parts};
	}

	function attacks (char, scores, pb) {
		const out = [];
		for (const i of (char.inventory || []).filter(x => x.equipped)) {
			const s = i.snap || {};
			const t = typeCode(s.type);
			if (!(s.weapon || t === "M" || t === "R")) continue;
			const props = (s.property || []).map(p => typeCode(typeof p === "object" ? p.uid : p));
			const ranged = t === "R";
			const abil = props.includes("F") ? (scores.str.mod >= scores.dex.mod ? "str" : "dex") : (ranged ? "dex" : "str");
			const mod = scores[abil].mod;
			const atkB = numBonus(s.bonusWeapon) + numBonus(s.bonusWeaponAttack);
			const dmgB = numBonus(s.bonusWeapon) + numBonus(s.bonusWeaponDamage);
			const m = mod + dmgB;
			out.push({
				ranged, mod, dmgBonus: m, atkBonus: pb + mod + atkB,
				item: i, name: i.name, source: i.source, toHit: CS.fmtMod(pb + mod + atkB),
				damage: s.dmg1 ? `${s.dmg1}${m ? CS.fmtMod(m) : ""}` : "—", dmgType: CS.DMG[s.dmgType] || "",
				versatile: props.includes("V") && s.dmg2 ? `${s.dmg2}${m ? CS.fmtMod(m) : ""}` : null,
				range: s.range ? `${s.range} ft.` : (props.includes("R") ? "10 ft." : "5 ft."),
				props: (s.property || []).map(p => D.propName?.(typeof p === "object" ? p.uid : p, i.source) || p),
				mastery: (s.mastery || []).map(m2 => String(typeof m2 === "object" ? m2.uid : m2).split("|")[0]),
			});
		}
		return out;
	}

	/* ====================== Compute ====================== */

	function compute (char) {
		migrate(char);
		const W = new Walker(char).run();
		const g = W.g;
		const lvl = W.level;
		const pb = profBonus(lvl);
		const ces = classEntries(char);
		const er = effRace(char);

		// ability scores
		const scores = {};
		for (const a of CS.ABIL) scores[a] = {base: Number(char.base?.[a] || 0), bonus: 0, extra: Number(char.extra?.[a] || 0), parts: []};
		for (const b of g.ability) { scores[b.abil].bonus += b.amount; scores[b.abil].parts.push(`${b.from} ${CS.fmtMod(b.amount)}`); }
		for (const a of CS.ABIL) { scores[a].total = Math.min(30, scores[a].base + scores[a].bonus + scores[a].extra); scores[a].mod = CS.mod(scores[a].total); }

		// saves
		for (const [a, v] of Object.entries(char.saveExtra || {})) if (v) g.saves[a] = g.saves[a] || "Custom";
		// magic items: bonuses to saving throws, spell attacks and spell save DCs (worn, attuned when required)
		const activeItems = (char.inventory || []).filter(i => i.equipped !== false && (!i.snap?.reqAttune || i.attuned) && (i.equipped || i.attuned));
		const itemBonus = key => activeItems.reduce((n, i) => n + numBonus(i.snap?.[key]), 0);
		const saveItem = itemBonus("bonusSavingThrow");
		const saves = Object.fromEntries(CS.ABIL.map(a => [a, {prof: !!g.saves[a], from: g.saves[a] || null, value: scores[a].mod + (g.saves[a] ? pb : 0) + saveItem}]));

		// skills
		const skills = CS.SKILLS.map(s => {
			const manual = Number(char.skills?.[s.key] || 0);
			let lv = Math.max(manual, g.skills[s.key] ? 1 : 0);
			if (g.expertise[s.key]) lv = 2;
			return {...s, prof: lv, from: g.skills[s.key] || (manual ? "Custom" : null), expertFrom: g.expertise[s.key] || null, value: scores[s.abil].mod + pb * lv};
		});
		const sk = k => skills.find(s => s.key === k).value;

		// feats-based bonuses
		const featKeys = g.feats.map(f => K(f.feat.name, f.feat.source));
		let initBonus = Number(char.misc?.init || 0);
		if (featKeys.includes("alert|xphb")) initBonus += pb;
		else if (featKeys.includes("alert|phb")) initBonus += 5;

		// hit points
		let hpMax = 0; const hitDice = {};
		ces.forEach((ce, idx) => {
			const faces = ce.cls.hd?.faces || 8;
			hitDice[faces] = (hitDice[faces] || 0) + ce.level;
			for (let l = 1; l <= ce.level; l++) {
				const rolled = char.settings?.hpMethod === "manual" ? char.hp?.rolls?.[`${ce.i}:${l}`] : null;
				const v = idx === 0 && l === 1 ? faces : (rolled || Math.floor(faces / 2) + 1);
				hpMax += Math.max(1, v + scores.con.mod);
			}
		});
		if (!ces.length) hpMax = Math.max(1, 8 + scores.con.mod);
		const hpParts = [];
		if (featKeys.some(f => f.startsWith("tough|"))) { hpMax += 2 * lvl; hpParts.push("Tough"); }
		if ((er?.entries || []).some(e => /dwarven toughness/i.test(e?.name || ""))) { hpMax += lvl; hpParts.push("Dwarven Toughness"); }
		if (ces.some(c => /draconic/i.test(c.sc?.name || "") && c.cls.name === "Sorcerer")) { const c = ces.find(x => x.cls.name === "Sorcerer"); hpMax += c.level; hpParts.push("Draconic Resilience"); }
		hpMax += Number(char.hp?.bonus || 0);
		if (char.hp?.maxOverride) hpMax = Number(char.hp.maxOverride);

		// speed
		const sp = er?.speed;
		const speed = typeof sp === "number" ? {walk: sp} : {...(sp || {walk: 30})};
		for (const k of Object.keys(speed)) if (speed[k] === true) speed[k] = speed.walk;
		speed.walk = Number(speed.walk || 30) + Number(char.misc?.speed || 0);

		const size = char.choices?.["race:size"] || er?.size?.[0] || "M";
		const spells = spellcasting(char, scores, pb, ces);
		const spAtkItem = itemBonus("bonusSpellAttack"); const spDcItem = itemBonus("bonusSpellSaveDc");
		for (const pc of spells.perClass) { pc.attack += spAtkItem; pc.dc += spDcItem; }
		const weight = (char.inventory || []).reduce((s, i) => s + (Number(i.snap?.weight) || 0) * (Number(i.qty) || 1), 0);
		const settings = char.settings || {};

		const calc = {
			level: lvl, pb, scores, saves, skills, settings,
			passive: {perception: 10 + sk("perception"), investigation: 10 + sk("investigation"), insight: 10 + sk("insight")},
			initiative: scores.dex.mod + initBonus,
			ac: armorClass(char, scores, ces),
			hp: {max: hpMax, parts: hpParts},
			hitDice, speed, size,
			darkvision: g.darkvision || null,
			resist: [...new Set(g.resist)],
			race: er, classes: ces,
			background: D.getBackground(char.background),
			features: ces.flatMap(ce => classFeatureList(ce, settings)),
			choices: W.choices, grants: g,
			feats: g.feats, optfeatures: g.optfeatures,
			spellcasting: spells,
			proficiencies: {
				armor: [...new Set(g.armor)].filter(Boolean),
				weapons: [...new Set(g.weapons)].filter(Boolean),
				tools: [...new Set(g.tools)].filter(Boolean),
				languages: [...new Set(g.langs)].filter(Boolean),
			},
			attacks: attacks(char, scores, pb),
			weight, carry: scores.str.total * 15,
		};
		CS.actions?.applyMods(char, calc);
		calc.pending = W.choices.filter(c => isPending(c, calc)).length;
		calc.riders = damageRiders(char, calc);
		return calc;
	}

	/* ====================== Damage riders (features that add to rolls) ====================== */

	const GENIE_TYPE = {Dao: "bludgeoning", Djinni: "thunder", Efreeti: "fire", Marid: "cold"};

	/**
	 * Bonuses that features, invocations and feats add to attacks and damage.
	 * target: "spell" | "weapon" | "melee" | "ranged" | "any-attack"; perBeam: added to every beam/ray;
	 * conditional: off unless ticked in the right-click menu (on by default when defaultOn).
	 */
	function damageRiders (char, calc) {
		const out = [];
		const optNames = calc.optfeatures.map(o => o.of.name.toLowerCase());
		const featNames = calc.feats.map(f => f.feat.name.toLowerCase());
		const has = (ce, re) => calc.features.some(f => f.cls === ce.cls.name && re.test(f.name));
		const pcOf = name => calc.spellcasting.perClass.find(p => p.cls === name);
		for (const ce of calc.classes) {
			const pc = pcOf(ce.cls.name);
			if (ce.cls.name === "Warlock" && optNames.includes("agonizing blast")) {
				out.push({name: "Agonizing Blast", target: "spell", match: sp => /^eldritch blast$/i.test(sp.name), bonus: CS.fmtMod(calc.scores.cha.mod), perBeam: true});
			}
			if (ce.sc?.shortName === "Genie" && has(ce, /^Genie's Wrath$|^The Genie$|^Genie's Vessel$/)) {
				let kind = char.choices?.[`cls${ce.i}:geniekind`];
				const opt = char.choices?.[`cls${ce.i}:scspells>spellopt`];
				if (!kind && opt != null) kind = (ce.sc.additionalSpells || [])[Number(opt)]?.name;
				if (!kind && (ce.sc.additionalSpells || []).length) kind = ce.sc.additionalSpells[0].name;
				out.push({name: "Genie's Wrath", target: "any-attack", formula: String(calc.pb), type: GENIE_TYPE[kind] || "", conditional: true, defaultOn: true, once: true, note: "once per turn"});
			}
			if (ce.cls.name === "Wizard" && has(ce, /^Empowered Evocation$/) && pc) {
				out.push({name: "Empowered Evocation", target: "spell", match: sp => sp.school === "V", bonus: CS.fmtMod(calc.scores.int.mod), once: true});
			}
			if (ce.cls.name === "Cleric" && has(ce, /^(Potent Spellcasting|Blessed Strikes)$/) && pc) {
				out.push({name: "Potent Spellcasting", target: "spell", match: sp => sp.level === 0, bonus: CS.fmtMod(calc.scores.wis.mod), once: true});
			}
			if (ce.cls.name === "Paladin" && has(ce, /^(Improved Divine Smite|Radiant Strikes)$/)) {
				out.push({name: "Radiant Strikes", target: "melee", formula: "1d8", type: "radiant"});
			}
			if (ce.cls.name === "Paladin" && has(ce, /^Divine Smite$/)) {
				out.push({name: "Divine Smite", target: "melee", formula: "2d8", type: "radiant", conditional: true, note: "+1d8 per slot level above 1st"});
			}
			if (ce.cls.name === "Rogue" && has(ce, /^Sneak Attack$/)) {
				out.push({name: "Sneak Attack", target: "weapon", formula: `${Math.ceil(ce.level / 2)}d6`, type: "", conditional: true, once: true, note: "once per turn"});
			}
		}
		const fighting = [...optNames, ...featNames];
		if (fighting.includes("dueling")) out.push({name: "Dueling", target: "melee", bonus: "+2", match: (w) => !(w.props || []).some(p => /two-handed/i.test(p))});
		if (fighting.includes("archery")) out.push({name: "Archery", target: "ranged", hit: 2});
		const spellNames = [...char.spells.map(x => x.name), ...calc.grants.spells.map(g => String(g.uid).split("|")[0])].map(x => x.toLowerCase());
		if (spellNames.includes("hex")) out.push({name: "Hex", target: "any-attack", formula: "1d6", type: "necrotic", conditional: true, perHit: true});
		if (spellNames.includes("hunter's mark")) out.push({name: "Hunter's Mark", target: "weapon", formula: "1d6", type: calc.classes.some(c => c.cls.edition === "one") ? "force" : "", conditional: true, perHit: true});
		return out;
	}

	/** Damage lines of a spell: [{formula, type}], with cantrip scaling by character level */
	function spellDamage (sp, level) {
		const out = [];
		if (sp.scalingLevelDice) {
			const sc = Array.isArray(sp.scalingLevelDice) ? sp.scalingLevelDice : [sp.scalingLevelDice];
			for (const s of sc) {
				let best = null;
				for (const [lv, f] of Object.entries(s.scaling || {})) if (Number(lv) <= level) best = f;
				if (best) out.push({formula: best, type: (String(s.label || "").match(/^(\w+) damage/i)?.[1] || sp.damageInflict?.[0] || "").toLowerCase()});
			}
			if (out.length) return out;
		}
		const txt = JSON.stringify(sp.entries || []);
		const re = /\{@damage ([^}|]+)[^}]*\}\s*(?:(\w+) damage)?/gi;
		let m;
		while ((m = re.exec(txt))) {
			const type = (m[2] || "").toLowerCase();
			out.push({formula: m[1].trim(), type: CS.DMG_TYPES.includes(type) ? type : (sp.damageInflict?.length === 1 ? sp.damageInflict[0] : "")});
			if (out.length >= 3) break;
		}
		return out;
	}

	/** Eldritch Blast beams by character level */
	const spellBeams = (sp, level) => (/^eldritch blast$/i.test(sp.name) ? 1 + (level >= 5) + (level >= 11) + (level >= 17) : 1);

	/** A choice still to be made */
	function isPending (c, calc) {
		const v = c.value;
		switch (c.kind) {
			case "ability": return optionSlots(c.options[Math.min(Number(v?.opt || 0), c.options.length - 1)]).some((s, i) => s.from.length > 1 && !v?.picks?.[i]);
			case "skill": case "lang": case "tool": case "weapon": case "stl": case "expertise": case "optfeature": case "spell":
				return !Array.isArray(v) || v.filter(Boolean).length < c.count;
			case "save": case "spellAbility": case "feat": case "select": return !v;
			case "asi": return false;
			default: return false;
		}
	}

	CS.rules = {
		newChar, migrate, effRace, optionSlots, describeOption, optionBonus, tashaOptions,
		POINT_BUY_COST, STANDARD_ARRAY, classLevel, profBonus, classEntries, classFeatureList, tableGroups, cellValue,
		spellcasting, availableSpells, damageRiders, spellDamage, spellBeams, itemSnapshot, armorClass, attacks, compute, isPending, progAt, typeCode, evalFormula, findFeat,
		pointBuySpent: base => CS.ABIL.reduce((t, a) => t + (POINT_BUY_COST[base[a]] ?? 99), 0),
	};
})();
