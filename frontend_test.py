"""
Frontend UI Testing for Edit & Delete Drawing Feature
Tests the Engineering DRF Work Page UI and integration with backend APIs
"""
import asyncio
import sys

async def test_edit_delete_drawing_ui(page):
    """Test Edit & Delete Drawing UI in Engineering DRF Work Page"""
    
    try:
        # Set viewport
        await page.set_viewport_size({"width": 1920, "height": 1080})
        
        print("=" * 80)
        print("🎭 FRONTEND UI TESTING: Edit & Delete Drawing Feature")
        print("=" * 80)
        
        # Step 1: Login as engstaff
        print("\n🔐 Step 1: Logging in as engstaff...")
        await page.goto("https://error-fix-dev.preview.emergentagent.com/login")
        await page.wait_for_timeout(1000)
        
        # Fill login form
        await page.fill('input[name="username"]', "engstaff")
        await page.fill('input[name="password"]', "eng123")
        await page.click('button[type="submit"]')
        await page.wait_for_timeout(2000)
        
        # Check if login successful
        current_url = page.url
        if "/login" in current_url:
            print("❌ Login failed - still on login page")
            return False
        print(f"✅ Login successful - redirected to {current_url}")
        
        # Step 2: Navigate to Engineering portal
        print("\n📋 Step 2: Navigating to Engineering portal...")
        await page.goto("https://error-fix-dev.preview.emergentagent.com/engineering")
        await page.wait_for_timeout(2000)
        
        # Check if we're on the engineering page
        page_content = await page.content()
        if "engineering" not in page_content.lower():
            print("⚠️  May not be on engineering page")
        else:
            print("✅ On Engineering portal")
        
        # Step 3: Find a DRF with draft drawings
        print("\n🔍 Step 3: Looking for a DRF with draft drawings...")
        
        # Try to find any DRF link or card
        drf_links = await page.query_selector_all('a[href*="/engineering/drf/"]')
        if not drf_links:
            print("⚠️  No DRF links found, trying to find any navigation elements...")
            # Take screenshot to see what's on the page
            await page.screenshot(path=".screenshots/engineering_portal.png", quality=40, full_page=False)
            print("📸 Screenshot saved: engineering_portal.png")
            
            # Try to find the first available DRF
            # Look for any clickable elements that might lead to a DRF
            await page.wait_for_timeout(1000)
            
        # If we have DRF links, click the first one
        if drf_links and len(drf_links) > 0:
            print(f"✅ Found {len(drf_links)} DRF links")
            await drf_links[0].click()
            await page.wait_for_timeout(2000)
            print(f"✅ Navigated to DRF page: {page.url}")
        else:
            # Try direct navigation to a known DRF (from our backend test)
            print("⚠️  No DRF links found, will check if we can access DRF page directly")
            # We'll continue and see if we can find drawings
        
        # Step 4: Check for DRAFT drawings with Edit and Delete buttons
        print("\n🎨 Step 4: Checking for DRAFT drawings with Edit/Delete buttons...")
        
        # Wait for drawings to load
        await page.wait_for_timeout(2000)
        
        # Look for drawing elements
        drawings = await page.query_selector_all('[data-testid^="drf-drawing-"]')
        print(f"Found {len(drawings)} drawing elements")
        
        if len(drawings) == 0:
            print("⚠️  No drawings found on current page")
            await page.screenshot(path=".screenshots/no_drawings.png", quality=40, full_page=False)
            print("📸 Screenshot saved: no_drawings.png")
            print("ℹ️  This might be because:")
            print("   - No DRFs assigned to engstaff")
            print("   - Wrong page navigation")
            print("   - Drawings not loaded yet")
            return False
        
        # Find a drawing with Edit button (indicates DRAFT status)
        edit_buttons = await page.query_selector_all('[data-testid^="drf-edit-"]')
        delete_buttons = await page.query_selector_all('[data-testid^="drf-delete-"]')
        
        print(f"✅ Found {len(edit_buttons)} Edit buttons")
        print(f"✅ Found {len(delete_buttons)} Delete buttons")
        
        if len(edit_buttons) == 0:
            print("⚠️  No Edit buttons found - may not have DRAFT drawings")
            await page.screenshot(path=".screenshots/no_edit_buttons.png", quality=40, full_page=False)
            return False
        
        # Step 5: Test Edit functionality
        print("\n✏️  Step 5: Testing Edit functionality...")
        
        # Click the first Edit button
        await edit_buttons[0].click()
        await page.wait_for_timeout(1000)
        
        # Check if Edit modal opened
        edit_modal = await page.query_selector('[data-testid="drf-edit-modal"]')
        if not edit_modal:
            print("❌ Edit modal did not open")
            await page.screenshot(path=".screenshots/edit_modal_not_opened.png", quality=40, full_page=False)
            return False
        
        print("✅ Edit modal opened")
        await page.screenshot(path=".screenshots/edit_modal_opened.png", quality=40, full_page=False)
        
        # Check for input fields
        title_input = await page.query_selector('[data-testid="drf-edit-title-input"]')
        type_select = await page.query_selector('[data-testid="drf-edit-type-select"]')
        custno_input = await page.query_selector('[data-testid="drf-edit-custno-input"]')
        project_input = await page.query_selector('[data-testid="drf-edit-project-input"]')
        save_btn = await page.query_selector('[data-testid="drf-edit-save-btn"]')
        cancel_btn = await page.query_selector('[data-testid="drf-edit-cancel-btn"]')
        
        if not all([title_input, type_select, custno_input, project_input, save_btn, cancel_btn]):
            print("❌ Not all edit modal elements found")
            print(f"   Title input: {'✅' if title_input else '❌'}")
            print(f"   Type select: {'✅' if type_select else '❌'}")
            print(f"   Customer No input: {'✅' if custno_input else '❌'}")
            print(f"   Project input: {'✅' if project_input else '❌'}")
            print(f"   Save button: {'✅' if save_btn else '❌'}")
            print(f"   Cancel button: {'✅' if cancel_btn else '❌'}")
            return False
        
        print("✅ All edit modal elements found")
        
        # Fill in new values
        await title_input.fill("UI Test Updated Title")
        await custno_input.fill("CUST-UI-TEST")
        await project_input.fill("UI Test Project")
        
        print("✅ Filled in new values")
        await page.screenshot(path=".screenshots/edit_modal_filled.png", quality=40, full_page=False)
        
        # Click Save
        await save_btn.click()
        await page.wait_for_timeout(2000)
        
        # Check if modal closed
        edit_modal_after = await page.query_selector('[data-testid="drf-edit-modal"]')
        if edit_modal_after:
            print("⚠️  Edit modal still visible after save")
        else:
            print("✅ Edit modal closed after save")
        
        # Check for success message or updated values
        page_content = await page.content()
        if "UI Test Updated Title" in page_content or "diperbarui" in page_content.lower():
            print("✅ Edit appears successful (found updated title or success message)")
        else:
            print("⚠️  Could not confirm edit success")
        
        await page.screenshot(path=".screenshots/after_edit.png", quality=40, full_page=False)
        
        # Step 6: Test Delete functionality
        print("\n🗑️  Step 6: Testing Delete functionality...")
        
        # Find delete buttons again (in case page refreshed)
        await page.wait_for_timeout(1000)
        delete_buttons = await page.query_selector_all('[data-testid^="drf-delete-"]')
        
        if len(delete_buttons) == 0:
            print("⚠️  No Delete buttons found after edit")
            return True  # Edit test passed, but can't test delete
        
        # Click the first Delete button
        await delete_buttons[0].click()
        await page.wait_for_timeout(1000)
        
        # Check if Delete confirmation dialog opened
        delete_dialog = await page.query_selector('[data-testid="drf-delete-dialog"]')
        if not delete_dialog:
            print("❌ Delete confirmation dialog did not open")
            await page.screenshot(path=".screenshots/delete_dialog_not_opened.png", quality=40, full_page=False)
            return False
        
        print("✅ Delete confirmation dialog opened")
        await page.screenshot(path=".screenshots/delete_dialog_opened.png", quality=40, full_page=False)
        
        # Check for confirm and cancel buttons
        confirm_btn = await page.query_selector('[data-testid="drf-delete-confirm-btn"]')
        cancel_btn_del = await page.query_selector('[data-testid="drf-delete-cancel-btn"]')
        
        if not all([confirm_btn, cancel_btn_del]):
            print("❌ Not all delete dialog elements found")
            print(f"   Confirm button: {'✅' if confirm_btn else '❌'}")
            print(f"   Cancel button: {'✅' if cancel_btn_del else '❌'}")
            return False
        
        print("✅ All delete dialog elements found")
        
        # Test Cancel first
        await cancel_btn_del.click()
        await page.wait_for_timeout(1000)
        
        # Check if dialog closed
        delete_dialog_after_cancel = await page.query_selector('[data-testid="drf-delete-dialog"]')
        if delete_dialog_after_cancel:
            print("⚠️  Delete dialog still visible after cancel")
        else:
            print("✅ Delete dialog closed after cancel")
        
        # Now test actual delete
        delete_buttons = await page.query_selector_all('[data-testid^="drf-delete-"]')
        if len(delete_buttons) > 0:
            await delete_buttons[0].click()
            await page.wait_for_timeout(1000)
            
            confirm_btn = await page.query_selector('[data-testid="drf-delete-confirm-btn"]')
            if confirm_btn:
                await confirm_btn.click()
                await page.wait_for_timeout(2000)
                
                # Check if drawing disappeared or success message shown
                page_content = await page.content()
                if "dihapus" in page_content.lower() or "deleted" in page_content.lower():
                    print("✅ Delete appears successful (found success message)")
                else:
                    print("⚠️  Could not confirm delete success")
                
                await page.screenshot(path=".screenshots/after_delete.png", quality=40, full_page=False)
        
        print("\n" + "=" * 80)
        print("✅ FRONTEND UI TESTING COMPLETED")
        print("=" * 80)
        return True
        
    except Exception as e:
        print(f"\n❌ Error during frontend testing: {str(e)}")
        import traceback
        traceback.print_exc()
        try:
            await page.screenshot(path=".screenshots/error_state.png", quality=40, full_page=False)
            print("📸 Error screenshot saved: error_state.png")
        except:
            pass
        return False

# This script is meant to be run by the browser automation tool
# The page object will be provided by the tool
