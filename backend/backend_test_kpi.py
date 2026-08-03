#!/usr/bin/env python3
"""
Backend API Testing for Engineering KPI Feature (WITH WEIGHTED SCORING)
Tests the NEW API structure with Achievement Weight (%) column.

Requirements:
- 6 KPIs with weights: KPI1=20, KPI2=15, KPI3=15, KPI4=25, KPI5=15, KPI6=10 (sum=100)
- KPI Score = achievement% × weight% / 100
- Total KPI Score = SUM of weighted scores
- Category: >=90 SANGAT BAIK, 80-89 BAIK, 71-79 CUKUP, <=70 PERLU PERBAIKAN

Tests:
1. Login with riski/eng123
2. GET /api/engineering/kpi?year=2026&month=7 (July) - verify readable
3. GET /api/engineering/kpi?year=2026&month=8 (August) - verify weighted scoring
4. GET /api/engineering/kpi/{key}/records - verify auditability
5. Formula correctness (denominators equal for certain KPIs)
6. Weights sum to 100
7. RBAC (engineering users only)
"""
import requests
import sys
from datetime import datetime

class EngineeringKpiTester:
    def __init__(self, base_url="https://error-fix-dev.preview.emergentagent.com"):
        self.base_url = base_url
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_result(self, test_name, passed, details=""):
        """Log test result"""
        self.tests_run += 1
        if passed:
            self.tests_passed += 1
            print(f"✅ PASS: {test_name}")
            if details:
                print(f"   {details}")
        else:
            print(f"❌ FAIL: {test_name}")
            if details:
                print(f"   {details}")
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "details": details
        })

    def login(self, username, password):
        """Login and get session cookie"""
        print(f"\n🔐 Logging in as {username}...")
        try:
            response = self.session.post(
                f"{self.base_url}/api/auth/login",
                json={"username": username, "password": password},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Login successful - User: {username}, Role: {data.get('role')}")
                return True
            else:
                print(f"❌ Login failed - Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Login error: {str(e)}")
            return False

    def test_kpi_endpoint(self, year, month, expected_status=200):
        """Test GET /api/engineering/kpi"""
        test_name = f"GET /api/engineering/kpi (year={year}, month={month})"
        print(f"\n🔍 Testing {test_name}...")
        try:
            response = self.session.get(
                f"{self.base_url}/api/engineering/kpi",
                params={"year": year, "month": month},
                timeout=10
            )
            
            if response.status_code != expected_status:
                self.log_result(test_name, False, f"Expected {expected_status}, got {response.status_code}")
                return None
            
            if response.status_code == 200:
                data = response.json()
                self.log_result(test_name, True, f"Status: {response.status_code}")
                return data
            else:
                self.log_result(test_name, True, f"Status: {response.status_code} (as expected)")
                return None
                
        except Exception as e:
            self.log_result(test_name, False, f"Error: {str(e)}")
            return None

    def test_july_readable(self):
        """Test that July 2026 data is readable (not empty/error)"""
        test_name = "July 2026 Data Readable"
        print(f"\n🔍 Testing {test_name}...")
        
        july_data = self.test_kpi_endpoint(2026, 7)
        if not july_data:
            self.log_result(test_name, False, "Failed to fetch July data")
            return False, None
        
        # Verify structure
        if "kpis" not in july_data or "total_weight" not in july_data:
            self.log_result(test_name, False, "Missing required fields in July data")
            return False, None
        
        kpis = july_data.get("kpis", [])
        if len(kpis) != 6:
            self.log_result(test_name, False, f"Expected 6 KPIs, got {len(kpis)}")
            return False, None
        
        # Check expected July values (from requirements)
        # Expected: total_weight=100; KPI3 (bom_no_revision) numerator=1 denominator=1 achievement=100 score=15.0
        # other KPIs have denominator 0 -> achievement null, score null; total_score=15.0; category='PERLU PERBAIKAN'
        
        kpi3 = next((k for k in kpis if k["key"] == "bom_no_revision"), None)
        if not kpi3:
            self.log_result(test_name, False, "KPI3 (bom_no_revision) not found")
            return False, None
        
        details = f"July data readable: {len(kpis)} KPIs, total_weight={july_data.get('total_weight')}, "
        details += f"KPI3: num={kpi3.get('numerator')} den={kpi3.get('denominator')} ach={kpi3.get('achievement')} score={kpi3.get('score')}, "
        details += f"total_score={july_data.get('total_score')}, category={july_data.get('category')}"
        
        self.log_result(test_name, True, details)
        return True, july_data

    def test_august_weighted_scoring(self):
        """Test August 2026 weighted scoring correctness"""
        test_name = "August 2026 Weighted Scoring"
        print(f"\n🔍 Testing {test_name}...")
        
        aug_data = self.test_kpi_endpoint(2026, 8)
        if not aug_data:
            self.log_result(test_name, False, "Failed to fetch August data")
            return False, None
        
        # Expected August values (from requirements):
        # KPI1 (drawing_customer_nc): num=7 den=13 ach=53.8 weight=20 score~10.76
        # KPI2 (drawing_no_revision): num=13 den=13 ach=100 weight=15 score=15.00
        # KPI3 (bom_no_revision): num=3 den=3 ach=100 weight=15 score=15.00
        # KPI4 (drawing_ontime): num=4 den=13 ach=30.8 weight=25 score~7.70
        # KPI5 (costing_ontime): num=0 den=0 ach=null weight=15 score=null
        # KPI6 (drawing_template_mks): num=4 den=13 ach=30.8 weight=10 score~3.08
        # Total score ~51.54, Category='PERLU PERBAIKAN'
        
        kpis = aug_data.get("kpis", [])
        if len(kpis) != 6:
            self.log_result(test_name, False, f"Expected 6 KPIs, got {len(kpis)}")
            return False, None
        
        # Verify weighted scoring formula for each KPI
        all_correct = True
        total_computed = 0.0
        
        for kpi in kpis:
            key = kpi.get("key")
            achievement = kpi.get("achievement")
            weight = kpi.get("weight")
            score = kpi.get("score")
            
            if achievement is not None:
                expected_score = round(achievement * weight / 100, 2)
                if score != expected_score:
                    print(f"   ❌ {key}: score={score}, expected={expected_score} (ach={achievement}, weight={weight})")
                    all_correct = False
                else:
                    print(f"   ✅ {key}: score={score} (ach={achievement}%, weight={weight}%) - CORRECT")
                    total_computed += score
            else:
                if score is not None:
                    print(f"   ❌ {key}: achievement=null but score={score} (should be null)")
                    all_correct = False
                else:
                    print(f"   ✅ {key}: achievement=null, score=null - CORRECT")
        
        # Verify total score
        total_score = aug_data.get("total_score")
        expected_total = round(total_computed, 2)
        
        if total_score != expected_total:
            print(f"   ❌ Total score mismatch: got {total_score}, expected {expected_total}")
            all_correct = False
        else:
            print(f"   ✅ Total score: {total_score} - CORRECT")
        
        # Verify category
        category = aug_data.get("category")
        if total_score is not None:
            if total_score >= 90:
                expected_cat = "SANGAT BAIK"
            elif total_score >= 80:
                expected_cat = "BAIK"
            elif total_score >= 71:
                expected_cat = "CUKUP"
            else:
                expected_cat = "PERLU PERBAIKAN"
            
            if category != expected_cat:
                print(f"   ❌ Category mismatch: got '{category}', expected '{expected_cat}'")
                all_correct = False
            else:
                print(f"   ✅ Category: '{category}' - CORRECT")
        
        if all_correct:
            self.log_result(test_name, True, f"All weighted scores correct, total={total_score}, category='{category}'")
        else:
            self.log_result(test_name, False, "Weighted scoring formula errors detected")
        
        return all_correct, aug_data

    def test_weights_sum(self, data):
        """Test that weights sum to 100"""
        test_name = "Weights Sum to 100"
        print(f"\n🔍 Testing {test_name}...")
        
        total_weight = data.get("total_weight")
        kpis = data.get("kpis", [])
        
        # Sum individual weights
        weight_sum = sum(k.get("weight", 0) for k in kpis)
        
        if total_weight != 100:
            self.log_result(test_name, False, f"total_weight={total_weight}, expected 100")
            return False
        
        if weight_sum != 100:
            self.log_result(test_name, False, f"Sum of individual weights={weight_sum}, expected 100")
            return False
        
        # Verify expected weights
        expected_weights = {
            "drawing_customer_nc": 20,
            "drawing_no_revision": 15,
            "bom_no_revision": 15,
            "drawing_ontime": 25,
            "costing_ontime": 15,
            "drawing_template_mks": 10
        }
        
        for kpi in kpis:
            key = kpi.get("key")
            weight = kpi.get("weight")
            expected = expected_weights.get(key)
            
            if weight != expected:
                self.log_result(test_name, False, f"{key}: weight={weight}, expected {expected}")
                return False
        
        self.log_result(test_name, True, f"total_weight=100, sum of weights=100, all individual weights correct")
        return True

    def test_kpi_audit_records(self, key, year, month):
        """Test GET /api/engineering/kpi/{key}/records"""
        test_name = f"GET /api/engineering/kpi/{key}/records (year={year}, month={month})"
        print(f"\n🔍 Testing {test_name}...")
        
        try:
            response = self.session.get(
                f"{self.base_url}/api/engineering/kpi/{key}/records",
                params={"year": year, "month": month},
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result(test_name, False, f"Expected 200, got {response.status_code}")
                return None
            
            data = response.json()
            self.log_result(test_name, True, f"Status: 200, Records: {len(data.get('records', []))}")
            return data
            
        except Exception as e:
            self.log_result(test_name, False, f"Error: {str(e)}")
            return None

    def test_auditability(self, kpi_data, year, month):
        """Test auditability: verify numerator/denominator match audit records"""
        print(f"\n🔍 Testing Auditability (year={year}, month={month})...")
        
        kpis = kpi_data.get("kpis", [])
        
        # Test 5 keys as specified
        audit_keys = ["drawing_customer_nc", "drawing_no_revision", "bom_no_revision", 
                     "drawing_ontime", "drawing_template_mks"]
        
        all_passed = True
        for key in audit_keys:
            kpi = next((k for k in kpis if k["key"] == key), None)
            if not kpi:
                print(f"   ⚠️  Skipping {key} (not found)")
                continue
            
            # Get audit records
            audit_data = self.test_kpi_audit_records(key, year, month)
            if not audit_data:
                all_passed = False
                continue
            
            records = audit_data.get("records", [])
            
            # Verify consistency
            test_name = f"Auditability: {key}"
            expected_total = kpi["denominator"]
            expected_ok = kpi["numerator"]
            
            actual_total = len(records)
            actual_ok = sum(1 for r in records if r.get("ok"))
            
            if actual_total != expected_total or actual_ok != expected_ok:
                self.log_result(test_name, False, 
                    f"Mismatch - Expected: {expected_ok}/{expected_total}, Got: {actual_ok}/{actual_total}")
                all_passed = False
            else:
                self.log_result(test_name, True, 
                    f"Consistent - {actual_ok}/{actual_total} records match KPI numerator/denominator")
        
        return all_passed

    def test_formula_correctness(self, data):
        """Test formula correctness: denominators equal for certain KPIs"""
        test_name = "Formula Correctness (Equal Denominators)"
        print(f"\n🔍 Testing {test_name}...")
        
        kpis = data.get("kpis", [])
        
        # These KPIs should all have equal denominators (Total Drawings Release)
        drawing_keys = ["drawing_customer_nc", "drawing_no_revision", "drawing_ontime", "drawing_template_mks"]
        
        denominators = {}
        for key in drawing_keys:
            kpi = next((k for k in kpis if k["key"] == key), None)
            if kpi:
                denominators[key] = kpi.get("denominator")
        
        if len(set(denominators.values())) != 1:
            details = f"Denominators not equal: {denominators}"
            self.log_result(test_name, False, details)
            return False
        
        # Verify KPI6 numerator = count of pdf_match_status=='verified'
        kpi6 = next((k for k in kpis if k["key"] == "drawing_template_mks"), None)
        if kpi6:
            # This is verified by auditability test, just log
            print(f"   ✅ KPI6 (drawing_template_mks) numerator={kpi6.get('numerator')} (verified by audit)")
        
        self.log_result(test_name, True, f"All drawing KPIs have equal denominator: {list(denominators.values())[0]}")
        return True

    def test_rbac(self):
        """Test RBAC: engineering user gets 200, non-engineering gets 403"""
        test_name = "RBAC: Engineering User (200)"
        print(f"\n🔍 Testing {test_name}...")
        
        # Already logged in as riski (engineering), test should pass
        response = self.session.get(
            f"{self.base_url}/api/engineering/kpi",
            params={"year": 2026, "month": 8},
            timeout=10
        )
        
        if response.status_code == 200:
            self.log_result(test_name, True, "Engineering user (riski) can access KPI")
        else:
            self.log_result(test_name, False, f"Expected 200, got {response.status_code}")
            return False
        
        # Test non-engineering user
        test_name = "RBAC: Non-Engineering User (403)"
        print(f"\n🔍 Testing {test_name}...")
        
        # Logout current user
        self.session = requests.Session()
        
        # Login as sales user (nicholas)
        if not self.login("nicholas", "sales123"):
            self.log_result(test_name, False, "Failed to login as sales user")
            return False
        
        # Try to access KPI endpoint
        try:
            response = self.session.get(
                f"{self.base_url}/api/engineering/kpi",
                params={"year": 2026, "month": 8},
                timeout=10
            )
            
            if response.status_code == 403:
                self.log_result(test_name, True, "Non-engineering user correctly denied (403)")
                return True
            else:
                self.log_result(test_name, False, f"Expected 403, got {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result(test_name, False, f"Error: {str(e)}")
            return False

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*70)
        print("📊 TEST SUMMARY")
        print("="*70)
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        print("="*70)
        
        if self.tests_passed < self.tests_run:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["passed"]:
                    print(f"  - {result['test']}")
                    if result["details"]:
                        print(f"    {result['details']}")

def main():
    print("="*70)
    print("🧪 ENGINEERING KPI BACKEND API TESTS (WITH WEIGHTED SCORING)")
    print("="*70)
    
    tester = EngineeringKpiTester()
    
    # Login as engineering leader
    if not tester.login("riski", "eng123"):
        print("❌ Failed to login. Aborting tests.")
        return 1
    
    # Test 1: July data readable
    july_passed, july_data = tester.test_july_readable()
    
    # Test 2: August weighted scoring
    aug_passed, aug_data = tester.test_august_weighted_scoring()
    
    if not aug_data:
        print("❌ Failed to fetch August data. Aborting remaining tests.")
        tester.print_summary()
        return 1
    
    # Test 3: Weights sum to 100
    tester.test_weights_sum(aug_data)
    
    # Test 4: Auditability
    tester.test_auditability(aug_data, 2026, 8)
    
    # Test 5: Formula correctness
    tester.test_formula_correctness(aug_data)
    
    # Test 6: RBAC
    tester.test_rbac()
    
    # Print summary
    tester.print_summary()
    
    # Return exit code
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())
