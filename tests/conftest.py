import itertools, pytest

class FakeSupabase:
    def __init__(self):
        self.tables = {}
        self._ids = itertools.count(1)
        self.auth_users = {}

    def _key(self, table):
        return self.tables.setdefault(table, [])

    def select(self, table, filters=None, columns="*"):
        rows = self._key(table)
        cols = None
        if columns and columns != "*":
            cols = [c.strip() for c in columns.split(",")]
        out = []
        for r in rows:
            if all(str(r.get(k)) == str(v) for k, v in (filters or {}).items()):
                row = dict(r)
                if cols is not None:
                    row = {c: row.get(c) for c in cols}
                out.append(row)
        return out

    def insert(self, table, rows):
        created = []
        for row in rows:
            r = dict(row)
            r.setdefault("id", f"id-{next(self._ids)}")
            self._key(table).append(r)
            created.append(dict(r))
        return created

    def update(self, table, filters, patch):
        changed = []
        for r in self._key(table):
            if all(str(r.get(k)) == str(v) for k, v in filters.items()):
                r.update(patch)
                changed.append(dict(r))
        return changed

    def delete(self, table, filters):
        rows = self._key(table)
        self.tables[table] = [r for r in rows
                              if not all(str(r.get(k)) == str(v) for k, v in filters.items())]

    def auth_create_user(self, email, password):
        uid = f"uid-{next(self._ids)}"
        self.auth_users[uid] = {"email": email, "password": password}
        return {"id": uid, "email": email}

    def auth_update_user(self, uid, patch):
        self.auth_users.setdefault(uid, {}).update(patch)
        return {"id": uid, **self.auth_users[uid]}

@pytest.fixture
def supa():
    return FakeSupabase()
