import os
import sys
import time
from pathlib import Path

# Ensure backend root is on sys.path and is current working directory for .env
backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))
os.chdir(backend_root)

from playwright.sync_api import sync_playwright, expect
from app.database import SessionLocal
from app import models

SCREENSHOTS_DIR = Path(r"C:\Users\acer\.gemini\antigravity-ide\brain\220f33a6-9e32-4ff3-99ac-93c445434bfe\screenshots")
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

def test_phase3_e2e():
    print("\n========================================================")
    print("      PHASE 3 E2E TEST: AI ASSISTANT & CONTEXT ENGINE")
    print("========================================================\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        # Automatically accept confirm dialogs
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

        # Ensure a sample file exists in worktree to attach
        sample_file = worktree_path / "README.md"
        if not sample_file.exists():
            sample_file.write_text("# Project Documentation\nWelcome to the intern task.\n", encoding="utf-8")
        # Trigger tree refresh
        refresh_btn = page.locator("button[title='Refresh Tree']")
        if refresh_btn.count() > 0:
            refresh_btn.click()
            time.sleep(1)

        # ==========================================
        # STEP 2: CONTEXT INSPECTOR MODAL
        # ==========================================
        print("2. Opening Context Inspector modal...")
        inspect_btn = page.locator("button[data-inspect-context-btn]")
        expect(inspect_btn).to_be_visible(timeout=5000)
        inspect_btn.click()

        modal = page.locator("div[data-context-inspect-modal]")
        expect(modal).to_be_visible(timeout=5000)

        # Verify metadata elements
        task_title = page.locator("[data-inspect-task-title]")
        expect(task_title).to_be_visible()
        tokens = page.locator("[data-inspect-tokens]")
        expect(tokens).to_be_visible()
        bundle = page.locator("pre[data-inspect-bundle]")
        expect(bundle).to_be_visible()
        print(f"   -> Context bundle tokens: {tokens.inner_text()}")

        page.screenshot(path=str(SCREENSHOTS_DIR / "17_context_inspector.png"))
        print("   -> Screenshot 17_context_inspector.png captured.")

        # Close modal
        close_btn = page.locator("button[data-close-inspect-btn]").first
        close_btn.click()
        expect(modal).to_be_hidden(timeout=5000)
        time.sleep(0.5)

        # ==========================================
        # STEP 3: ATTACH FILE CONTEXT VIA FILETREE
        # ==========================================
        print("3. Attaching file context via FileTree hover button...")
        # Hover over README.md node
        file_node = page.locator("[data-path='README.md']")
        if file_node.count() > 0:
            file_node.hover()
            time.sleep(0.5)
            attach_btn = page.locator("button[data-attach-context-btn='README.md']")
            if attach_btn.count() > 0:
                attach_btn.click(force=True)
            else:
                # Fallback: click active file attach in chat panel
                file_node.click()
                time.sleep(0.5)
                page.click("button:has-text('Attach README.md as context')")
        else:
            # Click the attach active file button if README tab is open
            page.locator("button:has-text('Attach')").first.click()

        # Wait for pill chip in ChatPanel
        page.wait_for_selector("text=README.md", timeout=5000)
        time.sleep(1)
        page.screenshot(path=str(SCREENSHOTS_DIR / "18_context_attached.png"))
        print("   -> Screenshot 18_context_attached.png captured.")

        # ==========================================
        # STEP 4: WORKBENCH LOCAL ASSISTANT STREAMING
        # ==========================================
        print("4. Testing local AI assistant chat & code generation...")
        # Ensure model is workbench-local
        model_select = page.locator("select[data-model-select]")
        model_select.select_option("workbench-local")

        chat_input = page.locator("textarea[data-chat-input]")
        expect(chat_input).to_be_visible()
        chat_input.fill("Please implement a calculator helper in math_helper.py with add and subtract functions.")

        send_btn = page.locator("button[data-chat-send-btn]")
        send_btn.click()

        # Wait for streaming to complete and apply button to be visible
        print("   -> Waiting for local streaming response and code block...")
        apply_btn = page.locator("button[data-preview-apply-btn]").last
        apply_btn.wait_for(state="visible", timeout=15000)
        time.sleep(1)

        page.screenshot(path=str(SCREENSHOTS_DIR / "19_local_assistant_streaming.png"))
        print("   -> Screenshot 19_local_assistant_streaming.png captured.")

        # ==========================================
        # STEP 5: MONACO DIFF MODAL PREVIEW
        # ==========================================
        print("5. Opening Monaco Diff Editor modal...")
        apply_btn.click()

        diff_modal = page.locator("div[data-diff-modal]")
        expect(diff_modal).to_be_visible(timeout=5000)
        page.wait_for_selector("text=Review Changes", timeout=5000)
        page.wait_for_selector("button[data-apply-diff-btn]", timeout=5000)
        time.sleep(2)  # Allow Monaco Diff Editor to render side-by-side cleanly

        page.screenshot(path=str(SCREENSHOTS_DIR / "20_diff_editor_modal.png"))
        print("   -> Screenshot 20_diff_editor_modal.png captured.")

        # ==========================================
        # STEP 6: APPLY DIFF & VERIFY WORKTREE TAB
        # ==========================================
        print("6. Accepting and applying diff...")
        accept_btn = page.locator("button[data-apply-diff-btn]")
        accept_btn.click()
        expect(diff_modal).to_be_hidden(timeout=5000)

        # Wait for file to open in tab and notice
        time.sleep(2)
        applied_file = worktree_path / "math_helper.py"
        assert applied_file.exists(), f"File {applied_file} must have been created on disk"
        file_content = applied_file.read_text(encoding="utf-8")
        assert "execute_task" in file_content or "def add" in file_content, "Generated code must be in file"
        print(f"   -> Successfully applied code to {applied_file} ({len(file_content)} bytes)")

        # Verify active tab in workspace editor
        page.wait_for_selector("text=math_helper.py", timeout=5000)
        page.evaluate("window.scrollTo(0, 0)")
        time.sleep(0.5)
        page.screenshot(path=str(SCREENSHOTS_DIR / "21_diff_applied.png"))
        print("   -> Screenshot 21_diff_applied.png captured.")

        # ==========================================
        # STEP 7: CLEAR CHAT CONVERSATION
        # ==========================================
        print("7. Testing Clear Chat functionality...")
        clear_btn = page.locator("button[data-clear-chat-btn]")
        expect(clear_btn).to_be_enabled()
        clear_btn.click()

        # Wait for messages to disappear and default message to reappear
        page.wait_for_selector("text=Ask for help implementing this task", timeout=5000)
        page.evaluate("window.scrollTo(0, 0)")
        time.sleep(0.5)

        page.screenshot(path=str(SCREENSHOTS_DIR / "22_chat_cleared.png"))
        print("   -> Screenshot 22_chat_cleared.png captured.")

        browser.close()

    print("\n========================================================")
    print("      ALL PHASE 3 E2E TESTS PASSED WITH 100% SUCCESS")
    print("========================================================\n")

if __name__ == "__main__":
    test_phase3_e2e()
