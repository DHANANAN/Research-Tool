import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from database import copy_database


class BackupTests(unittest.TestCase):
    def test_live_wal_snapshot_restores_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, backup, restored = [Path(tmp) / name for name in ['live.sqlite3', 'backup.sqlite3', 'restored.sqlite3']]
            with sqlite3.connect(source) as db:
                db.execute('PRAGMA journal_mode=WAL')
                db.executescript('CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE responses(id TEXT, user_id TEXT REFERENCES users(id));')
                db.execute("INSERT INTO users VALUES ('fictional-user')")
                db.execute("INSERT INTO responses VALUES ('response-1','fictional-user')")
                db.commit()
                copy_database(source, backup)
                db.execute("INSERT INTO responses VALUES ('response-2','fictional-user')")
                db.commit()
                copy_database(backup, restored)
                with sqlite3.connect(restored) as recovered:
                    self.assertEqual(recovered.execute('SELECT count(*) FROM responses').fetchone()[0], 1)
                with self.assertRaises(FileExistsError):
                    copy_database(backup, source)
                self.assertEqual(db.execute('SELECT count(*) FROM responses').fetchone()[0], 2)
                self.assertEqual(os.stat(backup).st_mode & 0o777, 0o600)


if __name__ == '__main__':
    unittest.main()
