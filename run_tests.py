"""
Standard library test runner for SPECTRE intelligence engine.
Runs all tests without requiring external dependencies like pytest.
"""
import sys
import traceback

def run_suite():
    total_passed = 0
    total_failed = 0

    from tests.test_engine import test_input_classifier_types, test_cache_ttl_and_hashing, test_engine_investigate_structure
    from tests.test_ssrf import test_ssrf_blocked_urls, test_headers_raises_on_ssrf, test_ip_lookup_blocks_private
    from tests.test_risk_engine import test_risk_score_zero_on_clean, test_risk_score_high_on_sensitive_recent_breach
    from tests.test_auth import (
        test_user_registration_and_hashing, test_tier_upgrade_and_persistence,
        test_admin_upgrade_api_routes, test_payment_checkout_flow,
        test_payment_config_endpoint, test_strict_paywall_blocks_free_users,
        test_landing_page_routes, test_logout_route_and_session_clearing,
        test_admin_settings_and_plans_api,
        test_order_rejection_flow
    )

    test_functions = [
        test_input_classifier_types,
        test_cache_ttl_and_hashing,
        test_engine_investigate_structure,
        test_ssrf_blocked_urls,
        test_headers_raises_on_ssrf,
        test_ip_lookup_blocks_private,
        test_risk_score_zero_on_clean,
        test_risk_score_high_on_sensitive_recent_breach,
        test_user_registration_and_hashing,
        test_tier_upgrade_and_persistence,
        test_admin_upgrade_api_routes,
        test_payment_checkout_flow,
        test_order_rejection_flow,
        test_payment_config_endpoint,
        test_strict_paywall_blocks_free_users,
        test_landing_page_routes,
        test_logout_route_and_session_clearing,
        test_admin_settings_and_plans_api
    ]

    print("=" * 60)
    print("SPECTRE AUTOMATED VERIFICATION SUITE")
    print("=" * 60)

    for test_fn in test_functions:
        test_name = test_fn.__name__
        try:
            test_fn()
            print(f"  [PASS] {test_name}")
            total_passed += 1
        except Exception as e:
            print(f"  [FAIL] {test_name}: {e}")
            traceback.print_exc()
            total_failed += 1

    print("=" * 60)
    print(f"RESULTS: {total_passed} Passed | {total_failed} Failed")
    print("=" * 60)

    return 0 if total_failed == 0 else 1

if __name__ == '__main__':
    sys.exit(run_suite())
