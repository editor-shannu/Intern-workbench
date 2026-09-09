import os
import time
import requests

BASE_URL = "http://127.0.0.1:8000/api"
ADMIN_CREDS = {"email": "admin@example.com", "password": "internpass123"}
INTERN_CREDS = {"email": "intern@example.com", "password": "internpass123"}

def run_test():
    print("=== STARTING INTERN FLOW TEST ===")
    
    # 1. Admin logs in
    print("\n1. Admin login...")
    r = requests.post(f"{BASE_URL}/auth/login", json=ADMIN_CREDS)
    if r.status_code != 200:
        print(f"FAILED to login as admin: {r.text}")
        return
    admin_token = r.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    print("Admin login successful.")

    # 2. Admin creates intern
    print("\n2. Admin creates intern...")
    intern_data = {"name": "Test Intern", "email": "intern@example.com", "password": "internpass123", "role": "intern"}
    r = requests.post(f"{BASE_URL}/users", json=intern_data, headers=admin_headers)
    if r.status_code not in (200, 201, 400): # 400 if already exists
        print(f"FAILED to create intern: {r.text}")
        return
    
    # 3. Admin gets users and tasks
    users = requests.get(f"{BASE_URL}/users", headers=admin_headers).json()
    intern_id = next((u["id"] for u in users if u["email"] == "intern@example.com"), None)
    
    tasks = requests.get(f"{BASE_URL}/tasks", headers=admin_headers).json()
    if not tasks:
        print("FAILED: No tasks available to assign.")
        return
    task_id = tasks[0]["id"]
    
    # 4. Admin assigns task
    print(f"\n3. Admin assigns task {task_id} to intern {intern_id}...")
    r = requests.post(f"{BASE_URL}/tasks/{task_id}/assign", json={"user_id": intern_id}, headers=admin_headers)
    if r.status_code != 200:
        print(f"FAILED to assign task: {r.text}")
        return
    print("Task assigned successfully.")

    # ==========================================
    # INTERN FLOW
    # ==========================================
    print("\n--- SWITCHING TO INTERN PERSPECTIVE ---")
    
    # 5. Intern logs in
    print("\n4. Intern login...")
    r = requests.post(f"{BASE_URL}/auth/login", json=INTERN_CREDS)
    if r.status_code != 200:
        print(f"DEAD END: Intern cannot log in! {r.text}")
        return
    intern_token = r.json()["access_token"]
    intern_headers = {"Authorization": f"Bearer {intern_token}"}
    print("Intern login successful.")

    # 6. Intern gets tasks
    print("\n5. Intern views dashboard...")
    r = requests.get(f"{BASE_URL}/tasks", headers=intern_headers)
    my_tasks = r.json()
    print(f"Intern sees {len(my_tasks)} tasks.")

    # 7. Intern opens workspace
    print("\n6. Intern clicks 'Open Workspace'...")
    r = requests.post(f"{BASE_URL}/workspaces/open/{task_id}", headers=intern_headers)
    if r.status_code != 200:
        print(f"DEAD END: Workspace creation failed! {r.text}")
        return
    ws = r.json()
    ws_id = ws["id"]
    print(f"Workspace opened. ID: {ws_id}")

    # 8. Intern views file tree
    print("\n7. Intern views file tree...")
    r = requests.get(f"{BASE_URL}/workspaces/{ws_id}/tree", headers=intern_headers)
    if r.status_code != 200:
        print(f"DEAD END: File tree failed! {r.text}")
        return
    tree = r.json()
    print(f"File tree loaded. Contains {len(tree)} root items.")

    # 9. Intern saves a file
    print("\n8. Intern edits a file...")
    edit_payload = {"path": "README.md", "content": "# Updated by Intern\nThis is a test."}
    r = requests.put(f"{BASE_URL}/workspaces/{ws_id}/files", json=edit_payload, headers=intern_headers)
    if r.status_code != 200:
        print(f"DEAD END: File save failed! {r.text}")
        return
    print("File saved successfully.")

    # 10. Intern commits
    print("\n9. Intern commits changes...")
    r = requests.post(f"{BASE_URL}/workspaces/{ws_id}/commit", json={"message": "Test commit"}, headers=intern_headers)
    if r.status_code != 200:
        print(f"DEAD END: Commit failed! {r.text}")
        return
    print("Commit successful.")

    # 11. Intern pushes and opens PR
    print("\n10. Intern clicks 'Push & open PR'...")
    r = requests.post(f"{BASE_URL}/workspaces/{ws_id}/push-pr", headers=intern_headers)
    if r.status_code != 200:
        print(f"POSSIBLE DEAD END: Push/PR failed: {r.text}")
        # Not returning here, as we want to see if chat works even if PR fails
    else:
        print("Push/PR successful.")

    # 12. Intern tries to chat (will likely fail without OpenRouter key, but let's see how it behaves)
    print("\n11. Intern tries to chat...")
    r = requests.post(f"{BASE_URL}/workspaces/{ws_id}/chat", json={"message": "Hello", "model": "openai/gpt-4o-mini"}, headers=intern_headers)
    if r.status_code != 200:
        print(f"POSSIBLE DEAD END: Chat failed: {r.text} (Expected if no API key is set)")
    else:
        print("Chat request accepted.")

    print("\n=== TEST COMPLETE ===")

if __name__ == "__main__":
    run_test()
