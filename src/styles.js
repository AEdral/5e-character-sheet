/* Layout styles for the extension. Colours, fonts, buttons, lists, filters and stat blocks come from 5etools' own CSS. */
(function () {
	const CS = globalThis.CS5E;
	CS.APP_CSS = `
.ve-hwin{z-index:1100!important}
/* uniform type scale: 14px text, 12px secondary, 11px labels, 16px headings */
.cs5e-shell,.cs5e-drawer{font-size:14px;line-height:1.45}
.cs5e-shell .ve-small,.cs5e-drawer .ve-small{font-size:12px}
.cs5e-shell .ve-rd__b,.cs5e-shell .ve-stats,.cs5e-shell .ve-stats td,.cs5e-modal-inner .ve-stats td{font-size:14px}
.cs5e-shell .ve-lst__row-inner,.cs5e-modal-inner .ve-lst__row-inner{font-size:13px}
.cs5e-shell .ve-stats__h-name{font-size:18px}
.cs5e-shell .ve-cls-tbl{font-size:12.5px}
/* softer table/selection contrast */
.cs5e-shell .ve-cls-tbl__stripe-odd:nth-child(odd),.cs5e-modal-inner .ve-cls-tbl__stripe-odd:nth-child(odd){background:rgba(127,127,127,.09)!important}
.cs5e-shell .list-multi-selected,.cs5e-modal-inner .list-multi-selected{box-shadow:inset 0 0 0 5000px rgba(0,107,196,.10)}
.cs5e-shell .cs5e-fl__rows .ve-lst__row:nth-child(even) .ve-lst__row-inner{background:rgba(127,127,127,.04)}
.cs5e-hidden{display:none!important}
body.cs5e-noscroll{overflow:hidden!important}
.cs5e-gap{gap:8px}.cs5e-gap-s{gap:4px}
.cs5e-ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px}

/* pull tab + drawer */
.cs5e-pull{position:fixed;right:0;top:45%;z-index:940;writing-mode:vertical-rl;transform:rotate(180deg);border-radius:0 6px 6px 0!important;padding:10px 5px!important;box-shadow:0 0 8px rgba(0,0,0,.3)}
.cs5e-drawer{position:fixed;top:0;right:0;height:100vh;width:min(420px,96vw);z-index:960;background:var(--rgb-bg);color:var(--rgb-font);border-left:2px solid var(--rgb-border--statblock);box-shadow:-4px 0 18px rgba(0,0,0,.35);transform:translateX(105%);transition:transform .2s ease;display:flex;flex-direction:column;padding:10px 12px;gap:8px;overflow:auto}
.cs5e-drawer--open{transform:none}
.cs5e-drawer__head{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--rgb-border--statblock);padding-bottom:6px}
.cs5e-drawer__head h4{font-family:Convergence,sans-serif;font-variant:small-caps;color:var(--rgb-name)}
.cs5e-drawer__auth{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.cs5e-avatar{width:24px;height:24px;border-radius:50%}
.cs5e-drawer__list{display:flex;flex-direction:column;gap:6px;flex:1}
.cs5e-crow{display:flex;gap:8px;align-items:center;padding:6px;border:1px solid rgba(127,127,127,.3);background:var(--rgb-bg--alt);border-radius:4px}
.cs5e-crow:hover{border-color:var(--rgb-border--statblock)}
.cs5e-crow__img{width:44px;height:44px;border-radius:4px;object-fit:cover;flex:none}
.cs5e-crow__img--ph{display:flex;align-items:center;justify-content:center;font:700 22px Convergence,sans-serif;color:var(--rgb-name);background:var(--rgb-bg)}
.cs5e-crow__main{flex:1;min-width:0;cursor:pointer}
.cs5e-crow__act{display:flex;flex-direction:column;gap:3px;align-items:flex-end}
.cs5e-drawer__settings summary{cursor:pointer;font-weight:bold}
.cs5e-code{display:block;font-size:11px;word-break:break-all;margin:4px 0;user-select:all}

/* shell */
.cs5e-shell{position:fixed;inset:0;z-index:950;background:var(--rgb-bg);color:var(--rgb-font);display:flex;flex-direction:column}
.cs5e-bar{display:flex;align-items:center;gap:10px;padding:6px 12px;background:var(--rgb-bg--alt);border-bottom:2px solid var(--rgb-border--statblock);flex:none}
.cs5e-bar__title{flex:1;font-family:Convergence,sans-serif;font-size:16px;color:var(--rgb-name)}
.cs5e-steps{display:flex;padding:0 16px;border-bottom:1px solid rgba(127,127,127,.3);overflow-x:auto;flex:none;background:var(--rgb-bg)}
.cs5e-step{position:relative;background:none;border:0;padding:9px 14px 8px;cursor:pointer;color:var(--rgb-font--muted);font-size:13px;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;display:flex;align-items:baseline;gap:6px}
.cs5e-step+.cs5e-step::before{content:"";position:absolute;left:0;top:30%;height:40%;border-left:1px solid rgba(127,127,127,.3)}
.cs5e-step:hover{color:var(--rgb-font)}
.cs5e-step--on{color:var(--rgb-name)}
.cs5e-step--on::after{content:"";position:absolute;left:14px;right:14px;bottom:-1px;height:2px;background:var(--rgb-name)}
.cs5e-step__n{font-size:11px;opacity:.55;font-variant-numeric:tabular-nums}
.cs5e-step .cs5e-badge{align-self:center}
.cs5e-badge{display:inline-flex;min-width:16px;height:16px;padding:0 4px;border-radius:8px;align-items:center;justify-content:center;font-size:10px;font-weight:bold;background:#d9534f;color:#fff;margin-left:2px;letter-spacing:0;text-transform:none}
.cs5e-content{flex:1;overflow:auto;padding:12px 16px}
.cs5e-page{max-width:1400px;margin:0 auto}
.cs5e-hdr{display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:2px solid var(--rgb-border--statblock);padding-bottom:4px;margin-bottom:8px;flex-wrap:wrap}
.cs5e-sec{margin:10px 0 14px}
.cs5e-sec__h{font-family:Convergence,sans-serif;font-variant:small-caps;font-size:16px;color:var(--rgb-name);border-bottom:1px solid rgba(127,127,127,.35);margin-bottom:6px}
.cs5e-card{border:1px solid rgba(127,127,127,.35);border-top:3px solid var(--rgb-border--statblock);background:var(--rgb-bg--alt);padding:8px 12px;margin-bottom:14px;box-shadow:0 0 5px rgba(0,0,0,.15)}
.cs5e-next{display:flex;justify-content:flex-end;margin:16px 0 30px}
.cs5e-field{display:flex;flex-direction:column;gap:2px;font-size:12px}
.cs5e-field>span{font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.cs5e-field>span{font-weight:bold;color:var(--rgb-font--muted)}
.cs5e-grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.cs5e-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.cs5e-grid6{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
.cs5e-num{width:70px!important;display:inline-block}
.cs5e-warn{color:#c9302c;font-weight:bold;margin:4px 0}
.cs5e-big{font-size:22px;font-weight:bold}
@media (max-width:900px){.cs5e-grid2,.cs5e-grid3{grid-template-columns:1fr}}

/* accordions (features, traits) */
.cs5e-features{display:flex;flex-direction:column}
.cs5e-acc{border-bottom:1px solid rgba(127,127,127,.3)}
.cs5e-acc>summary{cursor:pointer;padding:5px 2px;display:flex;align-items:center;gap:8px;list-style:none}
.cs5e-acc>summary::before{content:"\\25B8";color:var(--rgb-name);transition:transform .15s}
.cs5e-acc[open]>summary::before{transform:rotate(90deg)}
.cs5e-acc__t{font-weight:bold}
.cs5e-acc__body{padding:4px 4px 10px 20px}
.cs5e-acc--inline{border:0;display:inline-block}
.cs5e-acc--inline>summary{padding:0;font-size:.9em;color:var(--rgb-font--muted)}
.cs5e-lvl{display:inline-block;min-width:58px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-variant:small-caps;color:var(--rgb-font--muted)}

/* choices */
.cs5e-choice{border-left:3px solid var(--rgb-border--statblock);background:var(--rgb-bg);padding:5px 8px;margin:6px 0}
.cs5e-choice--pending{border-left-color:#c9302c}
.cs5e-choice__head{display:flex;align-items:center;gap:8px;justify-content:space-between}
.cs5e-choice__label{font-weight:bold;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.cs5e-choice__todo{font-size:11px;color:#fff;background:#c9302c;padding:0 6px;border-radius:8px}
.cs5e-choice__row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:3px}
.cs5e-choice__col{display:flex;flex-direction:column;gap:3px;margin-top:3px}
.cs5e-choice__sel{width:auto!important;min-width:170px;display:inline-block}
.cs5e-choice__kids{margin-left:14px}
.cs5e-choice select.ve-form-control,.cs5e-hdr select.ve-form-control,.cs5e-page>.cs5e-sec select.ve-form-control{width:auto;display:inline-block;min-width:160px}

/* filter list */
.cs5e-fl{display:flex;flex-direction:column}
.cs5e-fl--split{display:grid;grid-template-columns:minmax(380px,5fr) 6fr;gap:14px;align-items:start}
.cs5e-fl__list{min-width:0}
.cs5e-fl__rows{overflow-y:auto;height:60vh;border-bottom:1px solid rgba(127,127,127,.3)}
.cs5e-fl__preview{max-height:calc(100vh - 200px);overflow:auto;position:sticky;top:0}
.cs5e-fl .ve-lst__row-inner{display:flex;align-items:center}
.cs5e-fl .ve-lst__row-inner>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cs5e-fl__act{margin-left:auto;padding-left:4px;flex:none}
.cs5e-row--active>.ve-lst__row-inner{background:rgba(0,107,196,.10)!important}
.cs5e-mini{flex-wrap:wrap;display:flex}
.cs5e-pills{display:flex;flex-wrap:wrap;gap:4px}
.cs5e-modal-inner .cs5e-fl__rows{height:calc(100vh - 280px)}
@media (max-width:900px){.cs5e-fl--split{grid-template-columns:1fr}.cs5e-fl__preview{position:static;max-height:none}}

/* class table */
.cs5e-cls-wrap{overflow-x:auto}
.cs5e-cls-cur>td{background:rgba(0,107,196,.12)!important;font-weight:bold}
.cs5e-slot-tbl{width:auto;min-width:420px}

/* abilities */
.cs5e-abils{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:10px 0}
@media (max-width:1100px){.cs5e-abils{grid-template-columns:repeat(3,1fr)}}
.cs5e-abil-card{border:1px solid rgba(127,127,127,.35);border-top:3px solid var(--rgb-border--statblock);padding:6px;background:var(--rgb-bg--alt);display:flex;flex-direction:column;gap:5px}
.cs5e-abil-card__n{font-family:Convergence,sans-serif;font-variant:small-caps;color:var(--rgb-name);font-size:16px;text-align:center}
.cs5e-abil-card__t{width:100%;font-size:12px}
.cs5e-abil-card__t td:last-child{text-align:right}
.cs5e-pb{font-size:1.1em;margin:6px 0}

/* chips */
.cs5e-chips{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}
.cs5e-chip{border:1px solid rgba(127,127,127,.4);padding:3px 10px;text-align:center;background:var(--rgb-bg)}
.cs5e-chip--warn{border-color:#c9302c}
.cs5e-chip__v{font-weight:bold;font-size:15px}
.cs5e-chip__l{font-size:10px;text-transform:uppercase;color:var(--rgb-font--muted)}
.cs5e-tag{font-size:11px;padding:0 6px;border-radius:8px;background:var(--rgb-bg--alt);border:1px solid rgba(127,127,127,.4);white-space:nowrap}
.cs5e-spell-known{display:flex;flex-direction:column}
.cs5e-spell-row{display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px dotted rgba(127,127,127,.35)}
.cs5e-spell-row__lvl{display:inline-block;width:22px;text-align:center;font-weight:bold;color:var(--rgb-name)}

/* spell level tabs */
.cs5e-lvltabs{display:flex;flex-wrap:wrap;gap:0;border:1px solid rgba(127,127,127,.35);border-radius:4px;overflow:hidden}
.cs5e-lvltab{background:var(--rgb-bg);border:0;border-right:1px solid rgba(127,127,127,.3);padding:5px 12px;font-size:13px;color:var(--rgb-font);cursor:pointer;display:flex;gap:6px;align-items:baseline}
.cs5e-lvltab:last-child{border-right:0}
.cs5e-lvltab:hover{background:var(--rgb-bg--alt)}
.cs5e-lvltab--on{background:var(--rgb-name)!important;color:#fff}
.cs5e-lvltab__n{font-size:11px;opacity:.75}
.cs5e-lvltab--todo .cs5e-lvltab__n{color:#d9534f;opacity:1;font-weight:bold}
.cs5e-lvltab--on.cs5e-lvltab--todo .cs5e-lvltab__n{color:#fff}

/* equipment */
.cs5e-eq-grp{margin:4px 0 8px;padding-left:4px;border-left:2px solid rgba(127,127,127,.3)}
.cs5e-eq-opt{display:flex;gap:6px;align-items:baseline;font-weight:normal;margin:2px 0}
.cs5e-coins{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.cs5e-tbl{border-collapse:collapse}
.cs5e-tbl th{font-size:11px;text-transform:uppercase;color:var(--rgb-font--muted);border-bottom:1px solid rgba(127,127,127,.4);padding:3px 5px;text-align:left}
.cs5e-tbl td{border-bottom:1px solid rgba(127,127,127,.2);padding:3px 5px;vertical-align:top}

/* sheet */
.cs5e-sheet{max-width:1500px;margin:0 auto}
.cs5e-sheet__head{display:flex;gap:12px;align-items:center;border-bottom:2px solid var(--rgb-border--statblock);padding-bottom:8px;margin-bottom:10px;flex-wrap:wrap}
.cs5e-sheet__avatar{width:72px;height:72px;border-radius:6px;object-fit:cover;border:2px solid var(--rgb-border--statblock)}
.cs5e-sheet__avatar--ph{display:flex;align-items:center;justify-content:center;font:700 34px Convergence,sans-serif;color:var(--rgb-name);background:var(--rgb-bg--alt)}
.cs5e-sheet__who{flex:1}
.cs5e-sheet__top{display:flex;gap:10px;flex-wrap:wrap;align-items:stretch;margin-bottom:10px}
.cs5e-sheet__abils{display:flex;gap:8px;flex-wrap:wrap}
.cs5e-abil{width:92px;border:2px solid var(--rgb-border--statblock);border-radius:8px;text-align:center;padding:4px 2px 2px;background:var(--rgb-bg--alt);display:flex;flex-direction:column;align-items:center}
.cs5e-abil__n{font-size:10px;text-transform:uppercase;font-weight:bold;letter-spacing:.04em}
.cs5e-abil__m{font-size:22px;font-weight:bold;line-height:1.15}
.cs5e-abil__s{border:1px solid rgba(127,127,127,.6);border-radius:10px;padding:0 10px;font-size:13px;background:var(--rgb-bg);margin-top:2px}
.cs5e-stat{min-width:84px;border:2px solid var(--rgb-border--statblock);border-radius:8px;text-align:center;padding:4px 6px;background:var(--rgb-bg--alt);display:flex;flex-direction:column;justify-content:center}
.cs5e-stat--click{cursor:pointer}
.cs5e-stat--shield{border-radius:8px 8px 40px 40px}
.cs5e-stat__l{font-size:10px;text-transform:uppercase;font-weight:bold;color:var(--rgb-font--muted)}
.cs5e-stat__v{font-size:20px;font-weight:bold}
.cs5e-small-v{font-size:16px}
.cs5e-hp{flex:1;min-width:280px;border:2px solid var(--rgb-border--statblock);border-radius:8px;padding:4px 8px;background:var(--rgb-bg--alt);display:flex;flex-direction:column;gap:4px}
.cs5e-hp__ctl{display:flex;gap:6px;align-items:center;justify-content:center}
.cs5e-hp__vals{display:flex;gap:14px;align-items:flex-end;justify-content:center;text-align:center}
.cs5e-hp__sep{font-size:20px;padding-bottom:2px}
.cs5e-sheet__main{display:grid;grid-template-columns:260px 260px 1fr;gap:10px}
@media (max-width:1200px){.cs5e-sheet__main{grid-template-columns:1fr 1fr}.cs5e-sheet__right{grid-column:span 2}}
@media (max-width:700px){.cs5e-sheet__main{grid-template-columns:1fr}.cs5e-sheet__right{grid-column:auto}}
.cs5e-sheet__left,.cs5e-sheet__mid,.cs5e-sheet__right{display:flex;flex-direction:column;gap:10px;min-width:0}
.cs5e-sheet__combat{display:flex;gap:8px;flex-wrap:wrap}
.cs5e-box{border:1px solid rgba(127,127,127,.4);border-top:3px solid var(--rgb-border--statblock);background:var(--rgb-bg--alt);padding:6px 8px}
.cs5e-box__h{font-family:Convergence,sans-serif;font-variant:small-caps;color:var(--rgb-name);font-size:16px;margin-bottom:4px;text-align:center}
.cs5e-saves{display:grid;grid-template-columns:1fr 1fr;gap:4px}
.cs5e-save{display:flex;gap:5px;align-items:center;border:1px solid rgba(127,127,127,.3);padding:2px 5px;background:var(--rgb-bg)}
.cs5e-save__n{flex:1;font-size:12px;font-weight:bold}
.cs5e-dot{display:inline-block;width:10px;height:10px;border-radius:50%;border:1px solid var(--rgb-font--muted)}
.cs5e-dot--on{background:var(--rgb-name);border-color:var(--rgb-name)}
.cs5e-dot--exp{box-shadow:0 0 0 2px var(--rgb-bg),0 0 0 3px var(--rgb-name)}
.cs5e-sense{border:1px solid rgba(127,127,127,.3);padding:2px 6px;margin:2px 0;background:var(--rgb-bg)}
.cs5e-prof{margin:3px 0;font-size:13px}
.cs5e-prof__l{font-size:10px;text-transform:uppercase;font-weight:bold;color:var(--rgb-font--muted)}
.cs5e-skills{width:100%;font-size:13px}
.cs5e-skills td{white-space:nowrap}
.cs5e-skills td{padding:2px 3px;border-bottom:1px dotted rgba(127,127,127,.3)}
.cs5e-tabs{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid rgba(127,127,127,.4);padding-bottom:6px;margin-bottom:6px}
.cs5e-tabbody{min-height:200px}
.cs5e-sub{font-family:Convergence,sans-serif;font-variant:small-caps;color:var(--rgb-name);font-size:16px;border-bottom:1px solid rgba(127,127,127,.35);margin:10px 0 4px;display:flex;align-items:center;gap:10px}
.cs5e-slots{font-family:inherit;font-variant:normal;font-size:12px;color:var(--rgb-font)}
.cs5e-inline{margin-right:10px}
.cs5e-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2000;background:#333;color:#fff;padding:8px 14px;border-radius:4px}
`;
})();
