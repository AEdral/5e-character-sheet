/* Shared utilities. Every module lives in the globalThis.CS5E namespace (page "MAIN" world). */
(function () {
	const CS = (globalThis.CS5E = globalThis.CS5E || {});

	CS.ABIL = ["str", "dex", "con", "int", "wis", "cha"];
	CS.ABIL_FULL = {str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma"};
	CS.ABIL_SHORT = {str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA"};

	CS.SKILLS = [
		["acrobatics", "dex"], ["animal handling", "wis"], ["arcana", "int"], ["athletics", "str"],
		["deception", "cha"], ["history", "int"], ["insight", "wis"], ["intimidation", "cha"],
		["investigation", "int"], ["medicine", "wis"], ["nature", "int"], ["perception", "wis"],
		["performance", "cha"], ["persuasion", "cha"], ["religion", "int"], ["sleight of hand", "dex"],
		["stealth", "dex"], ["survival", "wis"],
	].map(([key, abil]) => ({key, abil, name: key.replace(/\b\w/g, c => c.toUpperCase()).replace(/ Of /g, " of ")}));
	CS.SKILL_BY_KEY = Object.fromEntries(CS.SKILLS.map(s => [s.key, s]));

	CS.ALIGNMENTS = ["", "Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "True Neutral", "Chaotic Neutral", "Lawful Evil", "Neutral Evil", "Chaotic Evil", "Unaligned"];
	CS.SIZE = {T: "Tiny", S: "Small", M: "Medium", L: "Large", H: "Huge", G: "Gargantuan", V: "Varies"};
	CS.SCHOOL = {A: "Abjuration", C: "Conjuration", D: "Divination", E: "Enchantment", V: "Evocation", I: "Illusion", N: "Necromancy", T: "Transmutation", P: "Psionic"};
	CS.DMG = {A: "acid", B: "bludgeoning", C: "cold", F: "fire", O: "force", L: "lightning", N: "necrotic", P: "piercing", I: "poison", Y: "psychic", R: "radiant", S: "slashing", T: "thunder"};

	CS.DMG_TYPES = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
	CS.mod = score => Math.floor((Number(score || 0) - 10) / 2);
	CS.fmtMod = n => (n >= 0 ? "+" : "") + n;
	CS.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
	CS.clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
	CS.esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
	CS.cap = s => String(s || "").replace(/(^|[\s(\-/])(\w)/g, (m, a, c) => a + c.toUpperCase());
	CS.key = (name, source) => `${String(name || "").toLowerCase()}|${String(source || "").toLowerCase()}`;
	CS.ordinal = n => {
		n = Number(n);
		const s = ["th", "st", "nd", "rd"]; const v = n % 100;
		return n + (s[(v - 20) % 10] || s[v] || s[0]);
	};
	CS.levelName = l => (Number(l) === 0 ? "Cantrip" : `${CS.ordinal(l)} level`);
	CS.plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

	CS.debounce = (fn, ms) => {
		let t;
		const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
		d.flush = (...a) => { clearTimeout(t); fn(...a); };
		return d;
	};

	/** Create a DOM element. attrs: {class, style, on:{click}, html, ...}; children: nodes or strings */
	CS.h = (tag, attrs, ...children) => {
		const el = document.createElement(tag);
		if (attrs) {
			for (const [k, v] of Object.entries(attrs)) {
				if (v == null || v === false) continue;
				if (k === "on") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
				else if (k === "class") el.className = v;
				else if (k === "html") el.innerHTML = v;
				else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
				else if (k === "value") el.value = v;
				else if (k === "checked") el.checked = !!v;
				else if (k === "selected") el.selected = !!v;
				else if (k === "disabled") el.disabled = !!v;
				else el.setAttribute(k, v === true ? "" : v);
			}
		}
		for (const c of children.flat(Infinity)) {
			if (c == null || c === false) continue;
			el.append(c instanceof Node ? c : document.createTextNode(String(c)));
		}
		return el;
	};

	CS.skillName = k => CS.SKILL_BY_KEY[k]?.name || CS.cap(k);

	/** Source display helpers (use the site's Parser when available) */
	const brewSrc = s => CS.data?.brewSources?.get(String(s).toLowerCase());
	CS.srcAbv = s => { try { const v = globalThis.Parser?.sourceJsonToAbv?.(s); return (v && v !== s) ? v : (brewSrc(s)?.abbreviation || v || s); } catch (e) { return s; } };
	CS.srcFull = s => { try { const v = globalThis.Parser?.sourceJsonToFull?.(s); return (v && v !== s) ? v : (brewSrc(s)?.full || v || s); } catch (e) { return s; } };
	CS.srcClass = s => { try { return globalThis.Parser?.sourceJsonToSourceClassname?.(s) || `ve-source__${s}`; } catch (e) { return `ve-source__${s}`; } };
})();
