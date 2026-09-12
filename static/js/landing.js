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

    // Dynamic Plans Rendering
    async function loadDynamicPlans() {
        try {
            const resp = await fetch('/api/public/plans');
            if (resp.ok) {
                const data = await resp.json();
                if (data.plans && data.plans.length > 0) {
                    renderLandingPlans(data.plans);
                }
            }
        } catch (e) {
            console.warn('Using default pricing cards:', e);
        }
    }

    function renderLandingPlans(plans) {
        const container = document.getElementById('pricing-cards-container');
        if (!container) return;

        container.innerHTML = plans.map(p => {
            const isFeatured = p.id === 'lifetime' || p.badge === 'BEST VALUE' || p.badge === 'POPULAR';
            const priceFormatted = `$${Number(p.price).toFixed(0)}`;
            const featuresList = (p.features || []).map(f => `<li><i class="fas fa-check"></i> ${escapeHtml(f)}</li>`).join('');
            const ribbon = p.badge ? `<div class="pricing-ribbon">${escapeHtml(p.badge)}</div>` : '';

            return `
                <div class="pricing-card ${isFeatured ? 'featured' : ''}" data-plan="${escapeHtml(p.id)}">
                    ${ribbon}
                    <div class="pcard-header">
                        <div class="pcard-tier" ${isFeatured ? 'style="color:var(--accent-amber);"' : ''}>${escapeHtml(p.name)}</div>
                        <div class="pcard-price" ${isFeatured ? 'style="color:var(--accent-amber);"' : ''}>${priceFormatted} <span class="pcard-period">${escapeHtml(p.billing_period)}</span></div>
                        <div class="pcard-sub">${escapeHtml(p.description || '')}</div>
                    </div>

                    <ul class="pcard-features">
                        ${featuresList}
                    </ul>

                    <button class="btn-select-plan ${isFeatured ? 'btn-plan-lifetime' : 'btn-plan-pro'}" onclick="openCheckoutModal('${escapeHtml(p.id)}', ${p.price}, '${escapeHtml(p.name)}')">
                        <i class="fas ${isFeatured ? 'fa-bolt' : 'fa-arrow-right'}"></i>
                        <span>Get ${escapeHtml(p.name)} (${priceFormatted})</span>
                    </button>
                </div>
            `;
        }).join('');
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Modal Controllers
    window.openCheckoutModal = function(tier = 'lifetime', amount = null, planName = null) {
        currentTier = tier;
        if (amount !== null && !isNaN(amount)) {
            currentAmount = amount;
        } else {
            currentAmount = (tier === 'lifetime') ? 99 : 19;
        }
        
        const backdrop = document.getElementById('checkout-modal-backdrop');
        const planNameEl = document.getElementById('modal-plan-name');
        const planPriceEl = document.getElementById('modal-plan-price');
        
        if (planNameEl) planNameEl.textContent = planName || (tier === 'lifetime' ? 'Lifetime Pass' : 'Pro Monthly');
        if (planPriceEl) planPriceEl.textContent = `$${Number(currentAmount).toFixed(2)} USD`;
        
        if (backdrop) {
            backdrop.style.display = 'flex';
        }
        selectPaymentMethod(currentMethod);
    };

    window.closeCheckoutModal = function() {
        const backdrop = document.getElementById('checkout-modal-backdrop');
        if (backdrop) backdrop.style.display = 'none';
    };

    // Admin Console Modal Controllers
    window.openAdminModal = function() {
        const backdrop = document.getElementById('admin-modal-backdrop');
        if (!backdrop) return;
        backdrop.style.display = 'flex';
        window.switchAdminTab('pay');
    };

    window.closeAdminModal = function() {
        const backdrop = document.getElementById('admin-modal-backdrop');
        if (backdrop) backdrop.style.display = 'none';
    };

    window.switchAdminTab = function(tab) {
        const tabs = ['pay', 'plans', 'users'];
        tabs.forEach(t => {
            const btn = document.getElementById(`tab-btn-admin-${t}`);
            const pane = document.getElementById(`tab-pane-admin-${t}`);
            if (btn) btn.classList.toggle('active', t === tab);
            if (pane) pane.style.display = (t === tab) ? 'block' : 'none';
        });
        if (tab === 'pay') loadAdminSettings();
        if (tab === 'plans') loadAdminPlans();
        if (tab === 'users') loadAdminUsers();
    };

    window.loadAdminSettings = async function() {
        try {
            const resp = await fetch('/api/admin/settings');
            const data = await resp.json();
            if (resp.ok && data.settings) {
                const s = data.settings;
                const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
                setVal('adm-ltc', s.LTC_ADDRESS);
                setVal('adm-btc', s.BTC_ADDRESS);
                setVal('adm-eth', s.ETH_ADDRESS);
                setVal('adm-paypal-email', s.PAYPAL_EMAIL);
                setVal('adm-paypal-link', s.PAYPAL_LINK);
                setVal('adm-cashapp', s.CASHAPP_TAG);
            }
        } catch (e) {
            showToast(`Failed loading settings: ${e.message}`, 'error');
        }
    };

    window.saveAdminSettings = async function() {
        const getVal = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
        const payload = {
            LTC_ADDRESS: getVal('adm-ltc'),
            BTC_ADDRESS: getVal('adm-btc'),
            ETH_ADDRESS: getVal('adm-eth'),
            PAYPAL_EMAIL: getVal('adm-paypal-email'),
            PAYPAL_LINK: getVal('adm-paypal-link'),
            CASHAPP_TAG: getVal('adm-cashapp')
        };

        try {
            const resp = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await resp.json();
            if (resp.ok && data.success) {
                showToast('Payment Wallets & Routing Saved Live!', 'check');
                loadPaymentConfig();
            } else {
                showToast(data.error || 'Failed saving payment info', 'error');
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }
    };

    window.loadAdminPlans = async function() {
        const tbody = document.getElementById('admin-plans-tbody');
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="6" style="padding:12px;text-align:center;color:var(--text-muted);">Loading plans...</td></tr>`;

        try {
            const resp = await fetch('/api/admin/plans');
            const data = await resp.json();
            if (resp.ok && data.plans) {
                if (data.plans.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="6" style="padding:12px;text-align:center;color:var(--text-muted);">No plans found.</td></tr>`;
                    return;
                }
                tbody.innerHTML = data.plans.map(p => `
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
                        <td style="padding:8px 10px;"><code>${escapeHtml(p.id)}</code></td>
                        <td style="padding:8px 10px;font-weight:700;color:var(--text-primary);">${escapeHtml(p.name)}</td>
                        <td style="padding:8px 10px;color:#10b981;font-weight:700;">$${Number(p.price).toFixed(2)}</td>
                        <td style="padding:8px 10px;color:var(--text-muted);font-size:0.75rem;">${escapeHtml(p.billing_period)}</td>
                        <td style="padding:8px 10px;"><span style="color:${p.is_active ? '#34d399' : '#f43f5e'};font-size:0.7rem;font-weight:700;">${p.is_active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                        <td style="padding:8px 10px;">
                            <button onclick="deleteAdminPlan('${escapeHtml(p.id)}')" style="background:rgba(244,63,94,0.15);border:1px solid rgba(244,63,94,0.4);color:#f43f5e;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:0.7rem;">Remove</button>
                        </td>
                    </tr>
                `).join('');
            }
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" style="padding:12px;text-align:center;color:var(--accent-rose);">Error: ${escapeHtml(err.message)}</td></tr>`;
        }
    };

    window.saveAdminPlan = async function() {
        const planId = document.getElementById('adm-plan-id')?.value.trim();
        const name = document.getElementById('adm-plan-name')?.value.trim();
        const price = parseFloat(document.getElementById('adm-plan-price')?.value || 0);
        const billingPeriod = document.getElementById('adm-plan-period')?.value.trim() || 'one-time';
        const badge = document.getElementById('adm-plan-badge')?.value.trim() || '';
        const desc = document.getElementById('adm-plan-desc')?.value.trim() || '';
        const features = document.getElementById('adm-plan-features')?.value.trim() || '';

        if (!planId || !name) {
            showToast('Plan ID and Name are required', 'warning');
            return;
        }

        try {
            const resp = await fetch('/api/admin/plans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: planId,
                    name: name,
                    price: price,
                    billing_period: billingPeriod,
                    badge: badge,
                    description: desc,
                    features: features
                })
            });
            const data = await resp.json();
            if (resp.ok && data.success) {
                showToast(`Plan ${name} saved live!`, 'check');
                loadAdminPlans();
                loadDynamicPlans();
                document.getElementById('admin-new-plan-form')?.reset();
            } else {
                showToast(data.error || 'Failed saving plan', 'error');
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }
    };

    window.deleteAdminPlan = async function(planId) {
        if (!confirm(`Remove or deactivate plan '${planId}'?`)) return;
        try {
            const resp = await fetch(`/api/admin/plans/${encodeURIComponent(planId)}`, { method: 'DELETE' });
            const data = await resp.json();
            if (resp.ok && data.success) {
                showToast(`Plan ${planId} updated`, 'check');
                loadAdminPlans();
                loadDynamicPlans();
            } else {
                showToast(data.error || 'Failed deleting plan', 'error');
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }
    };

    window.loadAdminUsers = async function() {
        const tbody = document.getElementById('admin-users-tbody');
        const datalist = document.getElementById('registered-emails-list');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="4" style="padding:12px;text-align:center;color:var(--text-muted);">Loading user records...</td></tr>`;

        try {
            const resp = await fetch('/api/admin/users');
            const data = await resp.json();
            if (resp.ok && data.users) {
                if (datalist) {
                    datalist.innerHTML = data.users.map(u => `<option value="${escapeHtml(u.email)}"></option>`).join('');
                }
                tbody.innerHTML = data.users.map(u => {
                    const tierColor = u.tier === 'lifetime' ? '#fbbf24' : (u.tier === 'premium' ? '#06b6d4' : (u.tier === 'admin' ? '#f43f5e' : '#94a3b8'));
                    return `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
                            <td style="padding:8px 10px;font-weight:700;color:var(--text-primary);">${escapeHtml(u.email)}</td>
                            <td style="padding:8px 10px;"><span style="color:${tierColor};font-weight:700;font-size:0.75rem;">${escapeHtml(u.tier.toUpperCase())}</span></td>
                            <td style="padding:8px 10px;font-size:0.75rem;color:var(--text-muted);">${(u.created_at || '').substring(0, 10)}</td>
                            <td style="padding:8px 10px;">
                                <div style="display:flex; gap:4px;">
                                    <button onclick="upgradeAdminUserDirect('${escapeHtml(u.email)}', 'lifetime')" style="color:#fbbf24;border:1px solid rgba(251,191,36,0.3);background:rgba(251,191,36,0.08);padding:2px 6px;border-radius:4px;cursor:pointer;font-size:0.7rem;">Lifetime</button>
                                    <button onclick="upgradeAdminUserDirect('${escapeHtml(u.email)}', 'premium')" style="color:#06b6d4;border:1px solid rgba(6,182,212,0.3);background:rgba(6,182,212,0.08);padding:2px 6px;border-radius:4px;cursor:pointer;font-size:0.7rem;">Pro</button>
                                    <button onclick="upgradeAdminUserDirect('${escapeHtml(u.email)}', 'free')" style="color:#94a3b8;border:1px solid rgba(148,163,184,0.3);background:rgba(148,163,184,0.08);padding:2px 6px;border-radius:4px;cursor:pointer;font-size:0.7rem;">Free</button>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="4" style="padding:12px;text-align:center;color:var(--accent-rose);">Error: ${escapeHtml(err.message)}</td></tr>`;
        }
    };

    window.upgradeAdminUserDirect = async function(email, tier) {
        try {
            const resp = await fetch('/api/admin/upgrade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, tier })
            });
            const data = await resp.json();
            if (resp.ok && data.success) {
                showToast(`User ${email} upgraded to ${tier.toUpperCase()}`, 'check');
                loadAdminUsers();
            } else {
                showToast(data.error || 'Upgrade failed', 'error');
            }
        } catch (e) {
            showToast(`Error: ${e.message}`, 'error');
        }
    };

    window.upgradeAdminUser = async function() {
        const email = document.getElementById('admin-target-email')?.value.trim();
        const tier = document.getElementById('admin-target-tier')?.value || 'lifetime';
        if (!email) {
            showToast('Enter user email', 'warning');
            return;
        }
        await window.upgradeAdminUserDirect(email, tier);
    };

    document.addEventListener('DOMContentLoaded', () => {
        loadPaymentConfig();
        loadDynamicPlans();

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
                        if (tier === 'admin') {
                            window.location.reload();
                        } else if (tier === 'premium' || tier === 'lifetime') {
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
