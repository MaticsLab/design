# This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
# distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
#
# Copyright (c) City Politics INC.
#
# City Politics' changes to Penpot's compiled frontend bundle (used by docker/citypolitics/Dockerfile.frontend, which
# ships Penpot's official bundle for the release we track). Each change is the compiled form of a source change in this
# fork, so a frontend built from source gets the same result:
#
#   1. Light is the default theme (frontend/src/app/util/theme.cljs and the places that read an unset theme): new
#      accounts and anyone who never picked a theme see the light UI; dark and system stay a choice in the profile.
#   2. City Politics branding: the megaphone mark in place of Penpot's logo (the inline SVG sprite's logo symbols, the
#      favicon, the login illustration, the link preview), "City Politics Design" in the browser tab, and the login and
#      register pages' taglines. Penpot's attribution stays: Help → About Penpot, the LICENSE and NOTICE.md.
#
# Every patch must match exactly as expected (the counts are checked), so a new Penpot release that moves the code makes
# the image build fail here instead of shipping a half-applied change.
#
# Usage: python3 apply.py <bundle dir (the /var/www/app copy)> <this brand dir> [--brand-only]
#   --brand-only: for a bundle built from this fork's sources, which already has the light default (part 1 is skipped).

import glob
import os
import re
import shutil
import sys

APP, BRAND = sys.argv[1], sys.argv[2]
BRAND_ONLY = "--brand-only" in sys.argv[3:]
NAME = "City Politics Design"


def patch(path, pattern, repl, count=1, regex=False):
    p = os.path.join(APP, path)
    s = open(p, encoding="utf-8").read()
    n = len(re.findall(pattern, s)) if regex else s.count(pattern)
    if n != count:
        sys.exit(f"brand: {path}: expected {count} match(es) of {pattern[:80]!r}, found {n}")
    s = re.sub(pattern, repl, s) if regex else s.replace(pattern, repl)
    open(p, "w", encoding="utf-8").write(s)


# ---------- 1. light by default ----------

def light_default():
  # app.util.theme/resolve-theme: an unset or legacy "default" theme resolves to light.
  patch("js/main.js", r'(\$profile_theme\$\$,"default"\)\?)"dark"(:\$APP\.\$app\$common\$data\$nilv\$\$\.\$cljs\$core\$IFn\$_invoke\$arity\$2\$\(\$profile_theme\$\$,)"dark"\)',
        r'\1"light"\2"light")', regex=True)
  # app.main.ui.settings.options: the theme select shows light for an unset theme.
  patch("js/main-settings.js", r'(\$p1__\d+_SHARP_\$\$),"default"\)\?"dark":\$APP\.\$cljs\$core\$truth_\$\$\(\1\)\?\1:"dark"\}',
        r'\1,"default")?"light":$APP.$cljs$core$truth_$$(\1)?\1:"light"}', regex=True)
  patch("js/main-settings.js", 'name:$APP.$cljs$cst$3201$theme$$,"default":"dark"', 'name:$APP.$cljs$cst$3201$theme$$,"default":"light"')
  # app.main.data.profile/toggle-theme: unset counts as light (light → system → dark → light).
  patch("js/shared.js", r'switch\(\$APP\.\$cljs\$core\$_EQ_\$\$\.\$cljs\$core\$IFn\$_invoke\$arity\$2\$\((\$current\$jscomp\$\d+\$\$),\s*"default"\)\?"dark":\1\)',
        r'switch(null==\1||$APP.$cljs$core$_EQ_$$.$cljs$core$IFn$_invoke$arity$2$(\1,"default")?"light":\1)', regex=True)
  # app.main.ui.workspace.main-menu: the toggle's label for an unset theme names the next one (system).
  patch("js/main-workspace.js",
        'case "system":return $APP.$app$util$i18n$tr$$.$cljs$core$IFn$_invoke$arity$1$("workspace.header.menu.toggle-dark-theme");default:return $APP.$app$util$i18n$tr$$.$cljs$core$IFn$_invoke$arity$1$("workspace.header.menu.toggle-light-theme")',
        'case "system":return $APP.$app$util$i18n$tr$$.$cljs$core$IFn$_invoke$arity$1$("workspace.header.menu.toggle-dark-theme");default:return $APP.$app$util$i18n$tr$$.$cljs$core$IFn$_invoke$arity$1$("workspace.header.menu.toggle-system-theme")')
  # The progress and export widgets read an unset theme as light (their colors).
  patch("js/main-dashboard.js", r'(\$APP\.\$cljs\$cst\$3201\$theme\$\$),"dark"\);var (\$background_clr\$jscomp\$\d+_default_theme_QMARK_\$\$)=',
        r'\1,"light");var \2=', regex=True)
  patch("js/shared.js", r'(\$or__5162__auto__\$jscomp\$\d+\$\$):"dark"\}\(\),\$background_clr_is_default_theme_QMARK_\$\$=',
        r'\1:"light"}(),$background_clr_is_default_theme_QMARK_$$=', regex=True)


if not BRAND_ONLY:
  light_default()
# The first paint (before the app sets the theme class) is light, either way.
patch("index.html", "<body>", '<body class="light">')

# ---------- 2. branding ----------

mark = open(os.path.join(BRAND, "mark.svg"), encoding="utf-8").read()
inner = re.search(r"<g id=\"mark\">(.*)</g>\s*</svg>", mark, re.S).group(1).strip()
MARK_BOX = "-12 16 134 134"


def mark_symbol(sid, view_box):
    """The megaphone, centered in a symbol of Penpot's own viewBox (so every slot keeps its size)."""
    x, y, w, h = [float(v) for v in view_box.split()]
    side = min(w, h)
    return (f'<symbol viewBox="{view_box}" id="{sid}" xmlns="http://www.w3.org/2000/svg">'
            f'<svg x="{x + (w - side) / 2}" y="{y + (h - side) / 2}" width="{side}" height="{side}" viewBox="{MARK_BOX}">{inner}</svg></symbol>')


def wordmark_symbol(sid, view_box):
    """Penpot's wordmark slot (1512 x 500): the megaphone and "City Politics", the words in the UI's text color."""
    return (f'<symbol viewBox="{view_box}" id="{sid}" xmlns="http://www.w3.org/2000/svg">'
            f'<svg x="0" y="0" width="500" height="500" viewBox="{MARK_BOX}">{inner}</svg>'
            '<text x="540" y="330" font-family="Work Sans, Inter, Arial, sans-serif" font-size="210" font-weight="700" '
            'textLength="960" lengthAdjust="spacingAndGlyphs" style="fill:var(--app-black, currentColor)">City Politics</text></symbol>')


def replace_symbol(html, sid, make):
    m = re.search(r'<symbol[^>]*\bid="' + re.escape(sid) + r'"[^>]*>', html)
    if not m:
        sys.exit(f"brand: index.html: no symbol {sid}")
    end = html.index("</symbol>", m.end()) + len("</symbol>")
    view_box = re.search(r'viewBox="([^"]*)"', m.group(0)).group(1)
    return html[:m.start()] + make(sid, view_box) + html[end:]


idx = os.path.join(APP, "index.html")
html = open(idx, encoding="utf-8").read()
for sid in ("icon-penpot-logo", "asset-penpot-logo"):
    html = replace_symbol(html, sid, wordmark_symbol)
for sid in ("icon-penpot-logo-icon", "asset-penpot-logo-icon", "icon-penpot-logo-icon-loader", "asset-penpot-logo-subtle"):
    html = replace_symbol(html, sid, mark_symbol)
# The error screens' decorative strip of Penpot logos: left empty.
for sid in ("icon-logo-error-screen", "asset-logo-error-screen"):
    html = replace_symbol(html, sid, lambda s, vb: f'<symbol viewBox="{vb}" id="{s}" xmlns="http://www.w3.org/2000/svg"></symbol>')
# The document's title and link previews.
html = html.replace("<title>Penpot | Full-stack design</title>", f"<title>{NAME}</title>")
html = re.sub(r'content="Penpot \| Full-stack design"', f'content="{NAME}"', html)
html = re.sub(r'content="Penpot is the open-source design platform for teams that build digital products at scale\."',
              'content="Design ads for the City Politics network: presets, dynamic text and rules, motion, sent straight to your campaigns."', html)
html = html.replace('content="@penpotapp"', 'content="@citypolitics"')
html = html.replace('<link rel="icon" href="images/favicon.png', '<link rel="apple-touch-icon" href="images/apple-touch-icon.png" />\n    <link rel="icon" href="images/favicon.png')
if "Penpot | Full-stack design" in html or 'id="icon-penpot-logo"' not in html:
    sys.exit("brand: index.html: title or logo symbols not as expected")
open(idx, "w", encoding="utf-8").write(html)

# Images: the favicon, an app icon, the login illustration, the link preview.
for src, dst in (("favicon.png", "images/favicon.png"), ("apple-touch-icon.png", "images/apple-touch-icon.png"),
                 ("megaphone-512.png", "images/registration-illustration.png"), ("link-preview.png", "images/penpot-link-preview.png")):
    shutil.copyfile(os.path.join(BRAND, src), os.path.join(APP, dst))

# Translations: the browser tab's titles in every language ("… - Penpot" → "… - City Politics Design"), and in English
# the login and register pages' lines about Penpot.
TITLE = re.compile(r'("title\.[a-z0-9.-]+":")((?:[^"\\]|\\.)*)(")')
EN = {
    "auth.login-tagline": "Design ads for the City Politics network: dynamic text and rules, motion, and one click to send them to your campaigns.",
    "auth.sidebar-tagline": "The City Politics designer: ads for the network's local politics sites.",
    "auth.register-tagline": "Sign in with your City Politics advertiser account to design ads for the network.",
    "auth.check-your-email": "Check your email and click on the link to verify and start using the City Politics designer.",
    "not-found.login.free": "The City Politics designer: ads for the network's local politics sites.",
    "not-found.login.start-using": "Sign in with your City Politics account.",
}
files = sorted(glob.glob(os.path.join(APP, "js", "translation.*.js")))
if not files:
    sys.exit("brand: no translation files")
for p in files:
    s = open(p, encoding="utf-8").read()
    s, n = TITLE.subn(lambda m: m.group(1) + m.group(2).replace("Penpot | Full-stack design", NAME).replace("Penpot", NAME) + m.group(3), s)
    if p.endswith("translation.en.js"):
        if n < 10:
            sys.exit("brand: translation.en.js: titles not found")
        for k, v in EN.items():
            s, c = re.subn(r'("' + re.escape(k) + r'":")((?:[^"\\]|\\.)*)(")', lambda m: m.group(1) + v + m.group(3), s)
            if c != 1:
                sys.exit(f"brand: translation.en.js: {k} found {c} times")
    open(p, "w", encoding="utf-8").write(s)

print(f"brand: light by default, City Politics branding applied ({len(files)} translations)")
