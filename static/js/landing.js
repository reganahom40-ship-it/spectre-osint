/**
 * SPECTRE — Landing & Checkout Management Controller
 */
(function() {
    'use strict';

    let currentTier = 'lifetime';
    let currentAmount = 99;
    let currentMethod = 'ltc';
    let paymentConfig = null;

    // Load active payment configuration from server
    async function loadPaymentConfig() {
        try {
            const resp = await fetch('/api/payment/config');
            if (resp.ok) {
                paymentConfig = await resp.json();
                applyPaymentConfig(paymentConfig);
            }
        } catch (e) {
            console.warn('Using default payment addresses:', e);
        }
    }

    function applyPaymentConfig(cfg) {
        if (!cfg) return;
        const ltcEl = document.getElementById('cfg-ltc-addr');
        if (ltcEl && cfg.LTC_ADDRESS) ltcEl.textContent = cfg.LTC_ADDRESS;

        const btcEl = document.getElementById('cfg-btc-addr');
        if (btcEl && cfg.BTC_ADDRESS) btcEl.textContent = cfg.BTC_ADDRESS;

        const ethEl = document.getElementById('cfg-eth-addr');
        if (ethEl && cfg.ETH_ADDRESS) ethEl.textContent = cfg.ETH_ADDRESS;

        const ppEmailEl = document.getElementById('cfg-paypal-email');
        if (ppEmailEl && cfg.PAYPAL_EMAIL) ppEmailEl.textContent = cfg.PAYPAL_EMAIL;

        const ppLinkEl = document.getElementById('cfg-paypal-link');
        if (ppLinkEl && cfg.PAYPAL_LINK) {
            ppLinkEl.href = cfg.PAYPAL_LINK;
            ppLinkEl.textContent = cfg.PAYPAL_LINK;
        }

        const cashEl = document.getElementById('cfg-cashapp-tag');
        if (cashEl && cfg.CASHAPP_TAG) cashEl.textContent = cfg.CASHAPP_TAG;
    }

    // Modal Controllers
    window.openCheckoutModal = function(tier = 'lifetime') {
        currentTier = tier;
        currentAmount = (tier === 'lifetime') ? 99 : 19;
        
        const backdrop = document.getElementById('checkout-modal-backdrop');
        const planNameEl = document.getElementById('modal-plan-name');
        const planPriceEl = document.getElementById('modal-plan-price');
        
        if (planNameEl) planNameEl.textContent = tier === 'lifetime' ? 'Lifetime Pass' : 'Pro Monthly';
        if (planPriceEl) planPriceEl.textContent = `$${currentAmount}.00 USD`;
        
        if (backdrop) {
            backdrop.style.display = 'flex';
        }
        selectPaymentMethod(currentMethod);
    };

    window.closeCheckoutModal = function() {
        const backdrop = document.getElementById('checkout-modal-backdrop');
        if (backdrop) backdrop.style.display = 'none';
    };

    window.openAuthModal = function(mode = 'login') {
        const backdrop = document.getElementById('auth-modal-backdrop');
        const tabLogin = document.getElementById('tab-login');
        const tabRegister = document.getElementById('tab-register');
        const submitBtn = document.getElementById('btn-auth-submit');
        const form = document.getElementById('landing-auth-form');

        if (mode === 'register') {
            if (tabRegister) tabRegister.classList.add('active');
            if (tabLogin) tabLogin.classList.remove('active');
            if (submitBtn) submitBtn.textContent = 'Create Account';
            if (form) form.dataset.mode = 'register';
        } else {
            if (tabLogin) tabLogin.classList.add('active');
            if (tabRegister) tabRegister.classList.remove('active');
            if (submitBtn) submitBtn.textContent = 'Authenticate & Sign In';
            if (form) form.dataset.mode = 'login';
        }

        if (backdrop) backdrop.style.display = 'flex';
    };

    window.closeAuthModal = function() {
        const backdrop = document.getElementById('auth-modal-backdrop');
        if (backdrop) backdrop.style.display = 'none';
        const err = document.getElementById('auth-error-msg');
        if (err) err.style.display = 'none';
    };

    window.selectPaymentMethod = function(method) {
        currentMethod = method;
        const tabs = document.querySelectorAll('.pmethod-tab');
        tabs.forEach(t => t.classList.toggle('active', t.dataset.method === method));

        const panels = document.querySelectorAll('.pmethod-content-panel');
        panels.forEach(p => p.style.display = (p.id === `panel-${method}`) ? 'block' : 'none');
    };

    window.copyText = function(elementId, label = 'Address') {
        const el = document.getElementById(elementId);
        if (el) {
            navigator.clipboard.writeText(el.textContent.trim()).then(() => {
                showToast(`${label} copied to clipboard!`, 'check');
            });
        }
    };

    window.executeCheckout = async function() {
        const emailInput = document.getElementById('checkout-email-input');
        const email = emailInput ? emailInput.value.trim() : '';

        if (!email || !email.includes('@')) {
            showToast('Please enter a valid operator email', 'warning');
            if (emailInput) emailInput.focus();
            return;
        }

        const btn = document.getElementById('btn-confirm-checkout');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Processing Payment...';
        }

        try {
            const resp = await fetch('/api/payment/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email,
                    tier: currentTier,
                    amount: currentAmount,
                    method: currentMethod
                })
            });
            const data = await resp.json();

            if (resp.ok && data.success) {
                showToast(`Payment Confirmed! Account upgraded to ${currentTier.toUpperCase()}.`, 'check');
                setTimeout(() => {
                    window.location.href = '/app';
                }, 1000);
            } else {
                showToast(data.error || 'Payment failed to process', 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Confirm & Activate Access';
                }
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Confirm & Activate Access';
            }
        }
    };

    function showToast(message, type = 'info') {
        let toast = document.getElementById('landing-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'landing-toast';
            toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#0f172a;border:1px solid #06b6d4;color:#f8fafc;padding:12px 20px;border-radius:8px;font-size:0.9rem;font-weight:600;box-shadow:0 8px 30px rgba(0,0,0,0.6);z-index:99999;transition:all 0.3s;opacity:0;transform:translateY(10px);';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
        }, 3500);
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadPaymentConfig();

        // Auth Form submit
        const authForm = document.getElementById('landing-auth-form');
        if (authForm) {
            authForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const mode = authForm.dataset.mode || 'login';
                const email = document.getElementById('auth-email').value.trim();
                const password = document.getElementById('auth-password').value;
                const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
                const errBox = document.getElementById('auth-error-msg');

                if (errBox) errBox.style.display = 'none';

                try {
                    const resp = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password })
                    });
                    const data = await resp.json();

                    if (resp.ok && data.success) {
                        const tier = (data.user && data.user.tier) || 'free';
                        if (tier === 'premium' || tier === 'lifetime' || tier === 'admin') {
                            window.location.href = '/app';
                        } else {
                            closeAuthModal();
                            showToast('Please select an access pass to unlock intelligence features.', 'info');
                            openCheckoutModal('lifetime');
                            const chkEmail = document.getElementById('checkout-email-input');
                            if (chkEmail) chkEmail.value = email;
                        }
                    } else {
                        if (errBox) {
                            errBox.textContent = data.error || 'Authentication failed';
                            errBox.style.display = 'block';
                        }
                    }
                } catch (err) {
                    if (errBox) {
                        errBox.textContent = err.message || 'Network error';
                        errBox.style.display = 'block';
                    }
                }
            });
        }
    });
})();
