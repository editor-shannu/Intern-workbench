import os
import sys
import time
from pathlib import Path

# Ensure backend root is on sys.path
backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))
os.chdir(backend_root)

from playwright.sync_api import sync_playwright, expect
from app.database import SessionLocal
from app import models

SCREENSHOTS_DIR = Path(r"C:\Users\acer\.gemini\antigravity-ide\brain\220f33a6-9e32-4ff3-99ac-93c445434bfe\screenshots")
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

def test_phase5_e2e():
    print("\n========================================================")
    print("      PHASE 5 / OPTION B E2E TEST: TEST RUNNER & DRAWER")
    print("========================================================\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        # Automatically accept dialogs
        page.on("dialog", lambda dialog: dialog.accept())

        # ==========================================
        # STEP 1: LOGIN AS INTERN & LOAD WORKSPACE
        # ==========================================
        print("1. Logging in as intern1@example.com...")
        page.goto("http://127.0.0.1:5173/login", wait_until="networkidle")
        page.fill("input[type='email']", "intern1@example.com")
        page.fill("input[type='password']", "intern123")
        page.click("button[type='submit']")

        page.wait_for_url("http://127.0.0.1:5173/", timeout=10000)
        print("   -> Dashboard loaded. Opening workspace...")
        page.click("button:has-text('Open workspace')")
        page.wait_for_url("**/workspace/*", timeout=15000)
        page.wait_for_selector("text=WORKSPACE", timeout=10000)
        time.sleep(2)

        # Get worktree path from db
        db = SessionLocal()
        try:
            ws = db.query(models.Workspace).filter_by(id=1).first()
            raw_path = Path(ws.worktree_path)
            worktree_path = raw_path if raw_path.is_absolute() else (backend_root / raw_path)
            print(f"   -> Worktree path: {worktree_path}")
            assert worktree_path.exists(), f"Worktree {worktree_path} must exist"
        finally:
            db.close()

        # Prepare a passing test file in the worktree
        passing_test = worktree_path / "test_sample_pass.py"
        passing_test.write_text(
            "def test_addition():\n    assert 2 + 2 == 4\n\ndef test_subtraction():\n    assert 10 - 3 == 7\n",
            encoding="utf-8"
        )

        # ==========================================
        # STEP 2: TOGGLE TERMINAL DRAWER OPEN
        # ==========================================
        print("2. Opening In-Workspace Terminal Drawer...")
        open_term_btn = page.locator("button[data-open-terminal-btn]")
        expect(open_term_btn).to_be_visible(timeout=5000)
        open_term_btn.click()

        term_drawer = page.locator("div[data-terminal-drawer]")
        expect(term_drawer).to_be_visible(timeout=5000)
        time.sleep(1)

        shot1 = SCREENSHOTS_DIR / "26_terminal_drawer_open.png"
        page.screenshot(path=str(shot1))
        print(f"   -> Captured {shot1.name}")

        # ==========================================
        # STEP 3: RUN PASSING TEST SUITE
        # ==========================================
        print("3. Executing passing test suite via pytest...")
        run_btn = page.locator("button[data-run-tests-btn]")
        expect(run_btn).to_be_visible()
        run_btn.click()

        status_badge = page.locator("span[data-test-status-badge]")
        expect(status_badge).to_contain_text("PASS (Exit 0)", timeout=15000)
        terminal_out = page.locator("pre[data-terminal-output]")
        expect(terminal_out).to_be_visible()
        out_text = terminal_out.text_content()
        assert "passed" in out_text.lower() or "exit code 0" in out_text.lower()
        print("   -> Test run passed with Exit Code 0!")
        time.sleep(1)

        shot2 = SCREENSHOTS_DIR / "27_test_runner_success.png"
        page.screenshot(path=str(shot2))
        print(f"   -> Captured {shot2.name}")

        # ==========================================
        # STEP 4: TRIGGER FAILING TEST & PIPE TO AI
        # ==========================================
        print("4. Creating failing test and running suite...")
        # Remove passing test or write a failing test
        failing_test = worktree_path / "test_sample_fail.py"
        failing_test.write_text(
            "def test_failing_case():\n    expected = 42\n    actual = 0\n    assert actual == expected, 'Critical assertion mismatch: 0 != 42'\n",
            encoding="utf-8"
        )

        run_btn.click()
        expect(status_badge).to_contain_text("FAIL (Exit 1)", timeout=15000)
        out_fail_text = terminal_out.text_content()
        assert "Critical assertion mismatch" in out_fail_text or "AssertionError" in out_fail_text
        print("   -> Failing test captured traceback successfully.")

        send_to_ai_btn = page.locator("button[data-send-to-ai-btn]")
        expect(send_to_ai_btn).to_be_visible(timeout=5000)
        send_to_ai_btn.click()
        print("   -> Clicked 'Fix with AI' button.")

        # Verify traceback is piped into ChatPanel input
        chat_input = page.locator("textarea[data-chat-input]")
        expect(chat_input).to_be_visible()
        chat_text = chat_input.input_value()
        assert "failed with exit code 1" in chat_text
        assert "Critical assertion mismatch" in chat_text or "test_sample_fail.py" in chat_text
        print("   -> Verified traceback piped cleanly into AI prompt textarea!")
        time.sleep(1)

        shot3 = SCREENSHOTS_DIR / "28_test_runner_failure_ai.png"
        page.screenshot(path=str(shot3))
        print(f"   -> Captured {shot3.name}")

        # Cleanup temporary test files
        if passing_test.exists():
            passing_test.unlink()
        if failing_test.exists():
            failing_test.unlink()

        browser.close()

    print("\n========================================================")
    print("  PHASE 5 / OPTION B E2E TEST COMPLETED SUCCESSFULLY!")
    print("========================================================\n")

if __name__ == "__main__":
    test_phase5_e2e()
