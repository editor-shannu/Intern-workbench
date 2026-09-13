import os
import sys
import time
import subprocess
from pathlib import Path

# Ensure backend root is on sys.path and is current working directory for .env
backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))
os.chdir(backend_root)

from playwright.sync_api import sync_playwright, expect
from app.database import engine, SessionLocal
from app import models
from app.config import settings

SCREENSHOTS_DIR = Path(r"C:\Users\acer\.gemini\antigravity-ide\brain\220f33a6-9e32-4ff3-99ac-93c445434bfe\screenshots")
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

def git_cmd(args, cwd=None):
    res = subprocess.run(["git"] + args, cwd=str(cwd) if cwd else None, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"Git error ({args}): {res.stderr.strip()}")
    return res

def test_phase2_e2e():
    print("\n========================================================")
    print("      PHASE 2 E2E TEST: GIT LIFECYCLE & PRUNING")
    print("========================================================\n")

    db = SessionLocal()
    try:
        ws = db.query(models.Workspace).filter_by(id=1).first()
        assert ws is not None, "Workspace 1 must exist for testing"
        raw_path = Path(ws.worktree_path)
        worktree_path = raw_path if raw_path.is_absolute() else (Path(__file__).resolve().parent.parent / raw_path)
        print(f"Target Worktree Path: {worktree_path}")
        assert worktree_path.exists(), f"Worktree {worktree_path} should exist before test"
    finally:
        db.close()

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
        page.click("button:has-text('Open workspace')")
        page.wait_for_url("**/workspace/*", timeout=15000)
        page.wait_for_selector("text=WORKSPACE", timeout=10000)
        time.sleep(1)

        # ==========================================
        # STEP 2: TEST WORKSPACE HARD RESET
        # ==========================================
        print("2. Testing Workspace Hard Reset...")
        # Create a dirty untracked file directly in worktree
        dirty_file = worktree_path / "dirty_uncommitted.txt"
        dirty_file.write_text("temporary uncommitted data", encoding="utf-8")
        assert dirty_file.exists()

        # Click the Reset button
        reset_btn = page.locator("button[data-reset-btn]")
        expect(reset_btn).to_be_visible()
        reset_btn.click()

        # Wait for notice flash
        page.wait_for_selector("text=Workspace reset to clean HEAD", timeout=6000)
        time.sleep(1)
        assert not dirty_file.exists(), "Hard reset should have discarded untracked files"
        page.screenshot(path=str(SCREENSHOTS_DIR / "11_workspace_reset.png"))
        print("   -> Workspace hard reset verified successfully!")

        # ==========================================
        # STEP 3: CONSTRUCT MERGE CONFLICT
        # ==========================================
        print("3. Setting up Divergent Commits for Merge Conflict...")
        # 3a. Commit change in intern's worktree
        ts = int(time.time())
        feature_file = worktree_path / "feature.py"
        feature_file.write_text(f"# Intern Divergent Line {ts}\n", encoding="utf-8")
        git_cmd(["-C", str(worktree_path), "add", "feature.py"])
        git_cmd(["-C", str(worktree_path), "commit", "-m", f"Intern conflicting edit {ts}", "--author=Intern <intern1@example.com>"])

        # 3b. Commit conflicting change on main branch in dummy-upstream
        upstream_path = Path("D:/Intern-workbench/dummy-upstream.git")
        import tempfile
        import shutil
        temp_clone = Path(tempfile.mkdtemp(prefix="temp_upstream_"))
        git_cmd(["clone", "-b", "main", str(upstream_path), str(temp_clone)])
        git_cmd(["-C", str(temp_clone), "config", "user.name", "Upstream Dev"])
        git_cmd(["-C", str(temp_clone), "config", "user.email", "dev@example.com"])
        (temp_clone / "feature.py").write_text(f"# Upstream Divergent Line {ts}\n", encoding="utf-8")
        git_cmd(["-C", str(temp_clone), "add", "feature.py"])
        git_cmd(["-C", str(temp_clone), "commit", "-m", f"Upstream conflicting line {ts}"])
        git_cmd(["-C", str(temp_clone), "push", "origin", "main"])
        
        # Windows-safe force cleanup
        def rmtree_force(path):
            import os, stat
            for root, dirs, files in os.walk(path, topdown=False):
                for name in files:
                    os.chmod(os.path.join(root, name), stat.S_IWRITE)
                for name in dirs:
                    os.chmod(os.path.join(root, name), stat.S_IWRITE)
            shutil.rmtree(path, ignore_errors=True)
        rmtree_force(temp_clone)

        # 3c. Intern clicks 'Sync from main' in UI
        print("4. Triggering 'Sync from main' via UI...")
        sync_btn = page.locator("button[data-sync-btn]")
        sync_btn.click()

        # Wait for conflict banner to appear
        conflict_banner = page.locator("div[data-conflict-banner]")
        expect(conflict_banner).to_be_visible(timeout=10000)
        expect(conflict_banner).to_contain_text("Merge Conflicts Detected")
        expect(conflict_banner).to_contain_text("feature.py")
        time.sleep(1)
        page.screenshot(path=str(SCREENSHOTS_DIR / "12_merge_conflict_banner.png"))
        print("   -> Conflict banner rendered with conflicted files list!")

        # ==========================================
        # STEP 4: TEST MERGE ABORT
        # ==========================================
        print("5. Testing 'Abort Merge'...")
        abort_btn = page.locator("button[data-abort-merge-btn]")
        abort_btn.click()

        page.wait_for_selector("text=Merge aborted", timeout=6000)
        expect(conflict_banner).not_to_be_visible()
        time.sleep(1)
        page.screenshot(path=str(SCREENSHOTS_DIR / "13_merge_aborted.png"))
        print("   -> Merge aborted cleanly. Banner removed.")

        # ==========================================
        # STEP 5: RE-TRIGGER CONFLICT & RESOLVE
        # ==========================================
        print("6. Re-triggering conflict for full resolution test...")
        sync_btn.click()
        expect(conflict_banner).to_be_visible(timeout=10000)

        # Read feature.py on disk to confirm conflict markers exist
        content_with_markers = feature_file.read_text(encoding="utf-8")
        assert "<<<<<<<" in content_with_markers, "File should have git conflict markers"
        print("   -> Conflict markers detected in feature.py on disk.")

        # Resolve conflict cleanly by editing file
        resolved_content = "# Resolved line: Both Intern and Upstream integrated cleanly.\n"
        feature_file.write_text(resolved_content, encoding="utf-8")

        # In UI, click 'Complete Merge'
        print("7. Clicking 'Complete Merge'...")
        complete_btn = page.locator("button[data-complete-merge-btn]")
        complete_btn.click()

        page.wait_for_selector("text=Merge completed successfully!", timeout=8000)
        expect(conflict_banner).not_to_be_visible()
        time.sleep(1)
        page.screenshot(path=str(SCREENSHOTS_DIR / "14_merge_completed.png"))
        print("   -> Merge completed successfully. No conflict markers remain.")

        # ==========================================
        # STEP 6: ADMIN BOARD WORKTREE PRUNING
        # ==========================================
        print("8. Logging in as Admin to test Worktree Pruning...")
        page.goto("http://127.0.0.1:5173/login", wait_until="networkidle")
        page.fill("input[type='email']", "admin@example.com")
        page.fill("input[type='password']", "internpass123")
        page.click("button[type='submit']")

        page.wait_for_url("http://127.0.0.1:5173/admin", timeout=10000)
        page.wait_for_selector("text=Task board", timeout=10000)
        time.sleep(1)

        # Verify Worktree column shows 'active' and 'Prune' button
        prune_btn = page.locator("button[data-prune-btn='1']")
        expect(prune_btn).to_be_visible()
        page.screenshot(path=str(SCREENSHOTS_DIR / "15_admin_board_worktree_active.png"))
        print("   -> Admin board displays active worktree and Prune button.")

        # Click Prune button
        print("9. Clicking 'Prune' button on Admin Board...")
        prune_btn.click()

        # Wait for status to switch to 'archived'
        page.wait_for_selector("text=archived", timeout=8000)
        time.sleep(1)
        page.screenshot(path=str(SCREENSHOTS_DIR / "16_admin_board_worktree_pruned.png"))

        # Verify worktree directory is deleted from disk
        assert not worktree_path.exists(), f"Worktree directory {worktree_path} should be deleted on disk"
        print("   -> Worktree directory successfully deleted from disk. Status is 'archived'.")

        browser.close()

    print("\n========================================================")
    print("      ALL PHASE 2 E2E TESTS PASSED WITH 100% SUCCESS!   ")
    print("========================================================\n")

if __name__ == "__main__":
    test_phase2_e2e()
