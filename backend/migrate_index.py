
import sqlite3
conn = sqlite3.connect("workbench.db")
try:
    conn.execute("DROP INDEX IF EXISTS ix_tasks_identifier;")
    conn.execute("CREATE UNIQUE INDEX ix_tasks_project_identifier ON tasks(project_id, identifier);")
    print("Index updated")
except Exception as e:
    print("Error:", e)
conn.commit()
conn.close()

