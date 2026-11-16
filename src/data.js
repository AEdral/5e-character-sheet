/* Caricamento e indicizzazione dei dati di 5e.tools (cartella /data del sito) */
(function () {
	const CS = globalThis.CS5E;
	const K = CS.key;

	const D = (CS.data = {
		loaded: false,
		base: (typeof location !== "undefined" ? location.origin : "") + "/data/",
		settings: {edition: "all", excludeSources: []},
		fetchJson: async path => {
			const r = await fetch(D.base + path, {credentials: "omit"});
			if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
			return r.json();
		},
	});

	/* ---------------- _copy resolver ---------------- */

	const NOT_COPIED = ["page", "otherSources", "additionalSources", "srd", "srd52", "basicRules", "basicRules2024", "reprintedAs", "hasFluff", "hasFluffImages", "hasToken", "_versions", "referenceSources"];
	const COPY_MATCH = ["className", "classSource", "raceName", "raceSource", "shortName", "subclassShortName", "subclassSource", "level"];

	function applyTxt (obj, re, w) {
		if (typeof obj === "string") return obj.replace(re, w);
		if (Array.isArray(obj)) return obj.map(x => applyTxt(x, re, w));
		if (obj && typeof obj === "object") {
			const o = {};
			for (const [k, v] of Object.entries(obj)) o[k] = (k === "type" ? v : applyTxt(v, re, w));
			return o;
		}
		return obj;
	}

	const entName = e => (e && typeof e === "object" ? e.name : e);

	function applyMod (out, prop, mod) {
		if (mod === "remove") { delete out[prop]; return; }
		if (!mod || typeof mod !== "object") return;
		const items = mod.items == null ? [] : (Array.isArray(mod.items) ? mod.items : [mod.items]);
		if (prop === "*") {
			if (mod.mode === "replaceTxt") {
				const re = new RegExp(mod.replace, mod.flags || "g");
				for (const k of Object.keys(out)) if (!["name", "source", "type"].includes(k)) out[k] = applyTxt(out[k], re, mod.with ?? "");
			}
			return;
		}
		const arr = Array.isArray(out[prop]) ? out[prop] : (out[prop] = out[prop] == null ? [] : [out[prop]]);
		switch (mod.mode) {
			case "appendArr": arr.push(...CS.clone(items)); break;
			case "prependArr": arr.unshift(...CS.clone(items)); break;
			case "appendIfNotExistsArr":
				for (const it of items) if (!arr.some(x => JSON.stringify(x) === JSON.stringify(it))) arr.push(CS.clone(it));
				break;
			case "insertArr": arr.splice(mod.index ?? arr.length, 0, ...CS.clone(items)); break;
			case "replaceArr": {
				let idx = -1;
				if (typeof mod.replace === "string") idx = arr.findIndex(x => entName(x) === mod.replace);
				else if (mod.replace?.index != null) idx = mod.replace.index;
				else if (mod.replace?.regex) { const re = new RegExp(mod.replace.regex, mod.replace.flags); idx = arr.findIndex(x => re.test(entName(x) || "")); }
				if (idx >= 0) arr.splice(idx, 1, ...CS.clone(items));
				break;
			}
			case "removeArr": {
				const names = mod.names == null ? [] : (Array.isArray(mod.names) ? mod.names : [mod.names]);
				out[prop] = arr.filter(x => !names.includes(entName(x)) && !items.some(it => JSON.stringify(it) === JSON.stringify(x)));
				break;
			}
			case "replaceTxt": {
				const re = new RegExp(mod.replace, mod.flags || "g");
				out[prop] = applyTxt(arr, re, mod.with ?? "");
				break;
			}
			default: break; // modalità numeriche/rare: ignorate
		}
	}

	/** Risolve in-place le entità con _copy nella lista (le basi possono stare in extraPool) */
	function resolveCopies (list, extraPool = []) {
		const pool = [...list, ...extraPool];
		const byNS = new Map();
		for (const e of pool) {
			const k = K(e.name, e.source);
			if (!byNS.has(k)) byNS.set(k, []);
			byNS.get(k).push(e);
		}
		const resolving = new Set();
		const resolve = ent => {
			if (!ent._copy) return ent;
			if (resolving.has(ent)) return ent;
			resolving.add(ent);
			const c = ent._copy;
			const cands = (byNS.get(K(c.name, c.source)) || []).filter(b => b !== ent && COPY_MATCH.every(f => c[f] == null || String(b[f]).toLowerCase() === String(c[f]).toLowerCase()));
			const base = cands[0] ? resolve(cands[0]) : null;
			const out = base ? CS.clone(base) : {};
			const preserve = c._preserve || {};
			for (const k of NOT_COPIED) if (!preserve[k]) delete out[k];
			for (const [k, v] of Object.entries(ent)) if (k !== "_copy") out[k] = CS.clone(v);
			for (const [prop, mods] of Object.entries(c._mod || {})) {
				for (const m of (Array.isArray(mods) ? mods : [mods])) applyMod(out, prop, m);
			}
			delete out._copy;
			for (const k of Object.keys(ent)) delete ent[k];
			Object.assign(ent, out);
			resolving.delete(ent);
			return ent;
		};
		list.forEach(resolve);
		return list;
	}
	D.resolveCopies = resolveCopies;

	/* ---------------- Filtri edizione/fonte ---------------- */

	const NEW_SOURCES = /^(XPHB|XDMG|XMM)$/i;
	D.isAllowed = ent => {
		if (!ent) return false;
		const s = D.settings;
		if (s.excludeSources?.length && s.excludeSources.includes(String(ent.source).toUpperCase())) return false;
		if (s.edition === "one") {
			if (ent.edition === "classic") return false;
			if ((ent.reprintedAs || []).some(r => NEW_SOURCES.test(String(typeof r === "string" ? r : r.uid || "").split("|").pop()))) return false;
		} else if (s.edition === "classic") {
			if (ent.edition === "one") return false;
		}
		return true;
	};

	/* ---------------- Caricamento ---------------- */

	const idx = list => {
		const m = new Map();
		for (const e of list) m.set(K(e.name, e.source), e);
		return m;
	};

	const cfKey = (name, cls, clsSrc, lvl, src) => [name, cls, clsSrc, lvl, src].map(x => String(x ?? "").toLowerCase()).join("|");
	const scfKey = (name, cls, clsSrc, sc, scSrc, lvl, src) => [name, cls, clsSrc, sc, scSrc, lvl, src].map(x => String(x ?? "").toLowerCase()).join("|");

	D.parseClassFeatureRef = ref => {
		const [name, cls, clsSrc0, lvl, src0] = String(ref).split("|");
		const clsSrc = clsSrc0 || "PHB";
		return {name, className: cls, classSource: clsSrc, level: Number(lvl), source: src0 || clsSrc};
	};
	D.parseSubclassFeatureRef = ref => {
		const [name, cls, clsSrc0, sc, scSrc0, lvl, src0] = String(ref).split("|");
		const clsSrc = clsSrc0 || "PHB"; const scSrc = scSrc0 || "PHB";
		return {name, className: cls, classSource: clsSrc, subclassShortName: sc, subclassSource: scSrc, level: Number(lvl), source: src0 || scSrc};
	};

	D.getClassFeature = ref => {
		const r = D.parseClassFeatureRef(ref);
		return D.classFeatureIdx.get(cfKey(r.name, r.className, r.classSource, r.level, r.source));
	};
	D.getSubclassFeature = ref => {
		const r = D.parseSubclassFeatureRef(ref);
		return D.subclassFeatureIdx.get(scfKey(r.name, r.className, r.classSource, r.subclassShortName, r.subclassSource, r.level, r.source));
	};

	D.resolveRef = (type, ref) => {
		if (!D.loaded || !ref) return null;
		if (type === "refClassFeature") return D.getClassFeature(ref);
		if (type === "refSubclassFeature") return D.getSubclassFeature(ref);
		const [n, s] = String(ref).split("|");
		if (type === "refOptionalfeature") return D.optfeatureIdx.get(K(n, s || "PHB"));
		if (type === "refFeat") return D.featIdx.get(K(n, s || "PHB"));
		return null;
	};

	D.load = async (progress = () => {}) => {
		if (D.loaded) return D;
		if (D._loading) return D._loading;
		D._loading = (async () => {
			const step = (msg, f) => { progress(msg); return f; };
			const [races, classIndex, bgs, feats, opts, base, items, spellIndex, spellSources] = await Promise.all([
				step("species", D.fetchJson("races.json")),
				D.fetchJson("class/index.json"),
				step("background", D.fetchJson("backgrounds.json")),
				step("feats", D.fetchJson("feats.json")),
				D.fetchJson("optionalfeatures.json"),
				step("items", D.fetchJson("items-base.json")),
				D.fetchJson("items.json"),
				step("spells", D.fetchJson("spells/index.json")),
				D.fetchJson("spells/sources.json").catch(() => ({})),
			]);
			const langs = await D.fetchJson("languages.json").catch(() => ({}));
			// homebrew and prerelease content the user added on 5etools (e.g. partnered books such as TLotRR)
			const brews = [];
			for (const util of [globalThis.PrereleaseUtil, globalThis.BrewUtil2]) {
				try {
					const b = await Promise.race([util?.pGetBrewProcessed?.(), new Promise(r => setTimeout(() => r(null), 8000))]);
					if (b && typeof b === "object") brews.push(b);
				} catch (e) { console.warn("[5etools Characters] homebrew", e); }
			}
			const fromBrew = prop => brews.flatMap(b => Array.isArray(b[prop]) ? b[prop] : []);
			D.brewSources = new Map();
			for (const b of brews) for (const src of b._meta?.sources || []) if (src.json) D.brewSources.set(String(src.json).toLowerCase(), src);
			races.race = [...(races.race || []), ...fromBrew("race")];
			races.subrace = [...(races.subrace || []), ...fromBrew("subrace")];
			bgs.background = [...(bgs.background || []), ...fromBrew("background")];
			feats.feat = [...(feats.feat || []), ...fromBrew("feat")];
			opts.optionalfeature = [...(opts.optionalfeature || []), ...fromBrew("optionalfeature")];
			base.baseitem = [...(base.baseitem || []), ...fromBrew("baseitem")];
			base.itemProperty = [...(base.itemProperty || []), ...fromBrew("itemProperty")];
			items.item = [...(items.item || []), ...fromBrew("item")];
			langs.language = [...(langs.language || []), ...fromBrew("language")];
			progress("classes");
			const classFiles = await Promise.all(Object.values(classIndex).map(f => D.fetchJson("class/" + f).catch(() => ({}))));
			progress("spells");
			const spellFiles = await Promise.all(Object.values(spellIndex).map(f => D.fetchJson("spells/" + f).catch(() => ({}))));
			spellFiles.push({spell: fromBrew("spell")});
			classFiles.push({class: fromBrew("class"), subclass: fromBrew("subclass"), classFeature: fromBrew("classFeature"), subclassFeature: fromBrew("subclassFeature")});
			progress("indexing");

			// Specie
			D.races = resolveCopies((races.race || []).filter(r => r.name && r.source));
			D.subraces = resolveCopies((races.subrace || []).filter(r => r.raceName));
			D.raceIdx = idx(D.races);
			for (const r of D.races) r._subraces = [];
			for (const sr of D.subraces) {
				const parent = D.raceIdx.get(K(sr.raceName, sr.raceSource || "PHB"));
				if (parent) parent._subraces.push(sr);
			}

			// Classi
			D.classes = []; const subclasses = []; const cf = []; const scf = [];
			for (const f of classFiles) {
				D.classes.push(...(f.class || []));
				subclasses.push(...(f.subclass || []));
				cf.push(...(f.classFeature || []));
				scf.push(...(f.subclassFeature || []));
			}
			resolveCopies(D.classes);
			resolveCopies(subclasses);
			resolveCopies(cf);
			resolveCopies(scf);
			D.classes = D.classes.filter(c => c.name && c.source && c.hd);
			D.classIdx = idx(D.classes);
			for (const c of D.classes) c._subclasses = [];
			for (const sc of subclasses) {
				const parent = D.classIdx.get(K(sc.className, sc.classSource || "PHB"));
				if (parent && sc.name) parent._subclasses.push(sc);
			}
			D.classFeatureIdx = new Map(cf.map(f => [cfKey(f.name, f.className, f.classSource || "PHB", f.level, f.source), f]));
			D.subclassFeatureIdx = new Map(scf.map(f => [scfKey(f.name, f.className, f.classSource || "PHB", f.subclassShortName, f.subclassSource || "PHB", f.level, f.source), f]));

			// Background, talenti, opzioni
			D.backgrounds = resolveCopies((bgs.background || []).filter(b => b.name));
			D.backgroundIdx = idx(D.backgrounds);
			D.feats = resolveCopies((feats.feat || []).filter(f => f.name));
			D.featIdx = idx(D.feats);
			D.optfeatures = resolveCopies((opts.optionalfeature || []).filter(f => f.name));
			D.optfeatureIdx = idx(D.optfeatures);

			// Oggetti
			const baseItems = (base.baseitem || []).map(i => ({...i, _base: true}));
			const magic = resolveCopies((items.item || []).filter(i => i.name), baseItems);
			const itemMap = new Map();
			for (const i of [...baseItems, ...magic]) itemMap.set(K(i.name, i.source), i);
			D.items = [...itemMap.values()].sort((a, b) => a.name.localeCompare(b.name));
			D.itemIdx = itemMap;
			D.itemProps = new Map((base.itemProperty || []).map(p => [K(p.abbreviation, p.source), p.name || p.entries?.[0]?.name || p.abbreviation]));

			// Incantesimi
			D.spells = [];
			for (const f of spellFiles) D.spells.push(...(f.spell || []));
			resolveCopies(D.spells);
			D.spells = D.spells.filter(s => s.name).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
			D.spellIdx = idx(D.spells);
			D.spellClasses = new Map();
			for (const [src, bySpell] of Object.entries(spellSources || {})) {
				for (const [name, v] of Object.entries(bySpell)) {
					D.spellClasses.set(K(name, src), [...(v.class || []), ...(v.classVariant || []).map(c => ({...c, variant: true}))]);
				}
			}
			for (const s of D.spells) {
				const fromEnt = s.classes?.fromClassList || [];
				if (fromEnt.length && !D.spellClasses.has(K(s.name, s.source))) D.spellClasses.set(K(s.name, s.source), fromEnt);
			}

			D.languages = resolveCopies((langs.language || []).filter(l => l.name)).sort((a, b) => a.name.localeCompare(b.name));

			D.sources = [...new Set([...D.races, ...D.classes, ...D.backgrounds, ...D.feats, ...D.spells].map(e => String(e.source).toUpperCase()))].sort();
			D.loaded = true;
			return D;
		})();
		try { return await D._loading; } finally { D._loading = null; }
	};

	/* ---------------- Query di comodo ---------------- */

	D.getRace = ref => ref && D.raceIdx?.get(K(ref.name, ref.source));
	D.getSubrace = (race, ref) => race && ref && race._subraces.find(s => K(s.name ?? "", s.source) === K(ref.name ?? "", ref.source));
	D.getClass = ref => ref && D.classIdx?.get(K(ref.name, ref.source));
	D.getSubclass = (cls, ref) => cls && ref && cls._subclasses.find(s => K(s.name, s.source) === K(ref.name, ref.source));
	D.getBackground = ref => ref && D.backgroundIdx?.get(K(ref.name, ref.source));
	D.getFeat = ref => ref && D.featIdx?.get(K(ref.name, ref.source));
	D.getOptFeature = ref => ref && D.optfeatureIdx?.get(K(ref.name, ref.source));
	D.getSpell = ref => ref && D.spellIdx?.get(K(ref.name, ref.source));
	D.getItem = ref => ref && D.itemIdx?.get(K(ref.name, ref.source));

	/** Trova un'entità da un riferimento "nome|fonte" (default PHB) */
	D.findByUid = (list, uid, defSrc = "PHB") => {
		const [n, s] = String(uid).split("|");
		const k = K(n, s || defSrc);
		return list.find(e => K(e.name, e.source) === k) || list.find(e => e.name.toLowerCase() === n.toLowerCase());
	};

	/** Spells on a class's list: [{spell, variant}] (variant = optional/expanded list, e.g. TCE) */
	D.spellsForClass = (cls, {variants = true} = {}) => {
		if (!cls) return [];
		const n = cls.name.toLowerCase(); const s = cls.source.toLowerCase();
		const pick = exact => {
			const out = [];
			for (const sp of D.spells) {
				const lst = D.spellClasses.get(K(sp.name, sp.source)) || [];
				const hits = lst.filter(c => c.name?.toLowerCase() === n && (!exact || c.source?.toLowerCase() === s));
				if (!hits.length) continue;
				const variant = hits.every(c => c.variant);
				if (variant && !variants) continue;
				out.push({spell: sp, variant});
			}
			return out;
		};
		const exact = pick(true);
		return exact.length ? exact : pick(false);
	};

	/** Does a spell match a 5etools spell filter string, e.g. "level=1|school=E;D|class=Wizard" */
	D.matchSpellFilter = (sp, filter, {variants = false} = {}) => {
		for (const part of String(filter || "").split("|")) {
			const [k0, v0] = part.split("=");
			if (!v0) continue;
			const k = k0.trim().toLowerCase(); const vals = v0.split(";").map(x => x.trim().toLowerCase());
			if (k === "level" && !vals.includes(String(sp.level))) return false;
			if (k === "school" && !vals.includes(String(sp.school).toLowerCase())) return false;
			if (k === "class") {
				const lst = (D.spellClasses.get(K(sp.name, sp.source)) || []).filter(c => variants || !c.variant);
				if (!lst.some(c => vals.includes(c.name.toLowerCase()))) return false;
			}
			if (k === "components & miscellaneous" && vals.includes("ritual") && !sp.meta?.ritual) return false;
			if (k === "spell attack" && !(sp.spellAttack || []).length) return false;
			if (k === "damage type" && !(sp.damageInflict || []).some(d => vals.includes(d))) return false;
		}
		return true;
	};

	D.propName = (p, itemSrc) => {
		const [abbr, src] = String(p).split("|");
		return D.itemProps?.get(K(abbr, src || (itemSrc === "XPHB" ? "XPHB" : "PHB"))) || D.itemProps?.get(K(abbr, "PHB")) || abbr;
	};

	D.subclassLevel = cls => {
		for (const f of cls?.classFeatures || []) {
			if (typeof f === "object" && f.gainSubclassFeature) return D.parseClassFeatureRef(f.classFeature).level;
		}
		return 3;
	};
})();
