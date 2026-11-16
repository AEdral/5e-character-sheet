/* Dice rolls from the sheet: sent to Roll20 when a Roll20 game is open, otherwise rolled with the 5etools dice roller.
 * Shift-click = advantage, Ctrl/Alt-click = disadvantage. */
(function () {
	const CS = globalThis.CS5E;
	const fmt = n => (n ? CS.fmtMod(n) : "");

	CS.roll = async ({title, rolls, desc}, evt) => {
		const charName = CS.app?.st?.char?.name || "Character";
		const adv = evt?.shiftKey ? 1 : (evt?.ctrlKey || evt?.altKey || evt?.metaKey) ? -1 : 0;
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

	/** first damage expression in a spell's text, e.g. {@damage 8d6} */
	CS.spellDamage = sp => {
		const txt = JSON.stringify(sp.entries || []);
		const m = txt.match(/\{@damage ([^}|]+)/);
		return m ? m[1].trim() : null;
	};
})();
