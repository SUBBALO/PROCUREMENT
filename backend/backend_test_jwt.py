"""
Direct JWT Token Test for Feature F+G
Uses direct JWT token creation to bypass login
"""
import requests
import sys
import uuid
import io
import os

# Load environment variables
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')

sys.path.insert(0, '/app/backend')

from security import create_access_token
from db import db
import asyncio

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

async def get_user_token(username):
    """Get JWT token for a user"""
    user = await db.users.find_one({"username": username}, {"_id": 0})
    if not user:
        print(f"User {username} not found")
        return None
    token = create_access_token(user["id"], username)
    return token

class DirectTokenTester:
    def __init__(self):
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0
        
    def log(self, msg, status="info"):
        prefix = {"info": "ℹ️", "success": "✅", "error": "❌", "warn": "⚠️"}
        print(f"{prefix.get(status, 'ℹ️')} {msg}")
    
    def set_token(self, token):
        """Set authorization token"""
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test(self, name, method, endpoint, expected_status, data=None, json_data=None, files=None):
        """Run a single API test"""
        url = f"{BASE_URL}/{endpoint}"
        self.tests_run += 1
        self.log(f"Testing {name}...", "info")
        
        try:
            if method == "GET":
                response = self.session.get(url)
            elif method == "POST":
                if files:
                    response = self.session.post(url, data=data, files=files)
                else:
                    response = self.session.post(url, json=json_data or data)
            elif method == "PUT":
                response = self.session.put(url, json=json_data or data)
            else:
                self.log(f"Unknown method {method}", "error")
                return False, {}
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"PASSED - Status: {response.status_code}", "success")
            else:
                self.log(f"FAILED - Expected {expected_status}, got {response.status_code}", "error")
                try:
                    err_detail = response.json().get("detail", "")
                    self.log(f"Error: {err_detail}", "error")
                except Exception:
                    self.log(f"Response text: {response.text[:300]}", "error")
            
            try:
                return success, response.json() if response.text else {}
            except Exception:
                return success, {}
        except Exception as e:
            self.log(f"FAILED - Error: {str(e)}", "error")
            return False, {}
    
    async def run_full_workflow(self):
        """Run the complete workflow test"""
        self.log("=" * 70, "info")
        self.log("FULL WORKFLOW TEST: DRF → Drawing → Sales TTD Auto-fill", "info")
        self.log("=" * 70, "info")
        
        # Get token for super_admin
        self.log("Getting token for super_admin (susanto)...", "info")
        token = await get_user_token("susanto")
        if not token:
            self.log("Failed to get token", "error")
            return 1
        self.set_token(token)
        self.log("Token set successfully", "success")
        
        # Step 1: Create DRF with po_customer_no
        self.log("\n[STEP 1] Create DRF with po_customer_no", "info")
        test_po = f"PO-{uuid.uuid4().hex[:8].upper()}"
        test_customer_code = "TESTCUST"
        
        drf_data = {
            "request_type": "new_order",
            "so_no": f"SO-{uuid.uuid4().hex[:6].upper()}",
            "project_name": "Test Project for Feature F+G",
            "customer_code": test_customer_code,
            "customer_name": "Test Customer Company",
            "po_customer_no": test_po,
            "qty_order": 10,
            "unit": "pcs",
            "material": "Steel",
            "expected_due_date": "2026-12-31"
        }
        
        success, drf = self.test(
            "Create DRF",
            "POST",
            "drawing-requests",
            200,
            json_data=drf_data
        )
        
        if not success:
            return 1
        
        drf_id = drf.get("id")
        self.log(f"DRF created: {drf.get('form_no')}", "success")
        self.log(f"po_customer_no: {drf.get('po_customer_no')}", "info")
        
        # Step 2: Submit DRF
        self.log("\n[STEP 2] Submit DRF", "info")
        success, _ = self.test(
            "Submit DRF",
            "POST",
            f"drawing-requests/{drf_id}/submit",
            200
        )
        
        if not success:
            return 1
        
        # Step 3: Accept DRF
        self.log("\n[STEP 3] Accept DRF", "info")
        success, _ = self.test(
            "Accept DRF",
            "POST",
            f"drawing-requests/{drf_id}/accept",
            200
        )
        
        if not success:
            return 1
        
        # Step 4: Generate drawings from DRF
        self.log("\n[STEP 4] Generate drawings from DRF", "info")
        gen_data = {
            "drawings": [
                {
                    "project_initial": "TST",
                    "drawing_type": "Assembly",
                    "title": "Test Drawing for Feature F+G",
                    "discipline": "Mechanical"
                }
            ],
            "class_material": "Test Material Class"
        }
        
        success, gen_result = self.test(
            "Generate drawings",
            "POST",
            f"drawing-requests/{drf_id}/generate-drawings",
            200,
            json_data=gen_data
        )
        
        if not success:
            return 1
        
        drawings = gen_result.get("drawings", [])
        if not drawings:
            self.log("No drawings generated", "error")
            return 1
        
        drawing = drawings[0]
        drawing_id = drawing.get("id")
        drawing_no = drawing.get("drawing_no")
        
        self.log(f"Drawing created: {drawing_no}", "success")
        
        # Verify po_customer_no was copied
        if drawing.get("po_customer_no") != test_po:
            self.log(f"❌ CRITICAL: po_customer_no NOT copied to drawing!", "error")
            self.log(f"Expected: {test_po}, Got: {drawing.get('po_customer_no')}", "error")
            return 1
        else:
            self.log(f"✅ po_customer_no correctly copied: {drawing.get('po_customer_no')}", "success")
        
        # Verify customer_code is present
        if drawing.get("customer_code") != test_customer_code:
            self.log(f"❌ CRITICAL: customer_code mismatch!", "error")
            self.log(f"Expected: {test_customer_code}, Got: {drawing.get('customer_code')}", "error")
            return 1
        else:
            self.log(f"✅ customer_code correct: {drawing.get('customer_code')}", "success")
        
        # Step 5: Upload PDF
        self.log("\n[STEP 5] Upload PDF to drawing", "info")
        pdf_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF"
        
        files = {"file": ("test_drawing.pdf", io.BytesIO(pdf_content), "application/pdf")}
        data = {"force": "false"}
        
        success, _ = self.test(
            "Upload PDF",
            "POST",
            f"drawings/{drawing_id}/upload",
            200,
            data=data,
            files=files
        )
        
        if not success:
            self.log("PDF upload failed, but continuing...", "warn")
        
        # Step 6: Set work category
        self.log("\n[STEP 6] Set work category", "info")
        success, _ = self.test(
            "Set work category",
            "POST",
            f"drawings/{drawing_id}/work-category",
            200,
            json_data={"work_category": "simple"}
        )
        
        if not success:
            self.log("Work category failed, but continuing...", "warn")
        
        # Step 7: Submit drawing
        self.log("\n[STEP 7] Submit drawing (Prepared By)", "info")
        success, _ = self.test(
            "Submit drawing",
            "POST",
            f"drawings/{drawing_id}/submit-for-approval",
            200,
            json_data={"notes": "Test submission", "placements": []}
        )
        
        if not success:
            return 1
        
        # Step 8: Approve as Eng Head
        self.log("\n[STEP 8] Approve as Eng Head", "info")
        success, _ = self.test(
            "Approve eng_head",
            "POST",
            f"drawings/{drawing_id}/approve/eng_head",
            200,
            json_data={"notes": "Approved by Eng Head", "placements": []}
        )
        
        if not success:
            return 1
        
        # Step 9: Approve as QC
        self.log("\n[STEP 9] Approve as QC", "info")
        success, _ = self.test(
            "Approve QC",
            "POST",
            f"drawings/{drawing_id}/approve/qc",
            200,
            json_data={"notes": "Approved by QC", "placements": []}
        )
        
        if not success:
            return 1
        
        # Step 10: Approve as Sales (CRITICAL TEST)
        self.log("\n[STEP 10] Approve as Sales - TEST AUTO-FILL", "info")
        self.log("⚠️  CRITICAL: Testing WITHOUT so_stamp_data - should auto-fill", "warn")
        
        success, sales_result = self.test(
            "Sales approve WITHOUT so_stamp_data",
            "POST",
            f"drawings/{drawing_id}/approve/sales",
            200,
            json_data={"notes": "Approved by Sales", "placements": []}
        )
        
        if not success:
            self.log("❌ Sales approval failed - cannot test auto-fill", "error")
            return 1
        
        # Step 11: Verify so_stamp_draft
        self.log("\n[STEP 11] Verify so_stamp_draft auto-fill", "info")
        success, drawing_final = self.test(
            "GET drawing to check so_stamp_draft",
            "GET",
            f"drawings/{drawing_id}",
            200
        )
        
        if not success:
            return 1
        
        so_stamp_draft = drawing_final.get("so_stamp_draft", {})
        
        self.log("\n" + "=" * 70, "info")
        self.log("VERIFICATION RESULTS:", "info")
        self.log("=" * 70, "info")
        
        all_checks_passed = True
        
        # Check 1: so_stamp_draft exists
        if not so_stamp_draft:
            self.log("❌ FAILED: so_stamp_draft is EMPTY", "error")
            all_checks_passed = False
        else:
            self.log("✅ so_stamp_draft exists", "success")
        
        # Check 2: po_no = po_customer_no
        if so_stamp_draft.get("po_no") != test_po:
            self.log(f"❌ FAILED: po_no mismatch", "error")
            self.log(f"   Expected: {test_po}", "error")
            self.log(f"   Got: {so_stamp_draft.get('po_no')}", "error")
            all_checks_passed = False
        else:
            self.log(f"✅ po_no correctly auto-filled: {so_stamp_draft.get('po_no')}", "success")
        
        # Check 3: customer = customer_code (NOT customer_name)
        if so_stamp_draft.get("customer") != test_customer_code:
            self.log(f"❌ FAILED: customer mismatch", "error")
            self.log(f"   Expected (customer_code): {test_customer_code}", "error")
            self.log(f"   Got: {so_stamp_draft.get('customer')}", "error")
            all_checks_passed = False
        else:
            self.log(f"✅ customer correctly uses CODE (not name): {so_stamp_draft.get('customer')}", "success")
        
        # Check 4: so_no is filled
        if not so_stamp_draft.get("so_no"):
            self.log("⚠️  WARNING: so_no is empty", "warn")
        else:
            self.log(f"✅ so_no filled: {so_stamp_draft.get('so_no')}", "success")
        
        self.log("\n" + "=" * 70, "info")
        if all_checks_passed:
            self.log("🎉 ALL CRITICAL CHECKS PASSED!", "success")
            self.log("Feature F+G implementation is CORRECT", "success")
        else:
            self.log("❌ SOME CHECKS FAILED - See errors above", "error")
        self.log("=" * 70, "info")
        
        self.log(f"\nTotal API calls: {self.tests_run}", "info")
        self.log(f"Successful calls: {self.tests_passed}", "info")
        
        return 0 if all_checks_passed else 1

def main():
    tester = DirectTokenTester()
    return asyncio.run(tester.run_full_workflow())

if __name__ == "__main__":
    sys.exit(main())
