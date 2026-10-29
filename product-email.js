/* Product presentation email builder. Runs fully in the browser; nothing is stored or sent. */
(function (root) {
  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var CC = "Sergio.Garaguso@hedinautomotive.co.uk";
  var PDF = "https://edge.sitecorecloud.io/hedinitaban27a1-hedin8837-prod5c4b-4604/media/project/hedin/retail/hedinautomotive/unitedkingdom/hedinautomotiveuksite/bmw/";
  var PAGE = "https://hedinautomotive.co.uk/buy-car/finance-and-protection-products/protection-products/bmw/";
  var PRODUCTS = [
    { id: "tyreAlloy", slug: "tyre-alloy", name: "Tyre & Alloy Insurance", inList: "Tyre & Alloy Insurance", zero: true,
      text: "Up to 5 new tyres and 5 alloy wheel repairs a year (15 of each on a three-year policy), plus unlimited puncture repairs. It covers accidental and malicious damage and is Defaqto 5-star rated.",
      pdf: PDF + "personal-finance/ipid-for-sjames-taw-202401-combined.pdf" },
    { id: "gap", slug: "gap", name: "GAP Insurance", inList: "GAP Insurance", zero: true,
      text: "Return to Invoice cover if your car is written off, with a contribution towards your motor insurance excess and towards a temporary replacement car. Available for 36 or 48 months.",
      pdf: PDF + "personal-finance/ipid-for-sjms-rtigme-36m-30d-500axs-202407.pdf" },
    { id: "hedinCare", slug: "club-hedincare", name: "Hedin Club Care SMART Protection", inList: "Hedin Club Care SMART Protection", zero: false,
      text: "Unlimited repairs for chips, light scratches, scuffs and minor dents, done in-house or by our mobile team, with two assessments a year. It won't affect your no-claims bonus.",
      page: PAGE + "club-hedincare-cosmetic-repair" },
    { id: "ceramic", slug: "williams-ceramic", name: "Williams Racing Ceramic Coating", inList: "Williams Racing Ceramic Coating", zero: false,
      text: "A high-gloss ceramic coating that protects your paintwork from tree sap, pollutants, UV and the British weather, plus interior fabric protection, all with a lifetime guarantee.",
      page: PAGE + "williams-racing" },
    { id: "warranty", slug: "extended-warranty", name: "Extended Warranty", inList: "an Extended Warranty", zero: false,
      text: "Unlimited claims covering parts and labour with new-for-old manufacturer-specification parts, a replacement car for up to 7 days after the first 24 hours, European cover for up to 60 days a year, plus roadside assistance (UK breakdown cover only).",
      pdf: PDF + "warranty-presenter/12513-hedin-certified-warranty-sales-presenter-jan26-final.pdf" }
  ];
  var VID = "https://dan-sells.co.uk/product-videos/";
  var A = 'style="color:#1c69d4"';
  function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function ordinal(n) { var s = n % 100; if (s >= 11 && s <= 13) return n + "th"; return n + ({1:"st",2:"nd",3:"rd"}[n % 10] || "th"); }
  function deadline(orderDate) {
    var d = new Date(orderDate + "T00:00:00Z"); if (isNaN(d)) throw new Error("Invalid order date");
    d.setUTCDate(d.getUTCDate() + 30); return ordinal(d.getUTCDate()) + " " + MONTHS[d.getUTCMonth()];
  }
  function isValidEmail(e) { return typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim()); }
  function joinList(a, w) { if (a.length <= 1) return a.join(""); return a.slice(0, -1).join(", ") + " " + (w || "and") + " " + a[a.length - 1]; }
  function productBlock(p) {
    var url = VID + p.slug + ".html", n = esc(p.name);
    return '<tr><td style="padding:16px 0;border-top:1px solid #e5e5e5"><p style="margin:0 0 8px;font-size:17px;font-weight:bold;color:#1c69d4">' + n + '</p>\n' +
      '<a href="' + url + '"><img src="' + VID + p.slug + '.gif" width="240" alt="Play the ' + n + ' video" style="display:block;border:0;border-radius:8px;max-width:100%"></a>\n' +
      '<p style="margin:10px 0 6px">' + esc(p.text) + '</p><p style="margin:0"><a href="' + url + '" ' + A + '>&#9654; Watch the video</a> &nbsp;|&nbsp; <a href="' +
      (p.pdf || p.page) + '" ' + A + '>' + (p.pdf ? "Product information (PDF)" : "More information") + '</a></p></td></tr>';
  }
  function build(d) {
    if (!isValidEmail(d.email)) throw new Error("Invalid customer email");
    if (!d.firstName || !String(d.firstName).trim()) throw new Error("First name required");
    var stage = d.stage || "post_handover";
    if (stage !== "point_of_sale" && stage !== "post_handover") throw new Error("Invalid stage");
    var car = String(d.car || "").trim() || "BMW", name = esc(String(d.firstName).trim()), carH = esc(car);
    var bought = d.bought || [];
    var missing = PRODUCTS.filter(function (p) { return bought.indexOf(p.id) < 0; });
    var dl = deadline(d.orderDate);
    var h = '<p>Hi ' + name + ',</p><p>Hope you\'re keeping well!</p>\n<p>' + (stage === "point_of_sale"
      ? 'Thank you so much for your order of your new ' + carH + ', it was lovely speaking with you today. I have handed your details to our handover team, who will be in touch very shortly to arrange your handover (if you haven\'t already booked it in!).'
      : 'It was lovely speaking with you earlier today. I hope you\'re enjoying your new ' + carH + ' and getting settled in with everything! If you need a second handover, please do let me know and I will be happy to assist.') + '</p>\n';
    var subject;
    if (!missing.length) {
      subject = stage === "point_of_sale" ? "Thank you for your order of your new " + car : "Thank you, enjoy your new " + car + "!";
      h += '<p>I just wanted to say a big thank you for choosing our full range of protection for your new car. With your ' + esc(joinList(PRODUCTS.map(function (p) { return p.name; }))) + ' all in place, you\'re fully covered and can simply enjoy the drive.</p>\n' +
        '<p>All of your policy documents will follow shortly, but if you have any questions about your cover or your new car, please do let me know and I will be happy to assist.</p>\n';
    } else {
      var one = missing.length === 1;
      subject = "Protection options for your new " + car;
      h += '<p>I just wanted to follow up regarding the additional protection policies available for your new car. Currently, you haven\'t taken out ' +
        esc(joinList(missing.map(function (p) { return p.inList; }), "or")) + ', so I\'ve included the information on ' + (one ? "this" : "these") + ' below. Tap ' + (one ? "the" : "any") + ' video to watch.</p>\n' +
        '<p>Please note: the product videos in this email are AI generated.</p>\n' +
        '<table width="100%" cellpadding="0" cellspacing="0">' + missing.map(productBlock).join("") + '</table>\n';
      var zero = ["gap", "tyreAlloy"].map(function (id) { return missing.filter(function (p) { return p.id === id; })[0]; }).filter(Boolean);
      if (zero.length) h += '<p>We can also offer ' + esc(joinList(zero.map(function (p) { return p.name; }))) + ' on 0% finance over 10 months, should you prefer to spread the cost.</p>\n';
      h += '<p><a href="' + VID + 'full-presentation.html" ' + A + '>&#9654; Watch our full protection presentation</a></p>\n' +
        '<p>You have until <b>' + dl + '</b> to let me know if you would like to take out ' + (one ? "this policy" : "any of these policies") + ', so there\'s still some time to have a look through the options!</p>\n' +
        '<p>If ' + (one ? "the policy is" : "any of the policies are") + ' of interest, or if you have any questions about your new car, please do let me know and I will be happy to assist.</p>\n';
    }
    h += '<p>Kind regards,</p>';
    var html = '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222;padding:24px"><tr><td>\n' + h + '</td></tr></table></td></tr></table>';
    return { to: d.email.trim(), cc: CC, subject: subject, deadline: dl, html: html, missing: missing.map(function (p) { return p.id; }) };
  }
  function toText(html) {
    return html.replace(/<br>/g, "\n").replace(/<\/p>/g, "\n\n").replace(/<a href="([^"]+)"[^>]*>(?:<img[^>]*>|([^<]*))<\/a>/g, function (m, u, t) { return t ? t.replace("&#9654; ", "") + ": " + u : ""; })
      .replace(/<[^>]+>/g, "").replace(/&nbsp;\|&nbsp;/g, "\n").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\n{3,}/g, "\n\n").trim();
  }
  var api = { build: build, toText: toText, isValidEmail: isValidEmail, deadline: deadline, PRODUCTS: PRODUCTS, CC: CC };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.ProductEmail = api;
})(this);
