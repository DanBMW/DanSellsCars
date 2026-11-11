/* Stylised SVG hatchback (generic, drawn for this tool; not BMW artwork).
 * CarArt.exterior(opts) / CarArt.interior(opts) return SVG markup strings. */
(function () {
  function hexToRgb(h) { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); }
  function rgbToHex(r) { return '#' + r.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
  function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A.map((v, i) => v + (B[i] - v) * t)); }
  function lum(h) { const [r, g, b] = hexToRgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }

  function wheel(cx, cy, size, style, rim, face, caliper) {
    const R = { 17: 60, 18: 64, 19: 68 }[size] || 64;      // tyre radius grows with rim size
    const rimR = R * (0.62 + (size - 17) * 0.035);          // bigger rim = thinner sidewall
    let spokes = '';
    const n = style === 'multi' ? 10 : style === 'aero' ? 5 : 5;
    const faceCol = face || rim;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const rot = (a * 180 / Math.PI);
      if (style === 'y') {
        spokes += `<g transform="rotate(${rot} ${cx} ${cy})">
          <path d="M${cx - 4} ${cy} L${cx - 5} ${cy - rimR * 0.55} L${cx - 14} ${cy - rimR * 0.97} L${cx - 6} ${cy - rimR * 0.97} L${cx} ${cy - rimR * 0.62} L${cx + 6} ${cy - rimR * 0.97} L${cx + 14} ${cy - rimR * 0.97} L${cx + 5} ${cy - rimR * 0.55} L${cx + 4} ${cy} Z" fill="${faceCol}"/></g>`;
      } else if (style === 'double') {
        spokes += `<g transform="rotate(${rot} ${cx} ${cy})">
          <path d="M${cx - 7} ${cy} L${cx - 10} ${cy - rimR * 0.97} L${cx - 4} ${cy - rimR * 0.97} L${cx - 2} ${cy} Z M${cx + 2} ${cy} L${cx + 4} ${cy - rimR * 0.97} L${cx + 10} ${cy - rimR * 0.97} L${cx + 7} ${cy} Z" fill="${faceCol}"/></g>`;
      } else if (style === 'aero') {
        spokes += `<g transform="rotate(${rot} ${cx} ${cy})">
          <path d="M${cx - 9} ${cy} C${cx - 16} ${cy - rimR * 0.5}, ${cx - 22} ${cy - rimR * 0.8}, ${cx - 20} ${cy - rimR * 0.97} L${cx + 12} ${cy - rimR * 0.97} C${cx + 10} ${cy - rimR * 0.7}, ${cx + 8} ${cy - rimR * 0.4}, ${cx + 9} ${cy} Z" fill="${faceCol}"/></g>`;
      } else {
        spokes += `<g transform="rotate(${rot} ${cx} ${cy})">
          <path d="M${cx - 3} ${cy} L${cx - 6} ${cy - rimR * 0.97} L${cx + 6} ${cy - rimR * 0.97} L${cx + 3} ${cy} Z" fill="${faceCol}"/></g>`;
      }
    }
    return `<g class="wheel">
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="#121315"/>
      <circle cx="${cx}" cy="${cy}" r="${R - 3}" fill="none" stroke="#24262a" stroke-width="2"/>
      <circle cx="${cx}" cy="${cy}" r="${rimR}" fill="#0b0c0d"/>
      ${caliper ? `<rect x="${cx + rimR * 0.25}" y="${cy - rimR * 0.62}" width="${rimR * 0.26}" height="${rimR * 0.62}" rx="5" fill="${caliper}"/>` : ''}
      <circle cx="${cx}" cy="${cy}" r="${rimR}" fill="none" stroke="${rim}" stroke-width="5"/>
      ${spokes}
      <circle cx="${cx}" cy="${cy}" r="${rimR * 0.2}" fill="${rim}"/>
      <circle cx="${cx}" cy="${cy}" r="${rimR * 0.1}" fill="#1a1b1e"/>
    </g>`;
  }

  let UID = 0;
  function exterior(o) {
    const u = 'c' + (++UID);
    const p = o.paint || '#cccccc';
    const dark = lum(p) < 0.25;
    const hi = mix(p, '#ffffff', o.matte ? 0.12 : (dark ? 0.32 : 0.45));
    const lo = mix(p, '#000000', o.matte ? 0.25 : 0.38);
    const roofCol = o.blackRoof ? '#0d0e10' : p;
    const caliper = o.caliper || null;
    const ws = o.wheel || {};
    const body = `M62 300 C54 276 58 252 82 240 L176 223 C252 210 322 201 378 197 L476 146
      C530 130 640 126 716 132 C770 137 812 152 846 182 L874 204 C890 220 894 254 888 292
      L884 322 L852 330 A86 86 0 0 0 684 330 L318 330 A86 86 0 0 0 146 330 L84 330 Z`;
    return `<svg viewBox="0 0 960 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${o.label || 'Car illustration'}">
      <defs>
        <linearGradient id="paintG${u}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${hi}"/><stop offset="0.42" stop-color="${p}"/><stop offset="1" stop-color="${lo}"/>
        </linearGradient>
        <linearGradient id="glassG${u}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#4b5560"/><stop offset="0.55" stop-color="#1a1e24"/><stop offset="1" stop-color="#0e1014"/>
        </linearGradient>
        <radialGradient id="shadowG${u}" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="rgba(0,0,0,.45)"/><stop offset="1" stop-color="rgba(0,0,0,0)"/>
        </radialGradient>
        <clipPath id="bodyClip${u}"><path d="${body}"/></clipPath>
      </defs>
      <ellipse cx="475" cy="388" rx="440" ry="26" fill="url(#shadowG${u})"/>
      <path d="${body}" fill="url(#paintG${u})"/>
      <g clip-path="url(#bodyClip${u})">
        <path d="M452 160 C530 136 650 130 716 136 C764 140 800 152 828 170 L836 176 L430 176 Z" fill="${roofCol}" opacity="${o.blackRoof ? 1 : 0}"/>
        <path d="M70 262 C300 236 620 230 884 238" stroke="${mix(p, '#ffffff', 0.55)}" stroke-width="2.2" fill="none" opacity="${o.matte ? 0.25 : 0.7}"/>
        <path d="M120 300 C360 286 640 286 880 292" stroke="${lo}" stroke-width="1.5" fill="none" opacity=".6"/>
        <rect x="0" y="312" width="960" height="30" fill="${o.shadowline ? '#121316' : '#2a2c30'}" opacity=".85"/>
      </g>
      <path d="M402 203 L484 154 C534 142 630 138 696 142 C742 146 776 158 800 178 L812 200 Z" fill="url(#glassG${u})"/>
      <path d="M402 203 L484 154 C534 142 630 138 696 142 C742 146 776 158 800 178 L812 200 Z" fill="none" stroke="${o.shadowline ? '#0b0b0c' : '#b8bcc2'}" stroke-width="4"/>
      <path d="M566 140 L560 202" stroke="#0f1013" stroke-width="9"/>
      <path d="M742 146 C750 166 758 184 770 201" stroke="#0f1013" stroke-width="7" fill="none"/>
      <path d="M392 206 L370 200 C360 212 372 222 396 218 Z" fill="${o.shadowline ? '#111' : p}" stroke="${lo}" stroke-width="1"/>
      <path d="M560 206 L556 318" stroke="${lo}" stroke-width="1.6" opacity=".7"/>
      <path d="M402 214 C398 260 400 300 402 322" stroke="${lo}" stroke-width="1.6" fill="none" opacity=".7"/>
      <path d="M760 210 C770 250 772 290 770 318" stroke="${lo}" stroke-width="1.6" fill="none" opacity=".7"/>
      <rect x="478" y="236" width="42" height="7" rx="3.5" fill="${lo}" opacity=".85"/>
      <rect x="652" y="236" width="42" height="7" rx="3.5" fill="${lo}" opacity=".85"/>
      <path d="M84 246 L168 232 C172 240 168 248 158 251 L92 258 Z" fill="#dfe8f2" stroke="#2a2c30" stroke-width="2"/>
      <path d="M96 252 L150 245" stroke="${o.glow ? '#fffbe8' : '#9fb0c2'}" stroke-width="3" stroke-linecap="round"/>
      <path d="M58 270 C62 262 72 258 84 258 L86 284 L62 288 Z" fill="${o.glow ? '#1a1a1a' : '#202226'}" stroke="${o.glow ? '#f5f1e0' : '#555'}" stroke-width="${o.glow ? 2.5 : 1}"/>
      <path d="M852 206 L884 212 C888 222 888 230 884 236 L846 230 Z" fill="#7a0f14" stroke="#2a0507" stroke-width="2"/>
      <path d="M856 214 L880 218" stroke="#ff4d4d" stroke-width="2.5" stroke-linecap="round"/>
      ${o.pano ? `<path d="M530 134 C600 128 680 129 712 134" stroke="#0e1014" stroke-width="5" fill="none" opacity=".9"/>` : ''}
      <path d="M684 331 A86 86 0 0 1 852 331 Z M146 331 A86 86 0 0 1 318 331 Z" fill="#141518"/>
      <path d="${body}" fill="none" stroke="${lo}" stroke-width="1" opacity=".5"/>
      ${wheel(232, 330, ws.size, ws.style, ws.rim || '#555', ws.face, caliper)}
      ${wheel(768, 330, ws.size, ws.style, ws.rim || '#555', ws.face, caliper)}
    </svg>`;
  }

  function interior(o) {
    const uid = 'i' + (++UID);
    const u = o.uph || '#333', a = o.accent || '#222', t = o.trim || '#777';
    const seat = (x, flip) => `
      <g transform="translate(${x} 0) ${flip ? 'scale(-1 1)' : ''}">
        <path d="M-70 360 C-80 300 -78 220 -60 160 C-50 120 -30 100 0 98 C30 100 50 120 60 160 C78 220 80 300 70 360 Z" fill="${a}"/>
        <path d="M-46 350 C-54 300 -52 230 -40 170 C-32 136 -18 124 0 122 C18 124 32 136 40 170 C52 230 54 300 46 350 Z" fill="${u}"/>
        ${[0, 1, 2, 3, 4, 5, 6].map(i => `<path d="M-40 ${180 + i * 24} L40 ${180 + i * 24}" stroke="${mix(u, '#000000', 0.25)}" stroke-width="2" opacity=".6"/>`).join('')}
        <path d="M-44 70 C-44 40 -26 26 0 26 C26 26 44 40 44 70 L40 92 C30 98 -30 98 -40 92 Z" fill="${a}"/>
        <path d="M-30 66 C-30 46 -16 38 0 38 C16 38 30 46 30 66 L28 82 C20 86 -20 86 -28 82 Z" fill="${u}"/>
        <path d="M-70 360 L70 360 L80 400 L-80 400 Z" fill="${mix(a, '#000000', 0.2)}"/>
      </g>`;
    return `<svg viewBox="0 0 960 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Interior illustration">
      <defs><linearGradient id="cab${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2e33"/><stop offset="1" stop-color="#0f1012"/></linearGradient></defs>
      <rect width="960" height="420" fill="url(#cab${uid})" rx="18"/>
      <path d="M0 0 L960 0 L960 46 C700 30 260 30 0 46 Z" fill="#1a1c20"/>
      <path d="M60 64 C320 46 640 46 900 64 L900 92 C640 80 320 80 60 92 Z" fill="#17181b"/>
      <path d="M80 92 C330 82 630 82 880 92 L880 104 C630 96 330 96 80 104 Z" fill="${t}" opacity=".95"/>
      ${o.illum ? `<path d="M100 100 C340 92 620 92 860 100" stroke="#7fb4ff" stroke-width="2" fill="none" opacity=".75"/>` : ''}
      <rect x="380" y="20" width="280" height="56" rx="10" fill="#0a0b0d" stroke="#3a3d42"/>
      <rect x="392" y="30" width="120" height="36" rx="6" fill="#18324f" opacity=".85"/>
      <rect x="520" y="30" width="128" height="36" rx="6" fill="#1d2a3a" opacity=".85"/>
      ${seat(300, false)}${seat(660, true)}
      <path d="M430 240 L530 240 L540 400 L420 400 Z" fill="#141518"/>
      <rect x="446" y="250" width="68" height="14" rx="5" fill="${t}"/>
    </svg>`;
  }

  function wheelBadge(w) {
    return `<svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${wheel(80, 80, w.size, w.style, w.rim, w.face, null)}</svg>`;
  }
  window.CarArt = { exterior, interior, wheelBadge };
})();
