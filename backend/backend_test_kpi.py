#!/usr/bin/env python3
"""
Backend API Testing for Engineering KPI Feature
Tests:
- GET /api/engineering/kpi?year=2026&month=8
- GET /api/engineering/kpi/{key}/records?year=2026&month=8
- Auditability (numerator/denominator consistency)
- RBAC (engineering users only)
- Real data computation (compare different months)
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

    def test_kpi_structure(self, data, year, month):
        """Verify KPI response structure"""
        test_name = f"KPI Structure Validation (year={year}, month={month})"
        print(f"\n🔍 Testing {test_name}...")
        
        try:
            # Check top-level fields
            required_fields = ["year", "month", "period", "target", "overall_score", "category", "kpis"]
            missing = [f for f in required_fields if f not in data]
            if missing:
                self.log_result(test_name, False, f"Missing fields: {missing}")
                return False
            
            # Check year/month match
            if data["year"] != year or data["month"] != month:
                self.log_result(test_name, False, f"Year/month mismatch: expected {year}/{month}, got {data['year']}/{data['month']}")
                return False
            
            # Check target
            if data["target"] != 95.0:
                self.log_result(test_name, False, f"Target should be 95.0, got {data['target']}")
                return False
            
            # Check KPIs count
            kpis = data.get("kpis", [])
            if len(kpis) != 7:
                self.log_result(test_name, False, f"Expected 7 KPIs, got {len(kpis)}")
                return False
            
            # Check each KPI structure
            kpi_fields = ["key", "no", "name", "mode", "target", "unit", "numerator", "denominator", "value", "source", "num_label", "den_label"]
            for kpi in kpis:
                missing_kpi = [f for f in kpi_fields if f not in kpi]
                if missing_kpi:
                    self.log_result(test_name, False, f"KPI {kpi.get('key')} missing fields: {missing_kpi}")
                    return False
            
            self.log_result(test_name, True, f"All fields present, 7 KPIs found")
            return True
            
        except Exception as e:
            self.log_result(test_name, False, f"Error: {str(e)}")
            return False

    def test_manual_kpi(self, data):
        """Verify manual KPI (response_time) has mode='manual' and value=null"""
        test_name = "Manual KPI Validation (response_time)"
        print(f"\n🔍 Testing {test_name}...")
        
        try:
            kpis = data.get("kpis", [])
            manual_kpi = next((k for k in kpis if k["key"] == "response_time"), None)
            
            if not manual_kpi:
                self.log_result(test_name, False, "response_time KPI not found")
                return False
            
            if manual_kpi["mode"] != "manual":
                self.log_result(test_name, False, f"Expected mode='manual', got '{manual_kpi['mode']}'")
                return False
            
            if manual_kpi["value"] is not None:
                self.log_result(test_name, False, f"Expected value=null, got {manual_kpi['value']}")
                return False
            
            self.log_result(test_name, True, "Manual KPI has mode='manual' and value=null (no fake data)")
            return True
            
        except Exception as e:
            self.log_result(test_name, False, f"Error: {str(e)}")
            return False

    def test_auto_kpis(self, data):
        """Verify auto KPIs have correct mode"""
        test_name = "Auto KPIs Validation"
        print(f"\n🔍 Testing {test_name}...")
        
        try:
            kpis = data.get("kpis", [])
            auto_keys = ["drawing_customer_nc", "drawing_no_revision", "bom_no_revision", 
                        "drawing_ontime", "costing_ontime", "drawing_template_mks"]
            
            for key in auto_keys:
                kpi = next((k for k in kpis if k["key"] == key), None)
                if not kpi:
                    self.log_result(test_name, False, f"Auto KPI {key} not found")
                    return False
                
                if kpi["mode"] != "auto":
                    self.log_result(test_name, False, f"KPI {key} should have mode='auto', got '{kpi['mode']}'")
                    return False
            
            self.log_result(test_name, True, f"All 6 auto KPIs have mode='auto'")
            return True
            
        except Exception as e:
            self.log_result(test_name, False, f"Error: {str(e)}")
            return False

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
        auto_kpis = [k for k in kpis if k["mode"] == "auto" and k["value"] is not None]
        
        audit_keys = ["drawing_no_revision", "drawing_customer_nc", "bom_no_revision", 
                     "drawing_template_mks", "drawing_ontime"]
        
        all_passed = True
        for key in audit_keys:
            kpi = next((k for k in auto_kpis if k["key"] == key), None)
            if not kpi:
                print(f"   ⚠️  Skipping {key} (no data)")
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

    def test_real_computation(self):
        """Test that KPI numbers are computed from real data (not mocked)"""
        test_name = "Real Data Computation (compare Aug vs July vs March)"
        print(f"\n🔍 Testing {test_name}...")
        
        try:
            # Get data for different months
            aug_data = self.test_kpi_endpoint(2026, 8, expected_status=200)
            july_data = self.test_kpi_endpoint(2026, 7, expected_status=200)
            march_data = self.test_kpi_endpoint(2026, 3, expected_status=200)
            
            if not aug_data or not july_data or not march_data:
                self.log_result(test_name, False, "Failed to fetch data for all months")
                return False
            
            # Check that values differ (indicating real computation)
            aug_score = aug_data.get("overall_score")
            july_score = july_data.get("overall_score")
            march_score = march_data.get("overall_score")
            
            print(f"   Aug 2026 overall_score: {aug_score}")
            print(f"   July 2026 overall_score: {july_score}")
            print(f"   March 2026 overall_score: {march_score}")
            
            # March should likely have null/empty values (no data)
            march_kpis = march_data.get("kpis", [])
            march_auto_values = [k["value"] for k in march_kpis if k["mode"] == "auto"]
            march_nulls = sum(1 for v in march_auto_values if v is None)
            
            if march_nulls > 0:
                self.log_result(test_name, True, 
                    f"March has {march_nulls} null values (no data), Aug/July have computed values - indicates real computation")
                return True
            else:
                # If March has data, check that values differ between months
                if aug_score != july_score or aug_score != march_score:
                    self.log_result(test_name, True, 
                        f"Different scores across months - indicates real computation")
                    return True
                else:
                    self.log_result(test_name, False, 
                        f"All months have same score - may indicate mocked data")
                    return False
            
        except Exception as e:
            self.log_result(test_name, False, f"Error: {str(e)}")
            return False

    def test_rbac(self):
        """Test RBAC: non-engineering user should get 403"""
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
    print("🧪 ENGINEERING KPI BACKEND API TESTS")
    print("="*70)
    
    tester = EngineeringKpiTester()
    
    # Login as engineering leader
    if not tester.login("riski", "eng123"):
        print("❌ Failed to login. Aborting tests.")
        return 1
    
    # Test 1: GET /api/engineering/kpi for August 2026
    aug_data = tester.test_kpi_endpoint(2026, 8)
    if not aug_data:
        print("❌ Failed to fetch KPI data. Aborting remaining tests.")
        tester.print_summary()
        return 1
    
    # Test 2: Verify KPI structure
    tester.test_kpi_structure(aug_data, 2026, 8)
    
    # Test 3: Verify manual KPI
    tester.test_manual_kpi(aug_data)
    
    # Test 4: Verify auto KPIs
    tester.test_auto_kpis(aug_data)
    
    # Test 5: Test auditability
    tester.test_auditability(aug_data, 2026, 8)
    
    # Test 6: Test real computation
    tester.test_real_computation()
    
    # Test 7: Test RBAC
    tester.test_rbac()
    
    # Print summary
    tester.print_summary()
    
    # Return exit code
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())
