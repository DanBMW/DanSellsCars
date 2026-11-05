/* Guided part exchange photos: full screen camera with a see through outline to line the car up, one shot at a time.
   Each photo is handed to the existing #pxFile input, so it uploads through the same private px bucket as before.
   No camera (or permission refused): falls back to the phone's own camera picker for that shot. */
(function () {
  'use strict';
  /* line icon style outlines (three quarter view of a generic saloon, end face on the left; flipped for the other side) */
  var BODY = '<path class="b" d="M46 160 Q36 160 36 150 L36 114 Q38 96 66 92 L304 92 Q352 98 358 120 L358 148 Q358 160 346 160 Z"/>' +
    '<path d="M66 92 Q84 62 122 58 L244 58 Q272 60 304 92"/><path d="M122 58 L150 92 L150 160"/>' +
    '<path d="M162 88 L180 66 L234 66 L236 88 Z"/><path d="M248 88 L246 66 Q270 66 290 88 Z"/><path d="M166 128 L344 122"/>' +
    '<circle class="w" cx="64" cy="164" r="15"/><circle class="w" cx="126" cy="164" r="15"/><circle class="w" cx="300" cy="162" r="23"/>';
  var FRONT = BODY + '<path d="M42 110 L68 114 M146 110 L120 114"/><path d="M68 132 L118 132"/><path d="M38 144 L148 144"/>';
  var REAR = BODY + '<path class="s" d="M42 112 L72 114 M146 112 L116 114"/><rect x="80" y="124" width="34" height="11" rx="2"/><path d="M38 144 L148 144"/>';
  var CAR = function (flip, rear) { return '<g' + (flip ? ' transform="translate(392 0) scale(-1 1)"' : '') + '>' + (rear ? REAR : FRONT) + '<path class="g" d="M16 190 L376 190"/></g>'; };
  var DASH = '<path d="M40 70 Q196 20 352 70 L352 150 Q196 120 40 150 Z"/><circle cx="140" cy="100" r="34"/><circle cx="252" cy="100" r="34"/><rect x="170" y="128" width="52" height="20" rx="4"/><text x="196" y="172" text-anchor="middle">Mileage here</text>';
  var SEATS = '<path d="M70 190 L82 70 Q90 50 120 50 L150 50 Q170 52 172 76 L176 190 Z"/><path d="M322 190 L310 70 Q302 50 272 50 L242 50 Q222 52 220 76 L216 190 Z"/><rect x="180" y="120" width="32" height="70" rx="8"/>';
  var SHOTS = [
    { id: 'front-left', t: 'Front left corner', h: 'Stand at the front left corner, a few steps back, so the whole car fits the outline.', svg: CAR(false, false) },
    { id: 'front-right', t: 'Front right corner', h: 'Walk round to the front right corner and line the car up again.', svg: CAR(true, false) },
    { id: 'rear-right', t: 'Rear right corner', h: 'Now the rear right corner, whole car in the outline.', svg: CAR(false, true) },
    { id: 'rear-left', t: 'Rear left corner', h: 'Last corner: rear left.', svg: CAR(true, true) },
    { id: 'dash-mileage', t: 'Dashboard with mileage', h: 'Switch the ignition on (engine off is fine) so the mileage and any warning lights show. Fit the dials in the outline.', svg: DASH },
    { id: 'interior-front', t: 'Front seats', h: 'From the back seat or an open rear door, take the front seats and dashboard.', svg: SEATS }
  ];
  function $(s, r) { return (r || document).querySelector(s); }
  function hand(file) { var inp = $('#pxFile'); if (!inp) return; try { var dt = new DataTransfer(); dt.items.add(file); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { console.warn('px capture', e); } }
  function open() {
    var i = 0, stream = null, o = document.createElement('div'); o.className = 'pxc'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'Guided part exchange photos');
    o.innerHTML = '<video class="pxc-v" playsinline muted autoplay></video><svg class="pxc-o" viewBox="0 0 392 220" aria-hidden="true"></svg>' +
      '<div class="pxc-top"><b class="pxc-n"></b><button type="button" class="pxc-x" aria-label="Close">Close</button></div>' +
      '<div class="pxc-bot"><p class="pxc-t"></p><p class="pxc-h"></p><div class="pxc-dots"></div>' +
      '<div class="pxc-row"><button type="button" class="pxc-skip">Skip</button><button type="button" class="pxc-shoot" aria-label="Take photo"></button><label class="pxc-pick">Upload<input type="file" accept="image/*" capture="environment" hidden></label></div></div><canvas hidden></canvas>';
    document.body.appendChild(o);
    var v = $('.pxc-v', o), pick = $('.pxc-pick input', o);
    function draw() { if (i >= SHOTS.length) return done(); var s = SHOTS[i]; $('.pxc-o', o).innerHTML = s.svg; $('.pxc-n', o).textContent = 'Photo ' + (i + 1) + ' of ' + SHOTS.length; $('.pxc-t', o).textContent = s.t; $('.pxc-h', o).textContent = s.h;
      $('.pxc-dots', o).innerHTML = SHOTS.map(function (_, k) { return '<i' + (k < i ? ' class="ok"' : k === i ? ' class="on"' : '') + '></i>'; }).join(''); }
    function next(file) { if (file) hand(new File([file], 'px-' + SHOTS[i].id + '.jpg', { type: file.type || 'image/jpeg' })); i++; draw(); }
    function done() { close(); var m = $('#pfMsg'); if (m) m.textContent = 'Thanks, your photos are added below.'; }
    function close() { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); o.remove(); }
    $('.pxc-x', o).onclick = close; $('.pxc-skip', o).onclick = function () { next(null); };
    pick.onchange = function () { var f = pick.files && pick.files[0]; pick.value = ''; if (f) next(f); };
    $('.pxc-shoot', o).onclick = function () { if (!stream || !v.videoWidth) { pick.click(); return; }
      var c = $('canvas', o), w = v.videoWidth, h = v.videoHeight, k = Math.min(1, 1600 / Math.max(w, h)); c.width = w * k; c.height = h * k; c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      o.classList.add('flash'); setTimeout(function () { o.classList.remove('flash'); }, 150); c.toBlob(function (b) { next(b); }, 'image/jpeg', 0.85); };
    draw();
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false })
      .then(function (s) { stream = s; v.srcObject = s; }).catch(function () { o.classList.add('nocam'); $('.pxc-h', o).textContent += ' Camera not available here, tap the button to choose a photo.'; });
    else o.classList.add('nocam');
  }
  function init() { var inp = $('#pxFile'); if (!inp || $('#pxGuide')) return; var b = document.createElement('button'); b.type = 'button'; b.id = 'pxGuide'; b.className = 'ct-btn ct-btn-big'; b.textContent = 'Take guided photos';
    var p = document.createElement('p'); p.className = 'ct-hint'; p.textContent = 'Six photos: each corner, the dashboard with the mileage showing and the front seats. We walk you through each one.';
    var lab = inp.closest('label'); lab.parentNode.insertBefore(b, lab); lab.parentNode.insertBefore(p, lab); b.addEventListener('click', open); }
  window.PxCapture = { open: open, shots: SHOTS };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
