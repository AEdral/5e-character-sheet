/* Actions and limited-use features (Wild Shape, Rage, Lay on Hands, Rabbit Hop...) and passive modifiers
 * (Hare-Trigger, Dread Ambusher, Observant, Defense, Fast Movement...) read from the rules text of class and
 * subclass features, species traits, feats and class options. 5etools has no structured data for these, so the
 * activation time, the number of uses and the reset come from the standard wording of the books. */
(function () {
	const CS = globalThis.CS5E;
	const R = () => CS.rules;
	const A = (CS.actions = {});

	const strip = s => CS.render.strip(String(s ?? ""));
	const NUM = {once: 1, twice: 2, "three times": 3, "four times": 4, "five times": 5, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6};

	/** subclass/class feature references inside entries ("Starry Form", "Turn Undead"...) become named entries */
	function deref (e, depth = 0) {
		if (Array.isArray(e)) return e.map(x => deref(x, depth));
		if (!e || typeof e !== "object" || depth > 6) return e;
		if (e.type === "refSubclassFeature" || e.type === "refClassFeature") {
			const r = CS.data.resolveRef(e.type, e.subclassFeature || e.classFeature);
			return r ? {type: "entries", name: r.name, entries: deref(r.entries || [], depth + 1)} : null;
		}
		const out = {...e};
		for (const k of ["entries", "items"]) if (Array.isArray(e[k])) out[k] = deref(e[k], depth + 1);
		return out;
	}

	/** text of an entry list without its named sub-entries (those are evaluated on their own) */
	function ownText (ents, depth = 0) {
		const out = [];
		const walk = (e, d) => {
			if (e == null) return;
			if (typeof e === "string") { out.push(strip(e)); return; }
			if (Array.isArray(e)) { e.forEach(x => walk(x, d)); return; }
			if (d > 0 && e.name && ["entries", "inset", "section"].includes(e.type)) return;
			if (e.type === "table") return;
			for (const k of ["entries", "items", "entry"]) if (e[k]) walk(e[k], d + 1);
			if (e.type === "item" && e.name) out.push(e.name);
		};
		(Array.isArray(ents) ? ents : [ents]).forEach(e => (typeof e === "object" && e?.name && ["entries", "inset", "section"].includes(e.type)) ? null : walk(e, depth));
		return out.join(" ").replace(/\s+/g, " ").trim();
	}
	const fullText = ents => { const out = []; const w = e => { if (typeof e === "string") out.push(strip(e)); else if (Array.isArray(e)) e.forEach(w); else if (e && typeof e === "object" && e.type !== "table") ["entries", "items", "entry"].forEach(k => e[k] && w(e[k])); }; w(ents); return out.join(" ").replace(/\s+/g, " "); };
	function namedChildren (ents) {
		const out = [];
		const walk = (e, d) => {
			if (Array.isArray(e)) { e.forEach(x => walk(x, d)); return; }
			if (!e || typeof e !== "object") return;
			if (d > 0 && e.name && ["entries", "inset", "section"].includes(e.type)) { out.push(e); return; }
			for (const k of ["entries", "items"]) if (e[k]) walk(e[k], d + 1);
		};
		(Array.isArray(ents) ? ents : [ents]).forEach(e => walk(e, 1));
		return out;
	}

	/* ---------------- activation and uses ---------------- */

	const RE_KIND = [
		["reaction", /\b(?:use|take|expend|spend) (?:your|a|an) reaction\b|\bas a reaction\b|\busing your reaction\b/],
		["bonus", /\bas a bonus action\b|\b(?:use|take|using|spend|with|expend) (?:a|your) bonus action\b|\bbonus action to\b/],
		["action", /\bas (?:a|an|your) (?:magic |utilize )?action\b|\b(?:use|using|take) (?:your|an) action\b|\btake (?:a|the) magic action\b|\bas a magic action\b/],
	];
	function activation (text) {
		const t = text.toLowerCase();
		let best = null;
		for (const [k, re] of RE_KIND) { const m = t.match(re); if (m && (!best || m.index < best.i)) best = {k, i: m.index}; }
		return best?.k || null;
	}

	function resetOf (t0) {
		const rel = t0.split(/(?<=[.!?])\s+/).filter(x => /regain|expended|until you finish|before you can|again until|to use [\w' ]* again|number of times|uses/.test(x)).join(" ");
		const t = rel || t0;
		if (/regain one (?:of its |of your )?expended uses? when you finish a short rest/.test(t)) return "short1";
		if (/short or long rest|short rest or a long rest|short rest or long rest|finish a short rest/.test(t)) return "short";
		if (/long rest|per day|each day|at dawn|daily/.test(t)) return "long";
		return null;
	}

	/** {max, reset, pool, column} or null */
	function usesOf (text, ctx) {
		const t = text.toLowerCase();
		const reset = resetOf(t);
		let max = null; let pool = false;
		let m;
		if ((m = t.match(/equal to (?:your )?(\w+) level (?:×|x|times) (\d+)/)) || (m = t.match(/(\w+) times your (\w+) level/))) {
			const n = /\d/.test(m[2]) ? Number(m[2]) : NUM[m[1]] || 5;
			max = n * (ctx.clsLevel || ctx.level); pool = true;
		} else if ((m = t.match(/shown (?:for your [\w ]+ level )?in the ([\w' ]+?) column/))) {
			max = ctx.column?.(m[1]); if (/points|dice/.test(m[1])) pool = max > 20;
		} else if (/(?:a )?number of times equal to (?:1 \+ )?your proficiency bonus/.test(t)) max = ctx.pb;
		else if ((m = t.match(/(?:a )?number of times equal to (1 \+ )?your (\w+) modifier/))) {
			const a = Object.keys(CS.ABIL_FULL).find(k => CS.ABIL_FULL[k].toLowerCase() === m[2]);
			max = Math.max(1, (a ? ctx.scores[a].mod : 0) + (m[1] ? 1 : 0));
		} else if ((m = t.split(/(?<=[.!?])\s+/).filter(x => !/at \d+\w* level/.test(x)).join(" ").match(/you can use (?:this (?:feature|trait|ability)|it|[\w' ]{2,30}?) (once|twice|three times|four times)\b/))) max = NUM[m[1]];
		else if ((m = t.match(/you have (one|two|three|four|five|six|\d+) ([\w ]+?) (?:dice|points)\b/))) max = NUM[m[1]] || Number(m[1]);
		else if (/once you use (?:this|it|[\w' ]+?),? you (?:can't|cannot|must finish)|must finish a (?:short or long|long) rest before you can (?:use|do) (?:it|this|so) again|can't (?:do so|use (?:it|this \w+)) again until you finish|must (?:then )?finish a (?:short or long|long) rest to use (?:your |this |it )?[\w' ]*again/.test(t)) max = 1;
		const col = /expended|regain|number of times|uses/.test(t) ? ctx.column?.(ctx.name) : null;
		if (max == null && col) max = col;
		if (max == null) return null;
		if (!reset) { if (!col) return null; }
		// "beginning at 6th level, you can use it twice"
		for (const s of t.matchAll(/(?:beginning|starting) at (\d+)\w* level,? you can use (?:it|this feature|your [\w' ]+?|[\w' ]+?) (twice|three times|four times)/g)) if ((ctx.clsLevel || ctx.level) >= Number(s[1])) max = Math.max(max, NUM[s[2]]);
		return {max, reset: reset || "long", pool: pool || max > 20};
	}

	function shareOf (text, name) {
		const t = text.toLowerCase();
		let m;
		if ((m = t.match(/expend (?:a|one) use of (?:your )?([\w' ]+?)(?: feature)?(?: to\b|,|\.| rather| instead)/))) return m[1].trim();
		if (/^channel divinity/i.test(name) || /\byour channel divinity\b|use (?:your|this class's) channel divinity/.test(t)) return "channel divinity";
		if ((m = t.match(/\b(?:spend|expend) (\d+) (ki|focus|sorcery) points?\b/))) return `${m[2]} points`;
		if (/expend (?:one|a) superiority die/.test(t)) return "superiority dice";
		return null;
	}
	const costOf0 = text => { const m = text.toLowerCase().match(/\b(?:spend|expend) (\d+(?:\s*(?:or more|to \d+))?) (ki|focus|sorcery) points?\b/); return m ? `${m[1]} ${CS.cap(m[2])} Point${m[1] === "1" ? "" : "s"}` : null; };

	const costOf = text => costOf0(text) || (/expend (?:one|a) superiority die/i.test(text) ? "1 Superiority Die" : null);

	/* ---------------- sources ---------------- */

	function sources (char, calc) {
		const out = [];
		const lvl = calc.level;
		const columnFor = ce => label => {
			if (!ce) return null;
			const want = String(label).toLowerCase().replace(/ uses$/, "");
			for (const g of R().tableGroups(ce)) {
				const labels = (g.colLabels || []).map(l => strip(l).toLowerCase());
				let i = labels.findIndex(l => l === want || l === `${want}s` || l.replace(/s$/, "") === want);
				if (i < 0) continue;
				const row = (g.rows || [])[ce.level - 1];
				const v = row?.[i];
				const n = typeof v === "number" ? v : v?.value ?? (typeof v === "string" ? Number(strip(v).replace(/[^\d]/g, "")) : null);
				return Number.isFinite(n) && n > 0 ? n : null;
			}
			return null;
		};
		for (const f of calc.features) {
			const ce = calc.classes.find(x => x.cls.name === f.cls);
			const tag = f.kind === "subclass"
				? `{@subclassFeature ${f.name}|${ce.cls.name}|${ce.cls.source}|${ce.sc.shortName}|${ce.sc.source}|${f.level}|${f.source}}`
				: `{@classFeature ${f.name}|${ce.cls.name}|${ce.cls.source}|${f.level}|${f.source}}`;
			out.push({name: f.name, entries: f.entries, origin: `${f.cls} ${f.level}`, tag, ce, clsLevel: ce.level, group: "class"});
		}
		for (const e of (calc.race?.entries || []).filter(e => e?.name)) out.push({name: e.name, entries: e.entries || [], origin: calc.race.displayName || "Species", group: "species"});
		for (const f of calc.feats) out.push({name: f.feat.name, entries: f.feat.entries || [], origin: "Feat", tag: `{@feat ${f.feat.name}|${f.feat.source}}`, group: "feat", feat: f.feat});
		for (const o of calc.optfeatures) {
			const ce = calc.classes.find(x => (o.group || "").includes(x.cls.name)) || null;
			out.push({name: o.of.name, entries: o.of.entries || [], origin: o.group || "Option", tag: `{@optfeature ${o.of.name}|${o.of.source}}`, ce, clsLevel: ce?.level, group: "option"});
		}
		return out.map(s => ({...s, column: columnFor(s.ce), level: lvl}));
	}

	/** all actions / limited-use features of a character */
	A.list = (char, calc) => {
		const out = [];
		const seen = new Set();
		const add = (src, name, ents, parent) => {
			const text = ownText(ents);
			if (!text) return null;
			const ctx = {pb: calc.pb, scores: calc.scores, level: calc.level, clsLevel: src.clsLevel, column: src.column, name: parent && !activation(text) ? parent.name : name};
			const kind = activation(text);
			const uses = usesOf(text, ctx);
			const share = shareOf(text, name) || (parent && /^channel divinity/i.test(parent.name) ? "channel divinity" : null);
			// a sub-section without its own activation ("Number of Uses", "Regaining Uses") belongs to its feature
			if (parent && !kind && out.includes(parent) && !/^channel divinity/i.test(name)) {
				if (uses) { if (!parent.uses || uses.max === parent.uses.max) parent.uses = uses; else if (uses.reset) parent.uses.reset = uses.reset; }
				return null;
			}
			if (!kind && !uses && !share) return null;
			const id = `${src.group}:${src.ce?.cls.name || src.origin}:${name}`.toLowerCase();
			if (seen.has(id)) return null;
			seen.add(id);
			const a = {id, name, kind: kind || "other", uses, share, cost: costOf(text), origin: src.origin, group: src.group, tag: parent ? null : src.tag, entries: ents, parentName: parent?.name || null};
			out.push(a);
			return a;
		};
		for (const s0 of sources(char, calc)) {
			const s = {...s0, entries: deref(s0.entries)};
			if (/^(ability score improvement|spellcasting|pact magic|epic boon|proficiencies|subclass)/i.test(s.name)) continue;
			const top = add(s, s.name, s.entries, null);
			const walkKids = (ents, parent, d) => {
				for (const ch of namedChildren(ents)) {
					const a = add(s, ch.name, ch.entries || [], parent);
					if (d < 2) walkKids(ch.entries || [], a || parent, d + 1);
				}
			};
			walkKids(s.entries, top || {name: s.name}, 0);
		}
		// "you regain all expended uses of Bardic Inspiration when you finish a short or long rest" (Font of Inspiration...)
		for (const s of sources(char, calc)) {
			const m = fullText(s.entries).toLowerCase().match(/regain all (?:of )?(?:your )?expended uses of ([\w' ]+?) when you finish a short or long rest/);
			const tgt = m && out.find(o => o.uses && o.name.toLowerCase() === m[1].trim());
			if (tgt) tgt.uses.reset = "short";
		}
		// shared pools: Wild Shape, Channel Divinity, Ki / Focus / Sorcery points
		for (const a of out) {
			if (!a.share) continue;
			const pool = out.find(o => o !== a && o.uses && (o.name.toLowerCase() === a.share || o.name.toLowerCase().replace(/^channel divinity.*/, "channel divinity") === a.share
				|| (/points$/.test(a.share) && new RegExp(`^(${a.share.split(" ")[0]}|monk's focus|font of magic)`, "i").test(o.name))));
			if (pool) { a.pool = pool.id; a.poolName = pool.name; if (!a.uses || a.uses.max === pool.uses.max) a.uses = null; }
		}
		return out;
	};

	/** expended uses after a rest */
	A.rest = (char, calc, type) => {
		const used = char.tracking.uses || (char.tracking.uses = {});
		for (const a of A.list(char, calc)) {
			if (!a.uses || !used[a.id]) continue;
			if (type === "long" || a.uses.reset === "short") used[a.id] = 0;
			else if (a.uses.reset === "short1") used[a.id] = Math.max(0, used[a.id] - 1);
		}
	};

	/* ---------------- passive modifiers ---------------- */

	const COND_SKIP = /\buntil\b|for 1 minute|for 10 minutes|for the rest of|this turn|while (?:you(?:'re| are) )?raging|in your rage|when you\b|whenever|as long as you|during|\bif you\b|for the duration|\bwhile (?:in|you are in|you're in) (?:your|a|an)\b|transform/;

	A.applyMods = (char, calc) => {
		const srcs = sources(char, calc);
		const ABN = Object.fromEntries(CS.ABIL.map(a => [CS.ABIL_FULL[a].toLowerCase(), a]));
		const armor = (char.inventory || []).find(i => i.equipped && ["LA", "MA", "HA"].includes(R().typeCode(i.snap?.type)));
		const shield = (char.inventory || []).find(i => i.equipped && R().typeCode(i.snap?.type) === "S");
		calc.initParts = calc.initParts || [];
		calc.speedParts = calc.speedParts || [];
		let half = 0; let halfSrc = null; const halfFrom = new Set();
		const doneSent = new Set();
		for (const s of srcs) {
			const isAlert = s.group === "feat" && /^alert$/i.test(s.name);
			const text = fullText(deref(s.entries));
			const lt = text.toLowerCase();
			const sentences = lt.split(/(?<=[.!?])\s+/);
			for (const se of sentences) {
				if (doneSent.has(se)) continue;
				doneSent.add(se);
				// initiative
				if (/initiative/.test(se) && !isAlert && !/advantage|\bif\b|\bwhen\b|creature|allies|ally/.test(se.replace(/when you roll initiative/, ""))) {
					let m; let v = null; let what = null;
					if (/add (?:your )?proficiency bonus to (?:your |the )?(?:initiative|roll)/.test(se)) { v = calc.pb; what = "PB"; }
					else if ((m = se.match(/add (?:your )?(\w+) modifier to (?:your |the )?(?:initiative|roll)/)) && ABN[m[1]]) { v = calc.scores[ABN[m[1]]].mod; what = CS.ABIL_SHORT[ABN[m[1]]]; }
					else if ((m = se.match(/\+(\d+) bonus to (?:your )?initiative/))) { v = Number(m[1]); what = `+${m[1]}`; }
					else if ((m = se.match(/bonus to your initiative(?: rolls)? equal to your (\w+) modifier/)) && ABN[m[1]]) { v = calc.scores[ABN[m[1]]].mod; what = CS.ABIL_SHORT[ABN[m[1]]]; }
					if (v) { calc.initiative += v; calc.initParts.push(`${s.name} ${CS.fmtMod(v)}`); }
				}
				// half proficiency to checks (Jack of All Trades, Remarkable Athlete)
				if (/half (?:your|of your) proficiency bonus/.test(se) && /ability check|\bcheck\b/.test(se)) {
					const up = /round(?:ed)? up/.test(se);
					const v = up ? Math.ceil(calc.pb / 2) : Math.floor(calc.pb / 2);
					const abils = /strength, dexterity, or constitution/.test(se) ? ["str", "dex", "con"] : CS.ABIL;
					const skillOnly = /skill proficiency you lack|uses a skill/.test(se);
					if (v > half) { half = v; halfSrc = s.name; halfFrom.clear(); abils.forEach(a => halfFrom.add(a)); if (skillOnly) halfFrom.add("skillOnly"); }
				}
				// speed
				let m;
				if ((m = se.match(/your (?:walking )?speed increases by (\d+) feet/)) && !COND_SKIP.test(se)) {
					let ok = true;
					if (/aren't wearing (?:any )?armor|not wearing armor|no armor/.test(se) && armor) ok = false;
					if (/heavy armor/.test(se) && armor && R().typeCode(armor.snap?.type) === "HA") ok = false;
					if (/shield/.test(se) && shield) ok = false;
					let v = Number(m[1]);
					const col = s.column?.(s.name);
					if (col && /increases when you reach|as shown in|column/.test(lt)) { const g = colSpeed(s); if (g) v = g; }
					if (ok && v) { calc.speed.walk += v; calc.speedParts.push(`${s.name} +${v} ft.`); }
				}
				// armor class
				if ((m = se.match(/\+(\d) bonus to (?:your )?(?:ac|armor class)\b/)) && !/\bwhen\b|\bif\b|\buntil\b|reaction|wielding|dual|two weapons|spell|shield spell|target|creature|ally/.test(se)) {
					let ok = true;
					if (/while you(?:'re| are) wearing (?:light |medium |heavy )?armor/.test(se)) ok = !!armor;
					if (ok) { calc.ac.value += Number(m[1]); calc.ac.parts.push(s.name); }
				}
				// passive perception / investigation
				if ((m = se.match(/\+(\d+) bonus to your passive wisdom \(perception\)/))) {
					calc.passive.perception += Number(m[1]);
					if (/intelligence \(investigation\)/.test(se)) calc.passive.investigation += Number(m[1]);
				}
			}
			// Aura of Protection: the paladin adds Charisma to their own saves
			if (s.group === "class" && /^aura of protection$/i.test(s.name)) {
				const v = Math.max(1, calc.scores.cha.mod);
				for (const a of CS.ABIL) calc.saves[a].value += v;
				calc.saveParts = [...(calc.saveParts || []), `Aura of Protection ${CS.fmtMod(v)}`];
			}
		}
		if (half) {
			for (const s of calc.skills) if (!s.prof && halfFrom.has(s.abil)) { s.value += half; s.half = halfSrc; }
			if (!halfFrom.has("skillOnly") && halfFrom.has("dex")) { calc.initiative += half; calc.initParts.push(`${halfSrc} +${half}`); }
			for (const k of ["perception", "investigation", "insight"]) if (calc.skills.find(x => x.key === k).half) calc.passive[k] += half;
		}
	};
	function colSpeed (s) {
		if (!s.ce) return null;
		for (const g of R().tableGroups(s.ce)) {
			const i = (g.colLabels || []).findIndex(l => strip(l).toLowerCase() === s.name.toLowerCase());
			if (i < 0) continue;
			const v = g.rows?.[s.ce.level - 1]?.[i];
			if (v?.type === "bonusSpeed") return v.value;
			const n = Number(strip(String(v ?? "")).replace(/[^\d]/g, ""));
			return n || null;
		}
		return null;
	}
})();
