
import sqlite3
conn = sqlite3.connect("workbench.db")
try:
    conn.execute("ALTER TABLE tasks ADD COLUMN identifier VARCHAR;")
    conn.execute("CREATE UNIQUE INDEX ix_tasks_identifier ON tasks(identifier);")
    print("Column added")
except Exception as e:
    print("Error:", e)
conn.commit()
conn.close()

