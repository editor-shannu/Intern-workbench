import os
import sys
import time
from pathlib import Path

# Ensure backend root is on sys.path
backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))
os.chdir(backend_root)

from playwright.sync_api import sync_playwright, expect

SCREENSHOTS_DIR = Path(r"C:\Users\acer\.gemini\antigravity-ide\brain\220f33a6-9e32-4ff3-99ac-93c445434bfe\screenshots")
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

def test_phase6_e2e():
    print("\n========================================================")
    print("      PHASE 6 / OPTION C E2E TEST: KANBAN & DAG GRAPH")
    print("========================================================\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        # Automatically accept dialogs
        page.on("dialog", lambda dialog: dialog.accept())

        # ==========================================
        # STEP 1: LOGIN AS ADMIN & LOAD ADMIN BOARD
        # ==========================================
        print("1. Logging in as admin@example.com...")
        page.goto("http://127.0.0.1:5173/login", wait_until="networkidle")
        page.fill("input[type='email']", "admin@example.com")
        page.fill("input[type='password']", "internpass123")
        page.click("button[type='submit']")

        page.wait_for_url("http://127.0.0.1:5173/admin", timeout=10000)
        print("   -> Admin board loaded.")
        time.sleep(1)

        # ==========================================
        # STEP 2: SWITCH TO KANBAN VIEW
        # ==========================================
        print("2. Switching to Kanban board view...")
        kanban_btn = page.locator("button[data-view-kanban-btn]")
        expect(kanban_btn).to_be_visible(timeout=5000)
        kanban_btn.click()

        kanban_board = page.locator("div[data-kanban-board]")
        expect(kanban_board).to_be_visible(timeout=5000)

        # Verify 4 columns exist
        expect(page.locator("div[data-kanban-column='unassigned']")).to_be_visible()
        expect(page.locator("div[data-kanban-column='in_progress']")).to_be_visible()
        expect(page.locator("div[data-kanban-column='pr_open']")).to_be_visible()
        expect(page.locator("div[data-kanban-column='merged']")).to_be_visible()

        # Check blocker badge on blocked task card
        blocker_badge = page.locator("div[data-task-blocker-badge]").first
        expect(blocker_badge).to_be_visible(timeout=5000)
        print(f"   -> Found blocker badge on task card: {blocker_badge.text_content()}")

        time.sleep(1)
        shot1 = SCREENSHOTS_DIR / "29_admin_kanban_board.png"
        page.screenshot(path=str(shot1))
        print(f"   -> Captured {shot1.name}")

        # ==========================================
        # STEP 3: MOVE TASK ACROSS COLUMNS
        # ==========================================
        print("3. Testing interactive status movement across Kanban columns...")
        # Find first card with a forward button
        forward_btn = page.locator("button[data-move-task-forward]").first
        expect(forward_btn).to_be_visible()
        forward_btn.click()
        time.sleep(1)
        print("   -> Task moved forward successfully.")

        # ==========================================
        # STEP 4: OPEN DEPENDENCY GRAPH (DAG) MODAL
        # ==========================================
        print("4. Opening Dependency Graph (DAG) Modal...")
        open_graph_btn = page.locator("button[data-open-graph-btn]")
        expect(open_graph_btn).to_be_visible()
        open_graph_btn.click()

        graph_modal = page.locator("div[data-dependency-graph-modal]")
        expect(graph_modal).to_be_visible(timeout=5000)

        # Verify SVG and node elements
        svg_elem = page.locator("svg[data-graph-svg]")
        expect(svg_elem).to_be_visible()
        node_count = page.locator("g[data-graph-node]").count()
        assert node_count >= 3, f"Expected at least 3 nodes in graph, got {node_count}"
        print(f"   -> Rendered {node_count} nodes in DAG SVG canvas.")

        # Verify Node Inspector
        inspector = page.locator("div[data-node-inspector]")
        expect(inspector).to_be_visible()
        print(f"   -> Node Inspector active for selected node.")

        time.sleep(1)
        shot2 = SCREENSHOTS_DIR / "30_dependency_graph_modal.png"
        page.screenshot(path=str(shot2))
        print(f"   -> Captured {shot2.name}")

        # Close graph modal
        close_graph_btn = page.locator("button[data-close-graph-btn]")
        close_graph_btn.click()
        expect(graph_modal).not_to_be_visible()
        print("   -> Closed graph modal.")

        # ==========================================
        # STEP 5: VERIFY INTERN DASHBOARD BLOCKER
        # ==========================================
        print("5. Logging out and logging in as intern to verify blocker warning...")
        # Clear storage / cookies or navigate to login
        page.goto("http://127.0.0.1:5173/login", wait_until="networkidle")
        page.evaluate("localStorage.clear()")
        page.reload(wait_until="networkidle")

        page.fill("input[type='email']", "intern1@example.com")
        page.fill("input[type='password']", "intern123")
        page.click("button[type='submit']")

        page.wait_for_url("http://127.0.0.1:5173/", timeout=10000)
        page.wait_for_selector("text=Your tasks", timeout=10000)

        # Check intern blocker badge
        intern_blocker = page.locator("div[data-intern-blocker-badge]").first
        expect(intern_blocker).to_be_visible(timeout=5000)
        badge_text = intern_blocker.text_content()
        print(f"   -> Intern Dashboard displays blocker warning: {badge_text}")
        assert "Blocked: Waiting on" in badge_text

        time.sleep(1)
        shot3 = SCREENSHOTS_DIR / "31_intern_dependency_blocker.png"
        page.screenshot(path=str(shot3))
        print(f"   -> Captured {shot3.name}")

        browser.close()

    print("\n========================================================")
    print("  PHASE 6 / OPTION C E2E TEST COMPLETED SUCCESSFULLY!")
    print("========================================================\n")

if __name__ == "__main__":
    test_phase6_e2e()
