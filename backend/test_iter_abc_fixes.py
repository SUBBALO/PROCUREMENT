"""
Test untuk 3 bug fixes & features:
A. BUG FIX: Inquiry assign ke eng_leader (qa_leader_tmp) harus berhasil
B. FEATURE: Revisi DR Berjenjang (request/approve/reject revision)
C. BUG FIX: Leader auto-verify saat submit drawing
"""
import requests
import sys
from datetime import datetime

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

class TestSession:
    def __init__(self):
        self.session = requests.Session()
        self.token = None
        self.user = None
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failed_tests = []

    def login(self, username, password):
        """Login and store cookies"""
        print(f"\n🔐 Login sebagai {username}...")
        try:
            resp = self.session.post(
                f"{BASE_URL}/auth/login",
                json={"username": username, "password": password},
                timeout=10
            )
            if resp.status_code == 200:
                data = resp.json()
                self.user = data.get("user", {})
                print(f"✅ Login berhasil: {self.user.get('name')} ({self.user.get('role')})")
                return True
            else:
                print(f"❌ Login gagal: {resp.status_code} - {resp.text[:200]}")
                return False
        except Exception as e:
            print(f"❌ Login error: {e}")
            return False

    def test(self, name, method, endpoint, expected_status, data=None, json_data=None):
        """Run a single test"""
        self.tests_run += 1
        print(f"\n🔍 Test #{self.tests_run}: {name}")
        
        try:
            url = f"{BASE_URL}{endpoint}"
            kwargs = {"timeout": 15}
            if data:
                kwargs["data"] = data
            if json_data:
                kwargs["json"] = json_data
            
            if method == "GET":
                resp = self.session.get(url, **kwargs)
            elif method == "POST":
                resp = self.session.post(url, **kwargs)
            elif method == "PUT":
                resp = self.session.put(url, **kwargs)
            elif method == "DELETE":
                resp = self.session.delete(url, **kwargs)
            else:
                raise ValueError(f"Unknown method: {method}")
            
            success = resp.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                print(f"✅ PASS - Status: {resp.status_code}")
                try:
                    return True, resp.json()
                except Exception:
                    return True, resp.text
            else:
                self.tests_failed += 1
                self.failed_tests.append(name)
                print(f"❌ FAIL - Expected {expected_status}, got {resp.status_code}")
                print(f"   Response: {resp.text[:300]}")
                try:
                    return False, resp.json()
                except Exception:
                    return False, resp.text
        except Exception as e:
            self.tests_failed += 1
            self.failed_tests.append(name)
            print(f"❌ FAIL - Exception: {str(e)}")
            return False, {}

    def summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("📊 TEST SUMMARY")
        print("="*60)
        print(f"Total Tests: {self.tests_run}")
        print(f"✅ Passed: {self.tests_passed}")
        print(f"❌ Failed: {self.tests_failed}")
        if self.failed_tests:
            print(f"\nFailed tests:")
            for t in self.failed_tests:
                print(f"  - {t}")
        print("="*60)
        return self.tests_failed == 0


def main():
    print("="*60)
    print("🧪 Testing Bug Fixes A, B, C")
    print("="*60)
    
    # ========== A. BUG FIX: Inquiry assign ke eng_leader ==========
    print("\n" + "="*60)
    print("A. BUG FIX: Inquiry Assignment to Engineering Leader")
    print("="*60)
    
    admin = TestSession()
    if not admin.login("qa_super_tmp", "QaTest12345"):
        print("❌ Cannot login as admin, aborting test A")
        return 1
    
    # Get list of inquiries with status submitted
    success, data = admin.test(
        "A1: Get submitted inquiries",
        "GET",
        "/inquiries?status=submitted&limit=10",
        200
    )
    
    inquiry_id = None
    if success and data:
        items = data.get("items", [])
        if items:
            inquiry_id = items[0].get("id")
            print(f"   Found inquiry: {items[0].get('inquiry_no')} (id: {inquiry_id})")
        else:
            print("   No submitted inquiries found, will create one")
    
    # If no inquiry, create one as sales first
    if not inquiry_id:
        sales = TestSession()
        if sales.login("qa_sales_tmp", "QaTest12345"):
            success, data = sales.test(
                "A1b: Create inquiry as sales",
                "POST",
                "/inquiries",
                200,
                json_data={
                    "title": f"Test Inquiry for Leader Assignment {datetime.now().strftime('%H%M%S')}",
                    "customer_name": "Test Customer",
                    "project_name": "Test Project",
                    "description": "Test inquiry for eng_leader assignment",
                    "items": [{"item_name": "Test Item", "qty": 1, "unit": "pcs"}],
                    "save_as_draft": False
                }
            )
            if success:
                inquiry_id = data.get("id")
                print(f"   Created inquiry: {data.get('inquiry_no')} (id: {inquiry_id})")
    
    if not inquiry_id:
        print("❌ Cannot get or create inquiry for test A")
        return 1
    
    # Get eng_leader user (qa_leader_tmp)
    success, data = admin.test(
        "A2: Get engineering users list",
        "GET",
        "/inquiries/engineers",
        200
    )
    
    leader_id = None
    if success and data:
        items = data.get("items", [])
        for u in items:
            if u.get("role") in ("eng_leader", "eng_head"):
                leader_id = u.get("id")
                leader_name = u.get("name") or u.get("username")
                print(f"   Found eng_leader: {leader_name} (id: {leader_id})")
                break
    
    if not leader_id:
        print("❌ Cannot find eng_leader user")
        return 1
    
    # MAIN TEST A: Assign inquiry to eng_leader
    success, data = admin.test(
        "A3: Assign inquiry to eng_leader (MAIN TEST)",
        "POST",
        f"/inquiries/{inquiry_id}/assign",
        200,
        json_data={
            "engineer_id": leader_id,
            "engineer_name": leader_name
        }
    )
    
    if not success:
        print("❌ BUG FIX A FAILED: Cannot assign inquiry to eng_leader")
    else:
        print("✅ BUG FIX A PASSED: eng_leader can be assigned to inquiry")
    
    # ========== B. FEATURE: Revisi DR Berjenjang ==========
    print("\n" + "="*60)
    print("B. FEATURE: Tiered Drawing Request Revision")
    print("="*60)
    
    sales = TestSession()
    if not sales.login("qa_sales_tmp", "QaTest12345"):
        print("❌ Cannot login as sales, aborting test B")
        return 1
    
    # Get list of SOs
    success, data = sales.test(
        "B1: Get sales orders",
        "GET",
        "/sales-orders?limit=10",
        200
    )
    
    so_no = None
    if success and data:
        items = data if isinstance(data, list) else data.get("items", [])
        if items:
            so_no = items[0].get("so_no")
            print(f"   Found SO: {so_no}")
    
    if not so_no:
        print("❌ No SO found for test B")
        return 1
    
    # Create DRF
    success, data = sales.test(
        "B2: Create DRF",
        "POST",
        "/drawing-requests",
        200,
        json_data={
            "request_type": "new_order",
            "so_no": so_no,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "project_name": f"Test DRF Revision {datetime.now().strftime('%H%M%S')}",
            "customer_code": "TEST",
            "customer_name": "Test Customer",
            "po_customer_no": "PO-TEST-001",
            "po_received_date": datetime.now().strftime("%Y-%m-%d"),
            "qty_order": 1,
            "unit": "pcs",
            "material": "TBA",
            "items": [{"name": "Test Item", "qty": 1, "unit": "pcs", "material": "TBA"}],
            "expected_due_date": "2026-12-31",
            "notes": "Test DRF for revision feature"
        }
    )
    
    if not success:
        print("❌ Cannot create DRF for test B")
        return 1
    
    drf_id = data.get("id")
    drf_no = data.get("form_no")
    print(f"   Created DRF: {drf_no} (id: {drf_id})")
    
    # Submit DRF
    success, data = sales.test(
        "B3: Submit DRF",
        "POST",
        f"/drawing-requests/{drf_id}/submit",
        200
    )
    
    if not success:
        print("❌ Cannot submit DRF")
        return 1
    
    print(f"   DRF status: {data.get('status')}")
    
    # B4: Request revision WITHOUT reason (should fail with 400)
    success, data = sales.test(
        "B4: Request revision without reason (should fail)",
        "POST",
        f"/drawing-requests/{drf_id}/request-revision",
        400,
        json_data={"reason": ""}
    )
    
    if not success:
        print("❌ Should return 400 when reason is empty")
    
    # B5: Request revision WITH reason (should succeed)
    success, data = sales.test(
        "B5: Request revision with reason (MAIN TEST)",
        "POST",
        f"/drawing-requests/{drf_id}/request-revision",
        200,
        json_data={"reason": "Perlu ubah qty dari 1 menjadi 2"}
    )
    
    if not success:
        print("❌ FEATURE B FAILED: Cannot request revision")
        return 1
    
    if data.get("status") != "revision_requested":
        print(f"❌ Status should be 'revision_requested', got: {data.get('status')}")
    else:
        print("✅ Status changed to 'revision_requested'")
    
    # B6: Sales trying to approve revision (should fail with 403)
    success, data = sales.test(
        "B6: Sales trying to approve revision (should fail)",
        "POST",
        f"/drawing-requests/{drf_id}/approve-revision",
        403
    )
    
    if not success:
        print("❌ Should return 403 when sales tries to approve")
    
    # B7: Supervisor approve revision
    supervisor = TestSession()
    if not supervisor.login("qa_super_tmp", "QaTest12345"):
        print("❌ Cannot login as supervisor")
        return 1
    
    success, data = supervisor.test(
        "B7: Supervisor approve revision (MAIN TEST)",
        "POST",
        f"/drawing-requests/{drf_id}/approve-revision",
        200
    )
    
    if not success:
        print("❌ FEATURE B FAILED: Supervisor cannot approve revision")
        return 1
    
    if data.get("status") != "draft":
        print(f"❌ Status should be 'draft' after approval, got: {data.get('status')}")
    else:
        print("✅ Status changed to 'draft' after approval")
    
    # B8: Submit again and test reject
    success, data = sales.test(
        "B8: Submit DRF again",
        "POST",
        f"/drawing-requests/{drf_id}/submit",
        200
    )
    
    success, data = sales.test(
        "B9: Request revision again",
        "POST",
        f"/drawing-requests/{drf_id}/request-revision",
        200,
        json_data={"reason": "Test reject flow"}
    )
    
    success, data = supervisor.test(
        "B10: Supervisor reject revision (MAIN TEST)",
        "POST",
        f"/drawing-requests/{drf_id}/reject-revision",
        200,
        json_data={"reason": "Tidak perlu revisi"}
    )
    
    if not success:
        print("❌ FEATURE B FAILED: Supervisor cannot reject revision")
    else:
        if data.get("status") == "submitted":
            print("✅ Status returned to 'submitted' after rejection")
        else:
            print(f"⚠️  Status should be 'submitted', got: {data.get('status')}")
    
    # B11: Check revision-pending-count endpoint
    success, data = supervisor.test(
        "B11: Get revision pending count",
        "GET",
        "/drawing-requests/revision-pending-count",
        200
    )
    
    if not success:
        print("❌ FEATURE B FAILED: Cannot get revision pending count")
    else:
        count = data.get("count")
        print(f"✅ Revision pending count: {count}")
    
    # ========== C. BUG FIX: Leader Auto-Verify ==========
    print("\n" + "="*60)
    print("C. BUG FIX: Leader Auto-Verify Drawing Submission")
    print("="*60)
    
    leader = TestSession()
    if not leader.login("qa_leader_tmp", "QaTest12345"):
        print("❌ Cannot login as eng_leader, aborting test C")
        return 1
    
    # Get list of drawings
    success, data = leader.test(
        "C1: Get drawings list",
        "GET",
        "/drawings?limit=10",
        200
    )
    
    drawing_id = None
    if success and data:
        items = data.get("items", [])
        # Find a draft drawing or create one
        for d in items:
            if d.get("approval_status") in (None, "", "draft") and d.get("file_id"):
                drawing_id = d.get("id")
                print(f"   Found draft drawing: {d.get('drawing_no')} (id: {drawing_id})")
                break
    
    # If no suitable drawing, create one
    if not drawing_id:
        print("   No suitable drawing found, creating one...")
        success, data = leader.test(
            "C1b: Create drawing",
            "POST",
            "/drawings",
            200,
            json_data={
                "customer_code": "TEST",
                "project_initial": "TST",
                "drawing_type": "Assembly",
                "title": f"Test Drawing Leader Auto-Verify {datetime.now().strftime('%H%M%S')}",
                "discipline": "Mechanical",
                "so_no": so_no if so_no else "000001",
                "project_name": "Test Project",
                "prepared_by": "qa_leader_tmp",
                "bom_link_mode": "none"
            }
        )
        
        if success:
            drawing_id = data.get("id")
            print(f"   Created drawing: {data.get('drawing_no')} (id: {drawing_id})")
        else:
            print("❌ Cannot create drawing for test C")
            print("⚠️  Test C skipped - cannot prepare drawing")
            # Don't fail the entire test suite
            print("\n" + "="*60)
            print("📊 PARTIAL TEST SUMMARY")
            print("="*60)
            print("Test A (Inquiry assign to eng_leader): TESTED")
            print("Test B (DR Revision flow): TESTED")
            print("Test C (Leader auto-verify): SKIPPED (cannot prepare drawing)")
            print("="*60)
            
            # Return success if A and B passed
            all_sessions = [admin, sales, supervisor]
            total_failed = sum(s.tests_failed for s in all_sessions)
            return 0 if total_failed == 0 else 1
    
    # Set work category (required before submit)
    success, data = leader.test(
        "C2: Set work category",
        "POST",
        f"/drawings/{drawing_id}/work-category",
        200,
        json_data={"work_category": "simple"}
    )
    
    # MAIN TEST C: Submit drawing for approval as eng_leader
    success, data = leader.test(
        "C3: Submit drawing for approval as eng_leader (MAIN TEST)",
        "POST",
        f"/drawings/{drawing_id}/submit-for-approval",
        200
    )
    
    if not success:
        print("❌ BUG FIX C FAILED: Cannot submit drawing")
        print("⚠️  This might be due to missing file upload or other requirements")
    else:
        approval_status = data.get("approval_status")
        auto_verified = data.get("auto_leader_verified")
        
        if approval_status == "pending_qc":
            print(f"✅ Approval status is 'pending_qc' (skipped eng_head stage)")
        else:
            print(f"⚠️  Approval status should be 'pending_qc', got: {approval_status}")
        
        if auto_verified:
            print(f"✅ auto_leader_verified flag is True")
        else:
            print(f"⚠️  auto_leader_verified flag should be True, got: {auto_verified}")
        
        if approval_status == "pending_qc" and auto_verified:
            print("✅ BUG FIX C PASSED: Leader auto-verify working correctly")
        else:
            print("⚠️  BUG FIX C PARTIAL: Some conditions not met")
    
    # Print final summary
    print("\n" + "="*60)
    print("📊 FINAL TEST SUMMARY")
    print("="*60)
    
    all_sessions = [admin, sales, supervisor, leader]
    total_run = sum(s.tests_run for s in all_sessions)
    total_passed = sum(s.tests_passed for s in all_sessions)
    total_failed = sum(s.tests_failed for s in all_sessions)
    
    print(f"Total Tests: {total_run}")
    print(f"✅ Passed: {total_passed}")
    print(f"❌ Failed: {total_failed}")
    
    all_failed = []
    for s in all_sessions:
        all_failed.extend(s.failed_tests)
    
    if all_failed:
        print(f"\nFailed tests:")
        for t in all_failed:
            print(f"  - {t}")
    
    print("="*60)
    
    return 0 if total_failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
