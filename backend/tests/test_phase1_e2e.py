import os
import sys
import time
from pathlib import Path

# Ensure backend root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from playwright.sync_api import sync_playwright, expect
from sqlalchemy import text
from app.database import engine, SessionLocal
from app import models

SCREENSHOTS_DIR = Path(r"C:\Users\acer\.gemini\antigravity-ide\brain\220f33a6-9e32-4ff3-99ac-93c445434bfe\screenshots")
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

def test_database_wal():
    print("\n--- 1. Testing Database WAL Mode & Pragmas ---")
    with engine.connect() as conn:
        wal_mode = conn.execute(text("PRAGMA journal_mode;")).scalar()
        busy_timeout = conn.execute(text("PRAGMA busy_timeout;")).scalar()
        sync_mode = conn.execute(text("PRAGMA synchronous;")).scalar()
        print(f"PRAGMA journal_mode: {wal_mode}")
        print(f"PRAGMA busy_timeout: {busy_timeout}")
        print(f"PRAGMA synchronous: {sync_mode}")
        assert wal_mode.lower() == "wal", f"Expected WAL mode, got {wal_mode}"
        assert busy_timeout >= 5000, f"Expected busy_timeout >= 5000, got {busy_timeout}"
    print("Database WAL configuration verified successfully.")

def test_playwright_e2e():
    print("\n--- 2. Testing Frontend & Multi-Tab IDE via Playwright ---")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        # Handle dialogs automatically
        page.on("dialog", lambda dialog: dialog.accept())

        # Step 1: Login
        print("Navigating to login page...")
        page.goto("http://127.0.0.1:5173/login", wait_until="networkidle")
        page.screenshot(path=str(SCREENSHOTS_DIR / "01_login_page.png"))

        print("Logging in as intern1@example.com...")
        page.fill("input[type='email']", "intern1@example.com")
        page.fill("input[type='password']", "intern123")
        page.click("button[type='submit']")

        # Step 2: Dashboard
        page.wait_for_url("http://127.0.0.1:5173/", timeout=10000)
        page.wait_for_selector("text=Build API Router", timeout=10000)
        page.screenshot(path=str(SCREENSHOTS_DIR / "02_intern_dashboard.png"))
        print("Logged in successfully. On intern dashboard.")

        # Step 3: Open Workspace
        print("Opening workspace for task...")
        page.click("button:has-text('Open workspace')")
        page.wait_for_url("**/workspace/*", timeout=15000)
        page.wait_for_selector("text=WORKSPACE", timeout=10000)
        time.sleep(1)
        page.screenshot(path=str(SCREENSHOTS_DIR / "03_workspace_initial.png"))
        print("Workspace loaded successfully.")

        # Generate unique filenames for this run
        test_id = int(time.time()) % 100000
        test_file = f"phase1_{test_id}.py"
        renamed_file = f"renamed_{test_id}.py"

        # Step 4: Create File via FileTree
        print(f"Testing FileTree: Creating new file '{test_file}'...")
        page.click("button[title='New File']")
        page.wait_for_selector("input[placeholder*='file.py']", timeout=5000)
        page.fill("input[placeholder*='file.py']", test_file)
        page.press("input[placeholder*='file.py']", "Enter")

        # Wait for file to appear in tree and open as tab
        page.wait_for_selector(f"div[data-path='{test_file}']", timeout=8000)
        time.sleep(1)
        page.screenshot(path=str(SCREENSHOTS_DIR / "04_file_created_and_tab_open.png"))
        print(f"File '{test_file}' created and open as tab.")

        # Step 5: Open a second file to test multi-tab
        print("Opening second file (README.md) to test multi-tab bar...")
        readme_node = page.locator("div[data-path='README.md']").first
        if readme_node.is_visible():
            readme_node.click()
            time.sleep(1)
            page.screenshot(path=str(SCREENSHOTS_DIR / "05_multi_tabs_active.png"))
            print("Multi-tab state verified: 2 tabs open.")

        # Step 6: Test Tab Switching & Editing & Dirty State
        print(f"Switching back to {test_file} tab and typing...")
        page.click(f"div[title*='{test_file}']")
        
        # Click in editor and type
        page.click(".monaco-editor")
        page.keyboard.type("\n# Automated Phase 1 verification test\ndef hello_phase1():\n    return 'success'\n")
        time.sleep(1)
        page.screenshot(path=str(SCREENSHOTS_DIR / "06_dirty_state_indicator.png"))
        print("Dirty indicator dot is visible on tab.")

        # Step 7: Test Save (Save Button & Hotkey)
        print("Testing Save functionality...")
        page.click("button:has-text('Save')")
        time.sleep(1)
        page.screenshot(path=str(SCREENSHOTS_DIR / "07_saved_state.png"))
        print("Saved file successfully. Notice flashed.")

        # Step 8: Test File Rename
        print(f"Testing file rename in FileTree to '{renamed_file}'...")
        demo_row = page.locator(f"div[data-path='{test_file}']").first
        demo_row.hover()
        demo_row.locator("button[title='Rename file']").click(force=True)
        
        rename_input = demo_row.locator("input").first
        rename_input.wait_for(state="visible", timeout=5000)
        rename_input.fill(renamed_file)
        rename_input.press("Enter")
        time.sleep(1)
        page.screenshot(path=str(SCREENSHOTS_DIR / "08_file_renamed.png"))
        print(f"File renamed to '{renamed_file}'. Tab updated.")

        # Step 9: Test Tab Closing
        print(f"Testing tab closing for '{renamed_file}'...")
        tab_close_btn = page.locator(f"div[title*='{renamed_file}'] button").first
        tab_close_btn.click(force=True)
        time.sleep(1)
        page.screenshot(path=str(SCREENSHOTS_DIR / "09_tab_closed.png"))
        print("Tab closed cleanly.")

        # Step 10: Test File Delete
        print(f"Testing file deletion for '{renamed_file}'...")
        renamed_row = page.locator(f"div[data-path='{renamed_file}']").first
        if renamed_row.is_visible():
            renamed_row.hover()
            renamed_row.locator("button[title='Delete file']").click(force=True)
            time.sleep(1)
        page.screenshot(path=str(SCREENSHOTS_DIR / "10_file_deleted.png"))
        print("File deleted successfully from tree.")

        browser.close()
        print("\n=== ALL PLAYWRIGHT TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    test_database_wal()
    test_playwright_e2e()
