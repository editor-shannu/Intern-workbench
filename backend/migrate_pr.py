
import sqlite3
conn = sqlite3.connect("workbench.db")
try:
    conn.execute("ALTER TABLE pull_requests ADD COLUMN repo_owner VARCHAR;")
    conn.execute("ALTER TABLE pull_requests ADD COLUMN repo_name VARCHAR;")
    print("Columns added to pull_requests")
except Exception as e:
    print("Error:", e)
conn.commit()
conn.close()

