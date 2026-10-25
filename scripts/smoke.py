#!/usr/bin/env python3
"""Isolated, fictional-data HTTP + XLSX + PDF + persistence smoke test.

Uses only Python's standard library and the built Rust binary. It creates a
temporary database, random credentials, and a loopback server, then removes them.
"""
import csv
import io
import copy
import http.cookiejar
import io
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


class Client:
    def __init__(self, base):
        self.base = base
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def request(self, path, data=None, method=None, expected=200, raw=False, client_header=True):
        headers = {"X-Research-Client": "1"} if client_header else {}
        if isinstance(data, bytes):
            body = data
            headers["Content-Type"] = "application/pdf"
        elif data is not None:
            body = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
        else:
            body = None
        request = urllib.request.Request(self.base + path, data=body, method=method, headers=headers)
        try:
            response = self.opener.open(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        content = response.read()
        assert response.status == expected, f"{request.method} {path}: expected {expected}, got {response.status}: {content[:300]!r}"
        if path.startswith('/api/'):
            assert response.headers.get('Cache-Control') == 'no-store'
        return content if raw else json.loads(content)


def question(identifier, kind, required=False, choices=None, **kwargs):
    return {"id": identifier, "label": identifier, "kind": kind, "required": required,
            "choices": choices or [], "min": None, "max": None, "show_if": None, **kwargs}


def pdf_with_text(text):
    # A valid, tiny native-text PDF with computed offsets: no external PDF library.
    text = text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
    content = f"BT /F1 14 Tf 40 750 Td ({text}) Tj ET".encode()
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>',
               b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
               b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
               b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
               b'<< /Length ' + str(len(content)).encode() + b' >>\nstream\n' + content + b'\nendstream']
    data = bytearray(b'%PDF-1.4\n')
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data.extend(f'{index} 0 obj\n'.encode() + obj + b'\nendobj\n')
    xref = len(data)
    data.extend(f'xref\n0 {len(objects)+1}\n0000000000 65535 f \n'.encode())
    for offset in offsets[1:]:
        data.extend(f'{offset:010d} 00000 n \n'.encode())
    data.extend(f'trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode())
    return bytes(data)


def inspect_workbook(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        shared = ET.fromstring(archive.read('xl/sharedStrings.xml'))
        strings = [''.join(si.itertext()) for si in shared]
        sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
        rows = sheet.findall('m:sheetData/m:row', NS)
        assert len(rows) == 2, 'Expected one header row and exactly one response row'

        def cells(row):
            values = []
            for cell in row.findall('m:c', NS):
                v = cell.find('m:v', NS)
                value = v.text if v is not None else ''
                values.append((cell.attrib['r'], cell.attrib.get('t', 'n'), strings[int(value)] if cell.attrib.get('t') == 's' else value))
            return values

        headers = {''.join(filter(str.isalpha, ref)): value for ref, _, value in cells(rows[0])}
        mapped = {headers[''.join(filter(str.isalpha, ref))]: (typ, value) for ref, typ, value in cells(rows[1])}
        assert mapped['q_count'] == ('n', '0')
        assert mapped['q_boolean'] == ('b', '0')
        assert mapped['q_identifier'] == ('s', '0007')
        assert mapped['q_formula'] == ('s', '=HYPERLINK("https://example.invalid","fictional")')
        assert mapped['q_unicode'] == ('s', 'नमस्ते — fictional')
        assert mapped['q_multiple__a'] == ('n', '1')
        assert mapped['q_multiple__b'] == ('n', '0')
        assert mapped['q_hidden__status'] == ('s', 'skipped')
        assert mapped['q_optional__status'] == ('s', 'not_recorded')
        assert not sheet.findall('.//m:f', NS), 'Answer text must never create formula cells'
        assert not sheet.findall('.//m:hyperlink', NS)
        names = [s.attrib['name'] for s in ET.fromstring(archive.read('xl/workbook.xml')).findall('m:sheets/m:sheet', NS)]
        assert names == ['Responses', 'Codebook', 'ExportInfo']


def main():
    binary = ROOT / 'target/debug/research-tool'
    if not binary.exists():
        raise SystemExit('Build first: ./scripts/setup.sh')
    with tempfile.TemporaryDirectory(prefix='research-tool-smoke-') as directory:
        with socket.socket() as available:
            available.bind(('127.0.0.1', 0))
            port = available.getsockname()[1]
        password = secrets.token_urlsafe(24)
        environment = {**os.environ, 'RESEARCH_DB_PATH': str(Path(directory) / 'smoke.sqlite3'),
                       'RESEARCH_ADMIN_ID': 'smoke-admin', 'RESEARCH_ADMIN_PASSWORD': password,
                       'RESEARCH_BIND': f'127.0.0.1:{port}'}
        base = f'http://127.0.0.1:{port}'
        log = open(Path(directory) / 'server.log', 'w+')

        def start():
            process = subprocess.Popen([str(binary)], cwd=ROOT, env=environment, stdout=log, stderr=log)
            for _ in range(150):
                if process.poll() is not None:
                    raise AssertionError('Temporary test server exited during startup')
                try:
                    urllib.request.urlopen(base + '/api/health', timeout=1).close()
                    return process
                except (OSError, urllib.error.URLError):
                    time.sleep(.1)
            process.terminate()
            process.wait(timeout=10)
            raise AssertionError('Temporary test server did not become ready')

        process = start()
        try:
            admin = Client(base)
            admin.request('/api/bootstrap', expected=401)
            admin.request('/api/auth/login', {'login_id': 'smoke-admin', 'password': password}, client_header=False, expected=403)
            admin.request('/api/auth/login', {'login_id': 'smoke-admin', 'password': password})
            assert any(c.name == 'research_session' and c.has_nonstandard_attr('HttpOnly') for c in admin.jar)
            seeded = admin.request('/api/bootstrap')
            assert seeded['forms'] and all(f['status'] == 'draft' for f in seeded['forms'])
            project = admin.request('/api/projects', {'name': 'Universal fictional study', 'description': 'Not ICSSR-specific', 'cities': []})
            pid = project['id']
            questions = [question('q_consent', 'boolean', True), question('q_count', 'integer', True, min=0, max=100),
                         question('q_boolean', 'boolean', True), question('q_negative', 'decimal'), question('q_identifier', 'text'),
                         question('q_formula', 'long_text'), question('q_unicode', 'text'),
                         question('q_multiple', 'multiple', True, [{'code': 'a', 'label': 'A'}, {'code': 'b', 'label': 'B'}]),
                         question('q_hidden', 'text', True, show_if={'question_id': 'q_boolean', 'equals': True}),
                         question('q_optional', 'text')]
            definition = {'title': 'Fictional test instrument', 'description': 'Smoke fixture', 'questions': questions, 'reviewed': False}
            form = admin.request(f'/api/projects/{pid}/forms', definition)
            fid = form['id']
            admin.request(f'/api/forms/{fid}/publish', {}, expected=400)
            definition['reviewed'] = True
            admin.request(f'/api/forms/{fid}', definition, method='PUT')
            admin.request(f'/api/forms/{fid}/publish', {})
            admin.request(f'/api/forms/{fid}', definition, method='PUT', expected=409)
            revision = admin.request(f'/api/forms/{fid}/revise', {})
            assert revision['id'] != fid and revision['version'] == 2 and revision['status'] == 'draft'
            invite = admin.request(f'/api/projects/{pid}/members', {'login_id': 'fictional-collector', 'name': 'Fictional Collector'})
            collector = Client(base)
            activation = {'login_id': 'fictional-collector', 'activation_code': invite['activation_code'], 'password': secrets.token_urlsafe(24)}
            collector_user = collector.request('/api/auth/activate', activation)['user']
            Client(base).request('/api/auth/activate', activation, expected=401)
            collector.request('/api/projects', {'name': 'Forbidden'}, expected=403)
            collector.request(f'/api/projects/{pid}/export.xlsx', expected=403)
            collector.request(f'/api/projects/{seeded["projects"][0]["id"]}/responses', expected=404)
            answers = {'q_consent': True, 'q_count': 0, 'q_boolean': False, 'q_identifier': '0007',
                       'q_formula': '=HYPERLINK("https://example.invalid","fictional")',
                       'q_unicode': 'नमस्ते — fictional', 'q_negative': -1.25, 'q_multiple': ['a']}
            payload = {'id': str(uuid.uuid4()), 'form_id': fid, 'expected_user_id': collector_user['id'], 'collected_at': '2026-10-25T05:30:00+05:30', 'timezone': 'Asia/Kolkata', 'answers': answers}
            wrong_actor = copy.deepcopy(payload)
            wrong_actor['expected_user_id'] = seeded['user']['id']
            collector.request('/api/responses', wrong_actor, expected=403)
            bad = copy.deepcopy(payload)
            bad['answers']['q_consent'] = False
            collector.request('/api/responses', bad, expected=400)
            bad = copy.deepcopy(payload)
            bad['answers']['q_count'] = '0'
            collector.request('/api/responses', bad, expected=400)
            bad = copy.deepcopy(payload)
            bad['answers']['q_hidden'] = 'Stale hidden value'
            collector.request('/api/responses', bad, expected=400)
            receipt = collector.request('/api/responses', payload)
            assert receipt['id'] == payload['id'] and receipt['collector_id'] == collector_user['id'] and receipt['duplicate'] is False
            assert collector.request('/api/responses', payload)['duplicate'] is True
            bad = copy.deepcopy(payload)
            bad['answers']['q_count'] = 1
            collector.request('/api/responses', bad, expected=409)
            rows = admin.request(f'/api/projects/{pid}/responses')
            assert len(rows) == 1 and rows[0]['answers']['q_boolean'] is False
            assert rows[0]['collected_at'].endswith('+00:00') or rows[0]['collected_at'].endswith('Z')
            workbook = admin.request(f'/api/projects/{pid}/export.xlsx?form_id={fid}', raw=True)
            inspect_workbook(workbook)
            collector.request(f'/api/projects/{pid}/export.csv', expected=403)
            csv_bytes = admin.request(f'/api/projects/{pid}/export.csv?form_id={fid}', raw=True)
            csv_rows = list(csv.DictReader(io.StringIO(csv_bytes.decode('utf-8'))))
            decoded = {row['question_id']: json.loads(row['answer_json']) for row in csv_rows}
            assert decoded['q_negative'] == -1.25
            assert decoded['q_count'] == 0 and decoded['q_boolean'] is False
            assert decoded['q_identifier'] == '0007' and decoded['q_multiple'] == ['a']
            assert decoded['q_formula'] == answers['q_formula']
            assert decoded['q_unicode'] == answers['q_unicode']
            assert decoded['q_hidden'] is None and decoded['q_optional'] is None
            assert all(row['form_id'] == fid for row in csv_rows)
            assert admin.request('/api/ready')['ok'] is True
            imported = admin.request(f'/api/projects/{pid}/import', {'text': 'A fictional instrument\n1. What matters to you?\na) Access\nb) Cost'})
            assert len(imported['questions']) == 1 and imported['questions'][0]['required'] is False
            imported_pdf = admin.request(f'/api/projects/{pid}/import-pdf', pdf_with_text('1. What matters to you?'))
            assert imported_pdf['questions'] and imported_pdf['warnings']
            admin.request(f'/api/forms/{fid}/close', {})
            late = copy.deepcopy(payload)
            late['id'] = str(uuid.uuid4())
            collector.request('/api/responses', late, expected=409)
            # Retry a previously accepted response even after closure: recovering
            # a lost acknowledgment must not duplicate or discard the receipt.
            assert collector.request('/api/responses', payload)['duplicate'] is True
            process.terminate()
            process.wait(timeout=10)
            process = start()
            admin.request('/api/auth/login', {'login_id': 'smoke-admin', 'password': password})
            assert len(admin.request(f'/api/projects/{pid}/responses')) == 1
            print('PASS: HTTP auth/activation, project isolation, immutable forms, consent/typed validation, idempotency, XLSX/CSV types, text/PDF draft import, closure, and database restart persistence.')
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=10)
            log.close()


if __name__ == '__main__':
    main()
