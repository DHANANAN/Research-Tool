#!/usr/bin/env python3
"""Optional real-browser pilot check with fictional data and a temporary server.

Requires the Python playwright package and its Chromium browser (or system
Chromium). Run after ./scripts/setup.sh. Screenshots use ignored .local/.
"""
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
import zipfile
import xml.etree.ElementTree as ET

from smoke import Client, ROOT, question


def main():
    try:
        from playwright.sync_api import sync_playwright, expect
    except ImportError as error:
        raise SystemExit('Optional browser check requires: python3 -m pip install playwright; python3 -m playwright install chromium') from error
    artifacts = ROOT / '.local/test-artifacts'
    artifacts.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='research-tool-browser-') as temp:
        with socket.socket() as available:
            available.bind(('127.0.0.1', 0))
            port = available.getsockname()[1]
        password = secrets.token_urlsafe(24)
        environment = {**os.environ, 'RESEARCH_DB_PATH': str(Path(temp) / 'browser.sqlite3'),
                       'RESEARCH_ADMIN_ID': 'browser-admin', 'RESEARCH_ADMIN_PASSWORD': password,
                       'RESEARCH_BIND': f'127.0.0.1:{port}'}
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
                with sync_playwright() as playwright:
                    browser = playwright.chromium.launch(executable_path=shutil.which('chromium'), args=['--no-sandbox'])
                    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
                    page = context.new_page()
                    page.set_default_timeout(10000)
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.goto(base)
                    page.get_by_label('Login ID', exact=True).fill('browser-admin')
                    page.get_by_label('Password', exact=True).fill(password)
                    page.get_by_role('button', name='Sign in to workspace', exact=True).click()
                    expect(page.get_by_role('button', name='New study', exact=True)).to_be_visible()
                    page.get_by_role('button', name='New study', exact=True).click()
                    page.get_by_label('Study name', exact=True).fill('Browser fictional study')
                    page.get_by_label('Description', exact=True).fill('An independent universal study with fictional answers only.')
                    page.get_by_role('button', name='Create study', exact=True).click()
                    expect(page.get_by_role('dialog')).to_have_count(0)
                    expect(page.get_by_role('combobox', name='Current study', exact=True)).to_contain_text('Browser fictional study')
                    page.get_by_role('button', name='Edit study', exact=True).click()
                    page.get_by_label('Description', exact=True).fill('Edited metadata for an independent fictional study.')
                    page.get_by_label('Locations, separated by commas', exact=True).fill('Fictional site A, Fictional site B')
                    page.get_by_role('button', name='Save study', exact=True).click()
                    expect(page.get_by_role('dialog')).to_have_count(0)
                    current = page.request.get(base + '/api/bootstrap').json()
                    project = next(p for p in current['projects'] if p['name'] == 'Browser fictional study')
                    assert project['cities'] == ['Fictional site A', 'Fictional site B']
                    fixture = {'title': 'Browser fixture', 'description': 'Fictional interview only.', 'reviewed': False,
                               'questions': [question('q_consent', 'boolean', True),
                                             question('q_count', 'integer', True, min=0, max=20),
                                             question('q_note', 'text', True)]}
                    for q, label in zip(fixture['questions'], ['Consent for fictional test', 'Number of visits', 'Fictional field note']):
                        q['label'] = label
                    response = page.request.post(base + f'/api/projects/{project["id"]}/forms', headers={'X-Research-Client': '1'}, data=fixture)
                    assert response.ok, response.text()
                    form = response.json()
                    page.reload()
                    page.get_by_role('combobox', name='Current study', exact=True).select_option(project['id'])
                    page.get_by_role('button', name='Questionnaires', exact=True).click()
                    page.get_by_role('button', name='Edit questionnaire', exact=True).click()
                    page.get_by_label('Questionnaire title', exact=True).fill('Browser fixture reviewed')
                    page.get_by_role('checkbox', name='I have reviewed this questionnaire', exact=False).check()
                    page.get_by_role('button', name='Publish version', exact=True).click()
                    expect(page.get_by_text('Published', exact=True).first).to_be_visible()
                    invite_response = page.request.post(base + f'/api/projects/{project["id"]}/members', headers={'X-Research-Client': '1'}, data={'login_id': 'browser-collector', 'name': 'Fictional Collector'})
                    assert invite_response.ok, invite_response.text()
                    invitation = invite_response.json()
                    page.get_by_role('button', name='Research team', exact=True).click()
                    expect(page.get_by_text('Fictional Collector', exact=True)).to_be_visible()
                    page.get_by_role('button', name='Study overview', exact=True).click()
                    page.screenshot(path=str(artifacts / 'desktop.png'), full_page=True)
                    page.get_by_role('button', name='Sign out', exact=True).click()
                    page.get_by_role('button', name='Have an invitation? Activate your account', exact=True).click()
                    page.get_by_label('Login ID', exact=True).fill('browser-collector')
                    page.get_by_label('One-time activation code', exact=True).fill(invitation['activation_code'])
                    page.get_by_label('Choose a password', exact=True).fill(secrets.token_urlsafe(24))
                    page.locator('.auth-form').get_by_role('button', name='Activate account', exact=True).click()
                    print('Browser: administrator authoring/publication and collector activation passed.', flush=True)
                    page.get_by_role('button', name=re.compile(r'^Field collection(?:\s*\d+)?$')).click()
                    page.get_by_label('Questionnaire', exact=True).select_option(form['id'])
                    page.get_by_role('button', name='Make available offline', exact=True).click()
                    expect(page.get_by_text('Downloaded to this device', exact=True)).to_be_visible()
                    page.evaluate('navigator.serviceWorker.ready.then(() => true)')
                    page.wait_for_function('!!navigator.serviceWorker.controller')
                    page.locator('.survey-question').filter(has_text='Consent for fictional test').get_by_role('radio', name='Yes', exact=True).check()
                    page.locator('#answer-q_count').fill('0')
                    # Spaces must not be accepted then stranded in the outbox.
                    page.locator('#answer-q_note').fill('   ')
                    page.get_by_role('button', name='Review answers', exact=True).click()
                    expect(page.locator('.survey-question.invalid')).to_be_visible()
                    page.locator('#answer-q_note').fill('Fictional offline interview')
                    expect(page.get_by_text('Draft saved on this device', exact=True)).to_be_visible()
                    context.set_offline(True)
                    page.reload(wait_until='domcontentloaded')
                    page.get_by_role('button', name=re.compile(r'^Field collection(?:\s*\d+)?$')).click()
                    page.get_by_label('Questionnaire', exact=True).select_option(form['id'])
                    expect(page.locator('#answer-q_count')).to_have_value('0')
                    expect(page.locator('#answer-q_note')).to_have_value('Fictional offline interview')
                    page.set_viewport_size({'width': 390, 'height': 844})
                    page.screenshot(path=str(artifacts / 'phone-offline.png'), full_page=True)
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Phone page overflows horizontally'
                    page.get_by_role('button', name='Review answers', exact=True).click()
                    page.get_by_role('button', name='Submit response', exact=True).click()
                    expect(page.get_by_text('Pending upload', exact=True)).to_be_visible()
                    print('Browser: offline reload, draft recovery, phone layout, and local submission passed.', flush=True)
                    # Confirm queue and deleted draft commit together, survive reload.
                    page.reload(wait_until='domcontentloaded')
                    page.set_viewport_size({'width': 1440, 'height': 1000})
                    try:
                        page.get_by_role('button', name=re.compile(r'^Field collection(?:\s*\d+)?$')).click()
                    except Exception:
                        print('Offline restart headings:', page.locator('h1,h2').all_text_contents(), 'runtime errors:', errors, flush=True)
                        print('Offline restart state:', page.locator('body').inner_text()[:700], flush=True)
                        page.screenshot(path=str(artifacts / 'failure-offline-restart.png'), full_page=True)
                        raise
                    expect(page.get_by_text('Pending upload', exact=True)).to_be_visible()
                    admin = Client(base)
                    admin.request('/api/auth/login', {'login_id': 'browser-admin', 'password': password})
                    assert admin.request(f'/api/projects/{project["id"]}/responses') == []
                    context.set_offline(False)
                    for _ in range(100):
                        rows = admin.request(f'/api/projects/{project["id"]}/responses')
                        if len(rows) == 1:
                            break
                        page.wait_for_timeout(100)
                    assert len(rows) == 1 and rows[0]['answers']['q_count'] == 0
                    assert rows[0]['collector_id'] == invitation['user']['id']
                    page.wait_for_function("""() => new Promise((resolve, reject) => {const request=indexedDB.open('research-tool-offline',1);request.onsuccess=()=>{const tx=request.result.transaction('records','readonly');const keys=tx.objectStore('records').getAllKeys();keys.onsuccess=()=>resolve(!keys.result.some(k=>String(k).includes('.outbox.')));keys.onerror=()=>reject(keys.error);};})""")
                    page.get_by_role('button', name='Responses & exports', exact=True).click()
                    expect(page.get_by_text('Fictional Collector', exact=True).last).to_be_visible()
                    assert page.get_by_role('button', name='Export Excel', exact=True).count() == 0
                    assert not errors, f'Browser runtime errors: {errors}'
                    context.close()
                    # Exercise the administrator's actual download control too,
                    # beyond the API-level cell checks in smoke.py.
                    admin_context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
                    admin_page = admin_context.new_page()
                    admin_page.set_default_timeout(10000)
                    admin_page.on('pageerror', lambda error: errors.append(str(error)))
                    admin_page.goto(base)
                    admin_page.get_by_label('Login ID', exact=True).fill('browser-admin')
                    admin_page.get_by_label('Password', exact=True).fill(password)
                    admin_page.get_by_role('button', name='Sign in to workspace', exact=True).click()
                    admin_page.get_by_role('combobox', name='Current study', exact=True).select_option(project['id'])
                    admin_page.get_by_role('button', name='Responses & exports', exact=True).click()
                    with admin_page.expect_download() as pending_download:
                        admin_page.get_by_role('button', name='Export Excel', exact=True).click()
                    download = pending_download.value
                    export_path = Path(temp) / 'browser-export.xlsx'
                    download.save_as(export_path)
                    with zipfile.ZipFile(export_path) as workbook:
                        sheet = ET.fromstring(workbook.read('xl/worksheets/sheet1.xml'))
                        assert len(sheet.findall('m:sheetData/m:row', {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'})) == 2
                    assert not errors, f'Browser runtime errors: {errors}'
                    admin_context.close()
                    browser.close()
                    print('PASS: real Chromium UI sign-in, universal study creation+editing, reviewed publication, activation, required-text validation, offline download+reload+draft recovery+queue persistence, phone layout, reconnect upload exactly once, receipt ownership, collector export restriction, and administrator XLSX download.')
                    print('Fictional-data screenshots: .local/test-artifacts/desktop.png and phone-offline.png')
            finally:
                if process.poll() is None:
                    process.terminate()
                    process.wait(timeout=10)


if __name__ == '__main__':
    main()
