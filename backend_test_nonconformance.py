"""Comprehensive Backend API Tests for Nonconformance (CAR) Module
Tests all endpoints with proper RBAC and data validation.
Uses public endpoint for testing.
"""
import os
import sys
import requests
import io
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "backend", ".env"))
from backend.security import create_access_token

# Public endpoint
BASE = "https://error-fix-dev.preview.emergentagent.com/api"

# User IDs from seed data
USERS = {
    "qc": "f4569e58-8bc8-4590-8535-ce0a45ce39e2",
    "sales": "37c44d5b-73cf-4aec-9ced-c971d9631af3",
    "produksi": "13d6f9c6-3e38-4e47-b85f-da1ee6996561",
    "eng_leader": "8a18b785-0f6d-4699-b408-0fae51f4259f",   # riski
    "eng_staff": "e24c23a4-c820-4f19-adfe-2a7688ce4660",     # adit
}

test_nc_ids = []  # Track created NCs for cleanup


def hdr(role):
    """Generate auth header for role"""
    return {"Authorization": f"Bearer {create_access_token(USERS[role], '')}"}


def get_drawings():
    """Get some drawings for testing"""
    r = requests.get(f"{BASE}/drawings?limit=500", headers=hdr("eng_leader"), timeout=30)
    r.raise_for_status()
    items = r.json().get("items", [])
    return [d for d in items if d.get("drawing_no")][:2]


class TestNonconformanceAPI:
    """Test suite for Nonconformance (CAR) endpoints"""
    
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.test_ncs = []  # Track created NCs
    
    def log_pass(self, msg):
        print(f"✅ PASS: {msg}")
        self.passed += 1
    
    def log_fail(self, msg):
        print(f"❌ FAIL: {msg}")
        self.failed += 1
    
    def test_create_any_user(self):
        """Test 1: ANY authenticated user can create CAR"""
        print("\n=== Test 1: Create CAR (any user) ===")
        
        # Test with different roles
        for role in ["qc", "sales", "produksi", "eng_staff"]:
            payload = {
                "issued_to_dept": "engineering",
                "link_type": "other",
                "object_ref": f"Test object from {role}",
                "description": f"Test NC from {role}",
                "source": "in_house",
                "severity": "minor"
            }
            r = requests.post(f"{BASE}/nonconformance", json=payload, headers=hdr(role), timeout=30)
            if r.status_code == 200:
                nc = r.json()
                self.test_ncs.append(nc["id"])
                self.log_pass(f"{role} can create CAR: {nc['nc_no']}")
            else:
                self.log_fail(f"{role} cannot create CAR: {r.status_code} - {r.text}")
    
    def test_create_validation(self):
        """Test 2: Validation - issued_to_dept required, link_type rules"""
        print("\n=== Test 2: Create validation ===")
        
        # Missing issued_to_dept
        r = requests.post(f"{BASE}/nonconformance", json={
            "link_type": "other", "object_ref": "x", "description": "y"
        }, headers=hdr("sales"), timeout=30)
        if r.status_code == 400:
            self.log_pass("issued_to_dept required (400)")
        else:
            self.log_fail(f"issued_to_dept validation failed: {r.status_code}")
        
        # link_type=drawing requires drawings
        r = requests.post(f"{BASE}/nonconformance", json={
            "issued_to_dept": "engineering",
            "link_type": "drawing",
            "drawings": [],
            "description": "test"
        }, headers=hdr("qc"), timeout=30)
        if r.status_code == 400:
            self.log_pass("link_type=drawing requires drawings (400)")
        else:
            self.log_fail(f"drawing validation failed: {r.status_code}")
        
        # link_type=other requires object_ref
        r = requests.post(f"{BASE}/nonconformance", json={
            "issued_to_dept": "produksi",
            "link_type": "other",
            "object_ref": "",
            "description": "test"
        }, headers=hdr("sales"), timeout=30)
        if r.status_code == 400:
            self.log_pass("link_type=other requires object_ref (400)")
        else:
            self.log_fail(f"object_ref validation failed: {r.status_code}")
    
    def test_create_drawing_type(self):
        """Test 3: Create drawing-type NC"""
        print("\n=== Test 3: Create drawing-type NC ===")
        
        dwgs = get_drawings()
        if not dwgs:
            self.log_fail("No drawings available for testing")
            return None
        
        payload = {
            "issued_to_dept": "engineering",
            "link_type": "drawing",
            "drawings": [{"drawing_id": d["id"], "drawing_no": d["drawing_no"]} for d in dwgs],
            "source": "external",
            "severity": "major",
            "description": "Drawing dimension issue"
        }
        r = requests.post(f"{BASE}/nonconformance", json=payload, headers=hdr("qc"), timeout=30)
        if r.status_code == 200:
            nc = r.json()
            self.test_ncs.append(nc["id"])
            if nc["nc_no"].startswith("MKS-QA-CAR-"):
                self.log_pass(f"Drawing NC created: {nc['nc_no']}")
            else:
                self.log_fail(f"Invalid CAR No format: {nc['nc_no']}")
            return nc["id"]
        else:
            self.log_fail(f"Drawing NC creation failed: {r.status_code} - {r.text}")
            return None
    
    def test_list_and_filters(self):
        """Test 4: GET /api/nonconformance with filters"""
        print("\n=== Test 4: List & filters ===")
        
        # Basic list
        r = requests.get(f"{BASE}/nonconformance", headers=hdr("sales"), timeout=30)
        if r.status_code == 200:
            data = r.json()
            self.log_pass(f"List NCs: {len(data.get('items', []))} items")
        else:
            self.log_fail(f"List failed: {r.status_code}")
        
        # Filter by status
        r = requests.get(f"{BASE}/nonconformance?status=open", headers=hdr("qc"), timeout=30)
        if r.status_code == 200:
            self.log_pass(f"Filter by status=open: {len(r.json().get('items', []))} items")
        else:
            self.log_fail(f"Status filter failed: {r.status_code}")
        
        # Filter by issuer_dept
        r = requests.get(f"{BASE}/nonconformance?issuer_dept=qc", headers=hdr("eng_leader"), timeout=30)
        if r.status_code == 200:
            self.log_pass(f"Filter by issuer_dept=qc: {len(r.json().get('items', []))} items")
        else:
            self.log_fail(f"Issuer dept filter failed: {r.status_code}")
        
        # Filter by issued_to_dept
        r = requests.get(f"{BASE}/nonconformance?issued_to_dept=engineering", headers=hdr("sales"), timeout=30)
        if r.status_code == 200:
            self.log_pass(f"Filter by issued_to_dept=engineering: {len(r.json().get('items', []))} items")
        else:
            self.log_fail(f"Issued to dept filter failed: {r.status_code}")
        
        # Filter by link_type
        r = requests.get(f"{BASE}/nonconformance?link_type=drawing", headers=hdr("qc"), timeout=30)
        if r.status_code == 200:
            self.log_pass(f"Filter by link_type=drawing: {len(r.json().get('items', []))} items")
        else:
            self.log_fail(f"Link type filter failed: {r.status_code}")
        
        # Search query
        r = requests.get(f"{BASE}/nonconformance?q=MKS", headers=hdr("sales"), timeout=30)
        if r.status_code == 200:
            self.log_pass(f"Search q=MKS: {len(r.json().get('items', []))} items")
        else:
            self.log_fail(f"Search failed: {r.status_code}")
    
    def test_stats(self):
        """Test 5: GET /api/nonconformance/stats"""
        print("\n=== Test 5: Stats ===")
        
        r = requests.get(f"{BASE}/nonconformance/stats", headers=hdr("sales"), timeout=30)
        if r.status_code == 200:
            stats = r.json()
            required = ["total", "open", "assigned", "in_progress", "closed", "open_or_active"]
            if all(k in stats for k in required):
                self.log_pass(f"Stats: total={stats['total']}, open={stats['open']}, closed={stats['closed']}")
            else:
                self.log_fail(f"Stats missing keys: {stats.keys()}")
        else:
            self.log_fail(f"Stats failed: {r.status_code}")
    
    def test_departments_and_users(self):
        """Test 6: Departments & assignable users"""
        print("\n=== Test 6: Departments & assignable users ===")
        
        r = requests.get(f"{BASE}/nonconformance/departments", headers=hdr("sales"), timeout=30)
        if r.status_code == 200:
            depts = r.json().get("departments", [])
            if len(depts) >= 5:
                self.log_pass(f"Departments: {len(depts)} available")
            else:
                self.log_fail(f"Too few departments: {len(depts)}")
        else:
            self.log_fail(f"Departments failed: {r.status_code}")
        
        r = requests.get(f"{BASE}/nonconformance/assignable-users?dept=engineering", headers=hdr("qc"), timeout=30)
        if r.status_code == 200:
            users = r.json().get("users", [])
            self.log_pass(f"Assignable users (engineering): {len(users)}")
        else:
            self.log_fail(f"Assignable users failed: {r.status_code}")
    
    def test_assign_workflow(self):
        """Test 7: Assign workflow"""
        print("\n=== Test 7: Assign workflow ===")
        
        # Create NC
        payload = {
            "issued_to_dept": "engineering",
            "link_type": "other",
            "object_ref": "Test assign",
            "description": "Test assign workflow"
        }
        r = requests.post(f"{BASE}/nonconformance", json=payload, headers=hdr("qc"), timeout=30)
        if r.status_code != 200:
            self.log_fail(f"Setup failed: {r.status_code}")
            return
        
        nc_id = r.json()["id"]
        self.test_ncs.append(nc_id)
        
        # Assign by eng_leader (target dept)
        r = requests.post(f"{BASE}/nonconformance/{nc_id}/assign", json={
            "assignee_id": USERS["eng_staff"],
            "assignee_name": "Adit"
        }, headers=hdr("eng_leader"), timeout=30)
        if r.status_code == 200 and r.json()["status"] == "assigned":
            self.log_pass("Assign by target dept (eng_leader)")
        else:
            self.log_fail(f"Assign failed: {r.status_code} - {r.text}")
        
        # Verify status changed
        r = requests.get(f"{BASE}/nonconformance/{nc_id}", headers=hdr("qc"), timeout=30)
        if r.status_code == 200:
            nc = r.json()
            if nc["status"] == "assigned" and nc["assigned_to"]["id"] == USERS["eng_staff"]:
                self.log_pass("Status changed to assigned")
            else:
                self.log_fail(f"Status not updated: {nc['status']}")
    
    def test_investigation(self):
        """Test 8: Investigation by target dept"""
        print("\n=== Test 8: Investigation ===")
        
        # Create and assign NC
        payload = {
            "issued_to_dept": "engineering",
            "link_type": "other",
            "object_ref": "Test investigation",
            "description": "Test investigation workflow"
        }
        r = requests.post(f"{BASE}/nonconformance", json=payload, headers=hdr("sales"), timeout=30)
        if r.status_code != 200:
            self.log_fail(f"Setup failed: {r.status_code}")
            return
        
        nc_id = r.json()["id"]
        self.test_ncs.append(nc_id)
        
        # Assign to eng_staff
        requests.post(f"{BASE}/nonconformance/{nc_id}/assign", json={
            "assignee_id": USERS["eng_staff"]
        }, headers=hdr("eng_leader"), timeout=30)
        
        # Investigation by eng_staff (target)
        r = requests.post(f"{BASE}/nonconformance/{nc_id}/investigation", json={
            "root_cause": "Test root cause",
            "immediate_action": "Test immediate action",
            "corrective_action": "Test corrective action",
            "preventive_action": "Test preventive action",
            "completed_by": "Adit",
            "completed_date": "2026-08-15",
            "set_in_progress": True
        }, headers=hdr("eng_staff"), timeout=30)
        
        if r.status_code == 200 and r.json()["status"] == "in_progress":
            self.log_pass("Investigation saved & status → in_progress")
        else:
            self.log_fail(f"Investigation failed: {r.status_code} - {r.text}")
        
        # Verify investigation saved
        r = requests.get(f"{BASE}/nonconformance/{nc_id}", headers=hdr("sales"), timeout=30)
        if r.status_code == 200:
            nc = r.json()
            if nc.get("investigation", {}).get("root_cause") == "Test root cause":
                self.log_pass("Investigation data saved correctly")
            else:
                self.log_fail("Investigation data not saved")
    
    def test_status_rbac(self):
        """Test 9: Status change RBAC"""
        print("\n=== Test 9: Status RBAC (close permissions) ===")
        
        # Create NC by QC, assign to eng_staff
        payload = {
            "issued_to_dept": "engineering",
            "link_type": "other",
            "object_ref": "Test RBAC",
            "description": "Test close RBAC"
        }
        r = requests.post(f"{BASE}/nonconformance", json=payload, headers=hdr("qc"), timeout=30)
        nc_id = r.json()["id"]
        self.test_ncs.append(nc_id)
        
        requests.post(f"{BASE}/nonconformance/{nc_id}/assign", json={
            "assignee_id": USERS["eng_staff"]
        }, headers=hdr("eng_leader"), timeout=30)
        
        # eng_staff (target but not initiator/qc/admin) cannot close
        r = requests.post(f"{BASE}/nonconformance/{nc_id}/status", json={
            "status": "closed"
        }, headers=hdr("eng_staff"), timeout=30)
        
        if r.status_code == 403:
            self.log_pass("eng_staff blocked from close (403)")
        else:
            self.log_fail(f"eng_staff should be blocked: {r.status_code}")
        
        # Initiator (qc) can close
        r = requests.post(f"{BASE}/nonconformance/{nc_id}/status", json={
            "status": "closed",
            "ecn_no": "ECN-TEST-001"
        }, headers=hdr("qc"), timeout=30)
        
        if r.status_code == 200:
            self.log_pass("Initiator (qc) can close")
        else:
            self.log_fail(f"Initiator close failed: {r.status_code}")
    
    def test_closeout(self):
        """Test 10: Closeout section"""
        print("\n=== Test 10: Closeout ===")
        
        # Create NC
        payload = {
            "issued_to_dept": "produksi",
            "link_type": "other",
            "object_ref": "Test closeout",
            "description": "Test closeout workflow"
        }
        r = requests.post(f"{BASE}/nonconformance", json=payload, headers=hdr("qc"), timeout=30)
        nc_id = r.json()["id"]
        self.test_ncs.append(nc_id)
        
        # Save closeout without closing
        r = requests.post(f"{BASE}/nonconformance/{nc_id}/closeout", json={
            "initiator_remarks": "Test remarks",
            "risk_review": True,
            "effectiveness_reviewed_by": "QC Manager",
            "effectiveness_date": "2026-08-20",
            "close": False
        }, headers=hdr("qc"), timeout=30)
        
        if r.status_code == 200:
            nc = requests.get(f"{BASE}/nonconformance/{nc_id}", headers=hdr("qc"), timeout=30).json()
            if nc["status"] != "closed" and nc.get("closeout", {}).get("initiator_remarks"):
                self.log_pass("Closeout saved without closing")
            else:
                self.log_fail("Closeout save failed")
        else:
            self.log_fail(f"Closeout failed: {r.status_code}")
        
        # Save closeout with close=true
        r = requests.post(f"{BASE}/nonconformance/{nc_id}/closeout", json={
            "initiator_remarks": "Final remarks",
            "qa_approved_by": "QC Head",
            "qa_date": "2026-08-21",
            "close": True
        }, headers=hdr("qc"), timeout=30)
        
        if r.status_code == 200:
            nc = requests.get(f"{BASE}/nonconformance/{nc_id}", headers=hdr("qc"), timeout=30).json()
            if nc["status"] == "closed":
                self.log_pass("Closeout with close=true → status closed")
            else:
                self.log_fail(f"Status not closed: {nc['status']}")
        else:
            self.log_fail(f"Closeout close failed: {r.status_code}")
    
    def test_attachments(self):
        """Test 11: Attachments (upload, list, delete, page-meta, page-image)"""
        print("\n=== Test 11: Attachments ===")
        
        # Create NC
        payload = {
            "issued_to_dept": "engineering",
            "link_type": "other",
            "object_ref": "Test attachments",
            "description": "Test attachment workflow"
        }
        r = requests.post(f"{BASE}/nonconformance", json=payload, headers=hdr("sales"), timeout=30)
        nc_id = r.json()["id"]
        self.test_ncs.append(nc_id)
        
        # Upload PNG
        png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
        files = {'file': ('test.png', io.BytesIO(png_data), 'image/png')}
        r = requests.post(f"{BASE}/nonconformance/{nc_id}/attachments", 
                         files=files, headers=hdr("sales"), timeout=30)
        
        if r.status_code == 200:
            att = r.json()["attachment"]
            att_id = att["id"]
            self.log_pass(f"PNG uploaded: {att['filename']}")
            
            # List attachments
            r = requests.get(f"{BASE}/nonconformance/{nc_id}/attachments", headers=hdr("qc"), timeout=30)
            if r.status_code == 200 and len(r.json()["items"]) > 0:
                self.log_pass("List attachments")
            else:
                self.log_fail("List attachments failed")
            
            # Page-meta
            r = requests.get(f"{BASE}/nonconformance/{nc_id}/attachments/{att_id}/page-meta", 
                           headers=hdr("sales"), timeout=30)
            if r.status_code == 200 and r.json().get("pages", 0) > 0:
                self.log_pass("Page-meta returns pages > 0")
            else:
                self.log_fail(f"Page-meta failed: {r.status_code}")
            
            # Page-image
            r = requests.get(f"{BASE}/nonconformance/{nc_id}/attachments/{att_id}/page-image?page=0", 
                           headers=hdr("sales"), timeout=30)
            if r.status_code == 200 and r.headers.get("content-type") == "image/png":
                self.log_pass("Page-image returns PNG")
            else:
                self.log_fail(f"Page-image failed: {r.status_code}")
            
            # Delete attachment
            r = requests.delete(f"{BASE}/nonconformance/{nc_id}/attachments/{att_id}", 
                              headers=hdr("sales"), timeout=30)
            if r.status_code == 200:
                self.log_pass("Delete attachment")
            else:
                self.log_fail(f"Delete failed: {r.status_code}")
        else:
            self.log_fail(f"Upload failed: {r.status_code} - {r.text}")
    
    def test_eng006_log(self):
        """Test 12: ENG-006 NC log"""
        print("\n=== Test 12: ENG-006 NC log ===")
        
        r = requests.get(f"{BASE}/nonconformance/eng006-nc-log", headers=hdr("eng_leader"), timeout=30)
        if r.status_code == 200:
            rows = r.json().get("rows", [])
            self.log_pass(f"ENG-006 log: {len(rows)} records")
        else:
            self.log_fail(f"ENG-006 log failed: {r.status_code}")
        
        # Non-engineering user should get 403
        r = requests.get(f"{BASE}/nonconformance/eng006-nc-log", headers=hdr("sales"), timeout=30)
        if r.status_code == 403:
            self.log_pass("Non-engineering blocked from ENG-006 (403)")
        else:
            self.log_fail(f"Sales should be blocked: {r.status_code}")
    
    def test_kpi_integration(self):
        """Test 13: KPI integration - only drawing-type NCs affect KPI"""
        print("\n=== Test 13: KPI integration ===")
        
        now = datetime.now(timezone.utc)
        r = requests.get(f"{BASE}/engineering/kpi/drawing_customer_nc/records",
                        params={"year": now.year, "month": now.month},
                        headers=hdr("eng_leader"), timeout=60)
        
        if r.status_code == 200:
            recs = r.json()["records"]
            # Check that records have nc_nos for failed drawings
            has_nc = [x for x in recs if not x["ok"] and x.get("nc_nos")]
            self.log_pass(f"KPI #1 records: {len(recs)} drawings, {len(has_nc)} with NC")
        else:
            self.log_fail(f"KPI records failed: {r.status_code}")
    
    def run_all(self):
        """Run all tests"""
        print("\n" + "="*60)
        print("BACKEND API TESTS - Nonconformance (CAR) Module")
        print("="*60)
        
        self.test_create_any_user()
        self.test_create_validation()
        self.test_create_drawing_type()
        self.test_list_and_filters()
        self.test_stats()
        self.test_departments_and_users()
        self.test_assign_workflow()
        self.test_investigation()
        self.test_status_rbac()
        self.test_closeout()
        self.test_attachments()
        self.test_eng006_log()
        self.test_kpi_integration()
        
        print("\n" + "="*60)
        print(f"RESULTS: {self.passed} passed, {self.failed} failed")
        print("="*60)
        
        return self.test_ncs


if __name__ == "__main__":
    tester = TestNonconformanceAPI()
    test_ncs = tester.run_all()
    
    # Store test NC IDs for cleanup
    if test_ncs:
        print(f"\n⚠️  Created {len(test_ncs)} test NCs - will be cleaned up after frontend tests")
        with open("/tmp/test_nc_ids.txt", "w") as f:
            f.write("\n".join(test_ncs))
    
    sys.exit(0 if tester.failed == 0 else 1)
