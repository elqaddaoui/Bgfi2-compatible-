#!/usr/bin/env python3
"""Validate the generated email: python email-ready/validate.py.

These are structural/content/MIME checks, not a substitute for test sends to
Gmail, Outlook Windows, Outlook.com, iOS Mail, and Gmail mobile.
"""
import json
import re
from collections import Counter
from email import policy
from email.parser import BytesParser
from pathlib import Path

from bs4 import BeautifulSoup, Comment
from PIL import Image

OUT = Path(__file__).resolve().parent
ROOT = OUT.parent


def normalized(value):
    return re.sub(r'\s+', '', str(value)).replace('\u200b', '')


def excluded(node):
    for parent in [node, *node.parents]:
        classes = set(parent.get('class', []))
        if parent.get('aria-hidden') == 'true' and 'testimonial-slide' not in classes:
            return True
        if classes.intersection({'sr-only', 'cd-list', 'edito-label--mobile',
                                 'chapter-slider-bar', 'testimonial-controls',
                                 'indaba-photo--support', 'cd-numeral'}):
            return True
        if parent.name == 'figcaption' and 'seminar-photo--hero' in parent.parent.get('class', []):
            return True
    return False


def main():
    report = json.loads((OUT / 'audit.json').read_text())
    source = BeautifulSoup((ROOT / 'index.html').read_text(), 'html.parser')
    html = (OUT / 'newsletter.html').read_text()
    preview = BeautifulSoup((OUT / 'index.html').read_text(), 'html.parser')
    email = BeautifulSoup(html, 'html.parser')
    assert len(html.encode()) < 100_000, 'Gmail clipping safety budget exceeded'
    assert not email.select('script,canvas,svg,form,input,button,link,iframe,video,source,picture')
    assert len(email.select('h1')) == 1
    ids = Counter(n['id'] for n in email.select('[id]'))
    assert all(count == 1 for count in ids.values()), 'Duplicate IDs'
    for a in email.select('a[href]'):
        if a['href'].startswith('#'):
            assert a['href'][1:] in ids, f'Broken anchor: {a["href"]}'
    for node in email.select('[style]'):
        assert not re.search(r'(?:display\s*:\s*(?:grid|flex)|position\s*:|transform\s*:|animation\s*:|var\()', node['style'])
    for table in email.select('table'):
        assert table.get('role') == 'presentation'
        assert table.get('cellspacing') == '0' and table.get('cellpadding') == '0'
    for td in email.select('td'):
        assert td.parent.name == 'tr'
    for tr in email.select('tr'):
        assert tr.parent.name in ('table', 'tbody', 'thead', 'tfoot')
    for img in preview.select('img'):
        path = (OUT / img['src']).resolve()
        assert path.is_relative_to(OUT / 'assets') and path.is_file()
        assert img.has_attr('alt') and img.has_attr('width') and img.has_attr('height')
        with Image.open(path) as image:
            assert image.format in ('JPEG', 'PNG', 'GIF')
            assert abs(int(img['width']) / int(img['height']) - image.width / image.height) < 0.1

    # Check every meaningful visible source text run and image against its section.
    asset_map = {x['source']: x['email_asset'] for x in report['assets']}
    runs = images = sections = 0
    for section in source.select('body > section,body > footer'):
        section_id = section.get('id')
        if section_id in report['already_hidden_sections_not_reintroduced']:
            assert not email.find(id=section_id)
            continue
        destination = preview.find(id=section_id) if section_id else preview
        assert destination is not None, f'Missing section: {section_id}'
        sections += 1
        for text in section.find_all(string=True):
            if isinstance(text, Comment) or not text.strip() or excluded(text.parent):
                continue
            if section_id == 'hero' and text.parent.find_parent(class_='hero-scroll'):
                continue
            assert normalized(text) in normalized(destination.get_text()), (section_id, text.strip())
            runs += 1
        for img in section.select('img'):
            if excluded(img) or section_id == 'hero':
                continue
            name = asset_map[img['src']]
            assert name, f'Visible source image not exported: {img["src"]}'
            assert destination.find('img', src='assets/' + name), f'Image not in original section: {name}'
            images += 1
    assert "L'année2025" in normalized(preview.find(id='edito').get_text())
    assert len(preview.find(id='story-social').select('img')) == 4
    assert len(preview.find(id='temoignages').select('img')) == 2
    assert len(preview.find(id='story-banques').select('img')) == 5

    raw = (OUT / 'newsletter.eml').read_bytes()
    message = BytesParser(policy=policy.default).parsebytes(raw)
    assert message.get_content_type() == 'multipart/alternative'
    assert message.get_body(('plain',)) and message.get_body(('html',))
    mime_html = message.get_body(('html',)).get_content()
    assert mime_html.replace('\r\n', '\n') == html
    refs = set(re.findall(r'cid:([^"\s]+)', mime_html))
    image_parts = [p for p in message.walk() if p.get_content_maintype() == 'image']
    content_ids = {p['Content-ID'].strip('<>') for p in image_parts}
    assert refs == content_ids, 'CID references do not match MIME images'
    for part in image_parts:
        assert part.get_content_disposition() == 'inline'
        assert part.get_payload(decode=True) == (OUT / 'assets' / part.get_filename()).read_bytes()
    assert all(len(line) <= 998 for line in raw.split(b'\r\n')), 'SMTP line-length violation'
    assert len(raw) < 20_000_000
    print(json.dumps({'result': 'PASS', 'html_bytes': len(html.encode()),
                      'sections': sections, 'source_text_runs_verified': runs,
                      'source_image_placements_verified': images,
                      'mime_inline_images': len(image_parts), 'mime_bytes': len(raw),
                      'inbox_rendering_tested': False}, indent=2))


if __name__ == '__main__':
    main()
