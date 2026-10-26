#!/usr/bin/env python3
"""Account registration plus a guest workflow with ALL server APIs unavailable."""
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from smoke import ROOT


def main():
    from playwright.sync_api import sync_playwright, expect
    import csv, json
    with tempfile.TemporaryDirectory(prefix='research-access-') as temp:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        environment = {**os.environ, 'RESEARCH_DB_PATH': str(Path(temp) / 'accounts.sqlite3'), 'RESEARCH_BIND': f'127.0.0.1:{port}'}
        for key in ['RESEARCH_ADMIN_ID', 'RESEARCH_ADMIN_PASSWORD', 'RESEARCH_DEMO_ACCOUNTS']:
            environment.pop(key, None)
        base = f'http://127.0.0.1:{port}'
        with open(Path(temp) / 'server.log', 'w') as log:
            process = subprocess.Popen([str(ROOT / 'target/debug/research-tool')], cwd=ROOT, env=environment, stdout=log, stderr=log)
            try:
                for _ in range(100):
                    try:
                        urllib.request.urlopen(base + '/api/health', timeout=1).close()
                        break
                    except OSError:
                        time.sleep(.1)
                with sync_playwright() as pw:
                    browser = pw.chromium.launch(executable_path=shutil.which('chromium'), args=['--no-sandbox'])
                    live = browser.new_context(viewport={'width': 1400, 'height': 1000})
                    page = live.new_page()
                    page.set_default_timeout(10000)
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.goto(base)
                    page.locator('.auth-tabs').get_by_role('button', name='Create organization', exact=True).click()
                    page.get_by_label('Organization name', exact=True).fill('Fictional online organization')
                    page.get_by_label('Your full name', exact=True).fill('Fictional Administrator')
                    page.get_by_label('Choose a login ID', exact=True).fill('fictional-online-owner')
                    page.get_by_label('Password', exact=True).fill(secrets.token_urlsafe(24))
                    page.locator('.auth-form').get_by_role('button', name='Create organization', exact=True).click()
                    expect(page.get_by_role('button', name='New study', exact=True)).to_be_visible()
                    page.get_by_role('button', name='My profile', exact=True).click()
                    expect(page.get_by_role('heading', name='My profile', exact=True)).to_be_visible()
                    expect(page.get_by_text('Fictional Administrator', exact=True).first).to_be_visible()
                    expect(page.get_by_text('Fictional online organization', exact=True)).to_be_visible()
                    page.get_by_role('button', name='Use dark mode', exact=True).click()
                    assert page.evaluate("document.documentElement.dataset.theme") == 'dark'
                    page.reload()
                    assert page.evaluate("document.documentElement.dataset.theme") == 'dark'
                    page.get_by_role('button', name='Use light mode', exact=True).click()
                    payload = page.request.get(base + '/api/bootstrap').json()
                    assert payload['org']['name'] == 'Fictional online organization'
                    assert len(payload['forms']) == 15 and all(f['status'] == 'draft' for f in payload['forms'])
                    assert not errors, errors
                    live.close()
                    print('PASS: live organization/account registration on an empty database; 15 draft guides.', flush=True)

                    guest = browser.new_context(viewport={'width': 1400, 'height': 1000}, accept_downloads=True)
                    blocked = []
                    def unavailable(route):
                        blocked.append((route.request.method, route.request.url))
                        route.fulfill(status=503, content_type='application/json', body='{"error":"Online accounts need a connected research server.","code":"backend_unavailable"}')
                    guest.route(base + '/api/**', unavailable)
                    page = guest.new_page()
                    page.set_default_timeout(10000)
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.goto(base)
                    page.get_by_role('button', name='Explore demo', exact=True).click()
                    page.get_by_role('button', name=re.compile('^Guest administrator')).click()
                    expect(page.get_by_label('Playground mode')).to_be_visible()
                    assert float(page.evaluate("getComputedStyle(document.body).fontSize.replace('px','')")) >= 16
                    page.get_by_role('button', name='Questionnaires', exact=True).click()
                    expect(page.locator('.questionnaire-card')).to_have_count(16)
                    page.get_by_role('button', name='New questionnaire', exact=True).click()
                    page.get_by_label('Questionnaire title', exact=True).fill('Fictional editable guest form')
                    page.get_by_role('checkbox', name='I have reviewed this questionnaire', exact=False).check()
                    page.get_by_role('button', name='Publish version', exact=True).click()
                    expect(page.locator('.questionnaire-card')).to_have_count(17)
                    page.get_by_role('button', name='Sign out', exact=True).click()

                    def sign_in(login):
                        page.get_by_label('Login ID', exact=True).fill(login)
                        page.get_by_label('Password', exact=True).fill('ResearchDemo2026!')
                        page.get_by_role('button', name='Sign in to workspace', exact=True).click()
                        expect(page.get_by_label('Playground mode')).to_be_visible()

                    sign_in('guest-surveyor-1')
                    assert page.get_by_role('button', name='Research team', exact=True).count() == 0
                    page.get_by_role('button', name=re.compile('^Field collection')).click()
                    page.get_by_role('combobox', name='Questionnaire', exact=True).select_option(label='SC / SC — fictional collection practice · v1')
                    page.locator('.survey-question').filter(has_text='Are you using invented answers').get_by_role('radio', name='Yes', exact=True).check()
                    page.locator('#answer-q_visits').fill('0')
                    page.locator('#answer-q_code').fill('constructor')
                    page.locator('#answer-q_comments').fill('=2+2')
                    page.get_by_role('button', name='Review answers', exact=True).click()
                    page.get_by_role('button', name='Submit response', exact=True).click()
                    expect(page.get_by_text('1 response saved in the playground.', exact=True)).to_be_visible()
                    page.get_by_role('button', name='Responses & exports', exact=True).click()
                    expect(page.locator('tbody tr')).to_have_count(1)
                    assert page.get_by_role('button', name='Export Excel', exact=True).count() == 0
                    page.reload()
                    expect(page.get_by_label('Playground mode')).to_be_visible()
                    for login in ['guest-surveyor-2', 'guest-surveyor-3']:
                        page.get_by_role('button', name='Sign out', exact=True).click()
                        sign_in(login)
                        page.get_by_role('button', name='Responses & exports', exact=True).click()
                        expect(page.locator('tbody tr')).to_have_count(0)
                    page.get_by_role('button', name='Sign out', exact=True).click()
                    sign_in('guest-admin')
                    page.get_by_role('button', name='Research team', exact=True).click()
                    expect(page.locator('.member-profile-card')).to_have_count(4)
                    page.get_by_placeholder('Find by name, login ID, or role').fill('surveyor 2')
                    expect(page.locator('.member-profile-card')).to_have_count(1)
                    page.get_by_role('button', name='Responses & exports', exact=True).click()
                    expect(page.locator('tbody tr')).to_have_count(1)
                    with page.expect_download() as downloading:
                        page.get_by_role('button', name='Export Excel', exact=True).click()
                    exported = Path(temp) / 'playground.xlsx'
                    downloading.value.save_as(exported)
                    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
                    with zipfile.ZipFile(exported) as workbook:
                        strings = [''.join(node.itertext()) for node in ET.fromstring(workbook.read('xl/sharedStrings.xml'))]
                        assert '=2+2' in strings
                        assert 'constructor' in strings
                        assert 'What would make the service easier to use?' in strings
                        assert 'Collector name' in strings
                        assert 'q_comments__status' not in strings
                        rows = []
                        for filename in workbook.namelist():
                            if re.match(r'xl/worksheets/sheet\d+.xml$', filename):
                                sheet = ET.fromstring(workbook.read(filename))
                                assert not sheet.findall('.//m:f', ns)
                                rows.extend(sheet.findall('m:sheetData/m:row', ns))
                        assert rows
                    with page.expect_download() as downloading:
                        page.get_by_role('button', name='Export CSV', exact=True).click()
                    csv_path = Path(temp) / 'playground.csv'
                    downloading.value.save_as(csv_path)
                    with csv_path.open(newline='', encoding='utf-8') as stream:
                        values = [json.loads(row['answer_json']) for row in csv.DictReader(stream)]
                    assert '=2+2' in values and 'constructor' in values
                    page.set_viewport_size({'width': 390, 'height': 844})
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                    page.set_viewport_size({'width': 1400, 'height': 1000})
                    page.get_by_role('button', name='Sign out', exact=True).click()
                    page.locator('.auth-tabs').get_by_role('button', name='Create organization', exact=True).click()
                    page.get_by_label('Organization name', exact=True).fill('My fictional playground organization')
                    page.get_by_label('Your full name', exact=True).fill('Fictional Local Owner')
                    page.get_by_label('Choose a login ID', exact=True).fill('local-new-owner')
                    page.get_by_label('Password', exact=True).fill('FictionalOwner2026!')
                    page.get_by_role('checkbox', name=re.compile('^Create this organization in the local playground')).check()
                    page.locator('.auth-form').get_by_role('button', name='Create organization', exact=True).click()
                    expect(page.get_by_label('Playground mode')).to_be_visible()
                    page.get_by_role('button', name='Responses & exports', exact=True).click()
                    expect(page.locator('tbody tr')).to_have_count(0)
                    page.get_by_role('button', name='Leave playground', exact=True).click()
                    expect(page.get_by_role('button', name='Explore demo', exact=True)).to_be_visible()
                    assert page.evaluate("localStorage.getItem('research-tool-playground-active')") is None
                    assert all(method == 'GET' for method, _ in blocked), 'Playground mutations must never go to the online API'
                    assert not errors, errors
                    guest.close()
                    browser.close()
                    print('PASS: unavailable API guest entry, four test accounts, editable/published forms, collected answers, browser persistence, role visibility, organization isolation, typed XLSX without formulas, 390px layout, and leaving playground; zero online mutations.', flush=True)
            finally:
                process.terminate()
                process.wait(timeout=10)


if __name__ == '__main__':
    main()
