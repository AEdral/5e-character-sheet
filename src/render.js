/* Renderer del formato "entries" e dei tag {@...} di 5etools */
(function () {
	const CS = globalThis.CS5E;
	const esc = CS.esc;

	const TAG_PAGE = {
		spell: ["spells.html", "PHB"], item: ["items.html", "PHB"], feat: ["feats.html", "PHB"],
		race: ["races.html", "PHB"], background: ["backgrounds.html", "PHB"], condition: ["conditionsdiseases.html", "PHB"],
		disease: ["conditionsdiseases.html", "DMG"], status: ["conditionsdiseases.html", "PHB"], creature: ["bestiary.html", "MM"],
		class: ["classes.html", "PHB"], optfeature: ["optionalfeatures.html", "PHB"], action: ["actions.html", "PHB"],
		sense: ["senses.html", "PHB"], skill: ["skills.html", "PHB"], language: ["languages.html", "PHB"],
		variantrule: ["variantrules.html", "DMG"], deity: ["deities.html", "PHB"], reward: ["rewards.html", "DMG"],
		vehicle: ["vehicles.html", "GoS"], object: ["objects.html", "DMG"], trap: ["trapshazards.html", "DMG"],
		hazard: ["trapshazards.html", "DMG"], cult: ["cultsboons.html", "MTF"], boon: ["cultsboons.html", "MTF"],
		psionic: ["psionics.html", "UATheMysticClass"], table: ["tables.html", "DMG"], deck: ["decks.html", "DMG"],
		itemMastery: ["itemmastery.html", "XPHB"], facility: ["bastions.html", "XDMG"], recipe: ["recipes.html", "HF"],
	};

	const hashOf = (name, source) => encodeURIComponent(`${name}_${source}`.toLowerCase()).replace(/'/g, "%27");

	/** Divide al primo livello ignorando i "|" dentro tag annidati */
	function splitTop (s, sep = "|") {
		const out = []; let depth = 0; let cur = "";
		for (let i = 0; i < s.length; i++) {
			const c = s[i];
			if (c === "{") depth++;
			else if (c === "}") depth--;
			if (c === sep && depth === 0) { out.push(cur); cur = ""; } else cur += c;
		}
		out.push(cur);
		return out;
	}

	function renderTag (tag, text) {
		const parts = splitTop(text);
		const inner = s => renderStr(s ?? "");
		switch (tag) {
			case "b": case "bold": return `<b>${inner(text)}</b>`;
			case "i": case "italic": return `<i>${inner(text)}</i>`;
			case "u": case "underline": return `<u>${inner(text)}</u>`;
			case "s": case "strike": return `<s>${inner(text)}</s>`;
			case "sup": return `<sup>${inner(text)}</sup>`;
			case "sub": return `<sub>${inner(text)}</sub>`;
			case "code": return `<code>${inner(text)}</code>`;
			case "note": return `<i class="cs-note">${inner(text)}</i>`;
			case "color": return `<span style="color:#${esc(parts[1] || "").replace(/[^0-9a-f]/gi, "")}">${inner(parts[0])}</span>`;
			case "highlight": return `<mark>${inner(parts[0])}</mark>`;
			case "dice": case "damage": case "autodice": return `<span class="cs-dice">${inner(parts[1] || parts[0])}</span>`;
			case "d20": case "hit": {
				const n = Number(parts[0]);
				return `<span class="cs-dice">${parts[1] ? inner(parts[1]) : (isNaN(n) ? esc(parts[0]) : CS.fmtMod(n))}</span>`;
			}
			case "dc": return `DC ${inner(parts[1] || parts[0])}`;
			case "chance": return `${inner(parts[1] || parts[0] + "%")}`;
			case "recharge": return `(Recharge ${esc(parts[0] || "6")}${parts[0] && parts[0] !== "6" ? "–6" : ""})`;
			case "scaledamage": case "scaledice": return `<span class="cs-dice">${inner(parts[3] || parts[2] || parts[0])}</span>`;
			case "atk": case "atkr": return `<i>${esc({mw: "Melee Weapon Attack:", rw: "Ranged Weapon Attack:", "mw,rw": "Melee or Ranged Weapon Attack:", ms: "Melee Spell Attack:", rs: "Ranged Spell Attack:", m: "Melee Attack Roll:", r: "Ranged Attack Roll:"}[parts[0]] || "Attack:")}</i>`;
			case "h": return "<i>Hit:</i> ";
			case "m": return "<i>Miss:</i> ";
			case "hom": return "<i>Hit or Miss:</i> ";
			case "actSave": return `<i>${esc(CS.ABIL_FULL[parts[0]] || parts[0])} Saving Throw:</i>`;
			case "actSaveFail": return "<i>Failure:</i>";
			case "actSaveSuccess": return "<i>Success:</i>";
			case "link": return `<a href="${esc(parts[1] || parts[0])}" target="_blank" rel="noopener">${inner(parts[0])}</a>`;
			case "5etools": return `<a href="/${esc(parts[1] || "")}" target="_blank">${inner(parts[0])}</a>`;
			case "filter": return inner(parts[0]);
			case "book": case "adventure": return `<i>${inner(parts[0])}</i>`;
			case "classFeature": return `<b>${inner(parts[5] || parts[0])}</b>`;
			case "subclassFeature": return `<b>${inner(parts[7] || parts[0])}</b>`;
			case "area": return inner(parts[1] || parts[0]);
			case "quickref": return inner(parts[4] || parts[0]);
			case "footnote": return `<sup>${inner(parts[0])}</sup>`;
			case "loader": case "homebrew": return inner(parts[0]);
			case "coinflip": return "coin flip";
			default: {
				const display = parts.length >= 3 && parts[2] ? parts[2] : parts[0];
				const page = TAG_PAGE[tag];
				if (page) {
					const src = parts[1] || page[1];
					const href = `/${page[0]}#${hashOf(parts[0], src)}`;
					return `<a class="cs-ref" href="${esc(href)}" target="_blank" title="${esc(parts[0])} (${esc(src)})">${inner(display)}</a>`;
				}
				return inner(display);
			}
		}
	}

	/** Converte una stringa con tag {@...} in HTML sicuro */
	function renderStr (s) {
		s = String(s ?? "");
		let out = ""; let i = 0;
		while (i < s.length) {
			const start = s.indexOf("{@", i);
			if (start < 0) { out += esc(s.slice(i)); break; }
			out += esc(s.slice(i, start));
			let depth = 0; let end = -1;
			for (let j = start; j < s.length; j++) {
				if (s[j] === "{") depth++;
				else if (s[j] === "}") { depth--; if (depth === 0) { end = j; break; } }
			}
			if (end < 0) { out += esc(s.slice(start)); break; }
			const body = s.slice(start + 2, end);
			const sp = body.search(/\s/);
			const tag = sp < 0 ? body : body.slice(0, sp);
			const text = sp < 0 ? "" : body.slice(sp + 1);
			out += renderTag(tag, text);
			i = end + 1;
		}
		return out;
	}

	/** Testo semplice (senza HTML) */
	function plain (s) {
		const d = document.createElement("div");
		d.innerHTML = renderStr(s);
		return d.textContent;
	}

	function renderCell (c) {
		if (c == null) return "";
		if (typeof c !== "object") return renderStr(String(c));
		if (c.type === "cell") {
			if (c.roll) {
				if (c.roll.exact != null) return esc(c.roll.exact);
				return `${esc(c.roll.min)}–${esc(c.roll.max)}`;
			}
			return renderEntries(c.entry ?? c.entries);
		}
		return renderEntry(c, 3);
	}

	function renderEntry (e, depth = 0) {
		if (e == null) return "";
		if (typeof e === "string") return `<p>${renderStr(e)}</p>`;
		if (typeof e === "number") return `<p>${e}</p>`;
		if (Array.isArray(e)) return e.map(x => renderEntry(x, depth)).join("");
		const name = e.name ? renderStr(e.name) : "";
		const kids = () => renderEntries(e.entries || e.items, depth + 1);
		switch (e.type) {
			case undefined:
			case "entries":
			case "section":
			case "variantSub":
			case "optfeature":
				if (!name) return kids();
				if (depth >= 2) {
					return `<div class="cs-e"><p><b><i>${name}.</i></b> ${kids().replace(/^<p>/, "")}</div>`;
				}
				return `<div class="cs-e"><div class="cs-h${Math.min(depth + 3, 6)}">${name}</div>${kids()}</div>`;
			case "inset": case "insetReadaloud": case "variant": case "variantInner":
				return `<div class="cs-inset">${name ? `<div class="cs-h5">${e.type === "variant" ? "Variant: " : ""}${name}</div>` : ""}${kids()}</div>`;
			case "quote":
				return `<blockquote>${renderEntries(e.entries)}${e.by ? `<div>— ${renderStr(e.by)}${e.from ? `, <i>${renderStr(e.from)}</i>` : ""}</div>` : ""}</blockquote>`;
			case "list":
				return `<ul class="cs-list${e.style === "list-no-bullets" ? " nb" : ""}">${(e.items || []).map(it => `<li>${renderEntry(it, depth + 2).replace(/^<p>([\s\S]*)<\/p>$/, "$1")}</li>`).join("")}</ul>`;
			case "item": case "itemSub": case "itemSpell":
				return `<p><b>${name}${/[.:?!]$/.test(e.name || "") ? "" : "."}</b> ${e.entry ? renderStr(e.entry) : renderEntries(e.entries, depth + 2).replace(/^<p>/, "").replace(/<\/p>$/, "")}</p>`;
			case "table": {
				const head = (e.colLabels || []).map(c => `<th>${renderStr(c)}</th>`).join("");
				const rows = (e.rows || []).map(r => {
					const cells = Array.isArray(r) ? r : (r.row || []);
					return `<tr>${cells.map(c => `<td>${renderCell(c)}</td>`).join("")}</tr>`;
				}).join("");
				return `<table class="cs-table">${e.caption ? `<caption>${renderStr(e.caption)}</caption>` : ""}${head ? `<thead><tr>${head}</tr></thead>` : ""}<tbody>${rows}</tbody></table>`;
			}
			case "tableGroup": return renderEntries(e.tables, depth);
			case "options":
				return `<div class="cs-options">${(e.entries || []).map(x => renderEntry(x, Math.max(depth, 2))).join("")}</div>`;
			case "inline": case "inlineBlock":
				return `<p>${(e.entries || []).map(x => typeof x === "string" ? renderStr(x) : renderEntry(x, depth).replace(/<\/?p>/g, "")).join("")}</p>`;
			case "bonus": return CS.fmtMod(e.value);
			case "bonusSpeed": return `${CS.fmtMod(e.value)} ft.`;
			case "dice": return esc((e.toRoll || []).map(d => `${d.number}d${d.faces}${d.modifier ? CS.fmtMod(d.modifier) : ""}`).join(" + "));
			case "abilityDc":
				return `<p class="cs-center"><b>${name} save DC</b> = 8 + your proficiency bonus + your ${(e.attributes || []).map(a => CS.ABIL_FULL[a]).join("/")} modifier</p>`;
			case "abilityAttackMod":
				return `<p class="cs-center"><b>${name} attack modifier</b> = your proficiency bonus + your ${(e.attributes || []).map(a => CS.ABIL_FULL[a]).join("/")} modifier</p>`;
			case "abilityGeneric":
				return `<p class="cs-center">${name ? `<b>${name}</b> = ` : ""}${renderStr(e.text)}</p>`;
			case "refClassFeature": case "refSubclassFeature": case "refOptionalfeature": case "refFeat": {
				const ref = e.classFeature || e.subclassFeature || e.optionalfeature || e.feat;
				const ent = CS.data?.resolveRef?.(e.type, ref);
				if (ent) return renderEntry({type: "entries", name: ent.name, entries: ent.entries}, Math.max(depth, 1));
				return `<p><b>${esc(String(ref).split("|")[0])}</b></p>`;
			}
			case "spellcasting":
				return `<div class="cs-e"><div class="cs-h5">${name}</div>${renderEntries(e.headerEntries)}${renderEntries(e.footerEntries)}</div>`;
			case "image": case "gallery": case "hr": case "statblock": case "statblockInline": case "flowchart":
				return e.type === "hr" ? "<hr>" : "";
			case "link": return `<a href="${esc(e.href?.url || "#")}" target="_blank">${renderStr(e.text)}</a>`;
			case "homebrew": return renderEntries(e.entries);
			case "flowBlock": return `<div class="cs-inset">${name ? `<div class="cs-h5">${name}</div>` : ""}${kids()}</div>`;
			default:
				if (e.entries || e.items) return name ? `<div class="cs-e"><div class="cs-h5">${name}</div>${kids()}</div>` : kids();
				if (e.entry) return `<p>${name ? `<b>${name}.</b> ` : ""}${renderStr(e.entry)}</p>`;
				return "";
		}
	}

	function renderEntries (arr, depth = 0) {
		if (arr == null) return "";
		if (!Array.isArray(arr)) return renderEntry(arr, depth);
		return arr.map(x => renderEntry(x, depth)).join("");
	}

	/** Testo semplice senza DOM */
	const strip = s => renderStr(s).replace(/<[^>]*>/g, "")
		.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

	CS.render = {renderStr, renderEntries, renderEntry, plain, strip, splitTop, hashOf, TAG_PAGE};

	/* ---------- Site renderer bridge (5etools Renderer, with delayed hover) ---------- */

	const site = () => (globalThis.Renderer && typeof globalThis.Renderer.get === "function" ? globalThis.Renderer : null);
	const withDelay = html => CS.render.hoverDelay === false ? String(html) : String(html).replace(/Renderer\.hover\.pHandleLinkMouseOver\(event, this\)/g, "Renderer.hover.pHandleLinkMouseOver(event, this, {isDelay: true})");

	/** Replace ref* entries with the referenced feature, so the site renderer can show them */
	function deref (e, depth = 0) {
		if (depth > 12 || e == null) return e;
		if (Array.isArray(e)) return e.map(x => deref(x, depth + 1));
		if (typeof e !== "object") return e;
		if (/^ref(ClassFeature|SubclassFeature|Optionalfeature|Feat)$/.test(e.type)) {
			const ref = e.classFeature || e.subclassFeature || e.optionalfeature || e.feat;
			const ent = CS.data?.resolveRef?.(e.type, ref);
			if (ent) return {type: "entries", name: ent.name, entries: deref(ent.entries || [], depth + 1)};
			return {type: "entries", name: String(ref).split("|")[0], entries: []};
		}
		const o = {};
		for (const [k, v] of Object.entries(e)) o[k] = (k === "entries" || k === "items" || k === "entry") ? deref(v, depth + 1) : v;
		return o;
	}

	const rd = CS.rd = {
		hasSite: () => !!site(),
		entries (entries, {depth = 1} = {}) {
			if (entries == null) return "";
			const arr = Array.isArray(entries) ? entries : [entries];
			const R = site();
			if (R) {
				try {
					const r = R.get().setFirstSection(true);
					const out = [];
					r.recursiveRender({type: "entries", entries: deref(arr)}, out, {depth});
					return withDelay(out.join(""));
				} catch (e) { console.warn("[5etools Characters] render", e); }
			}
			return renderEntries(arr);
		},
		str (s) {
			const R = site();
			if (R) { try { return withDelay(R.get().render(String(s ?? ""))); } catch (e) { /* fallback */ } }
			return renderStr(s);
		},
		link (tag, name, source, display) {
			return rd.str(`{@${tag} ${name}|${source || ""}${display ? `|${display}` : ""}}`);
		},
		/** Stat block like the site's right-hand pane */
		compact (prop, ent) {
			const R = site();
			if (R && R[prop]?.getCompactRenderedString) {
				try {
					const body = R[prop].getCompactRenderedString(ent);
					const nameTr = /ve-stats__th-name/.test(body) ? "" : R.utils.getNameTr(ent, {page: TAG_PAGE_BY_PROP[prop]});
					return withDelay(`<table class="ve-w-100 ve-stats">${R.utils.getBorderTr()}${nameTr}${body}${R.utils.getBorderTr()}</table>`);
				} catch (e) { /* fallback below */ }
			}
			return `<table class="ve-w-100 ve-stats"><tr><th class="ve-tbl-border" colspan="6"></th></tr><tr><th class="ve-stats__th-name ve-text-left" colspan="6"><h1 class="ve-stats__h-name ve-m-0">${esc(ent.name)}</h1></th></tr><tr><td colspan="6">${rd.entries(ent.entries)}</td></tr><tr><th class="ve-tbl-border" colspan="6"></th></tr></table>`;
		},
	};
	const TAG_PAGE_BY_PROP = {spell: "spells.html", item: "items.html", feat: "feats.html", race: "races.html", background: "backgrounds.html", optionalfeature: "optionalfeatures.html", class: "classes.html"};
})();
