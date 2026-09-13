import os
import sys
import time
from pathlib import Path

# Ensure backend root is on sys.path and is current working directory for .env
backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))
os.chdir(backend_root)

from playwright.sync_api import sync_playwright, expect

SCREENSHOTS_DIR = Path(r"C:\Users\acer\.gemini\antigravity-ide\brain\220f33a6-9e32-4ff3-99ac-93c445434bfe\screenshots")
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

SAMPLE_IMPORT_PLAN = """# Supercharged Enterprise Plan
Repo: https://github.com/enterprise/fintech-core
Branch: staging

## Milestone 1: Core Architecture
### [full-stack] Setup Auth Microservice
TaskID: auth-microservice
AssignTo: intern1@example.com
Configure OAuth2 and JWT session validation modules.

### [data] Financial Data ETL Ingestion
TaskID: financial-etl
DependsOn: auth-microservice
AssignTo: intern1@example.com
Streaming pipeline for real-time market quotes and transactions.

## Milestone 2: Intelligent Fraud Detection
### [ai-ml] Anomaly Detection Neural Net
TaskID: fraud-anomaly-detector
DependsOn: financial-etl
Deep learning model for high-frequency transaction anomaly identification.
"""

def test_phase4_e2e():
    print("\n========================================================")
    print("      PHASE 4 E2E TEST: ADMIN ANALYTICS & PLAN IMPORTER")
    print("========================================================\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        # Automatically accept confirm dialogs
        page.on("dialog", lambda dialog: dialog.accept())

        # ==========================================
        # STEP 1: LOGIN AS ADMIN
        # ==========================================
        print("1. Logging in as admin@example.com...")
        page.goto("http://127.0.0.1:5173/login", wait_until="networkidle")
        page.fill("input[type='email']", "admin@example.com")
        page.fill("input[type='password']", "internpass123")
        page.click("button[type='submit']")

        page.wait_for_url("http://127.0.0.1:5173/admin", timeout=10000)
        page.wait_for_selector("text=Task board", timeout=10000)
        time.sleep(1)

        # ==========================================
        # STEP 2: VERIFY ADMIN ANALYTICS DASHBOARD
        # ==========================================
        print("2. Verifying Admin Analytics & Telemetry KPI cards...")
        analytics_panel = page.locator("div[data-admin-analytics]")
        expect(analytics_panel).to_be_visible(timeout=5000)

        metric_worktrees = page.locator("div[data-metric-worktrees]")
        expect(metric_worktrees).to_be_visible()
        print(f"   -> Worktrees metric text: {metric_worktrees.inner_text().replace(chr(10), ' ')}")

        metric_tasks = page.locator("div[data-metric-tasks]")
        expect(metric_tasks).to_be_visible()

        metric_prs = page.locator("div[data-metric-prs]")
        expect(metric_prs).to_be_visible()

        metric_ai = page.locator("div[data-metric-ai]")
        expect(metric_ai).to_be_visible()

        page.screenshot(path=str(SCREENSHOTS_DIR / "23_admin_analytics_dashboard.png"))
        print("   -> Screenshot 23_admin_analytics_dashboard.png captured.")

        # ==========================================
        # STEP 3: OPEN PROJECT PLAN IMPORTER MODAL
        # ==========================================
        print("3. Opening Project Plan Importer modal...")
        import_btn = page.locator("button[data-import-plan-btn]")
        expect(import_btn).to_be_visible()
        import_btn.click()

        plan_modal = page.locator("div[data-plan-importer-modal]")
        expect(plan_modal).to_be_visible(timeout=5000)

        # Fill markdown textarea with sample enterprise plan
        textarea = page.locator("textarea[data-plan-textarea]")
        expect(textarea).to_be_visible()
        textarea.fill(SAMPLE_IMPORT_PLAN)

        # Click Generate Preview
        preview_btn = page.locator("button[data-generate-preview-btn]")
        preview_btn.click()

        # Verify Dry-Run Preview Area
        preview_area = page.locator("div[data-plan-preview-area]")
        expect(preview_area).to_be_visible(timeout=5000)

        plan_name = page.locator("[data-preview-plan-name]")
        expect(plan_name).to_contain_text("Supercharged Enterprise Plan")

        task_previews = page.locator("[data-preview-task-item]")
        count = task_previews.count()
        print(f"   -> Detected {count} tasks in dry-run preview.")
        assert count == 3, f"Expected 3 tasks in preview, got {count}"

        time.sleep(1)
        page.screenshot(path=str(SCREENSHOTS_DIR / "24_plan_importer_modal.png"))
        print("   -> Screenshot 24_plan_importer_modal.png captured.")

        # ==========================================
        # STEP 4: CONFIRM IMPORT & VERIFY TASKS
        # ==========================================
        print("4. Confirming import and committing tasks to database...")
        confirm_btn = page.locator("button[data-confirm-import-btn]")
        confirm_btn.click()

        # Modal closes on success
        expect(plan_modal).to_be_hidden(timeout=8000)
        time.sleep(2)

        # Verify newly created tasks in the Task board table
        page.wait_for_selector("text=Setup Auth Microservice", timeout=5000)
        page.wait_for_selector("text=Financial Data ETL Ingestion", timeout=5000)
        page.wait_for_selector("text=Anomaly Detection Neural Net", timeout=5000)

        print("   -> All 3 tasks successfully imported and displayed in Task board!")
        time.sleep(1)

        page.screenshot(path=str(SCREENSHOTS_DIR / "25_plan_imported_tasks.png"))
        print("   -> Screenshot 25_plan_imported_tasks.png captured.")

        browser.close()

    print("\n========================================================")
    print("      ALL PHASE 4 E2E TESTS PASSED WITH 100% SUCCESS")
    print("========================================================\n")

if __name__ == "__main__":
    test_phase4_e2e()
