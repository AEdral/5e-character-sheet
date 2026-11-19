/* Import of D&D Beyond character sheets exported as PDF ("Export to PDF" on dndbeyond.com).
 * The PDF is a fillable form: every value lives in a form field (/T name, /V value). The fields are read from
 * the raw file (plain or Flate-compressed object streams), then mapped onto 5etools data and the rules engine:
 * species, background, classes and subclasses, choices (feats, invocations, skills...), spells, items. */
(function () {
	const CS = globalThis.CS5E;
	const D = CS.data;
	const K = CS.key;
	const X = (CS.ddb = {});

	/* ====================== PDF form fields ====================== */

	const PDFDOC = {0x80: "•", 0x81: "†", 0x82: "‡", 0x83: "…", 0x84: "—", 0x85: "–", 0x86: "ƒ", 0x87: "⁄", 0x88: "‹", 0x89: "›", 0x8a: "−", 0x8b: "‰", 0x8c: "„", 0x8d: "“", 0x8e: "”", 0x8f: "‘", 0x90: "’", 0x91: "‚", 0x92: "™", 0x93: "ﬁ", 0x94: "ﬂ", 0x95: "Ł", 0x96: "Œ", 0x97: "Š", 0x98: "Ÿ", 0x99: "Ž", 0x9a: "ı", 0x9b: "ł", 0x9c: "œ", 0x9d: "š", 0x9e: "ž", 0xa0: "€"};

	function decodeBytes (arr) {
		if (arr.length >= 2 && arr[0] === 0xfe && arr[1] === 0xff) {
			let s = "";
			for (let i = 2; i + 1 < arr.length; i += 2) s += String.fromCharCode((arr[i] << 8) | arr[i + 1]);
			return s;
		}
		if (arr.length >= 3 && arr[0] === 0xef && arr[1] === 0xbb && arr[2] === 0xbf) return new TextDecoder("utf-8").decode(new Uint8Array(arr.slice(3)));
		return arr.map(b => PDFDOC[b] || String.fromCharCode(b)).join("");
	}

	/** reads a literal string starting at s[i] === "(" ; returns [bytes, end] */
	function literal (s, i) {
		let depth = 0; const out = []; let j = i;
		const ESC = {n: 10, r: 13, t: 9, b: 8, f: 12};
		while (j < s.length) {
			const c = s[j];
			if (c === "\\") {
				const n = s[j + 1];
				if (ESC[n] != null) { out.push(ESC[n]); j += 2; continue; }
				if (n >= "0" && n <= "7") {
					let k = j + 1; let d = "";
					while (k < s.length && d.length < 3 && s[k] >= "0" && s[k] <= "7") d += s[k++];
					out.push(parseInt(d, 8) & 255); j = k; continue;
				}
				if (n === "\n") { j += 2; continue; }
				if (n === "\r") { j += s[j + 2] === "\n" ? 3 : 2; continue; }
				out.push(n.charCodeAt(0) & 255); j += 2; continue;
			}
			if (c === "(") { depth++; if (depth > 1) out.push(40); } else if (c === ")") { depth--; if (depth === 0) return [out, j + 1]; out.push(41); } else out.push(c.charCodeAt(0) & 255);
			j++;
		}
		return [out, j];
	}

	const hexBytes = h => { const t = h.replace(/\s/g, ""); const out = []; for (let i = 0; i < t.length; i += 2) out.push(parseInt(t.substr(i, 2).padEnd(2, "0"), 16)); return out; };

	function readString (d, at) {
		const rest = d.slice(at).replace(/^\s+/, "");
		const off = d.length - rest.length;
		if (rest[0] === "(") return decodeBytes(literal(d, off)[0]);
		if (rest[0] === "<" && rest[1] !== "<") { const e = d.indexOf(">", off); return decodeBytes(hexBytes(d.slice(off + 1, e))); }
		return null;
	}

	async function inflate (bin) {
		const bytes = Uint8Array.from(bin, c => c.charCodeAt(0) & 255);
		for (const fmt of ["deflate", "deflate-raw"]) {
			try {
				const ds = new DecompressionStream(fmt);
				const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
				return latin1(new Uint8Array(buf));
			} catch (e) { /* try next */ }
		}
		return "";
	}
	function latin1 (u8) { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return s; }

	/** all object bodies of the PDF: plain "n 0 obj ... endobj" plus objects packed in compressed object streams */
	async function objects (s) {
		const out = new Map();
		const re = /(\d+)\s+(\d+)\s+obj\b/g;
		let m;
		while ((m = re.exec(s))) {
			const end = s.indexOf("endobj", re.lastIndex);
			if (end < 0) break;
			out.set(Number(m[1]), s.slice(re.lastIndex, end));
			re.lastIndex = end + 6;
		}
		for (const [, body] of [...out]) {
			if (!/\/Type\s*\/ObjStm/.test(body) || !/\/FlateDecode/.test(body)) continue;
			const sm = body.match(/stream\r?\n/);
			if (!sm) continue;
			const start = sm.index + sm[0].length;
			const lenM = body.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/);
			let raw = lenM ? body.substr(start, Number(lenM[1])) : body.slice(start, body.lastIndexOf("endstream"));
			const data = await inflate(raw);
			if (!data) continue;
			const n = Number((body.match(/\/N\s+(\d+)/) || [])[1] || 0);
			const first = Number((body.match(/\/First\s+(\d+)/) || [])[1] || 0);
			const nums = data.slice(0, first).trim().split(/\s+/).map(Number);
			for (let i = 0; i < n; i++) {
				const num = nums[2 * i]; const o = nums[2 * i + 1]; const o2 = i + 1 < n ? nums[2 * i + 3] : data.length - first;
				if (!out.has(num)) out.set(num, data.slice(first + o, first + o2));
			}
		}
		return out;
	}

	/** {fieldName: value} of a PDF form (names trimmed, inner spaces collapsed; first non-empty value wins) */
	X.readFields = async buffer => {
		const s = latin1(new Uint8Array(buffer));
		if (!s.startsWith("%PDF")) throw new Error("This file is not a PDF.");
		const objs = await objects(s);
		const fields = {};
		const resolve = v => { const m = String(v).match(/^\s*(\d+)\s+\d+\s+R/); return m ? objs.get(Number(m[1])) || "" : null; };
		for (const body of objs.values()) {
			const ti = body.search(/\/T\s*[(<]/);
			if (ti < 0) continue;
			const name = readString(body, ti + 2);
			if (!name) continue;
			let value = null;
			const vm = body.match(/\/V\s*([(<]|\d+\s+\d+\s+R)/);
			if (vm) {
				if (/R$/.test(vm[1])) value = readString(resolve(vm[1]) || "", 0);
				else value = readString(body, vm.index + 2);
			}
			const key = name.replace(/\s+/g, " ").trim();
			if (value != null && value !== "" && (fields[key] == null || fields[key] === "")) fields[key] = value;
			else if (fields[key] == null) fields[key] = value ?? "";
		}
		return fields;
	};

	/* ====================== matching helpers ====================== */

	const norm = s => String(s ?? "").toLowerCase().replace(/[‘’ʼ`]/g, "'").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
	const loose = s => norm(s).replace(/^the /, "").replace(/[^a-z0-9+]/g, "");
	const val = (F, k) => { const v = F[k]; return v == null || /^-+$/.test(String(v).trim()) ? "" : String(v).trim(); };

	const SRC = {
		"PHB": "PHB", "BASIC RULES": "PHB", "BR": "PHB", "PHB 2024": "XPHB", "PHB-2024": "XPHB", "PHB24": "XPHB", "FREE RULES": "XPHB",
		"DMG": "DMG", "DMG 2024": "XDMG", "MM": "MM", "XGTE": "XGE", "TCOE": "TCE", "VGTM": "VGM", "MTOF": "MTF", "MOTM": "MPMM",
		"EGTW": "EGW", "FTOD": "FTD", "SCAG": "SCAG", "ERLW": "ERLW", "E:RLW": "ERLW", "GGTR": "GGR", "MOOT": "MOT", "AI": "AI", "SCOC": "SCC",
		"BOMT": "BMT", "VRGTR": "VRGR", "WBTW": "WBtW", "SAIS": "AAG", "TOA": "ToA", "LLOK": "LLK", "OGA": "OGA", "POA": "PaBTSO", "TDCSR": "TDCSR",
		"TLOTRR": "TLotRR", "UA": "UA", "BGG": "BGG", "PSA": "PSA", "PSK": "PSK", "PSZ": "PSZ", "PSI": "PSI", "PSX": "PSX", "PSD": "PSD", "EFA": "EFA", "FRHOF": "FRHoF",
	};
	const mapSrc = t => {
		if (!t) return null;
		const u = String(t).trim().toUpperCase().replace(/\s+\d+$/, "").trim();
		if (/2024/.test(t)) return /DMG/i.test(t) ? "XDMG" : /MM/i.test(t) ? "XMM" : "XPHB";
		return SRC[u] || SRC[u.replace(/\s+/g, "")] || null;
	};

	/** pick the best entity among same-named candidates */
	function best (cands, {srcHint = null, edition = null} = {}) {
		if (!cands.length) return null;
		const score = e => {
			let s = 0;
			const src = String(e.source || "");
			if (srcHint && src.toLowerCase() === String(srcHint).toLowerCase()) s += 100;
			if (edition === "one" && (e.edition === "one" || src === "XPHB")) s += 20;
			if (edition === "classic" && e.edition !== "one" && src !== "XPHB") s += 20;
			if (["PHB", "XPHB"].includes(src)) s += 5;
			if (D.isAllowed?.(e)) s += 2;
			if (e._brew) s -= 1;
			return s;
		};
		return [...cands].sort((a, b) => score(b) - score(a))[0];
	}
	const byName = (list, name) => { const n = loose(name); return n ? (list || []).filter(e => loose(e.name) === n) : []; };

	/* ====================== DDB sheet parsing ====================== */

	/** lines of the features/traits text: sections ("=== WARLOCK FEATURES ===") with "* Feature" and "| Option" entries */
	function parseFeatures (F) {
		const text = ["FeaturesTraits1", "FeaturesTraits2", "FeaturesTraits3", "FeaturesTraits4", "FeaturesTraits5", "FeaturesTraits6"].map(k => F[k] || "").join("\n");
		const sections = [];
		let cur = {title: "", items: []};
		sections.push(cur);
		let lastItem = null;
		for (const raw of text.split(/\r?\n/)) {
			const line = raw.replace(/\s+$/, "");
			const hm = line.match(/^\s*===\s*(.+?)\s*===\s*$/);
			if (hm) { cur = {title: hm[1], items: []}; sections.push(cur); lastItem = null; continue; }
			const im = line.match(/^\s*([*|])\s*(.+)$/);
			if (im) {
				const [nameRaw, srcRaw] = im[2].split(/\s+•\s*/);
				const name = nameRaw.trim();
				const it = {kind: im[1] === "*" ? "feature" : "option", name, src: mapSrc(srcRaw), srcRaw: (srcRaw || "").trim(), text: "", options: [], parent: null};
				if (it.kind === "option" && lastItem) { it.parent = lastItem; lastItem.options.push(it); }
				cur.items.push(it);
				if (it.kind === "feature") lastItem = it;
				continue;
			}
			const tgt = cur.items[cur.items.length - 1];
			if (tgt) tgt.text += (tgt.text ? "\n" : "") + line.trim();
		}
		return sections.filter(s => s.items.length);
	}

	const listSection = (txt, title) => {
		const m = String(txt || "").match(new RegExp(`===\\s*${title}\\s*===([\\s\\S]*?)(?:===|$)`, "i"));
		return m ? m[1].split(/[,\n]/).map(x => x.trim()).filter(Boolean) : [];
	};

	X.parseSheet = F => {
		const sections = parseFeatures(F);
		const allItems = sections.flatMap(s => s.items);
		const srcSeen = allItems.map(i => i.srcRaw).filter(Boolean);
		const edition = srcSeen.some(s => /2024/.test(s)) ? "one" : "classic";
		const classes = [];
		const clsTxt = val(F, "CLASS LEVEL");
		for (const m of clsTxt.matchAll(/([A-Za-z][A-Za-z' -]*?)\s+(\d{1,2})\b/g)) classes.push({name: m[1].trim(), level: Number(m[2])});
		const abil = {};
		const FIELD = {str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA"};
		for (const a of CS.ABIL) abil[a] = Number(val(F, FIELD[a])) || 10;
		const saves = {};
		const SAVE = {str: "Str", dex: "Dex", con: "Con", int: "Int", wis: "Wis", cha: "Cha"};
		for (const a of CS.ABIL) saves[a] = !!val(F, `${SAVE[a]}Prof`);
		const skills = {};
		for (const [k, v] of Object.entries(F)) {
			const m = k.match(/^(.+?)Prof$/);
			if (!m || !v || /^(Str|Dex|Con|Int|Wis|Cha)$/.test(m[1])) continue;
			const compact = m[1].toLowerCase().replace(/[^a-z]/g, "");
			const sk = CS.SKILLS.find(s => s.key.replace(/\s/g, "") === compact) || CS.SKILLS.find(s => s.key.replace(/\s/g, "").startsWith(compact));
			if (!sk) continue;
			const t = String(v).trim().toUpperCase();
			if (t === "E") skills[sk.key] = 2; else if (t === "P" || t === "•") skills[sk.key] = 1; else if (t === "H") skills[sk.key] = 0;
		}
		const spells = [];
		for (let i = 0; i < 200; i++) {
			const name = val(F, `spellName${i}`);
			if (!name) continue;
			const page = val(F, `spellPage${i}`);
			spells.push({name, source: val(F, `spellSource${i}`), book: mapSrc(page), prepared: val(F, `spellPrepared${i}`), notes: val(F, `spellNotes${i}`)});
		}
		const items = [];
		for (let i = 0; i < 200; i++) {
			const name = val(F, `Eq Name${i}`);
			if (name) items.push({name, qty: Number(val(F, `Eq Qty${i}`)) || 1});
		}
		const attuned = [];
		for (let i = 0; i < 10; i++) { const n = val(F, `Attuned Name${i}`); if (n) attuned.push(n); }
		const profTxt = F["ProficienciesLang"] || "";
		return {
			name: val(F, "CharacterName"), player: val(F, "PLAYER NAME"), race: val(F, "RACE"), background: val(F, "BACKGROUND"),
			xp: Number(val(F, "EXPERIENCE POINTS").replace(/[^\d]/g, "")) || 0,
			classes, abil, saves, skills, spells, items, attuned, sections, allItems, edition,
			langs: listSection(profTxt, "LANGUAGES"), tools: listSection(profTxt, "TOOLS"),
			armor: listSection(profTxt, "ARMOR"), weapons: listSection(profTxt, "WEAPONS"),
			maxHp: Number(val(F, "MaxHP")) || null, ac: Number(val(F, "AC")) || null,
			size: val(F, "SIZE"), alignment: val(F, "ALIGNMENT"),
			currency: {cp: Number(val(F, "CP")) || 0, sp: Number(val(F, "SP")) || 0, ep: Number(val(F, "EP")) || 0, gp: Number(val(F, "GP")) || 0, pp: Number(val(F, "PP")) || 0},
			appearance: {age: val(F, "AGE"), height: val(F, "HEIGHT"), weight: val(F, "WEIGHT"), eyes: val(F, "EYES"), hair: val(F, "HAIR"), skin: val(F, "SKIN"), gender: val(F, "GENDER"), faith: val(F, "FAITH")},
			notes: {
				traits: val(F, "PersonalityTraits"), ideals: val(F, "Ideals"), bonds: val(F, "Bonds"), flaws: val(F, "Flaws"),
				backstory: [val(F, "Backstory"), val(F, "Appearance") ? `Appearance: ${val(F, "Appearance")}` : ""].filter(Boolean).join("\n\n"),
				allies: val(F, "AlliesOrganizations"),
				other: [val(F, "AdditionalNotes1"), val(F, "AdditionalNotes2")].filter(Boolean).join("\n"),
			},
		};
	};

	/* ====================== mapping to a character ====================== */

	function findRace (P, srcHint) {
		const want = loose(P.race);
		if (!want) return null;
		const cands = [];
		for (const r of D.races) {
			const names = [r.name];
			if (loose(r.name) === want) cands.push({race: r, sub: null, exact: true});
			for (const s of r._subraces || []) {
				if (!s.name) continue;
				const forms = [`${s.name} ${r.name}`, `${r.name} (${s.name})`, `${r.name}, ${s.name}`, `${r.name} ${s.name}`, s.name];
				if (forms.some(f => loose(f) === want)) cands.push({race: r, sub: s, exact: true});
			}
			void names;
		}
		let list = cands;
		if (!list.length) {
			for (const r of D.races) if (want.includes(loose(r.name)) && loose(r.name).length > 2) list.push({race: r, sub: (r._subraces || []).find(s => s.name && want.includes(loose(s.name))) || null});
		}
		if (!list.length) return null;
		const pick = best(list.map(x => ({...x, name: x.race.name, source: x.race.source, edition: x.race.edition, _brew: x.race._brew})), {srcHint, edition: P.edition});
		return pick;
	}

	function abilityOf (txt) {
		const n = norm(txt);
		return CS.ABIL.find(a => n.startsWith(CS.ABIL_FULL[a].toLowerCase()) || n === a);
	}

	X.toChar = (P, {report = [], asiByCharLevel = false} = {}) => {
		const R = CS.rules;
		const c = R.newChar();
		c.name = P.name || "Imported character";
		c.player = P.player || "";
		c.alignment = CS.ALIGNMENTS.find(a => norm(a) === norm(P.alignment)) || (norm(P.alignment) === "neutral" ? "True Neutral" : P.alignment || "");
		c.xp = P.xp;
		c.appearance = {...c.appearance, ...P.appearance};
		c.notes = {...c.notes, ...P.notes};
		c.currency = P.currency;
		c.settings.abilityMethod = "manual";
		c.settings.hpMethod = "fixed";
		c.settings.asiByCharLevel = !!asiByCharLevel;
		c.importedFrom = "D&D Beyond";

		const sectionFor = re => P.sections.find(s => re.test(s.title));
		const speciesSec = sectionFor(/SPECIES|RACIAL|RACE/i);
		const featSec = sectionFor(/^FEATS$/i);
		const srcOfSec = sec => { const cnt = {}; for (const i of sec?.items || []) if (i.src) cnt[i.src] = (cnt[i.src] || 0) + 1; return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || null; };

		// species
		const rr = findRace(P, srcOfSec(speciesSec));
		if (rr) { c.race = {name: rr.race.name, source: rr.race.source}; if (rr.sub) c.subrace = {name: rr.sub.name, source: rr.sub.source}; }
		else if (P.race) report.push(`Species not found: ${P.race}`);

		// background
		const bgName = P.background.replace(/\s*\(.*\)\s*$/, "");
		const bg = best(byName(D.backgrounds, bgName).length ? byName(D.backgrounds, bgName) : byName(D.backgrounds, P.background), {edition: P.edition});
		if (bg) c.background = {name: bg.name, source: bg.source};
		else if (P.background) report.push(`Background not found: ${P.background}`);

		// classes and subclasses
		for (const pc of P.classes) {
			const cls = best(byName(D.classes, pc.name), {edition: P.edition});
			if (!cls) { report.push(`Class not found: ${pc.name}`); continue; }
			const entry = {name: cls.name, source: cls.source, level: pc.level};
			const sec = sectionFor(new RegExp(`^${pc.name}\\b.*FEATURES`, "i")) || {items: P.allItems};
			const names = new Set(sec.items.map(i => loose(i.name.split(":")[0])));
			let bestSc = null; let bestScore = 0;
			for (const sc of cls._subclasses || []) {
				let score = 0;
				if (names.has(loose(sc.name)) || names.has(loose(sc.shortName))) score += 10;
				for (const ref of sc.subclassFeatures || []) { const n = loose(String(typeof ref === "string" ? ref : ref.subclassFeature).split("|")[0]); if (n && names.has(n)) score += 1; }
				const srcs = sec.items.filter(i => names.has(loose(sc.name)) && loose(i.name) === loose(sc.name)).map(i => i.src);
				if (srcs.includes(sc.source)) score += 0.5;
				if (P.edition === "one" ? sc.source === "XPHB" || sc.edition === "one" : sc.edition !== "one") score += 0.2;
				if (score > bestScore) { bestScore = score; bestSc = sc; }
			}
			if (bestSc && bestScore >= 1) entry.subclass = {name: bestSc.name, source: bestSc.source, shortName: bestSc.shortName};
			else if (pc.level >= D.subclassLevel(cls)) report.push(`${cls.name}: subclass not recognised`);
			c.classes.push(entry);
		}
		if (P.classes.length > 1) c.classes.sort((a, b) => 0 * (a.level - b.level));

		fillChoices(c, P, report);
		finish(c, P, report);
		return c;
	};

	/* ---- choices: walk the rules engine, fill what the DDB sheet says, repeat until nothing changes ---- */

	function fillChoices (c, P, report) {
		const R = CS.rules;
		const featItems = (P.sections.find(s => /^FEATS$/i.test(s.title))?.items || []).filter(i => i.kind === "feature");
		const ddbFeats = featItems.map(i => ({item: i, feat: best(byName(D.feats, i.name.replace(/\s*\(.*\)$/, "")), {srcHint: i.src, edition: P.edition}), used: false}));
		for (const f of ddbFeats) if (!f.feat) report.push(`Feat not found: ${f.item.name}`);
		const optionNames = P.allItems.map(i => i.name);
		const optionLoose = new Set(optionNames.flatMap(n => [loose(n), loose(n.split(":")[0]), loose(n.replace(/\s*\(.*\)$/, ""))]));
		const usedSpells = new Set();
		const usedOpt = new Set();
		const featFor = (category, taken) => {
			const cats = category ? (Array.isArray(category) ? category : [category]) : null;
			return ddbFeats.find(f => f.feat && !f.used && !taken.has(K(f.feat.name, f.feat.source)) && (!cats || cats.some(x => (f.feat.category || "") === x || (!f.feat.category && x === "G"))));
		};
		const featTextFor = calcChoice => {
			const name = calcChoice.from?.replace(/^Feat: /, "");
			return featItems.find(i => loose(i.name) === loose(name));
		};

		const asiTxt = (P.sections.find(x => /SPECIES|RACIAL|RACE/i.test(x.title))?.items || []).filter(i => /ability score/i.test(i.name)).map(i => i.text).join(" ");
		const raceIncreases = {};
		for (const m of asiTxt.matchAll(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+score\s+increases\s+by\s+(\d)/gi)) raceIncreases[abilityOf(m[1])] = Number(m[2]);
		let addedExtra = false;
		const tried = new Set();
		// how many ASIs the rules give (by class levels): the house rule's extra slots stay open for the user
		const rawAsiCount = c.settings.asiByCharLevel
			? R.compute({...c, settings: {...c.settings, asiByCharLevel: false}, choices: {}}).choices.filter(ch => ch.kind === "asi").length
			: Infinity;
		const openSlots = new Set();
		const clAsiIndex = id => [4, 8, 12, 16, 19].indexOf(Number(id.split("@")[1]));
		for (let iter = 0; iter < 25; iter++) {
			const k = R.compute(c);
			const takenFeats = new Set(k.feats.map(f => K(f.feat.name, f.feat.source)));
			for (const f of ddbFeats) if (f.feat && takenFeats.has(K(f.feat.name, f.feat.source))) f.used = true;
			let changed = false;
			const set = (id, v) => { c.choices[id] = v; changed = true; };
			const ownedSkills = () => new Set(k.skills.filter(s => s.prof >= 1).map(s => s.key));
			for (const ch of k.choices) {
				if (ch.kind === "grantedFeat" || ch.id in c.choices || tried.has(ch.id)) continue;
				tried.add(ch.id);
				switch (ch.kind) {
					case "size": { const s = Object.entries(CS.SIZE).find(([, v]) => norm(v) === norm(P.size)); if (s && ch.options.includes(s[0])) set(ch.id, s[0]); break; }
					case "asi": {
						const f = featFor(ch.edition === "one" ? ["G"] : null, takenFeats);
						if (f) { set(ch.id, {mode: "feat"}); set(ch.id + ">feat", {name: f.feat.name, source: f.feat.source}); f.used = true; takenFeats.add(K(f.feat.name, f.feat.source)); }
						else if (/^cl:asi@/.test(ch.id) && clAsiIndex(ch.id) >= rawAsiCount) openSlots.add(ch.id); /* extra slot of the house rule: D&D Beyond has nothing for it, the user chooses */
						else { set(ch.id, {mode: "asi"}); }
						break;
					}
					case "feat": {
						const f = featFor(ch.category, takenFeats);
						if (f) { set(ch.id, {name: f.feat.name, source: f.feat.source}); f.used = true; takenFeats.add(K(f.feat.name, f.feat.source)); }
						break;
					}
					case "ability": {
						if (openSlots.has(ch.parent) || [...openSlots].some(o => ch.id.startsWith(o + ">"))) break;
						// feats: the option DDB lists under the feat ("| Charisma"); species: "Your X score increases by N";
						// otherwise the highest (odd first) final scores
						const fi = featTextFor(ch);
						const named = (fi?.options || []).map(o => abilityOf(o.name)).filter(Boolean);
						const desired = ch.section === "race" ? raceIncreases : null;
						const order = [...CS.ABIL].sort((a, b) => (P.abil[b] % 2) - (P.abil[a] % 2) || P.abil[b] - P.abil[a]);
						const plan = (opt, wantMap) => {
							const used = [];
							return R.optionSlots(opt).map(s => {
								const p = (wantMap ? Object.keys(wantMap).find(a => wantMap[a] === s.amount && s.from.includes(a) && !used.includes(a) && !(typeof opt[a] === "number")) : null)
									|| named.find(a => s.from.includes(a) && !used.includes(a)) || order.find(a => s.from.includes(a) && !used.includes(a));
								used.push(p); return p;
							});
						};
						let choice = null;
						if (desired && Object.keys(desired).length) {
							const idx = ch.options.map((o, i) => i).sort((a, b) => (/^Standard/.test(ch.options[b]._label || "") ? 1 : 0) - (/^Standard/.test(ch.options[a]._label || "") ? 1 : 0));
							idx.forEach(i => {
								const opt = ch.options[i];
								if (choice) return;
								const picks = plan(opt, desired);
								const b = R.optionBonus(opt, {picks});
								if (CS.ABIL.every(a => (b[a] || 0) === (desired[a] || 0))) choice = {opt: i, picks};
							});
						}
						if (!choice) {
							const i = Math.max(0, ch.options.findIndex(o => /^Standard/.test(o._label || "")));
							choice = {opt: ch.options.length > 1 && ch.section === "race" ? i : 0, picks: plan(ch.options[ch.options.length > 1 && ch.section === "race" ? i : 0], null)};
						}
						set(ch.id, choice);
						break;
					}
					case "spellAbility": {
						const fi = featTextFor(ch);
						const named = (fi?.options || []).map(o => abilityOf(o.name)).find(a => ch.from.includes(a));
						const fromFeatAbility = c.choices[ch.prefix.replace(/>spell.*$/, "") + ">ability"]?.picks?.[0];
						set(ch.id, named || (ch.from.includes(fromFeatAbility) ? fromFeatAbility : ch.from[0]));
						break;
					}
					case "spellOpt": case "select": {
						const i = ch.options.findIndex(o => optionLoose.has(loose(o)) || P.allItems.some(it => loose(it.name).includes(loose(o)) && loose(o).length > 3));
						if (i >= 0) set(ch.id, ch.kind === "select" ? ch.options[i] : i);
						else if (ch.kind === "spellOpt") set(ch.id, ch.def || 0);
						break;
					}
					case "optfeature": {
						const types = (ch.featureType || []).map(t => String(t));
						const pool = D.optfeatures.filter(o => (o.featureType || []).some(t => types.includes(t)));
						const picked = [];
						for (const it of P.allItems) {
							if (picked.length >= ch.count) break;
							const nm = it.name.replace(/\s*\(.*\)$/, "");
							const cands = pool.filter(o => loose(o.name) === loose(nm) || loose(o.name) === loose(it.name));
							const o = best(cands, {srcHint: it.src, edition: P.edition});
							if (o && !usedOpt.has(K(o.name, o.source)) && !picked.some(p => K(p.name, p.source) === K(o.name, o.source))) picked.push({name: o.name, source: o.source});
						}
						picked.forEach(p => usedOpt.add(K(p.name, p.source)));
						if (picked.length) set(ch.id, picked);
						break;
					}
					case "skill": case "expertise": {
						const own = ownedSkills();
						const want = ch.kind === "expertise"
							? Object.entries(P.skills).filter(([s, l]) => l === 2 && !k.grants.expertise[s]).map(([s]) => s)
							: Object.entries(P.skills).filter(([s, l]) => l >= 1 && !own.has(s)).map(([s]) => s);
						const from = ch.from?.length ? ch.from : CS.SKILLS.map(s => s.key);
						const picks = want.filter(s => from.includes(s)).slice(0, ch.count);
						if (picks.length) set(ch.id, picks);
						break;
					}
					case "lang": case "tool": {
						const have = new Set((ch.kind === "lang" ? k.proficiencies.languages : k.proficiencies.tools).map(norm));
						const list = (ch.kind === "lang" ? P.langs : P.tools).filter(x => !have.has(norm(x)));
						const from = ch.from?.map(x => norm(String(x).split("|")[0]));
						const picks = list.filter(x => !from || from.includes(norm(x))).slice(0, ch.count).map(x => {
							if (ch.kind === "lang") return (D.languages.find(l => norm(l.name) === norm(x))?.name) || CS.cap(x);
							return (D.items.find(i => norm(i.name) === norm(x))?.name) || CS.cap(x);
						});
						if (picks.length) set(ch.id, picks);
						break;
					}
					case "stl": {
						const own = ownedSkills();
						const out = [];
						if (ch.allow.skill) for (const [s, l] of Object.entries(P.skills)) if (l >= 1 && !own.has(s)) out.push(`skill:${s}`);
						if (ch.allow.tool) for (const t of P.tools) if (!k.proficiencies.tools.map(norm).includes(norm(t))) out.push(`tool:${D.items.find(i => norm(i.name) === norm(t))?.name || CS.cap(t)}`);
						if (ch.allow.lang) for (const l of P.langs) if (!k.proficiencies.languages.map(norm).includes(norm(l))) out.push(`lang:${D.languages.find(x => norm(x.name) === norm(l))?.name || CS.cap(l)}`);
						if (out.length) set(ch.id, out.slice(0, ch.count));
						break;
					}
					case "save": {
						const a = ch.from.find(x => P.saves[x] && !k.saves[x]?.prof);
						if (a) set(ch.id, a);
						break;
					}
					case "spell": {
						const owner = norm(String(ch.from || "").replace(/^Feat: /, ""));
						const feature = norm(ch.feature || "");
						const cands = P.spells.filter(s => {
							const src = norm(s.source);
							if (usedSpells.has(s)) return false;
							if (ch.how === "Mystic Arcanum") return /mystic arcanum/.test(src);
							return src === owner || (feature && src === feature) || (owner && src.includes(owner)) || (owner && owner.includes(src) && src.length > 3);
						});
						const picks = [];
						for (const s of cands) {
							if (picks.length >= ch.count) break;
							const sp = best(byName(D.spells, s.name), {srcHint: s.book, edition: P.edition});
							if (!sp || !D.matchSpellFilter(sp, ch.filter, {variants: true})) continue;
							if (k.grants.spells.some(g => K(...String(g.uid).split("|")) === K(sp.name, sp.source) && g.how !== ch.how)) { usedSpells.add(s); continue; }
							picks.push(`${sp.name}|${sp.source}`); usedSpells.add(s);
						}
						if (picks.length) set(ch.id, picks);
						break;
					}
					default: break;
				}
			}
			if (!changed) {
				// feats DDB lists that found no slot: add them as extra feats
				const left = ddbFeats.filter(f => f.feat && !f.used && !takenFeats.has(K(f.feat.name, f.feat.source)));
				if (left.length && !addedExtra) {
					for (const f of left) { c.extraFeats.push({id: CS.uid(), name: f.feat.name, source: f.feat.source}); f.used = true; }
					addedExtra = true;
					continue;
				}
				break;
			}
		}
		for (const [k2, v] of Object.entries(c.choices)) if (v === undefined) delete c.choices[k2];
		if (openSlots.size) report.push(`New with the character-level house rule (D&D Beyond gives ASIs only at class levels): choose a feat or +2 ability scores at character level ${[...openSlots].map(id => id.split("@")[1]).join(", ")} in the builder.`);
		const live = new Set(R.compute(c).choices.map(ch => ch.id));
		for (const k2 of Object.keys(c.choices)) if (!live.has(k2)) delete c.choices[k2];
		c._usedSpells = usedSpells;
	}

	function itemByName (name) {
		const tries = [name, name.replace(/^(.*), (\+\d)$/, "$2 $1"), name.replace(/\s*\(.*\)$/, ""), name.replace(/^(.*), (.*)$/, "$2 $1"), name.replace(/s$/, "")];
		for (const t of tries) {
			const c = byName(D.items, t);
			if (c.length) return best(c);
		}
		return null;
	}

	function finish (c, P, report) {
		const R = CS.rules;
		let k = R.compute(c);

		// class spells (known / prepared)
		const used = c._usedSpells || new Set();
		delete c._usedSpells;
		const granted = new Set(k.grants.spells.map(g => { const [n, s] = String(g.uid).split("|"); return K(n, s || "PHB"); }));
		const grantedName = new Set(k.grants.spells.map(g => loose(String(g.uid).split("|")[0])));
		for (const s of P.spells) {
			if (used.has(s)) continue;
			const pc = k.spellcasting.perClass.find(p => norm(p.cls) === norm(s.source)) || (k.spellcasting.perClass.length === 1 && /pact|invocation|arcanum/i.test(s.source) ? null : null);
			const sp = best(byName(D.spells, s.name), {srcHint: s.book, edition: P.edition});
			if (!sp) { report.push(`Spell not found: ${s.name}`); continue; }
			if (granted.has(K(sp.name, sp.source)) || grantedName.has(loose(sp.name))) continue;
			if (!pc) { report.push(`Spell from "${s.source}" not linked: ${s.name}`); continue; }
			if (c.spells.some(x => K(x.name, x.source) === K(sp.name, sp.source) && x.cls === pc.cls)) continue;
			c.spells.push({name: sp.name, source: sp.source, level: sp.level, cls: pc.cls, prepared: true});
		}

		// items
		const att = new Set(P.attuned.map(loose));
		for (const it of P.items) {
			const found = itemByName(it.name);
			if (!found) { c.inventory.push({id: CS.uid(), name: it.name, source: null, qty: it.qty, equipped: false, attuned: false, snap: {}}); report.push(`Item not found (added as custom): ${it.name}`); continue; }
			const snap = R.itemSnapshot(found);
			const t = R.typeCode(found.type);
			const attuned = att.has(loose(it.name)) || att.has(loose(found.name));
			const equip = !!found.weapon || ["LA", "MA", "HA", "S"].includes(t) || attuned || (!!snap.bonusAc && !found.reqAttune);
			c.inventory.push({id: CS.uid(), name: found.name, source: found.source, displayName: norm(found.name) === norm(it.name) ? null : it.name, qty: it.qty, equipped: equip, attuned, snap});
		}
		// only one body armour and one shield equipped: keep the best combination for the sheet's AC
		const bodies = c.inventory.filter(i => i.equipped && ["LA", "MA", "HA"].includes(R.typeCode(i.snap?.type)));
		if (bodies.length > 1) {
			let bestI = bodies[0]; let bestDiff = Infinity;
			for (const b of bodies) {
				for (const o of bodies) o.equipped = o === b;
				const diff = Math.abs(R.compute(c).ac.value - (P.ac || 0));
				if (diff < bestDiff) { bestDiff = diff; bestI = b; }
			}
			for (const o of bodies) o.equipped = o === bestI;
		}

		// ability scores: base = DDB score - bonuses computed by the rules
		k = R.compute(c);
		for (const a of CS.ABIL) c.base[a] = Math.max(1, P.abil[a] - k.scores[a].bonus - (Number(c.extra[a]) || 0));
		k = R.compute(c);

		// proficiencies the rules engine didn't grant
		for (const [s, l] of Object.entries(P.skills)) {
			const cur = k.skills.find(x => x.key === s)?.prof || 0;
			if (l > cur) c.skills[s] = l;
		}
		for (const a of CS.ABIL) if (P.saves[a] && !k.saves[a].prof) c.saveExtra[a] = true;
		const haveL = new Set(k.proficiencies.languages.map(norm));
		const extraL = P.langs.filter(l => !haveL.has(norm(l)));
		if (extraL.length) c.languagesExtra = extraL.join(", ");
		const haveT = new Set([...k.proficiencies.tools, ...k.proficiencies.armor, ...k.proficiencies.weapons].map(x => norm(x).replace(/s$/, "")));
		const extraP = [...P.tools, ...P.armor, ...P.weapons].filter(t => !haveT.has(norm(t).replace(/s$/, "")));
		if (extraP.length) c.profsExtra = extraP.join(", ");

		// hit points: keep DDB's maximum (rolled HP, items...) as a bonus over the fixed value
		k = R.compute(c);
		if (P.maxHp && P.maxHp !== k.hp.max) c.hp.bonus = P.maxHp - k.hp.max;
		if (P.ac && k.ac.value !== P.ac) report.push(`AC differs: D&D Beyond ${P.ac}, here ${k.ac.value} (check equipped items)`);
		const pend = k.choices.filter(ch => R.isPending(ch, k));
		if (pend.length) report.push(`${pend.length} choice${pend.length > 1 ? "s" : ""} still to make in the builder: ${pend.slice(0, 6).map(p => p.label).join(", ")}${pend.length > 6 ? "…" : ""}`);
	}

	/** File -> {char, report} */
	X.importPdf = async file => {
		const F = await X.readFields(await file.arrayBuffer());
		if (!F.CharacterName && !F["CLASS LEVEL"]) throw new Error("No D&D Beyond character fields found in this PDF.");
		const P = X.parseSheet(F);
		// multiclass: Ability Score Improvements by total character level (the builder's house rule)
		const multi = P.classes.length > 1;
		const report = [];
		const char = X.toChar(P, {report, asiByCharLevel: multi});
		if (multi) report.unshift(char.settings.asiByCharLevel
			? "Ability Score Improvements are given at character levels 4, 8, 12, 16 and 19 (house rule, can be changed in the builder's Home step)."
			: "Ability Score Improvements are given at class levels, as in the rules (the character-level house rule can be turned on in the builder's Home step).");
		return {char, report, parsed: P};
	};
})();
