/* BMW 1 Series configurator for dan-sells.co.uk. No backend, nothing is sent anywhere. */
(function () {
  'use strict';
  const D = window.CONFIG_DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const gbp = (n, dp) => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: dp ? 2 : (n % 1 ? 2 : 0), maximumFractionDigits: 2 });
  const byId = (list, id) => list.find(x => x.id === id);

  const STEPS = [
    { id: 'model', label: 'Model' },
    { id: 'paint', label: 'Exterior colour' },
    { id: 'wheels', label: 'Wheels' },
    { id: 'uph', label: 'Upholstery' },
    { id: 'trim', label: 'Interior trim' },
    { id: 'packs', label: 'Packages' },
    { id: 'options', label: 'Optional equipment' },
    { id: 'acc', label: 'Accessories' },
    { id: 'summary', label: 'Summary' }
  ];

  const S = { v: '120s', paint: 'alpine', wheel: null, uph: null, trim: null, packs: [], opts: [], acc: [], step: 0, paintTab: 'All', uphTab: 'All' };

  // ---------- lookups ----------
  const variant = () => byId(D.variants, S.v) || D.variants[0];
  const line = () => variant().line;
  const avail = it => !it.lines || it.lines.includes(line());
  const unverified = it => !!(it.unverified || (it.unverifiedOn || []).includes(line()));
  const wheelPrice = w => (w.priceBy[line()] ?? 0);
  const packObj = id => byId(D.packs, id);
  const optObj = id => byId(D.options, id);
  const accObj = id => byId(D.accessories, id);
  const isStd = o => (o.standardOn || []).includes(line());
  const packWith = id => S.packs.map(packObj).find(p => p.includes.includes(id));
  const availablePacksWith = id => D.packs.filter(p => avail(p) && p.includes.includes(id)).sort((a, b) => a.price - b.price);
  const hasOpt = id => { const o = optObj(id); return S.opts.includes(id) || isStd(o) || !!packWith(id); };

  function optStatus(o) {
    if (isStd(o)) return { k: 'std', label: 'Standard' };
    const p = packWith(o.id);
    if (p) return { k: 'pack', label: 'In ' + p.name };
    if (o.packOnly) {
      const ap = availablePacksWith(o.id);
      return ap.length ? { k: 'packonly', label: 'With ' + ap[0].name } : { k: 'na', label: 'Not available on ' + D.lines[line()].name };
    }
    if (S.opts.includes(o.id)) return { k: 'on', label: priceLabel(o.price) };
    return { k: 'off', label: priceLabel(o.price) };
  }
  const priceLabel = p => p ? '+' + gbp(p) : 'No cost';

  // ---------- toast ----------
  let toastT;
  function notify(msgs) {
    msgs = [].concat(msgs).filter(Boolean);
    if (!msgs.length) return;
    const t = $('#toast');
    t.innerHTML = msgs.map(m => `<div>${esc(m)}</div>`).join('');
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 4200 + msgs.length * 800);
  }

  // ---------- rules ----------
  function normalize(msgs = []) {
    const L = line();
    if (!avail(byId(D.paints, S.paint) || {})) {
      const old = byId(D.paints, S.paint);
      S.paint = D.paints.find(avail).id;
      if (old) msgs.push(`${old.name} is not offered on ${D.lines[L].name}, so the colour changed to ${byId(D.paints, S.paint).name}.`);
    }
    S.packs = S.packs.filter(id => packObj(id) && avail(packObj(id)));
    const forced = S.packs.map(packObj).find(p => p.forcesWheel);
    if (forced) S.wheel = forced.forcesWheel;
    if (!S.wheel || !avail(byId(D.wheels, S.wheel) || {})) S.wheel = D.defaultWheel[L];
    if (!S.uph || !avail(byId(D.upholstery, S.uph) || {})) S.uph = D.defaultUpholstery[L];
    if (!S.trim || !avail(byId(D.trims, S.trim) || {})) S.trim = D.defaultTrim[L];
    S.opts = S.opts.filter(id => {
      const o = optObj(id);
      if (!o || o.packOnly || isStd(o) || packWith(id)) return false;
      if (o.requiresPack && !o.requiresPack.some(p => S.packs.includes(p))) {
        msgs.push(`${o.name} removed: it needs ${o.requiresPack.map(p => packObj(p).name).join(' or ')}.`);
        return false;
      }
      if (o.group) {
        const clash = D.options.find(x => x.group === o.group && x.id !== id && (isStd(x) || packWith(x.id)));
        if (clash) { msgs.push(`${o.name} removed: ${clash.name} is already included.`); return false; }
      }
      return true;
    });
    S.acc = S.acc.filter(id => {
      const a = accObj(id);
      if (!a) return false;
      if (a.requiresOpt && !a.requiresOpt.every(hasOpt)) { msgs.push(`${a.name} removed: it needs a ${a.requiresOpt.map(o => optObj(o).name.toLowerCase()).join(', ')}.`); return false; }
      if (a.requires && !a.requires.every(r => S.acc.includes(r))) { msgs.push(`${a.name} removed: it needs the ${a.requires.map(r => accObj(r).name).join(', ')}.`); return false; }
      return true;
    });
    return msgs;
  }

  function setVariant(id) {
    if (id === S.v) return;
    const before = line();
    S.v = id;
    const msgs = [];
    if (line() !== before) S.wheel = null;
    normalize(msgs);
    commit(msgs);
  }

  function selectWheel(id) {
    const forced = S.packs.map(packObj).find(p => p.forcesWheel);
    if (forced && id !== forced.forcesWheel) { notify(`Wheels are set by the ${forced.name}. Remove the pack to choose different wheels.`); return; }
    S.wheel = id; commit();
  }

  function togglePack(id) {
    const p = packObj(id), msgs = [];
    if (S.packs.includes(id)) {
      S.packs = S.packs.filter(x => x !== id);
      if (p.forcesWheel) { S.wheel = D.defaultWheel[line()]; msgs.push(`Wheels returned to the standard ${byId(D.wheels, S.wheel).name}.`); }
      msgs.push(`${p.name} removed.`);
    } else {
      if (p.group) S.packs.filter(x => packObj(x).group === p.group).forEach(x => { msgs.push(`${packObj(x).name} replaced by ${p.name}.`); });
      S.packs = S.packs.filter(x => !p.group || packObj(x).group !== p.group);
      S.packs.push(id);
      p.includes.forEach(oid => { if (S.opts.includes(oid)) msgs.push(`${optObj(oid).name} is now part of the ${p.name}, so it is no longer charged separately.`); });
      if (p.forcesWheel) { S.wheel = p.forcesWheel; msgs.push(`${p.name} fits ${byId(D.wheels, p.forcesWheel).name}.`); }
      msgs.push(`${p.name} added.`);
    }
    normalize(msgs);
    commit(msgs);
  }

  function toggleOpt(id) {
    const o = optObj(id), st = optStatus(o), msgs = [];
    if (st.k === 'std') return notify(`${o.name} is standard on the ${variant().name}.`);
    if (st.k === 'pack') return notify(`${o.name} is included in the ${packWith(id).name}. Remove the pack to change it.`);
    if (st.k === 'na') return notify(`${o.name} is not available on the ${variant().name}.`);
    if (st.k === 'packonly') { return togglePack(availablePacksWith(id)[0].id); }
    if (st.k === 'on') {
      S.opts = S.opts.filter(x => x !== id);
    } else {
      if (o.group) {
        const locked = D.options.find(x => x.group === o.group && x.id !== id && (isStd(x) || packWith(x.id)));
        if (locked) return notify(`${o.name} cannot be combined with ${locked.name}, which is ${isStd(locked) ? 'standard' : 'in the ' + packWith(locked.id).name}.`);
        S.opts.filter(x => optObj(x).group === o.group).forEach(x => msgs.push(`${optObj(x).name} removed: it cannot be combined with ${o.name}.`));
        S.opts = S.opts.filter(x => optObj(x).group !== o.group);
      }
      if (o.requiresPack && !o.requiresPack.some(p => S.packs.includes(p))) {
        const pk = o.requiresPack.map(packObj).filter(avail).sort((a, b) => a.price - b.price)[0];
        if (!pk) return notify(`${o.name} is not available on this model.`);
        S.packs = S.packs.filter(x => !pk.group || packObj(x).group !== pk.group).concat(pk.id);
        msgs.push(`${pk.name} added: ${o.name} needs it.`);
      }
      S.opts.push(id);
    }
    normalize(msgs);
    commit(msgs);
  }

  function toggleAcc(id) {
    const a = accObj(id), msgs = [];
    if (S.acc.includes(id)) {
      S.acc = S.acc.filter(x => x !== id);
    } else {
      if (a.group) {
        S.acc.filter(x => accObj(x).group === a.group).forEach(x => msgs.push(`${accObj(x).name} replaced by ${a.name}.`));
        S.acc = S.acc.filter(x => accObj(x).group !== a.group);
      }
      (a.requires || []).forEach(r => { if (!S.acc.includes(r)) { S.acc.push(r); msgs.push(`${accObj(r).name} added: the ${a.name} needs it.`); } });
      (a.requiresOpt || []).forEach(r => { if (!hasOpt(r)) { S.opts.push(r); msgs.push(`${optObj(r).name} added: the ${a.name} needs it.`); } });
      S.acc.push(id);
    }
    normalize(msgs);
    commit(msgs);
  }

  // ---------- pricing ----------
  function lineItems() {
    const v = variant(), items = [];
    const P = byId(D.paints, S.paint), W = byId(D.wheels, S.wheel), U = byId(D.upholstery, S.uph), T = byId(D.trims, S.trim);
    items.push({ cat: 'Paint', name: P.name, price: P.price, tbc: unverified(P) });
    items.push({ cat: 'Wheels', name: W.name, price: S.packs.some(p => packObj(p).forcesWheel === W.id) ? 0 : wheelPrice(W), tbc: unverified(W), note: S.packs.some(p => packObj(p).forcesWheel === W.id) ? 'In M Dynamic Pack' : '' });
    items.push({ cat: 'Upholstery', name: U.name, price: U.price, tbc: unverified(U) });
    items.push({ cat: 'Interior trim', name: T.name, price: T.price, tbc: unverified(T) });
    S.packs.forEach(id => { const p = packObj(id); items.push({ cat: 'Package', name: p.name, price: p.price, tbc: !!p.unverifiedContents, tbcNote: 'contents TBC' }); });
    S.opts.forEach(id => { const o = optObj(id); items.push({ cat: 'Option', name: o.name, price: o.price, tbc: !!o.unverifiedRule }); });
    S.acc.forEach(id => { const a = accObj(id); items.push({ cat: 'Accessory', name: a.name, price: a.price }); });
    return { base: v.price, items };
  }
  function totals() {
    const { base, items } = lineItems();
    const extras = items.reduce((s, i) => s + i.price, 0);
    const otr = base + extras;
    const fee = D.meta.onRoadFee, vr = D.meta.vatRate;
    const baseEx = (base - fee) / (1 + vr), extrasEx = extras / (1 + vr);
    const vat = (otr - fee) - (baseEx + extrasEx);
    return { base, extras, otr, fee, baseEx, extrasEx, vat, items };
  }
  function monthly(otr) {
    const f = D.meta.financeExample;
    if (!f || !f.show) return null;
    const dep = Math.round(otr * f.depositPct), fin = otr - dep, fp = Math.round(otr * f.finalPaymentPct);
    const r = Math.pow(1 + f.aprPct / 100, 1 / 12) - 1, n = f.termMonths - 1;
    const m = (fin - fp / Math.pow(1 + r, f.termMonths)) * r / (1 - Math.pow(1 + r, -n));
    return { dep, fin, fp, m, n, apr: f.aprPct, term: f.termMonths, total: dep + m * n + fp };
  }

  // ---------- URL state ----------
  function toQuery() {
    const q = new URLSearchParams();
    q.set('v', S.v); q.set('p', S.paint); q.set('w', S.wheel); q.set('u', S.uph); q.set('t', S.trim);
    if (S.packs.length) q.set('k', S.packs.join('.'));
    if (S.opts.length) q.set('o', S.opts.join('.'));
    if (S.acc.length) q.set('a', S.acc.join('.'));
    return q;
  }
  function shareUrl() { const q = toQuery(); q.set('s', 'summary'); return location.origin + location.pathname + '?' + q.toString(); }
  function fromQuery() {
    const q = new URLSearchParams(location.search);
    if (q.get('v') && byId(D.variants, q.get('v'))) S.v = q.get('v');
    S.paint = q.get('p') || S.paint; S.wheel = q.get('w'); S.uph = q.get('u'); S.trim = q.get('t');
    const list = k => (q.get(k) || '').split('.').filter(Boolean);
    S.packs = list('k').filter(packObj);
    S.opts = list('o').filter(optObj);
    S.acc = list('a').filter(accObj);
    const s = q.get('s'); const i = STEPS.findIndex(x => x.id === s); if (i >= 0) S.step = i;
    normalize();
  }
  function syncUrl() {
    const q = toQuery(); q.set('s', STEPS[S.step].id);
    history.replaceState(null, '', location.pathname + '?' + q.toString());
  }

  // ---------- render ----------
  function commit(msgs) { if (msgs && msgs.length) notify(msgs); render(); }

  function render() {
    const v = variant(), t = totals(), m = monthly(t.otr);
    $('#modelMeta').innerHTML = `<div class="mm-name">${esc(v.name)}</div>
      <div class="mm-specs"><span><b>${v.hp} hp</b> Max. power</span><span><b>${v.accel} s</b> 0 to 62 mph</span><span><b>${v.mpg ? v.mpg + ' mpg' : 'TBC'}</b> Combined</span></div>`;
    $('#topTotal').textContent = gbp(t.otr);
    $('#barTotal').textContent = gbp(t.otr);
    $('#barMonthly').innerHTML = m ? `Illustrative example ${gbp(Math.round(m.m))}/month <button type="button" class="linkish" data-go="summary">see assumptions</button>` : '';
    renderSteps();
    const sid = STEPS[S.step].id;
    const isSum = sid === 'summary';
    document.body.classList.toggle('is-summary', isSum);
    $('#stage').hidden = isSum; $('#panel').hidden = isSum; $('#summary').hidden = !isSum;
    if (isSum) renderSummary(t, m); else { renderStage(sid); renderPanel(sid); }
    $('#backBtn').disabled = S.step === 0;
    $('#nextBtn').textContent = S.step === STEPS.length - 2 ? 'See summary' : (isSum ? 'Start again' : 'Next');
    syncUrl();
  }

  function renderSteps() {
    $('#stepBar').innerHTML = STEPS.map((s, i) => `<li><button type="button" data-step="${i}" class="${i === S.step ? 'active' : ''} ${i < S.step ? 'done' : ''}" ${i === S.step ? 'aria-current="step"' : ''}><span class="sn">${i + 1}</span>${esc(s.label)}</button></li>`).join('');
    const act = $('#stepBar .active'); if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function artOpts() {
    const P = byId(D.paints, S.paint), W = byId(D.wheels, S.wheel);
    const L = line();
    return {
      paint: P.hex, matte: !!P.matte, blackRoof: S.opts.includes('roof'), pano: S.opts.includes('pano'),
      wheel: W, shadowline: hasOpt('shadow') || L === 'm135', glow: hasOpt('glow'),
      caliper: S.packs.includes('msppm135') || S.packs.includes('mdynamic') ? '#c3261f' : (L === 'sport' ? null : '#1f4ea1'),
      label: `${variant().name} in ${P.name} with ${W.name}`
    };
  }

  function renderStage(sid) {
    const interior = sid === 'uph' || sid === 'trim';
    const U = byId(D.upholstery, S.uph), T = byId(D.trims, S.trim), P = byId(D.paints, S.paint), W = byId(D.wheels, S.wheel);
    $('#stage').classList.toggle('interior', interior);
    $('#stageArt').innerHTML = interior ? CarArt.interior({ uph: U.hex, accent: U.accent, trim: T.hex, illum: /Illuminated/.test(T.name) }) : CarArt.exterior(artOpts());
    $('#stageCaption').innerHTML = interior
      ? `<span>${esc(U.name)}</span><span>${esc(T.name)}</span>`
      : `<span>${esc(P.name)}</span><span>${esc(W.name)}</span>`;
  }

  const tbcTag = it => unverified(it) ? ' <span class="tbc" title="Price not confirmed on BMW UK">TBC</span>' : '';

  function renderPanel(sid) {
    const P = $('#panel');
    const head = (title, sub) => `<div class="panel-head"><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>`;
    let h = '';
    if (sid === 'model') {
      h += head('Choose your model', 'Every 1 Series is a petrol automatic. Prices are on the road.');
      Object.keys(D.lines).forEach(L => {
        const vs = D.variants.filter(v => v.line === L);
        h += `<h3 class="grp">${esc(D.lines[L].name)}</h3><div class="cards">` + vs.map(v => `
          <button type="button" class="card ${v.id === S.v ? 'sel' : ''}" data-variant="${v.id}" aria-pressed="${v.id === S.v}">
            <span class="c-title">${esc(v.name)}</span>
            <span class="c-price">From ${gbp(v.price)}</span>
            <span class="c-specs">${v.hp} hp · 0 to 62 mph ${v.accel}s · ${esc(v.drive)}</span>
          </button>`).join('') + '</div>';
      });
    } else if (sid === 'paint') {
      const tabs = ['All', 'Solid', 'Metallic', 'BMW Individual'];
      const list = D.paints.filter(avail).filter(p => S.paintTab === 'All' || p.type === S.paintTab);
      const cur = byId(D.paints, S.paint);
      h += head('Exterior colour');
      h += `<div class="tabs" role="tablist">${tabs.map(t => `<button type="button" role="tab" aria-selected="${t === S.paintTab}" data-ptab="${t}">${t}</button>`).join('')}</div>`;
      h += `<div class="sel-head"><span class="dot" style="background:${cur.hex}"></span><div><b>${esc(cur.name)}</b><span>${cur.price ? gbp(cur.price) : '£0'}${tbcTag(cur)} · ${esc(cur.type)}${cur.matte ? ', matt' : ''}</span></div></div>`;
      h += `<div class="swatches">${list.map(p => `<button type="button" class="sw ${p.id === S.paint ? 'sel' : ''} ${p.matte ? 'matte' : ''}" style="--c:${p.hex}" data-paint="${p.id}" title="${esc(p.name)}, ${p.price ? gbp(p.price) : 'no cost'}" aria-label="${esc(p.name)}" aria-pressed="${p.id === S.paint}"></button>`).join('')}</div>`;
      const hidden = D.paints.filter(p => !avail(p));
      if (hidden.length) h += `<p class="hint">Also available on other models: ${hidden.map(p => esc(p.name)).join(', ')}.</p>`;
    } else if (sid === 'wheels') {
      const forced = S.packs.map(packObj).find(p => p.forcesWheel);
      h += head('Wheels', forced ? `Set by the ${esc(forced.name)}.` : 'Bigger wheels show in the drawing with thinner tyre sidewalls.');
      h += `<div class="cards">${D.wheels.filter(avail).map(w => `
        <button type="button" class="card wheelcard ${w.id === S.wheel ? 'sel' : ''} ${forced && w.id !== forced.forcesWheel ? 'locked' : ''}" data-wheel="${w.id}" aria-pressed="${w.id === S.wheel}">
          <span class="wb">${CarArt.wheelBadge(w)}</span>
          <span><span class="c-title">${esc(w.name)}</span><span class="c-price">${wheelPrice(w) ? gbp(wheelPrice(w)) : 'No cost'}${tbcTag(w)}</span></span>
        </button>`).join('')}</div>`;
    } else if (sid === 'uph') {
      const tabs = ['All', ...new Set(D.upholstery.filter(avail).map(u => u.type))];
      const list = D.upholstery.filter(avail).filter(u => S.uphTab === 'All' || u.type === S.uphTab);
      const cur = byId(D.upholstery, S.uph);
      h += head('Upholstery');
      h += `<div class="tabs">${tabs.map(t => `<button type="button" role="tab" aria-selected="${t === S.uphTab}" data-utab="${t}">${t}</button>`).join('')}</div>`;
      h += `<div class="sel-head"><span class="dot" style="background:linear-gradient(135deg,${cur.hex} 55%,${cur.accent} 55%)"></span><div><b>${esc(cur.name)}</b><span>${cur.price ? gbp(cur.price) : '£0'}${tbcTag(cur)} · ${esc(cur.type)}</span></div></div>`;
      h += `<div class="swatches">${list.map(u => `<button type="button" class="sw ${u.id === S.uph ? 'sel' : ''}" style="--c:linear-gradient(135deg,${u.hex} 55%,${u.accent} 55%)" data-uph="${u.id}" title="${esc(u.name)}" aria-label="${esc(u.name)}" aria-pressed="${u.id === S.uph}"></button>`).join('')}</div>`;
    } else if (sid === 'trim') {
      const cur = byId(D.trims, S.trim);
      h += head('Interior trim');
      h += `<div class="sel-head"><span class="dot" style="background:${cur.hex}"></span><div><b>${esc(cur.name)}</b><span>${cur.price ? gbp(cur.price) : '£0'}${tbcTag(cur)}</span></div></div>`;
      h += `<div class="swatches">${D.trims.filter(avail).map(t => `<button type="button" class="sw ${t.id === S.trim ? 'sel' : ''}" style="--c:${t.hex}" data-trim="${t.id}" title="${esc(t.name)}" aria-label="${esc(t.name)}" aria-pressed="${t.id === S.trim}"></button>`).join('')}</div>`;
    } else if (sid === 'packs') {
      h += head('Packages', 'A package locks in its contents, so they are not charged twice. Contents marked TBC are indicative.');
      h += `<div class="cards">${D.packs.filter(avail).map(p => {
        const on = S.packs.includes(p.id);
        const contents = p.includes.map(id => optObj(id).name).concat(p.extras || []);
        return `<div class="card pack ${on ? 'sel' : ''}">
          <div class="pack-top"><span class="c-title">${esc(p.name)}</span><span class="c-price">${gbp(p.price)}</span></div>
          <p class="c-desc">${esc(p.desc)}</p>
          ${contents.length ? `<ul class="contents">${contents.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
          ${p.unverifiedContents ? '<p class="hint small"><span class="tbc">TBC</span> Contents indicative, Dan will confirm.</p>' : ''}
          <button type="button" class="btn ${on ? 'ghost' : 'primary'} small" data-pack="${p.id}" aria-pressed="${on}">${on ? 'Remove' : 'Add package'}</button>
        </div>`;
      }).join('')}</div>`;
    } else if (sid === 'options') {
      h += head('Optional equipment', 'Standard and package items are locked. Some options cannot be combined, the configurator handles that for you.');
      D.optionCats.forEach(c => {
        const list = D.options.filter(o => o.cat === c);
        h += `<h3 class="grp">${esc(c)}</h3><div class="rows">${list.map(o => {
          const st = optStatus(o);
          const checked = ['std', 'pack', 'on'].includes(st.k);
          return `<button type="button" class="row st-${st.k}" data-opt="${o.id}" aria-pressed="${checked}" ${st.k === 'na' ? 'aria-disabled="true"' : ''}>
            <span class="chk">${st.k === 'std' || st.k === 'pack' ? '🔒' : (checked ? '✓' : '')}</span>
            <span class="r-name">${esc(o.name)}${o.unverifiedRule ? ' <span class="tbc" title="Rule assumed, not confirmed on BMW UK">TBC</span>' : ''}${o.desc ? `<small>${esc(o.desc)}</small>` : ''}</span>
            <span class="r-price">${esc(st.label)}</span>
          </button>`;
        }).join('')}</div>`;
      });
    } else if (sid === 'acc') {
      h += head('Accessories', 'Genuine BMW accessories, fitted price. Roof boxes need the roof rack, rear carriers need a towbar: they are added for you.');
      h += `<div class="rows">${D.accessories.map(a => {
        const on = S.acc.includes(a.id);
        return `<button type="button" class="row ${on ? 'st-on' : 'st-off'}" data-acc="${a.id}" aria-pressed="${on}">
          <span class="chk">${on ? '✓' : ''}</span><span class="r-name">${esc(a.name)}</span><span class="r-price">+${gbp(a.price)}</span></button>`;
      }).join('')}</div>`;
    }
    P.innerHTML = h;
    P.scrollTop = 0;
  }

  function renderSummary(t, m) {
    const v = variant(), c = D.meta.contact;
    const P = byId(D.paints, S.paint), W = byId(D.wheels, S.wheel), U = byId(D.upholstery, S.uph), T = byId(D.trims, S.trim);
    const included = D.options.filter(o => !S.opts.includes(o.id) && (isStd(o) || packWith(o.id)));
    const url = shareUrl();
    const anyTbc = t.items.some(i => i.tbc);
    const specRows = t.items.map(i => `<tr><td>${esc(i.cat)}</td><td>${esc(i.name)}${i.tbc ? ` <span class="tbc">${i.tbcNote || 'TBC'}</span>` : ''}${i.note ? ` <small>(${esc(i.note)})</small>` : ''}</td><td class="num">${i.price ? gbp(i.price) : '£0'}</td></tr>`).join('');
    const waText = `Hi Dan, I've built a ${v.name} on your 1 Series configurator: ${P.name}, ${W.name}, ${U.name}. Indicative price ${gbp(t.otr)}. Can you give me a proper quote? ${url}`;
    const mailBody = `Hi Dan,\n\nHere's the BMW 1 Series I've built on your configurator:\n\n${v.name}: ${gbp(v.price)}\n` +
      t.items.map(i => `${i.cat}: ${i.name}: ${i.price ? gbp(i.price) : '£0'}`).join('\n') +
      `\n\nIndicative on the road price: ${gbp(t.otr)}\n\nMy build: ${url}\n\nCould you send me a quote?\n`;
    $('#summary').innerHTML = `
      <div class="sum-hero">
        <div class="sum-art">${CarArt.exterior(artOpts())}</div>
        <div class="sum-intro">
          <p class="eyebrow">Your BMW 1 Series, built with Dan</p>
          <h1>${esc(v.name)}</h1>
          <p class="sum-specs">${v.hp} hp · 0 to 62 mph in ${v.accel}s · ${esc(v.drive)} · ${esc(v.fuel)} · ${esc(v.gearbox)}${v.mpg ? ` · ${v.mpg} mpg combined` : ''} · CO2 ${esc(v.co2)} g/km (WLTP)</p>
          <div class="sum-total"><small>Indicative on the road price</small><strong>${gbp(t.otr)}</strong></div>
          <div class="cta">
            <a class="btn primary" target="_blank" rel="noopener" href="https://wa.me/${c.whatsapp}?text=${encodeURIComponent(waText)}">Send this build to Dan on WhatsApp</a>
            <a class="btn ghost" href="mailto:${c.email}?subject=${encodeURIComponent('My BMW 1 Series build: ' + v.name)}&body=${encodeURIComponent(mailBody)}">Email it to Dan</a>
            <a class="btn ghost" target="_blank" rel="noopener" href="${c.booking}">Book a visit</a>
          </div>
          <div class="share">
            <label for="shareUrl">Your build link</label>
            <div class="share-row"><input id="shareUrl" readonly value="${esc(url)}"><button type="button" class="btn small" id="copyBtn">Copy</button>${navigator.share ? '<button type="button" class="btn small ghost" id="nativeShare">Share</button>' : ''}<button type="button" class="btn small ghost" id="printBtn">Print or save PDF</button></div>
          </div>
        </div>
      </div>
      <div class="sum-grid">
        <section class="sum-card">
          <h2>Your specification</h2>
          <table class="spec"><tbody>
            <tr><td>Model</td><td>${esc(v.name)}</td><td class="num">${gbp(v.price)}</td></tr>
            ${specRows}
          </tbody></table>
          ${included.length ? `<h3>Included at no extra cost</h3><ul class="inc">${included.map(o => `<li>${esc(o.name)} <small>${isStd(o) ? 'standard' : esc(packWith(o.id).name)}</small></li>`).join('')}</ul>` : ''}
          <p class="hint no-print"><button type="button" class="linkish" data-go="model">Change model</button> · <button type="button" class="linkish" data-go="options">Change options</button></p>
        </section>
        <section class="sum-card">
          <h2>Price breakdown</h2>
          <table class="spec price"><tbody>
            <tr><td>Base vehicle, excluding VAT</td><td class="num">${gbp(t.baseEx, 1)}</td></tr>
            <tr><td>Options and accessories, excluding VAT</td><td class="num">${gbp(t.extrasEx, 1)}</td></tr>
            <tr><td>VAT at ${Math.round(D.meta.vatRate * 100)}%</td><td class="num">${gbp(t.vat, 1)}</td></tr>
            <tr><td>On the road costs</td><td class="num">${gbp(t.fee, 1)}</td></tr>
            <tr class="tot"><td>On the road price</td><td class="num">${gbp(t.otr, 1)}</td></tr>
          </tbody></table>
          ${m ? `<div class="finance">
            <h3>Illustrative monthly example</h3>
            <p class="big">${gbp(Math.round(m.m))} <small>per month</small></p>
            <p class="small">Illustrative example only. This is not a finance quote, offer or representative example, and approval is not implied.
            It assumes a ${gbp(m.dep)} deposit (${Math.round(D.meta.financeExample.depositPct * 100)}%), ${m.n} monthly payments, an optional final payment of ${gbp(m.fp)},
            a ${m.term} month term and ${m.apr}% APR, with no deposit contribution. Total payable on these assumptions ${gbp(Math.round(m.total))}.
            Real figures depend on mileage, offers and status. Ask Dan for a quote from BMW Financial Services.</p>
          </div>` : ''}
          ${anyTbc ? '<p class="hint small"><span class="tbc">TBC</span> marks a price or rule not confirmed on BMW UK. Dan will confirm it.</p>' : ''}
        </section>
      </div>
      <p class="sum-foot">Prices indicative, from BMW UK in ${esc(D.meta.pricesAsOf)}, and subject to confirmation. Independent tool, not affiliated with BMW. Built by ${esc(c.name)}, ${esc(c.role)}.</p>`;
    $('#copyBtn').onclick = () => {
      const i = $('#shareUrl');
      (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).then(() => notify('Link copied.'), () => { i.select(); document.execCommand('copy'); notify('Link copied.'); });
    };
    if ($('#nativeShare')) $('#nativeShare').onclick = () => navigator.share({ title: 'My BMW 1 Series build', url }).catch(() => {});
    $('#printBtn').onclick = () => window.print();
    window.scrollTo(0, 0);
  }

  // ---------- events ----------
  document.addEventListener('click', e => {
    const b = e.target.closest('button, [data-go]');
    if (!b) return;
    const d = b.dataset;
    if (d.step !== undefined) { S.step = +d.step; render(); }
    else if (d.go) { S.step = STEPS.findIndex(s => s.id === d.go); render(); }
    else if (d.variant) setVariant(d.variant);
    else if (d.paint) { S.paint = d.paint; render(); }
    else if (d.ptab) { S.paintTab = d.ptab; render(); }
    else if (d.utab) { S.uphTab = d.utab; render(); }
    else if (d.wheel) selectWheel(d.wheel);
    else if (d.uph) { S.uph = d.uph; render(); }
    else if (d.trim) { S.trim = d.trim; render(); }
    else if (d.pack) togglePack(d.pack);
    else if (d.opt) toggleOpt(d.opt);
    else if (d.acc) toggleAcc(d.acc);
  });
  $('#backBtn').onclick = () => { if (S.step > 0) { S.step--; render(); } };
  $('#nextBtn').onclick = () => {
    if (STEPS[S.step].id === 'summary') { history.replaceState(null, '', location.pathname); Object.assign(S, { v: '120s', paint: 'alpine', wheel: null, uph: null, trim: null, packs: [], opts: [], acc: [], step: 0 }); normalize(); render(); return; }
    S.step = Math.min(STEPS.length - 1, S.step + 1); render();
  };

  // test hook
  window.cfg = { S, totals, render, normalize, togglePack, toggleOpt, toggleAcc, setVariant, selectWheel, shareUrl };

  fromQuery();
  render();
})();
