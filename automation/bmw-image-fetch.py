#!/usr/bin/env python3
"""Pull BMW M press images through headless chromium.

    python3 automation/bmw-image-fetch.py <out-dir> <name>=<url> [...]

curl cannot reach www.bmw-m.com's asset host from here - it closes the
connection - and an <img> in a local page is blocked by CORS the moment you
touch a canvas. Loading the image URL *as the page* works: chromium's own image
viewer renders it, and the capture is the picture.

The viewer letterboxes whatever it draws, and where it puts the picture cannot
be predicted: the headless virtual screen caps how tall a window really gets, so
a 1920px-tall asset is quietly shrunk to fit and comes back with a black border
baked in, while a 1080px-tall one does not. That border then shows up as bars
down the side of a full-bleed slide.

So the content rect is measured rather than assumed. The viewer's backdrop is
one flat colour, so the crop is the bounding box of everything that is not that
colour, found by walking in from each edge while a whole row or column still
matches it. The result is rescaled to the asset's published size.
"""
import base64, os, re, subprocess, sys

CHROMIUM = os.environ.get('CHROMIUM_PATH', '/opt/pw-browsers/chromium')
QUALITY = 0.92

# Native pixel size BMW publish for each crop suffix in the asset name.
ASPECTS = {'16x9': (1920, 1080), '9x16': (1080, 1920),
           '3x2': (1920, 1280), '4x5': (1080, 1350)}


def _chromium(args, timeout=180):
    return subprocess.run([CHROMIUM, '--headless', '--disable-gpu', '--no-sandbox',
                           '--hide-scrollbars', '--ignore-certificate-errors'] + args,
                          capture_output=True, text=True, timeout=timeout)


_DEFICIT = None


def deficit():
    global _DEFICIT
    if _DEFICIT is None:
        p = '/tmp/.vp-probe.html'
        open(p, 'w').write('<html><body><script>document.title=window.innerHeight;'
                           '</script></body></html>')
        r = _chromium(['--window-size=800,1000', '--virtual-time-budget=1500',
                       '--dump-dom', 'file://' + p])
        m = re.search(r'<title>(\d+)</title>', r.stdout)
        _DEFICIT = 1000 - int(m.group(1)) if m else 0
    return _DEFICIT


def size_for(url):
    for k, wh in ASPECTS.items():
        if url.endswith('-%s.jpg' % k):
            return wh
    return (1920, 1080)


PAD = 120     # a margin of viewer backdrop to measure the crop against
TOL = 10      # luminance tolerance when deciding a row is still backdrop


def grab(url, out):
    w, h = size_for(url)
    png = out + '.tmp.png'
    _chromium(['--force-device-scale-factor=1', '--virtual-time-budget=20000',
               '--window-size=%d,%d' % (w + PAD, h + PAD + deficit()),
               '--screenshot=' + png, url], timeout=240)
    if not os.path.exists(png):
        return None

    enc = out + '.tmp.html'
    open(enc, 'w').write("""<html><body><img id="i" src="data:image/png;base64,%s">
<div id="o"></div><script>
var i=document.getElementById("i"), TOL=%d, W=%d, H=%d;
function go(){
  var s=document.createElement("canvas"); s.width=i.naturalWidth; s.height=i.naturalHeight;
  var x=s.getContext("2d"); x.drawImage(i,0,0);
  var d=x.getImageData(0,0,s.width,s.height).data;
  function px(a,b){var k=(b*s.width+a)*4; return [d[k],d[k+1],d[k+2]];}
  var bg=px(0,0);
  function same(p){return Math.abs(p[0]-bg[0])<=TOL&&Math.abs(p[1]-bg[1])<=TOL
                        &&Math.abs(p[2]-bg[2])<=TOL;}
  function rowBg(y){for(var a=0;a<s.width;a+=3) if(!same(px(a,y))) return false; return true;}
  function colBg(a){for(var y=0;y<s.height;y+=3) if(!same(px(a,y))) return false; return true;}
  var top=0; while(top<s.height-1 && rowBg(top)) top++;
  var bot=s.height-1; while(bot>top && rowBg(bot)) bot--;
  var lef=0; while(lef<s.width-1 && colBg(lef)) lef++;
  var rig=s.width-1; while(rig>lef && colBg(rig)) rig--;
  var cw=rig-lef+1, ch=bot-top+1;
  var c=document.createElement("canvas"); c.width=W; c.height=H;
  var cx=c.getContext("2d"); cx.imageSmoothingQuality="high";
  cx.drawImage(i,lef,top,cw,ch,0,0,W,H);
  document.getElementById("o").textContent=c.toDataURL("image/jpeg",%s);
}
if(i.complete)go();else i.onload=go;
</script></body></html>""" % (base64.b64encode(open(png, 'rb').read()).decode(),
                              TOL, w, h, QUALITY))
    r = _chromium(['--virtual-time-budget=25000', '--dump-dom',
                   'file://' + os.path.abspath(enc)], timeout=240)
    os.remove(enc); os.remove(png)
    m = re.search(r'data:image/jpeg;base64,([A-Za-z0-9+/=]+)', r.stdout)
    if not m:
        return None
    open(out, 'wb').write(base64.b64decode(m.group(1)))
    return os.path.getsize(out)


def main():
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    for pair in sys.argv[2:]:
        name, url = pair.split('=', 1)
        dest = os.path.join(outdir, name + '.jpg')
        if os.path.exists(dest) and os.path.getsize(dest) > 20000:
            print('%-26s cached' % name); continue
        n = grab(url, dest)
        print('%-26s %s' % (name, ('%d bytes' % n) if n else 'FAILED'))


if __name__ == '__main__':
    main()
