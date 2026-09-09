
import sqlite3
conn = sqlite3.connect("workbench.db")
try:
    conn.execute("ALTER TABLE project_plans ADD COLUMN repo_url VARCHAR DEFAULT \"\";")
    conn.execute("ALTER TABLE project_plans ADD COLUMN base_branch VARCHAR DEFAULT \"main\";")
    conn.execute("ALTER TABLE tasks ADD COLUMN project_id INTEGER REFERENCES project_plans(id);")
    print("Columns added")
except Exception as e:
    print("Error:", e)
conn.commit()
conn.close()

