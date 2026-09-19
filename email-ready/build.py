#!/usr/bin/env python3
"""Rebuild the email without altering the source magazine.

Requires Python 3, beautifulsoup4 and Pillow. Run from this repository:
  python email-ready/build.py
Optional: --web-url https://YOUR-PUBLISHED-MAGAZINE/
          --asset-base-url https://YOUR-CDN/email-ready/assets/
          --unsubscribe-url https://YOUR-PREFERENCE-CENTER/
Default newsletter.html uses Content-IDs; send it with the related MIME images
in newsletter.eml, not by pasting HTML source into Gmail's compose window.
index.html is the local browser preview. No mail is sent by this script.
"""
from __future__ import annotations

import argparse
import html
import json
import re
from email.message import EmailMessage
from email.policy import SMTP
from pathlib import Path
from urllib.parse import urlsplit

from bs4 import BeautifulSoup, Comment, NavigableString, Tag
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'email-ready'
ASSETS = OUT / 'assets'
NAVY = '#001f4d'
PAPER = '#fcfefb'
SAGE = '#c2d2bc'
# Verified against the final source CSS cascade, not just inline styles.
HIDDEN_SECTIONS = {'chapitres', 'story-tour', 'story-tour-variation-2',
                   'story-tour-variation-3', 'story-muanda-variation-2',
                   'story-muanda-variation-3', 'famille', 'famille-variation-a',
                   'agenda', 'abonnement'}
DARK_SECTIONS = {'hero', 'edito', 'indicateurs', 'indaba-2026', 'story-abidjan',
                 'story-mining', 'story-muanda', 'story-femme', 'story-ebola',
                 'story-fanzone', 'story-formations', 'finale',
                 'chapitre-2', 'chapitre-4', 'chapitre-6'}
SKIP_CLASSES = {'cd-list', 'cd-numeral', 'cd-numeral-ghost', 'testimonial-word',
                'chapter-slider-bar', 'testimonial-controls', 'hero-scroll',
                'edito-label--mobile', 'sub-note', 'sep', 'kbm-meta-sep'}
# Meaningful two/three-column arrangements retained from the web version.
COLUMNS = {'edito-grid': 2, 'indicators-grid': 3, 'chapter-slides': 2,
           'chapter-facts': 3, 'retreat-gallery': 3, 'indaba-shell': 2,
           'feature-grid': 2, 'seminar-topics': 2, 'perf-hero': 2,
           'world-grid': 2, 'world-countries': 2, 'kbm-gallery': 2,
           'kbm-banner-meta': 3, 'tour-panorama-media': 2, 'tour-stats': 3,
           'mag-grid': 2, 'digital-pillars': 3, 'muanda-gallery': 2,
           'rakka-grid': 2, 'testimonial-slide': 2, 'etoiles-grid': 2,
           'double-grid': 2, 'family-cards': 2}
CARD_CLASSES = {'indicator-card', 'family-card', 'pillar'}
LABEL_CLASSES = {'section-eyebrow', 'story-month', 'story-rubric', 'chapter-num',
                 'editorial-date', 'chapter-eyebrow', 'hero-eyebrow', 'meta-label',
                 'edito-kicker', 'edito-label', 'edito-pullquote-label',
                 'indicator-unit', 'indicator-note', 'cd-kicker', 'cd-dateline',
                 'indaba-kicker', 'kbm-eyebrow', 'kbm-date', 'kbm-offer-label',
                 'team-callout-label', 'testimonial-value', 'testimonial-ribbon',
                 'family-label', 'family-metric', 'etoiles-label', 'finale-eyebrow',
                 'signature-role', 'perf-stat-label', 'feature-visual-badge',
                 'mag-caption', 'feature-kicker', 'chapter-datebox', 'chapter-tag'}
METRIC_CLASSES = {'indicator-value', 'family-value', 'perf-stat-value',
                  'edito-aside-value', 'pillar-num'}
ASSET_MAP: dict[str, str] = {}
USED: set[str] = set()


def esc(value):
    return html.escape(str(value), quote=True)


def clean(value):
    return re.sub(r'\s+', ' ', str(value).replace('\u200b', '')).strip()


def cls(node):
    return set(node.get('class', [])) if isinstance(node, Tag) else set()


def asset(source):
    if source in ASSET_MAP:
        return ASSET_MAP[source]
    if source.startswith('email-ready/assets/'):
        filename = Path(source).name
    elif source.endswith('.svg'):
        filename = 'flag-' + Path(source).stem + '.png'
    else:
        path = (ROOT / source).resolve()
        if not path.is_relative_to(ROOT / 'images') or not path.is_file():
            raise ValueError(f'Missing or invalid source image: {source}')
        image = ImageOps.exif_transpose(Image.open(path))
        transparent = image.mode in ('RGBA', 'LA') or 'transparency' in image.info
        suffix = '.png' if transparent else '.jpg'
        filename = '-'.join(Path(source).with_suffix('').parts[1:]) + suffix
        image.thumbnail((1200, 1600), Image.Resampling.LANCZOS)
        if suffix == '.png':
            image.convert('RGBA').save(ASSETS / filename, optimize=True)
        else:
            image.convert('RGB').save(ASSETS / filename, quality=85, optimize=True,
                                      progressive=False, subsampling=0)
    if not (ASSETS / filename).is_file():
        raise ValueError(f'Missing raster fallback: {filename}')
    ASSET_MAP[source] = filename
    return filename


def image_html(source, alt, width, small=False):
    filename = asset(source)
    USED.add(filename)
    with Image.open(ASSETS / filename) as im:
        width = min(int(width), im.width)
        height = round(width * im.height / im.width)
    responsive = '' if small else 'width:100%;'
    return (f'<img src="assets/{esc(filename)}" width="{width}" height="{height}" '
            f'alt="{esc(alt)}" border="0" style="display:block;border:0;outline:none;'
            f'{responsive}max-width:{width}px;height:auto;margin:0 auto 10px;'
            f'font:14px Arial,sans-serif;color:inherit;">')


def table(content, extra=''):
    return ('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            'border="0" style="width:100%;border-collapse:collapse;'
            f'mso-table-lspace:0pt;mso-table-rspace:0pt;"{extra}>{content}</table>')


def panel(content, background, dark=False, padding=18):
    color = '#f7faf6' if dark else NAVY
    return table(f'<tr><td bgcolor="{background}" style="padding:{padding}px;'
                 f'background-color:{background};color:{color};">{content}</td></tr>')


def paragraph(content, style='', tag='p', extra=''):
    return f'<{tag}{extra} style="margin:0 0 12px;{style}">{content}</{tag}>'


def inline(node, dark=False):
    if isinstance(node, Comment):
        return ''
    if isinstance(node, NavigableString):
        return esc(re.sub(r'\s+', ' ', str(node).replace('\u200b', '')))
    if not isinstance(node, Tag):
        return ''
    if node.name == 'br':
        return '<br>'
    if node.get('aria-hidden') == 'true' and 'dropcap' not in cls(node):
        return ''
    if 'dropcap' in cls(node):
        return ''  # The accessible sr-only L is retained exactly once.
    if node.name in ('svg', 'canvas', 'button'):
        return ''
    inner = ''.join(inline(c, dark) for c in node.children)
    if node.name in ('em', 'i'):
        return f'<em style="color:{SAGE if dark else "#566d50"};">{inner}</em>'
    if node.name in ('strong', 'b', 'sup', 'sub'):
        return f'<{node.name}>{inner}</{node.name}>'
    if node.name == 'a':
        href = link(node.get('href', ''))
        if href:
            return f'<a href="{esc(href)}" style="color:inherit;text-decoration:underline;">{inner}</a>'
    return inner


def link(href):
    if href.startswith('#'):
        target = href[1:]
        if target in HIDDEN_SECTIONS:
            return ''
        return ARGS.web_url.rstrip('#') + href if ARGS.web_url else href
    return href if urlsplit(href).scheme in ('https', 'mailto', 'tel') else ''


def meaningful(node):
    if isinstance(node, Comment):
        return False
    if isinstance(node, NavigableString):
        return bool(clean(node))
    return isinstance(node, Tag) and bool(node.get_text(strip=True) or node.find('img') or node.name == 'img')


def columns(nodes, count, width, dark):
    nodes = [n for n in nodes if meaningful(n) and not cls(n).intersection(SKIP_CLASSES)]
    if not nodes:
        return ''
    count = min(count, len(nodes))
    cell_width = int((width - (count - 1) * 16) / count)
    rows = []
    for start in range(0, len(nodes), count):
        cells = []
        for i, n in enumerate(nodes[start:start + count]):
            if i:
                cells.append('<td class="gap" width="16" style="width:16px;font-size:0;line-height:0;">&nbsp;</td>')
            cells.append(f'<td class="stack" valign="top" width="{cell_width}" '
                         f'style="width:{cell_width}px;vertical-align:top;padding:0 0 16px;">'
                         + render(n, cell_width, dark) + '</td>')
        rows.append('<tr>' + ''.join(cells) + '</tr>')
    return table(''.join(rows))


def render(node, width=596, dark=False):
    if isinstance(node, Comment):
        return ''
    if isinstance(node, NavigableString):
        return paragraph(esc(clean(node))) if clean(node) else ''
    if not isinstance(node, Tag):
        return ''
    classes = cls(node)
    if node.name in ('script', 'style', 'source', 'canvas', 'button', 'form', 'input'):
        return ''
    if classes.intersection(SKIP_CLASSES):
        return ''
    if 'indaba-photo--support' in classes:
        return ''  # Hidden by final redesign.css at every width.
    if node.name == 'figcaption' and 'seminar-photo--hero' in cls(node.parent):
        return ''
    if node.get('aria-hidden') == 'true' and 'testimonial-slide' not in classes:
        return ''
    if 'sr-only' in classes:
        return ''
    if node.get('data-email-icon'):
        return image_html('email-ready/assets/' + node['data-email-icon'], '', 44, True)
    if node.name == 'svg':
        return ''
    if node.name == 'img':
        small = '/flags/' in node.get('src', '')
        max_width = 42 if small else (250 if 'logo-lockup' in node.get('src', '') else width)
        return image_html(node['src'], node.get('alt', ''), max_width, small)
    if not meaningful(node):
        return ''
    if classes.intersection(CARD_CLASSES):
        new = BeautifulSoup(str(node), 'html.parser').find()
        new['class'] = [c for c in new.get('class', []) if c not in CARD_CLASSES]
        return panel(render(new, width - 28, dark), '#123864' if dark else '#eef4ec', dark, 14)
    if classes.intersection({'kbm-banner', 'kbm-offer', 'testimonial-portrait'}):
        new = BeautifulSoup(str(node), 'html.parser').find()
        new['class'] = [c for c in new.get('class', []) if c not in {'kbm-banner', 'kbm-offer', 'testimonial-portrait'}]
        return panel(render(new, width - 32, True), NAVY, True, 16)
    for key, count in COLUMNS.items():
        if key in classes:
            return columns(list(node.children), count, width, dark)
    if node.name == 'picture':
        return render(node.find('img'), width, dark)
    if node.name in ('h1', 'h2', 'h3', 'h4', 'h5'):
        size = {'h1': 38, 'h2': 30, 'h3': 23, 'h4': 20, 'h5': 16}[node.name]
        if width < 300:
            size = min(size, 26)
        extra = f' id="{esc(node["id"])}"' if node.get('id') else ''
        return paragraph(inline(node, dark),
                         f'font-family:Georgia,Times New Roman,serif;font-size:{size}px;'
                         f'line-height:{size+6}px;font-weight:normal;color:{"#f7faf6" if dark else NAVY};',
                         node.name, extra)
    if node.name == 'blockquote':
        return paragraph(inline(node, dark), f'font-size:20px;line-height:29px;font-style:italic;'
                         f'border-left:3px solid #9db49a;padding:10px 0 10px 16px;color:{SAGE if dark else "#566d50"};')
    if node.name == 'figcaption':
        return paragraph(inline(node, dark), 'font:12px/18px Arial,sans-serif;')
    if classes.intersection(METRIC_CLASSES):
        return paragraph(inline(node, dark), f'font: bold 36px/42px Georgia,serif;color:{SAGE if dark else NAVY};')
    if classes.intersection(LABEL_CLASSES):
        return paragraph(inline(node, dark), f'font:11px/18px Arial,sans-serif;letter-spacing:1px;'
                         f'color:{SAGE if dark else "#566d50"};')
    if node.name == 'p':
        return paragraph(inline(node, dark))
    if node.name == 'a':
        return paragraph(inline(node, dark), 'font:13px/22px Arial,sans-serif;')
    if node.name in ('ul', 'ol'):
        return ''.join(render(c, width, dark) for c in node.children)
    if node.name == 'li':
        return paragraph('• ' + inline(node, dark))
    # Group inline siblings in one text block instead of manufacturing line breaks.
    children = list(node.children)
    if not node.find('img') and all(isinstance(c, (NavigableString, Comment)) or c.name in
           ('span', 'strong', 'b', 'em', 'i', 'sup', 'sub', 'br', 'a') for c in children):
        return paragraph(inline(node, dark))
    return ''.join(render(c, width, dark) for c in children)


def section(section_node):
    id_ = section_node.get('id', '')
    dark = id_ in DARK_SECTIONS
    if section_node.name == 'footer':
        dark = True
    bg = '#030d20' if id_ in ('hero', 'finale') else NAVY if dark else PAPER
    if id_ == 'story-rakka':
        bg = '#e9f1df'
    elif id_ == 'story-etoiles':
        bg = '#e7f5ff'
    elif 'chapitre-divider' in cls(section_node) and not dark:
        bg = '#eef4ec'
    color = '#f7faf6' if dark else '#1c2230'
    if id_ == 'hero':
        content = render(section_node.select_one('.hero-eyebrow'), 596, True)
        title = render(section_node.select_one('.hero-title'), 342, True)
        art = image_html('email-ready/assets/orbit.jpg', 'Étoile BGFIBank entourée de ses orbites', 238)
        content += table('<tr><td class="stack" width="342" valign="middle" style="width:342px;">'
                         + title + '</td><td class="gap" width="16">&nbsp;</td>'
                         '<td class="stack" width="238" valign="middle" style="width:238px;">' + art + '</td></tr>')
        content += render(section_node.select_one('.hero-subtitle'), 596, True)
        content += render(section_node.select_one('.hero-meta'), 596, True)
        content += table('<tr><td align="left"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
                         f'<td bgcolor="#9db49a" style="padding:14px 20px;background-color:#9db49a;">'
                         f'<a href="{esc(link("#edito"))}" style="font:bold 13px Arial,sans-serif;color:#001f4d;'
                         'text-decoration:none;">Commencer la lecture</a></td></tr></table></td></tr>')
    elif 'masthead-strip' in cls(section_node):
        return ('<tr><td bgcolor="#001f4d" align="center" style="background-color:#001f4d;padding:18px;'
                'color:#c2d2bc;font:11px/20px Arial,sans-serif;letter-spacing:1px;">'
                'Excellence · Confiance · Innovation · Prestige · BGFI 30 · Semestre 1 · 2026</td></tr>')
    else:
        content = render(section_node, 596, dark)
    border = 'border-top:1px solid #9db49a;' if 'chapitre-divider' in cls(section_node) else ''
    anchor = f' id="{esc(id_)}"' if id_ else ''
    return (f'<tr><td{anchor} class="pad" bgcolor="{bg}" style="background-color:{bg};color:{color};'
            f'padding:36px 32px;font:17px/27px Georgia,Times New Roman,serif;{border}">{content}</td></tr>')


def make_html(source):
    header_logo = image_html('images/2026/bgfi-lisolo-mark.png', '', 38, True)
    nav = ' &nbsp;·&nbsp; '.join(f'<a href="{esc(link("#chapitre-"+str(i)))}" style="color:#c2d2bc;text-decoration:none;">{label}</a>'
                              for i, label in enumerate(['I Édito','II Indicateurs','III Vie sociale','IV Innovation',
                                                        'V Engagement','VI Valeurs','VII Formation','VIII Famille'], 1))
    header = '<tr><td bgcolor="#001f4d" style="padding:20px 24px;background-color:#001f4d;">'
    header += table('<tr><td width="48" valign="middle">' + header_logo + '</td>'
                    '<td valign="middle" style="font:24px Georgia,serif;color:#ffffff;"><b>BGFI</b> Lisolo</td>'
                    '<td align="right" style="font:11px/18px Arial,sans-serif;color:#c2d2bc;">N°01 · S1<br>2026</td></tr>')
    header += f'<p style="margin:12px 0 0;font:10px/22px Arial,sans-serif;text-align:center;">{nav}</p></td></tr>'
    body = header + ''.join(section(s) for s in source.select('body > section,body > footer')
                             if s.get('id') not in HIDDEN_SECTIONS)
    if ARGS.web_url or ARGS.unsubscribe_url:
        links = []
        if ARGS.web_url:
            links.append(f'<a href="{esc(ARGS.web_url)}" style="color:#c2d2bc;">Voir la version en ligne</a>')
        if ARGS.unsubscribe_url:
            links.append(f'<a href="{esc(ARGS.unsubscribe_url)}" style="color:#c2d2bc;">Se désinscrire</a>')
        body += '<tr><td bgcolor="#001f4d" align="center" style="padding:20px;font:12px/20px Arial,sans-serif;">' + ' · '.join(links) + '</td></tr>'
    return '''<!doctype html>
<html lang="fr" xmlns:o="urn:schemas-microsoft-com:office:office"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<title>BGFI Lisolo — Édition N°1 — Juin 2026</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}img{-ms-interpolation-mode:bicubic}a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}#outlook a{padding:0}@media screen and (max-width:660px){.outer{width:100%!important}.pad{padding:28px 20px!important}.stack{display:block!important;width:100%!important;max-width:100%!important}.gap{display:none!important;width:0!important}.stack img{max-width:100%!important}h1{font-size:34px!important;line-height:40px!important}h2{font-size:28px!important;line-height:34px!important}}</style>
</head><body bgcolor="#e6e8ec" style="margin:0;padding:0;background-color:#e6e8ec;">
<div style="display:none;font-size:1px;line-height:1px;color:#e6e8ec;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">BGFI Lisolo · Janvier — Juin 2026. Performance, innovation et vie de la famille BGFI.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#e6e8ec"><tr><td align="center" valign="top">
<!--[if mso]><table role="presentation" width="660" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="outer" width="660" cellpadding="0" cellspacing="0" border="0" align="center" bgcolor="#fcfefb" style="width:100%;max-width:660px;border-collapse:collapse;">''' + body + '''</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>
'''


def audit(source, email_html, message, plain):
    inventory = []
    for path in sorted((ROOT / 'images').rglob('*')):
        if not path.is_file():
            continue
        row = {'source': path.relative_to(ROOT).as_posix(), 'bytes': path.stat().st_size}
        try:
            with Image.open(path) as im:
                row.update(format=im.format, width=im.width, height=im.height,
                           frames=getattr(im, 'n_frames', 1))
        except Exception:
            row['format'] = 'SVG' if path.suffix == '.svg' else 'unknown'
        row['email_asset'] = ASSET_MAP.get(row['source'])
        inventory.append(row)
    result = {
        'source_html_bytes': (ROOT / 'index.html').stat().st_size,
        'email_html_bytes': len(email_html.encode()),
        'gmail_clipping_note': 'Below the approximately 102 KB clipping threshold; recheck after sender tracking/link rewriting.',
        'mime_bytes': len(message), 'plain_text_bytes': len(plain.encode()),
        'source_unchanged': True,
        'visible_sections_preserved': [s.get('id') or ('footer' if s.name == 'footer' else 'masthead-strip')
                                       for s in source.select('body > section,body > footer') if s.get('id') not in HIDDEN_SECTIONS],
        'already_hidden_sections_not_reintroduced': sorted(HIDDEN_SECTIONS),
        'fonts': {'source': ['Playfair Display', 'Newsreader', 'Cormorant Garamond', 'Inter'],
                  'email': ['Georgia', 'Times New Roman', 'Arial', 'sans-serif'],
                  'reason': 'Gmail and classic Outlook do not reliably load custom web fonts. Live text retained, not rasterized.'},
        'css_audit': [{'path': p.relative_to(ROOT).as_posix(), 'bytes': p.stat().st_size,
                       'keyframe_rules': len(re.findall(r'@keyframes\b', p.read_text()))}
                      for p in sorted((ROOT / 'css').glob('*.css'))],
        'javascript_audit': [{'path': p.relative_to(ROOT).as_posix(), 'bytes': p.stat().st_size}
                            for p in sorted((ROOT / 'js').glob('*.js'))],
        'compatibility_changes': [
            'CSS grid/flex and positioned content converted to presentation tables with mobile stacking.',
            'All essential typography, spacing and foreground/background colors are inline.',
            'Canvas/orbit animation replaced with a static capture of the original branded artwork.',
            'Both testimonial panels and all four photo carousel slides are visible without JavaScript.',
            'Count-up values remain at the original final values; controls, reveal opacity and hover dependencies removed.',
            'SVG flags and metric/family icons rasterized to PNG; WebP portraits converted to baseline JPEG.',
            'Photographs resized without cropping; overlaid captions moved below photos so they stay readable.',
            'Complex gradients, masks, blend modes and glows have solid original-palette fallbacks.',
            'Duplicate marquee strip rendered once; CSS-hidden sections and duplicate variants remain excluded.',
            'Missing source srcset candidate images/dg-portrait-560.jpg avoided by using the existing JPEG.',
            'The original hidden subscription form has no backend; no fake subscription behavior added.',
            'Outlook 96-DPI setting, fixed-width MSO wrapper, explicit image dimensions and fluid mobile tables included.'
        ],
        'delivery': {
            'newsletter.html': 'Email body. Default cid: URLs require the related image parts in newsletter.eml.',
            'index.html': 'Local browser preview with relative assets. Do not send relative paths to recipients.',
            'newsletter.eml': 'Unsent multipart/alternative + multipart/related MIME body with embedded images. Supply actual From/To/Date/Message-ID through your mail sender.',
            'gmail': 'Use an HTML-aware sender, Gmail API raw MIME, or SMTP. Pasting HTML source into Gmail compose does not send an HTML newsletter.',
            'hosted_images': 'Rebuild with --asset-base-url using a public HTTPS asset directory to generate externally hosted image URLs.',
            'web_links': 'Internal anchors have uneven Gmail support. Pass --web-url for reliable links to a published copy. No hosting URL was invented.',
            'unsubscribe': 'Before bulk/external delivery, pass --unsubscribe-url with a working recipient-specific endpoint and configure List-Unsubscribe / one-click headers in your sending service.',
            'authentication': 'Configure SPF, DKIM, DMARC and consent/list hygiene at the sending domain. HTML alone cannot guarantee inbox placement.',
            'client_limitations': 'Actual Gmail/Outlook inbox testing remains required. Image blocking, dark-mode recoloring, forwarding and sender HTML rewriting vary by client.',
            'web_url': ARGS.web_url or None,
            'asset_base_url': ARGS.asset_base_url or None,
            'unsubscribe_url': ARGS.unsubscribe_url or None
        },
        'source_editorial_issues_preserved_not_rewritten': [
            'Fanzone headings mention both Coupe d’Afrique and Coupe du Monde.',
            'Some in-section chapter labels differ from the eight chapter dividers.',
            'The fourth exchange-of-vows slide is the source Indaba announcement.'
        ],
        'assets': inventory,
        'email_assets': [{'file': f, 'bytes': (ASSETS / f).stat().st_size} for f in sorted(USED)]
    }
    (OUT / 'audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')


def main():
    source = BeautifulSoup((ROOT / 'index.html').read_text(), 'html.parser')
    # Keep rasterized original icons despite their decorative aria-hidden wrapper.
    for i, node in enumerate(source.select('.indicator-icon'), 1):
        node.attrs.pop('aria-hidden', None)
        node['data-email-icon'] = f'icon-{i}.png'
    for i, node in enumerate(source.select('#famille-variation-b .family-pictogram'), 7):
        node.attrs.pop('aria-hidden', None)
        node['data-email-icon'] = f'icon-{i}.png'
    preview = make_html(source)
    parsed = BeautifulSoup(preview, 'html.parser')
    assert not parsed.select('script,canvas,svg,form,input,button,link,picture,source')
    assert len(preview.encode()) < 100_000, 'HTML too large for a safe Gmail clipping margin'
    # Readable plain text, without machine navigation/control debris.
    plain = '\n'.join(clean(x) for x in parsed.stripped_strings if clean(x))
    (OUT / 'index.html').write_text(preview)
    (OUT / 'newsletter.txt').write_text(plain + '\n')
    email_html = preview
    for filename in sorted(USED):
        replacement = (ARGS.asset_base_url.rstrip('/') + '/' + filename if ARGS.asset_base_url
                       else 'cid:' + filename + '@bgfi-lisolo')
        email_html = email_html.replace('assets/' + filename, esc(replacement))
    (OUT / 'newsletter.html').write_text(email_html)
    msg = EmailMessage(policy=SMTP)
    msg['Subject'] = 'BGFI Lisolo — Édition N°1 — Juin 2026'
    msg.set_content(plain, charset='utf-8')
    msg.add_alternative(email_html, subtype='html', charset='utf-8', cte='quoted-printable')
    if not ARGS.asset_base_url:
        related = msg.get_payload()[-1]
        for filename in sorted(USED):
            subtype = 'png' if filename.endswith('.png') else 'jpeg'
            related.add_related((ASSETS / filename).read_bytes(), maintype='image', subtype=subtype,
                                cid=f'<{filename}@bgfi-lisolo>', disposition='inline', filename=filename)
        related.set_param('type', 'text/html')
        related.set_boundary('bgfi-lisolo-related-2026')
    msg.set_boundary('bgfi-lisolo-alternative-2026')
    mime = msg.as_bytes()
    assert len(mime) < 20_000_000, 'MIME package too large'
    (OUT / 'newsletter.eml').write_bytes(mime)
    audit(source, email_html, mime, plain)
    print(f'Built {len(email_html.encode()):,} HTML bytes; {len(USED)} assets; {len(mime):,} MIME bytes.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for arg in ('web-url', 'asset-base-url', 'unsubscribe-url'):
        parser.add_argument('--' + arg, default='')
    ARGS = parser.parse_args()
    for value in (ARGS.web_url, ARGS.asset_base_url, ARGS.unsubscribe_url):
        if value and (urlsplit(value).scheme != 'https' or not urlsplit(value).netloc or
                      any(c in value for c in '\r\n')):
            parser.error('Delivery URLs must be absolute HTTPS URLs.')
    main()
