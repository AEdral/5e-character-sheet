/* Dice rolls from the sheet: sent to Roll20 when a Roll20 game is open, otherwise rolled with the 5etools dice roller.
 * Shift-click = advantage, Ctrl/Alt-click = disadvantage. */
(function () {
	const CS = globalThis.CS5E;
	const fmt = n => (n ? CS.fmtMod(n) : "");

	CS.roll = async ({title, rolls, desc}, evt, opts = {}) => {
		const charName = CS.app?.st?.char?.name || "Character";
		const adv = opts.adv != null ? opts.adv : evt?.shiftKey ? 1 : (evt?.ctrlKey || evt?.altKey || evt?.metaKey) ? -1 : 0;
		const list = rolls.map(r => r.d20 != null
			? {label: r.label + (adv > 0 ? " (adv.)" : adv < 0 ? " (dis.)" : ""), formula: adv ? `2d20${adv > 0 ? "kh1" : "kl1"}${fmt(r.d20)}` : `1d20${fmt(r.d20)}`}
			: r);
		if (CS.data.settings.roll20 !== false) {
			try {
				const res = await CS.store.roll20({charName, title, rolls: list, desc});
				if (res?.sent) { CS.app?.toast?.(`Rolled in Roll20: ${title}`); return; }
			} catch (e) { /* no Roll20: roll here */ }
		}
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
		return {title: a.name, rolls, desc: notes.join(", ")};
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
		return rolls.length ? {title: sp.name, rolls, desc: notes.join(", ")} : null;
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
	document.addEventListener("mousedown", e => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }, true);
	document.addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });

	CS.rollMenu = (evt, specFn, conditional = []) => {
		evt.preventDefault();
		closeMenu();
		const h = CS.h;
		const enabled = new Set(conditional.filter(r => r.defaultOn).map(r => r.name));
		const go = adv => { const spec = specFn(enabled); closeMenu(); if (spec) CS.roll(spec, null, {adv}); };
		menuEl = h("div", {class: "cs5e-menu ve-flex-col"},
			h("button", {type: "button", class: "cs5e-menu__i", on: {click: () => go(0)}}, "Roll"),
			h("button", {type: "button", class: "cs5e-menu__i", on: {click: () => go(1)}}, "Roll with Advantage"),
			h("button", {type: "button", class: "cs5e-menu__i", on: {click: () => go(-1)}}, "Roll with Disadvantage"),
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
	CS.rollable = (specFn, conditional = [], title = "Click to roll \u00b7 right-click for advantage/disadvantage") => ({
		class: "cs5e-roll", title,
		on: {
			click: e => { if (e.target.closest("a, input, button")) return; const s = specFn(null); if (s) CS.roll(s, e); },
			contextmenu: e => { if (e.target.closest("a")) return; CS.rollMenu(e, en => specFn(en), conditional); },
		},
	});

	/** first damage expression in a spell's text, e.g. {@damage 8d6} */
	CS.spellDamage = sp => {
		const txt = JSON.stringify(sp.entries || []);
		const m = txt.match(/\{@damage ([^}|]+)/);
		return m ? m[1].trim() : null;
	};
})();
