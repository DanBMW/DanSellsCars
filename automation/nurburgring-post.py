#!/usr/bin/env python3
"""Build the 10-slide Instagram carousel for the 100 Jahre Nurburgring Edition.

    python3 automation/nurburgring-post.py

Renders nurburgring-posts/slide-01.jpg .. slide-10.jpg at 1080x1350 (4:5, the
tallest frame Instagram will carry in a feed carousel) plus the caption and an
index the gallery page reads.

Every factual line comes from BMW M's own edition page:
https://www.bmw-m.com/en/all-models/overview-m-and-m-performance/edition-100-jahre-nurburgring.html

One thing that page does NOT say, and this deck therefore does not claim: a
production cap on the cars. The 100-units-worldwide limit is published for the
three BMW Motorrad models only. Urgency here is built on what is true - a
finite allocation, an order window, and the M2 not arriving until January -
because a made-up build number on a public post is the kind of thing a customer
checks.
"""
import base64, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT  = os.path.join(ROOT, 'nurburgring-posts')
CHROMIUM = os.environ.get('CHROMIUM_PATH', '/opt/pw-browsers/chromium')
W, H = 1080, 1350
JPEG_QUALITY = 0.88

SOURCE = ('https://www.bmw-m.com/en/all-models/overview-m-and-m-performance/'
          'edition-100-jahre-nurburgring.html')

WA = 'https://wa.me/447827138197'


def _chromium(args, timeout=180):
    return subprocess.run([CHROMIUM, '--headless', '--disable-gpu', '--no-sandbox',
                           '--hide-scrollbars'] + args,
                          capture_output=True, text=True, timeout=timeout)


_CHROME_H = None


def viewport_deficit():
    """How much shorter chromium's viewport is than the --window-size asked for.

    Headless chromium still reserves window chrome, so --window-size=1080,1350
    lays the page out in a 1263px viewport. The capture is the full window
    height and the body background does reach the bottom of it, but content
    below the fold is never rastered - which is how the footer went missing from
    the first run of these slides. It was laid out correctly at y=1242 and
    simply not drawn, on a band that still looked like a properly painted card.

    Measured once per process rather than hard-coded, because it is a property
    of whatever browser build happens to be installed.
    """
    global _CHROME_H
    if _CHROME_H is None:
        probe = os.path.join(OUT, '.probe.html')
        os.makedirs(OUT, exist_ok=True)
        open(probe, 'w').write(
            '<html><body><script>document.title=window.innerHeight;'
            '</script></body></html>')
        r = _chromium(['--window-size=1080,1000', '--virtual-time-budget=1500',
                       '--dump-dom', 'file://' + os.path.abspath(probe)])
        os.remove(probe)
        m = re.search(r'<title>(\d+)</title>', r.stdout)
        _CHROME_H = 1000 - int(m.group(1)) if m else 0
    return _CHROME_H


def render(html_path, jpg_path):
    """Rasterise a slide to JPEG. Same two-pass trick the finance cards use:
    chromium only screenshots to PNG, so the PNG is a temporary and a second
    pass re-encodes it through a canvas."""
    png = jpg_path + '.tmp.png'
    r = _chromium(['--force-device-scale-factor=1', '--screenshot=' + png,
                   '--virtual-time-budget=8000',
                   '--window-size=%d,%d' % (W, H + viewport_deficit()),
                   'file://' + os.path.abspath(html_path)])
    if not os.path.exists(png):
        raise SystemExit('render failed for %s: %s' % (html_path, r.stderr[-400:]))

    # The window was made taller by viewport_deficit() so that the whole frame
    # falls inside the viewport and actually gets drawn. The capture comes back
    # at that taller window height, so the canvas is sized to the frame instead
    # of to the image, which crops the surplus back off.
    enc = jpg_path + '.tmp.html'
    open(enc, 'w').write(
        '<html><body><img id="i" src="data:image/png;base64,%s">'
        '<div id="out"></div><script>var i=document.getElementById("i");'
        'function go(){var c=document.createElement("canvas");'
        'c.width=%d;c.height=%d;'
        'c.getContext("2d").drawImage(i,0,0);'
        'document.getElementById("out").textContent=c.toDataURL("image/jpeg",%s);}'
        'if(i.complete)go();else i.onload=go;</script></body></html>'
        % (base64.b64encode(open(png, 'rb').read()).decode(), W, H, JPEG_QUALITY))
    r = _chromium(['--virtual-time-budget=10000', '--dump-dom',
                   'file://' + os.path.abspath(enc)])
    m = re.search(r'data:image/jpeg;base64,([A-Za-z0-9+/=]+)', r.stdout)
    os.remove(enc)
    if not m:
        os.replace(png, jpg_path.replace('.jpg', '.png'))
        raise SystemExit('jpeg encode failed for %s; kept the png' % html_path)
    open(jpg_path, 'wb').write(base64.b64decode(m.group(1)))
    os.remove(png)


CSS = """
@import url('https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&f[]=satoshi@400,500,700,900&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --ink:#07080a;--ink2:#0e1013;--paper:#f3f3f1;--body:#b9bcc0;--dim:#7d8187;
  --green:#6ec53a;--green-dim:rgba(110,197,58,.13);
  --hair:rgba(243,243,241,.13);
  --d:'Clash Display','Satoshi',sans-serif;
  --s:'Satoshi',ui-sans-serif,system-ui,sans-serif}
body{width:1080px;height:1350px;background:var(--ink);color:var(--paper);
  font-family:var(--s);overflow:hidden;position:relative;
  display:flex;flex-direction:column}
/* the M tricolour as a hairline. A nod, not a badge - no roundel, no M mark. */
.stripes{height:5px;display:flex;flex:0 0 auto}
.stripes i{flex:1}
.stripes i:nth-child(1){background:#0066b1}
.stripes i:nth-child(2){background:#16588e}
.stripes i:nth-child(3){background:#e22718}
.top{flex:0 0 118px;display:flex;align-items:center;justify-content:space-between;
  padding:0 68px;border-bottom:1px solid var(--hair)}
.ed{font-size:17px;letter-spacing:.28em;font-weight:700;text-transform:uppercase;
  color:var(--paper)}
.ed b{color:var(--green);font-weight:700}
.num{font-size:17px;letter-spacing:.22em;color:var(--dim);font-weight:500}
.body{flex:1 1 auto;padding:54px 68px 44px;display:flex;flex-direction:column;
  justify-content:center;min-height:0}
.foot{flex:0 0 108px;display:flex;align-items:center;justify-content:space-between;
  padding:0 68px;border-top:1px solid var(--hair)}
.who{font-size:16px;letter-spacing:.14em;color:var(--dim);text-transform:uppercase}
.who b{color:var(--body);font-weight:700}
.swipe{font-size:16px;letter-spacing:.2em;color:var(--green);text-transform:uppercase;
  font-weight:700}
.kicker{font-size:19px;letter-spacing:.3em;text-transform:uppercase;font-weight:700;
  color:var(--green);margin-bottom:26px}
h1{font-family:var(--d);font-weight:600;font-size:116px;line-height:.92;
  letter-spacing:-.02em;margin-bottom:30px}
h2{font-family:var(--d);font-weight:600;font-size:74px;line-height:.98;
  letter-spacing:-.018em;margin-bottom:26px}
.lede{font-size:30px;line-height:1.42;color:var(--body);font-weight:500;
  max-width:880px}
.lede b{color:var(--paper);font-weight:700}
.lede em{color:var(--green);font-style:normal;font-weight:700}
.sp{margin-top:auto}
ul{list-style:none}
li{font-size:27px;line-height:1.4;color:var(--body);padding-left:38px;
  position:relative;margin-bottom:24px;font-weight:500}
li::before{content:'';position:absolute;left:0;top:.62em;width:20px;height:3px;
  background:var(--green)}
li b{color:var(--paper);font-weight:700}
.quote{font-family:var(--d);font-weight:500;font-size:42px;line-height:1.24;
  color:var(--paper);border-left:4px solid var(--green);padding-left:34px;
  margin-top:8px}
.attrib{font-size:21px;color:var(--dim);margin-top:22px;padding-left:38px;
  letter-spacing:.04em}
.swatch{height:210px;border-radius:3px;margin:8px 0 34px;position:relative;
  background:linear-gradient(118deg,#7fdc46 0%,#6ec53a 46%,#3f8f1f 100%)}
.swatch span{position:absolute;left:34px;bottom:28px;font-family:var(--d);
  font-weight:700;font-size:40px;color:#08110a;letter-spacing:-.01em}
.alt{display:flex;align-items:center;gap:22px;font-size:25px;color:var(--body);
  line-height:1.45}
.alt span{flex:1 1 auto}
.alt b{color:var(--paper);font-weight:700}
.alt i{flex:0 0 56px;height:56px;border-radius:3px;background:#0b0f16;
  border:2px solid var(--green);display:block}
.models{display:grid;grid-template-columns:1fr 1fr;gap:16px 22px;margin-top:6px}
.models div{border:1px solid var(--hair);background:var(--ink2);padding:24px 26px}
.models b{display:block;font-family:var(--d);font-weight:600;font-size:36px;
  letter-spacing:-.01em;margin-bottom:7px}
.models small{font-size:19px;color:var(--dim);letter-spacing:.03em}
.tag{display:inline-block;font-size:19px;letter-spacing:.18em;text-transform:uppercase;
  font-weight:700;color:var(--green);border:1px solid rgba(110,197,58,.42);
  background:var(--green-dim);padding:11px 20px;margin-bottom:26px}
.tag.warn{color:#f2c14a;border-color:rgba(242,193,74,.42);background:rgba(242,193,74,.12)}
.big{font-family:var(--d);font-weight:700;font-size:290px;line-height:.82;
  letter-spacing:-.035em;color:var(--green)}
.bigsub{font-size:27px;letter-spacing:.2em;text-transform:uppercase;color:var(--body);
  font-weight:700;margin-top:18px}
.cta{border:1px solid rgba(110,197,58,.4);background:var(--green-dim);
  padding:30px 34px;margin-top:26px}
.cta p{font-size:27px;line-height:1.42;color:var(--paper);font-weight:500}
.cta p+p{margin-top:12px}
.cta b{color:var(--green);font-weight:700}
.note{font-size:20px;line-height:1.45;color:var(--dim);margin-top:26px}
"""


def page(n, inner, swipe=True):
    foot_right = ('<span class="swipe">Swipe &rarr;</span>' if swipe
                  else '<span class="swipe">dan-sells.co.uk</span>')
    return """<!DOCTYPE html><html><head><meta charset="utf-8"><style>%s</style></head>
<body>
<div class="stripes"><i></i><i></i><i></i></div>
<div class="top">
  <span class="ed">100 Jahre <b>N&uuml;rburgring</b> Edition</span>
  <span class="num">%02d / 10</span>
</div>
<div class="body">%s</div>
<div class="foot">
  <span class="who">Dan Cane &middot; <b>BMW Ruxley</b></span>
  %s
</div>
</body></html>""" % (CSS, n, inner, foot_right)


# --- the ten slides -------------------------------------------------------
# Wording is mine; every fact is BMW M's. Where the page gives a list of
# highlights the slide uses that list rather than a rewrite of it.

SLIDES = [
 # 01 hook
 """<div class="kicker">BMW M &middot; Anniversary edition</div>
    <h1>The Ring<br/>turns 100.<br/>M built<br/>six cars<br/>for it.</h1>
    <div class="sp"></div>
    <p class="lede">A paint that exists on nothing else, the Nordschleife
      stitched into the seats, and <b>order books open now</b>.</p>""",

 # 02 why it exists
 """<div class="kicker">Why this edition exists</div>
    <h2>Born on<br/>the racetrack.</h2>
    <p class="lede">The N&uuml;rburgring opened in <b>1927</b>. The Nordschleife runs
      <b>20.8km</b> with <b>73 corners</b>, and every BMW M production car is signed
      off on it before it reaches you.</p>
    <div class="sp"></div>
    <p class="quote">&ldquo;The N&uuml;rburgring is much more than just a racetrack
      for us &ndash; it is a second home for the BMW M brand.&rdquo;</p>
    <p class="attrib">Franciscus van Meel, CEO of BMW M GmbH</p>""",

 # 03 the colour
 """<div class="kicker">The thread running through it</div>
    <h2>N&uuml;rburgring<br/>Green.</h2>
    <div class="swatch"><span>Developed for this edition only</span></div>
    <p class="lede">A finish created <b>exclusively</b> for the anniversary cars.
      You cannot order it on anything else, and when the edition closes it goes
      with it.</p>
    <div class="sp"></div>
    <p class="alt"><i></i><span>Prefer it quieter? Every edition model is also
      available in <b>Sapphire Black metallic</b> with the green accents.</span></p>""",

 # 04 the details
 """<div class="kicker">What you only get on this one</div>
    <h2>The details.</h2>
    <ul>
      <li><b>&lsquo;100 Years&rsquo; anniversary logo</b> in the centre console</li>
      <li>N&uuml;rburgring <b>silhouette embroidered</b> on the front headrests</li>
      <li>Exclusive <b>door sills</b> carrying the &lsquo;100 Years&rsquo; logo</li>
      <li>M Alcantara wheel, green and white stitching, <b>white 12 o&rsquo;clock
        marker</b></li>
      <li>Black leather with green and white <b>contrast stitching</b></li>
      <li>M carbon roof with <b>edition-exclusive stripes</b> and black M logo</li>
      <li>&lsquo;<b>Born on the Racetrack. Made for the Streets.</b>&rsquo; lettering</li>
    </ul>""",

 # 05 M2
 """<div class="tag warn">Orders open January 2027</div>
    <h2>BMW M2.</h2>
    <p class="lede">The compact way in. Straight six, rear drive, and the
      shortest wheelbase of the six.</p>
    <ul style="margin-top:30px">
      <li>Painted <b>door graphics</b> with the N&uuml;rburgring silhouette</li>
      <li>&lsquo;100 Years&rsquo; logo and &lsquo;<b>N&uuml;rburgring since 1927</b>&rsquo; lettering</li>
      <li>M carbon roof with edition-exclusive stripes</li>
      <li>N&uuml;rburgring silhouette embroidered <b>in green</b> on the headrests</li>
      <li><b>930 M</b> light-alloy wheels in High-gloss Black</li>
    </ul>""",

 # 06 M3
 """<div class="tag">Available to order now</div>
    <h2>M3 Saloon.<br/>M3 Touring.</h2>
    <p class="lede">The one that does everything &ndash; and the one that does
      everything <b>and carries the dog</b>.</p>
    <ul style="margin-top:30px">
      <li>Painted graphics on the <b>C-pillar, rear side section, front doors and
        tailgate</b></li>
      <li>Roof with edition-exclusive stripes and black M logo</li>
      <li>N&uuml;rburgring silhouette embroidered in green on the headrests</li>
      <li><b>Green kidney grille frame</b> on the Sapphire Black cars</li>
      <li><b>826 M</b> wheels with accents in N&uuml;rburgring Green</li>
    </ul>""",

 # 07 M4
 """<div class="tag">Available to order now</div>
    <h2>M4 Coup&eacute;.</h2>
    <p class="lede">Two doors, M TwinPower Turbo straight six with <b>BMW M Ignite</b>,
      and the sharpest read on the whole edition.</p>
    <ul style="margin-top:30px">
      <li>Painted graphics on the <b>C-pillar, rear side section, doors and
        tailgate</b></li>
      <li>M carbon roof with edition-exclusive stripes and black M logo</li>
      <li>N&uuml;rburgring silhouette embroidered in green on the headrests</li>
      <li>Green kidney grille frame on the Sapphire Black cars</li>
      <li><b>826 M</b> wheels with accents in N&uuml;rburgring Green</li>
    </ul>""",

 # 08 M5
 """<div class="tag">Available to order now</div>
    <h2>M5 Saloon.<br/>M5 Touring.</h2>
    <p class="lede">M HYBRID drive, <b>V8</b>, and a plug so the school run is
      silent and the B-road is not.</p>
    <ul style="margin-top:30px">
      <li>Painted graphics on the C-pillar, rear side sections and front doors</li>
      <li>M carbon roof with edition-exclusive stripes and black M logo</li>
      <li>N&uuml;rburgring silhouette embroidered <b>in black</b> on the headrests</li>
      <li><b>951 M</b> light-alloy wheels with green accents</li>
      <li>M leather steering wheel with the edition&rsquo;s stitching</li>
    </ul>""",

 # 09 the bikes - the one genuinely capped number on the whole edition
 """<div class="kicker">And three bikes</div>
    <div class="big">100</div>
    <div class="bigsub">units worldwide. Each.</div>
    <p class="lede" style="margin-top:38px">BMW Motorrad build the
      <b>M 1000 RR</b>, <b>M 1000 R</b> and <b>M 1000 XR</b> in the same
      anniversary colours &ndash; and each one is <em>capped at 100 worldwide</em>.</p>
    <p class="lede" style="margin-top:26px"><b>Orders open 19 October 2026.</b> Worldwide, that is three
      hundred bikes between every market there is.</p>""",

 # 10 CTA
 """<div class="kicker">So &ndash; who wants one?</div>
    <h2>Taking orders<br/>now.</h2>
    <ul style="margin-top:14px">
      <li><b>Order now:</b> M3 Saloon, M3 Touring, M4 Coup&eacute;, M5 Saloon, M5 Touring</li>
      <li><b>January 2027:</b> M2</li>
      <li><b>19 October 2026:</b> the three Motorrad models, 100 each</li>
    </ul>
    <div class="cta">
      <p>Allocation on an anniversary edition is finite and it moves fast.
        The ones that land go to whoever <b>put their name down first</b>.</p>
      <p><b>DM me</b> to get yours on the list &ndash; and <b>send this to
        whoever you know</b> who would want one.</p>
    </div>
    <p class="note">Dan Cane, Sales Executive, BMW Ruxley (Hedin Automotive).
      Specification shown is BMW M&rsquo;s published edition detail and may vary
      by market. Not a binding offer.</p>""",
]

CAPTION = """The Nurburgring turns 100 - and BMW M have built six cars and three bikes for it.

NURBURGRING GREEN. A paint developed exclusively for this edition. When the edition closes, the colour goes with it.

Swipe for all of it:
- M3 Saloon, M3 Touring, M4 Coupe, M5 Saloon, M5 Touring - ORDER BOOKS OPEN NOW
- M2 - January 2027
- M 1000 RR, M 1000 R, M 1000 XR - 100 units worldwide EACH, orders from 19 October

The details are the bit that gets me. The Nurburgring silhouette embroidered into the headrests. The '100 Years' logo in the centre console. Door sills. Green and white stitching through black leather. White marker at 12 o'clock. Carbon roof with edition-only stripes. "Born on the Racetrack. Made for the Streets." written on the car.

Allocation on something like this is finite and it moves quickly. The cars that land go to the people who got their name down first - that is just how it works.

So: WHO WANTS ONE?

DM me and I will get you on the list before the allocation is spoken for.

And please SHARE this - tag someone, send it on, stick it on your story. Somebody you know has wanted one of these since 1927.

Dan Cane | BMW Ruxley
dan-sells.co.uk

#BMW #BMWM #Nurburgring #100JahreNurburgring #Nordschleife #GreenHell #BMWM2 #BMWM3 #BMWM4 #BMWM5 #M3Touring #M5Touring #M1000RR #BMWRuxley #HedinAutomotive #LimitedEdition #BornOnTheRacetrack
"""


def main():
    os.makedirs(OUT, exist_ok=True)
    made = []
    for i, inner in enumerate(SLIDES, 1):
        html = os.path.join(OUT, 'slide-%02d.html' % i)
        jpg  = os.path.join(OUT, 'slide-%02d.jpg' % i)
        open(html, 'w').write(page(i, inner, swipe=(i < len(SLIDES))))
        render(html, jpg)
        os.remove(html)
        made.append({'n': i, 'image': 'slide-%02d.jpg' % i,
                     'bytes': os.path.getsize(jpg)})
        print('slide %02d  %6d bytes' % (i, os.path.getsize(jpg)))

    open(os.path.join(OUT, 'caption.txt'), 'w').write(CAPTION)
    json.dump({'title': '100 Jahre Nurburgring Edition',
               'slides': made, 'caption': CAPTION, 'source': SOURCE,
               'size': '%dx%d' % (W, H)},
              open(os.path.join(OUT, 'index.json'), 'w'), indent=1)
    print('\n%d slides + caption in %s' % (len(made), OUT))


if __name__ == '__main__':
    main()
