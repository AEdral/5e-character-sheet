/* Dice rolls from the sheet: sent to Roll20 when a Roll20 game is open, otherwise rolled with the 5etools dice roller.
 * Shift-click = advantage, Ctrl/Alt-click = disadvantage. */
(function () {
	const CS = globalThis.CS5E;
	const fmt = n => (n ? CS.fmtMod(n) : "");

	CS.roll = async (spec, evt, opts = {}) => {
		const {title, rolls, desc} = spec;
		const charName = CS.app?.st?.char?.name || "Character";
		const adv = opts.adv != null ? opts.adv : evt?.shiftKey ? 1 : (evt?.ctrlKey || evt?.altKey || evt?.metaKey) ? -1 : 0;
		const list = rolls.map(r => r.d20 != null
			? {label: r.label + (adv > 0 ? " (adv.)" : adv < 0 ? " (dis.)" : ""), formula: adv ? `2d20${adv > 0 ? "kh1" : "kl1"}${fmt(r.d20)}` : `1d20${fmt(r.d20)}`}
			: r);
		if (CS.data.settings.roll20 !== false) {
			try {
				const style = CS.data.settings.roll20Style || "5e";
				const texts = spec.spell && !list.length ? [spellCardText(spec.spell, charName, style)] : style === "default" ? null : CS.roll20Texts({...spec, rolls: list}, adv, charName);
				const res = await CS.store.roll20({charName, title, rolls: list, desc, texts, style});
				if (res?.sent) { CS.app?.toast?.(`Rolled in Roll20: ${title}`); return; }
			} catch (e) { /* no Roll20: roll here */ }
		}
		if (!list.length && spec.spell) { CS.app?.toast?.("Open a Roll20 game to post the spell card in its chat."); return; }
		for (const r of list) {
			const label = list.length > 1 ? `${title} — ${r.label}` : title;
			try {
				if (globalThis.Renderer?.dice?.pRoll2) { await globalThis.Renderer.dice.pRoll2(r.formula, {name: charName, label}); continue; }
			} catch (e) { /* fallback */ }
			CS.app?.toast?.(`${label}: ${localRoll(r.formula)}`);
		}
	};

	function localRoll (f) {
		let total = 0;
		const m = String(f).replace(/\s/g, "").match(/[+-]?[^+-]+/g) || [];
		for (const part of m) {
			const sign = part.startsWith("-") ? -1 : 1;
			const p = part.replace(/^[+-]/, "");
			const d = p.match(/^(\d*)d(\d+)(k[hl]1)?$/);
			if (d) {
				const rolls = Array.from({length: Number(d[1] || 1)}, () => 1 + Math.floor(Math.random() * Number(d[2])));
				total += sign * (d[3] === "kh1" ? Math.max(...rolls) : d[3] === "kl1" ? Math.min(...rolls) : rolls.reduce((a, b) => a + b, 0));
			} else total += sign * (Number(p) || 0);
		}
		return total;
	}

	/* ---------------- roll specs for attacks and spells (damage types + riders) ---------------- */

	const ridersFor = (calc, kind, item, enabled) => (calc.riders || []).filter(r => {
		if (r.conditional && !(enabled ? enabled.has(r.name) : r.defaultOn)) return false;
		if (kind === "spell") return r.target === "spell" ? (!r.match || r.match(item)) : r.target === "any-attack" ? (item.spellAttack || []).length > 0 : false;
		if (r.target === "weapon" || r.target === "any-attack") return !r.match || r.match(item);
		if (r.target === "melee") return !item.ranged && (!r.match || r.match(item));
		if (r.target === "ranged") return item.ranged && (!r.match || r.match(item));
		return false;
	});
	CS.conditionalRiders = (calc, kind, item) => (calc.riders || []).filter(r => r.conditional && ridersFor({riders: [{...r, conditional: false}]}, kind, item, null).length);

	const lbl = type => `Damage${type ? ` (${type})` : ""}`;
	const join = (f, b) => `${f}${b || ""}`.replace(/\s/g, "");

	CS.weaponRollSpec = (a, calc, enabled = null) => {
		const rs = ridersFor(calc, "weapon", a, enabled);
		const hit = a.atkBonus + rs.reduce((n, r) => n + (r.hit || 0), 0);
		const bonus = rs.filter(r => r.bonus).map(r => r.bonus).join("");
		const base = a.damage === "\u2014" ? null : join(a.damage, bonus);
		const rolls = [{label: "To Hit", d20: hit}];
		if (base) rolls.push({label: lbl(a.dmgType), formula: base});
		if (a.versatile) rolls.push({label: `Two-handed${a.dmgType ? ` (${a.dmgType})` : ""}`, formula: join(a.versatile, bonus)});
		for (const r of rs.filter(r => r.formula)) rolls.push({label: `${r.name}${r.type ? ` (${r.type})` : ""}`, formula: r.formula});
		const notes = [...a.props, ...a.mastery.map(m => `Mastery: ${m}`), ...rs.map(r => r.name + (r.note ? ` (${r.note})` : ""))];
		return {title: a.name, rolls, desc: notes.join(", "), meta: {range: a.range, kind: a.ranged ? "Ranged Weapon Attack" : "Melee Weapon Attack"}};
	};

	CS.spellRollSpec = (sp, pc, calc, enabled = null) => {
		const lvl = calc.level;
		const parts = CS.rules.spellDamage(sp, lvl);
		const rs = ridersFor(calc, "spell", sp, enabled);
		const beams = CS.rules.spellBeams(sp, lvl);
		const atk = (sp.spellAttack || []).length;
		const perBeam = rs.filter(r => r.bonus && r.perBeam).map(r => r.bonus).join("");
		const onceB = rs.filter(r => r.bonus && !r.perBeam).map(r => r.bonus).join("");
		const rolls = [];
		for (let b = 1; b <= beams; b++) {
			const pre = beams > 1 ? `Beam ${b} \u2013 ` : "";
			if (atk) rolls.push({label: `${pre}${beams > 1 ? "To Hit" : "Spell Attack"}`, d20: pc?.attack ?? 0});
			parts.forEach((p, i) => rolls.push({label: `${pre}${lbl(p.type)}`, formula: join(p.formula, perBeam + (b === 1 && i === 0 ? onceB : ""))}));
			if (beams > 1) for (const r of rs.filter(r => r.formula && r.perHit)) rolls.push({label: `${pre}${r.name}${r.type ? ` (${r.type})` : ""}`, formula: r.formula});
		}
		for (const r of rs.filter(r => r.formula && !(beams > 1 && r.perHit))) rolls.push({label: `${r.name}${r.type ? ` (${r.type})` : ""}`, formula: r.formula});
		const save = (sp.savingThrow || [])[0];
		const notes = [save ? `${CS.cap(save)} save DC ${pc?.dc ?? ""}` : null, ...rs.map(r => r.name + (r.note ? ` (${r.note})` : ""))].filter(Boolean);
		return rolls.length ? {title: sp.name, rolls, desc: notes.join(", "), meta: {range: spRange(sp), save: save ? {attr: CS.cap(save), dc: pc?.dc} : null, spell: sp, levelText: spLevelText(sp), beams}} : null;
	};

	const P = () => globalThis.Parser;
	function spRange (sp) { try { return P().spRangeToFull(sp.range); } catch (e) { return sp.range?.distance?.amount ? `${sp.range.distance.amount} ${sp.range.distance.type}` : ""; } }
	function spLevelText (sp) {
		const school = CS.SCHOOL[sp.school] || sp.school || "";
		return sp.level ? `${CS.ordinal(sp.level)}-level ${school.toLowerCase()}` : `${school} cantrip`;
	}

	/** a spell's card for the Roll20 chat (no dice) */
	CS.spellCardSpec = (sp, pc) => ({title: sp.name, rolls: [], spell: sp, pc, desc: ""});

	/* ---------------- Roll20 chat cards (roll templates of the "D&D 5E by Roll20" sheet) ---------------- */

	const plain = s => String(s ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\{@\w+\s*([^|}]*)[^}]*\}/g, "$1").replace(/[{}]/g, "").replace(/\|/g, "/").replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
	const entriesText = (ents, max = 900) => {
		const out = [];
		const walk = e => {
			if (e == null) return;
			if (typeof e === "string") { out.push(e); return; }
			if (Array.isArray(e)) { e.forEach(walk); return; }
			if (e.type === "table") return;
			if (e.name && e.type !== "entries") out.push(`${e.name}.`);
			if (e.entries) walk(e.entries);
			if (e.items) walk(e.items);
			if (e.entry) walk(e.entry);
		};
		walk(ents);
		let t = plain(out.join(" "));
		if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, "") + "\u2026";
		return t;
	};
	const fld = (k, v) => (v == null || v === "" || v === false ? "" : ` {{${k}=${v === true ? 1 : v}}}`);
	const inl = f => `[[${String(f).replace(/[^\dd+\-*/()khl ]/gi, "")}]]`;
	const diceOnly = f => (String(f).replace(/\s/g, "").match(/[+-]?\d*d\d+/gi) || []).join("").replace(/^\+/, "");
	const typeOf = label => (String(label).match(/\(([^)]+)\)\s*$/) || [])[1] || "";
	const nameOf = label => String(label).replace(/^Beam \d+ \u2013 /, "").replace(/\s*\([^)]*\)\s*$/, "");

	function spellCardText (sp, charName, style = "5e") {
		const comp = sp.components || {};
		const m = comp.m ? (typeof comp.m === "string" ? comp.m : comp.m.text || "") : "";
		let time = ""; let dur = "";
		try { time = P().spTimeListToFull(sp.time); } catch (e) { time = (sp.time || []).map(t => `${t.number} ${t.unit}`).join(", "); }
		try { dur = P().spDurationToFull(sp.duration); } catch (e) { dur = ""; }
		const higher = (sp.entriesHigherLevel || []).length ? entriesText(sp.entriesHigherLevel.map(e => e.entries || e), 400) : "";
		if (style === "default") {
			const compTxt = [comp.v ? "V" : "", comp.s ? "S" : "", comp.m ? `M (${plain(m)})` : ""].filter(Boolean).join(", ");
			return `&{template:default}{{name=${plain(charName)}: ${plain(sp.name)}}}${fld("Level", spLevelText(sp))}${fld("Casting Time", plain(time))}${fld("Range", plain(spRange(sp)))}`
				+ `${fld("Components", compTxt)}${fld("Duration", plain(dur))}${fld("Description", entriesText(sp.entries, 600))}${fld("At Higher Levels", higher)}`;
		}
		return `&{template:spell}${fld("level", spLevelText(sp))}${fld("name", plain(sp.name))}${fld("castingtime", plain(time))}${fld("range", plain(spRange(sp)))}`
			+ `${fld("v", !!comp.v)}${fld("s", !!comp.s)}${fld("m", !!comp.m)}${fld("material", plain(m))}${fld("duration", plain(dur))}`
			+ `${fld("concentration", (sp.duration || []).some(d => d.concentration))}${fld("ritual", !!sp.meta?.ritual)}`
			+ `${fld("description", entriesText(sp.entries))}${fld("athigherlevels", higher)}${fld("charname", plain(charName))}`;
	}

	/** chat messages for a roll: ability checks/saves as "simple", attacks and damage as "atkdmg", spells as "spell" cards */
	CS.roll20Texts = (spec, adv, charName) => {
		const cn = fld("charname", plain(charName));
		const flag = adv > 0 ? fld("advantage", 1) : adv < 0 ? fld("disadvantage", 1) : fld("normal", 1);
		if (spec.spell && !spec.rolls.length) return [spellCardText(spec.spell, charName)];
		const d20s = spec.rolls.filter(r => r.d20 != null || /^[12]d20/.test(r.formula || ""));
		const dmgs = spec.rolls.filter(r => !d20s.includes(r));
		// a single d20 roll: check, save, skill, initiative
		if (d20s.length === 1 && !dmgs.length) {
			const r = spec.rolls[0];
			const mod = Number((String(r.formula).match(/[+-]\d+$/) || [0])[0]);
			const base = `1d20${mod ? CS.fmtMod(mod) : ""}`;
			if (/^Initiative$/i.test(spec.title)) {
				const f = adv ? `${adv > 0 ? "2d20kh1" : "2d20kl1"}${mod ? CS.fmtMod(mod) : ""}` : base;
				return [`&{template:simple}${fld("rname", "Initiative")}${fld("mod", CS.fmtMod(mod))}{{r1=[[${f.replace(/[^\dd+\-khl]/gi, "")} &{tracker}]]}}${fld("normal", 1)}${cn}`];
			}
			return [`&{template:simple}${fld("rname", plain(spec.title))}${fld("mod", CS.fmtMod(mod))}{{r1=${inl(base)}}}${flag}{{r2=${inl(base)}}}${cn}`];
		}
		// attacks and damage: one card per attack roll (Eldritch Blast beams...), or one damage card
		const groups = [];
		let cur = null;
		for (const r of spec.rolls) {
			if (d20s.includes(r)) { cur = {atk: r, dmg: []}; groups.push(cur); } else { if (!cur) { cur = {atk: null, dmg: []}; groups.push(cur); } cur.dmg.push(r); }
		}
		// once-per-turn riders of multi-beam spells go on the first card
		if (groups.length > 1) {
			const last = groups[groups.length - 1];
			const once = last.dmg.filter(r => !/^Beam \d+ /.test(r.label));
			if (once.length && last.dmg.some(r => /^Beam \d+ /.test(r.label))) { last.dmg = last.dmg.filter(r => !once.includes(r)); groups[0].dmg.push(...once); }
		}
		const meta = spec.meta || {};
		const out = [];
		groups.forEach((g, gi) => {
			let t = "&{template:atkdmg}";
			const title = plain(spec.title) + (groups.length > 1 ? ` (${gi + 1}/${groups.length})` : "");
			t += fld("rname", title);
			if (g.atk) {
				const mod = Number((String(g.atk.formula).match(/[+-]\d+$/) || [0])[0]);
				const base = `1d20${mod ? CS.fmtMod(mod) : ""}`;
				t += `${fld("mod", CS.fmtMod(mod))}{{r1=${inl(base)}}}${flag}{{r2=${inl(base)}}}${fld("attack", 1)}`;
			}
			t += fld("range", plain([meta.levelText, meta.range].filter(Boolean).join(" \u00b7 ") || meta.range || ""));
			const main = g.dmg.filter(r => !/^Two-handed/.test(nameOf(r.label)));
			const extra = g.dmg.filter(r => /^Two-handed/.test(nameOf(r.label)));
			const [d1, d2, ...rest] = main;
			const typeLbl = r => { const ty = typeOf(r.label); const nm = nameOf(r.label); return plain(/^Damage$/i.test(nm) ? ty : `${ty}${ty ? " " : ""}(${nm})`); };
			if (d1) { t += `${fld("damage", 1)}${fld("dmg1flag", 1)}{{dmg1=${inl(d1.formula)}}}${fld("dmg1type", typeLbl(d1))}`; if (g.atk && diceOnly(d1.formula)) t += `{{crit1=${inl(diceOnly(d1.formula))}}}`; }
			if (d2) { t += `${fld("dmg2flag", 1)}{{dmg2=${inl(d2.formula)}}}${fld("dmg2type", typeLbl(d2))}`; if (g.atk && diceOnly(d2.formula)) t += `{{crit2=${inl(diceOnly(d2.formula))}}}`; }
			if (g.atk && (d1 || d2)) t += fld("crit", 1);
			if (meta.save && gi === 0) t += `${fld("save", 1)}${fld("saveattr", meta.save.attr)}${fld("savedc", meta.save.dc)}`;
			const lines = [...rest, ...extra].map(r => `${plain(nameOf(r.label))}: ${inl(r.formula)} ${plain(typeOf(r.label))}`.trim());
			const notes = plain(String(spec.desc || "").replace(/\b\w+ save DC \d*,?\s*/i, "")).replace(/^,\s*/, "");
			const desc = [...lines, gi === 0 ? notes : ""].filter(Boolean).join(" \u2022 ");
			t += fld("desc", desc) + cn;
			out.push(t);
		});
		return out;
	};

	/** text summary of the damage of a roll spec, e.g. "1d10+4 force ×2" */
	CS.damageText = spec => {
		if (!spec) return "";
		const dm = spec.rolls.filter(r => r.formula && !/^Two-handed/.test(r.label));
		const uniq = [];
		for (const r of dm) {
			const t = (r.label.match(/\(([^)]+)\)$/) || [])[1] || "";
			const txt = `${r.formula}${t ? " " + t : ""}`;
			const ex = uniq.find(u => u.txt === txt);
			if (ex) ex.n++; else uniq.push({txt, n: 1});
		}
		return uniq.map(u => u.n > 1 ? `${u.txt} \u00d7${u.n}` : u.txt).join(" + ");
	};

	/* ---------------- right-click menu: advantage / disadvantage / optional riders ---------------- */

	let menuEl = null;
	const closeMenu = () => { menuEl?.remove(); menuEl = null; };
	document.addEventListener("mousedown", e => { if (menuEl && !menuEl.contains(e.target) && !menuEl._anchor?.contains(e.target)) closeMenu(); }, true);
	document.addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });

	/** a small drop-down menu under an element: items = [{label, sub, run}] */
	CS.dropMenu = (anchor, items) => {
		const wasOpen = menuEl?._anchor === anchor;
		closeMenu();
		if (wasOpen) return;
		const h = CS.h;
		menuEl = h("div", {class: "cs5e-menu ve-flex-col"}, items.map(x => h("button", {type: "button", class: "cs5e-menu__i", on: {click: () => { closeMenu(); x.run(); }}},
			h("div", null, x.label), x.sub ? h("div", {class: "ve-muted ve-small"}, x.sub) : null)));
		menuEl._anchor = anchor;
		document.body.append(menuEl);
		const r = anchor.getBoundingClientRect();
		const m = menuEl.getBoundingClientRect();
		menuEl.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - m.width - 8))}px`;
		menuEl.style.top = `${Math.min(r.bottom + 2, window.innerHeight - m.height - 8)}px`;
	};

	CS.rollMenu = (evt, specFn, conditional = [], extras = []) => {
		evt.preventDefault();
		closeMenu();
		const h = CS.h;
		const enabled = new Set(conditional.filter(r => r.defaultOn).map(r => r.name));
		const go = adv => { const spec = specFn(enabled); closeMenu(); if (spec) CS.roll(spec, null, {adv}); };
		menuEl = h("div", {class: "cs5e-menu ve-flex-col"},
			h("button", {type: "button", class: "cs5e-menu__i", on: {click: () => go(0)}}, "Roll"),
			h("button", {type: "button", class: "cs5e-menu__i", on: {click: () => go(1)}}, "Roll with Advantage"),
			h("button", {type: "button", class: "cs5e-menu__i", on: {click: () => go(-1)}}, "Roll with Disadvantage"),
			extras.length ? h("div", {class: "cs5e-menu__sep"}) : null,
			extras.map(x => h("button", {type: "button", class: "cs5e-menu__i", on: {click: () => { closeMenu(); x.run(); }}}, x.label)),
			conditional.length ? h("div", {class: "cs5e-menu__sep"}) : null,
			conditional.map(r => h("label", {class: "cs5e-menu__chk"}, h("input", {type: "checkbox", checked: enabled.has(r.name), on: {change: e => { if (e.target.checked) enabled.add(r.name); else enabled.delete(r.name); }}}),
				` ${r.name}${r.formula ? ` (+${r.formula}${r.type ? " " + r.type : ""})` : ""}`, r.note ? h("span", {class: "ve-muted ve-small"}, ` \u2014 ${r.note}`) : null)));
		document.body.append(menuEl);
		const {innerWidth: W, innerHeight: H} = window;
		const rect = menuEl.getBoundingClientRect();
		menuEl.style.left = `${Math.min(evt.clientX, W - rect.width - 8)}px`;
		menuEl.style.top = `${Math.min(evt.clientY, H - rect.height - 8)}px`;
	};

	/** attributes to make an element rollable: click = roll (Shift adv, Ctrl dis), right click = menu */
	CS.rollable = (specFn, conditional = [], title = "Click to roll \u00b7 right-click for advantage/disadvantage", extras = []) => ({
		class: "cs5e-roll", title,
		on: {
			click: e => { if (e.target.closest("a, input, button")) return; const s = specFn(null); if (s) CS.roll(s, e); },
			contextmenu: e => { if (e.target.closest("a")) return; CS.rollMenu(e, en => specFn(en), conditional, extras); },
		},
	});

	/** first damage expression in a spell's text, e.g. {@damage 8d6} */
	CS.spellDamage = sp => {
		const txt = JSON.stringify(sp.entries || []);
		const m = txt.match(/\{@damage ([^}|]+)/);
		return m ? m[1].trim() : null;
	};
})();
