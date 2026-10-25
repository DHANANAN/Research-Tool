#!/usr/bin/env python3
"""Consistent SQLite backups and restore to a NEW path. Never overwrite data."""
import argparse
import os
from pathlib import Path
import sqlite3


def copy_database(source, destination):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if not source.is_file():
        raise ValueError('Source database does not exist.')
    # Exclusive creation prevents overwriting a live DB, symlink, or prior backup.
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.close(fd)
    try:
        with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as src:
            with sqlite3.connect(destination) as dst:
                src.backup(dst)
                if dst.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                    raise ValueError('Database integrity check failed.')
                if dst.execute('PRAGMA foreign_key_check').fetchall():
                    raise ValueError('Database contains invalid foreign key references.')
                dst.execute('SELECT count(*) FROM users').fetchone()
                dst.execute('SELECT count(*) FROM responses').fetchone()
            dst.close()
        src.close()
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['backup', 'restore'])
    parser.add_argument('source')
    parser.add_argument('destination', help='New file path; must not already exist')
    args = parser.parse_args()
    try:
        copy_database(args.source, args.destination)
    except (OSError, ValueError, sqlite3.Error) as error:
        parser.exit(1, f'{args.operation} failed: {error}\n')
    print(f'{args.operation.capitalize()} complete; integrity and foreign keys checked.')


if __name__ == '__main__':
    main()
