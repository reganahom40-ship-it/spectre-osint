/**
 * SPECTRE — Redesigned Checkout Controller
 * Multi-Rail Settlement & Autonomous Blockchain Mempool Scanner
 */
(function() {
    'use strict';

    let currentMethod = 'crypto';
    let currentCoin = 'ltc';
    let activeOrder = null;
    let pollInterval = null;
    let qrcodeInstance = null;
    let paymentConfig = null;

    const urlParams = new URLSearchParams(window.location.search);
    const rawPlanParam = (urlParams.get('plan') || 'lifetime').toLowerCase();
    const activePlan = window.__CHECKOUT_PLAN || null;
    const planParam = (activePlan && activePlan.id) ? activePlan.id : (rawPlanParam === 'pro' || rawPlanParam === 'monthly' ? 'premium' : rawPlanParam);
    const planPrice = (activePlan && activePlan.price !== undefined) ? Number(activePlan.price) : (planParam === 'premium' ? 19 : 99);

    const cryptoRates = {
        'ltc': 85.0,
        'btc': 65000.0,
        'eth': 2600.0
    };

    let appliedCoupon = null;

    async function init() {
        try {
            const resp = await fetch('/api/payment/config');
            if (resp.ok) paymentConfig = await resp.json();
        } catch(e) {}
        updateEstimatedPrice();
    }

    window.applyCouponCode = async function() {
        const input = document.getElementById('chk-coupon-code');
        const msg = document.getElementById('chk-coupon-msg');
        const code = input ? input.value.trim() : '';

        if (!code) {
            appliedCoupon = null;
            if (msg) {
                msg.textContent = 'Please enter a coupon code.';
                msg.style.color = '#f87171';
                msg.style.display = 'block';
            }
            updateEstimatedPrice();
            return;
        }

        try {
            const resp = await fetch('/api/public/coupon/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code, plan_id: planParam })
            });
            const data = await resp.json();
            if (data.valid) {
                appliedCoupon = data;
                if (msg) {
                    msg.innerHTML = `<span style="color:#34d399;"><i class="fas fa-check-circle"></i> Coupon <strong>${data.code}</strong> applied! ($${data.discount_total.toFixed(2)} discount)</span>`;
                    msg.style.display = 'block';
                }
            } else {
                appliedCoupon = null;
                if (msg) {
                    msg.textContent = data.error || 'Invalid or expired coupon.';
                    msg.style.color = '#f87171';
                    msg.style.display = 'block';
                }
            }
        } catch (err) {
            appliedCoupon = null;
            if (msg) {
                msg.textContent = 'Error checking coupon.';
                msg.style.color = '#f87171';
                msg.style.display = 'block';
            }
        }
        updateEstimatedPrice();
    };

    function updateEstimatedPrice() {
        let price = planPrice;
        if (appliedCoupon && appliedCoupon.final_price !== undefined) {
            price = appliedCoupon.final_price;
        }

        const rate = cryptoRates[currentCoin] || 85.0;
        const estCrypto = (price / rate).toFixed(4);
        const calcEl = document.getElementById('chk-est-amount');
        const noticeEl = document.getElementById('chk-fee-notice');

        if (noticeEl) {
            if (appliedCoupon) {
                noticeEl.textContent = `Coupon ${appliedCoupon.code} applied (-$${appliedCoupon.discount_total.toFixed(2)})`;
                noticeEl.style.color = '#34d399';
            } else {
                noticeEl.textContent = 'Includes method fee & discounts';
                noticeEl.style.color = 'var(--text-muted)';
            }
        }

        if (calcEl) {
            if (currentMethod === 'crypto') {
                calcEl.textContent = `${estCrypto} ${currentCoin.toUpperCase()} ($${price.toFixed(2)} USD)`;
            } else {
                calcEl.textContent = `$${price.toFixed(2)} USD`;
            }
        }
    }

    window.switchPaymentMethod = function(method) {
        currentMethod = method;
        document.querySelectorAll('.chk-method-tabs-grid .chk-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.method === method);
        });

        const cryptoWrap = document.getElementById('chk-crypto-rails-wrap');
        if (cryptoWrap) {
            cryptoWrap.style.display = (method === 'crypto') ? 'block' : 'none';
        }

        const submitText = document.getElementById('btn-submit-text');
        if (submitText) {
            if (method === 'card') submitText.textContent = 'Pay with Card';
            else if (method === 'paypal') submitText.textContent = 'Proceed with PayPal';
            else if (method === 'cashapp') submitText.textContent = 'Pay with Cash App';
            else submitText.textContent = 'Generate Crypto Vault';
        }

        updateEstimatedPrice();
    };

    window.selectCryptoCoin = function(coin) {
        currentCoin = coin;
        document.querySelectorAll('.chk-coin-grid .chk-coin-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.coin === coin);
        });
        updateEstimatedPrice();
    };

    window.initiateCheckoutOrder = async function() {
        const emailInput = document.getElementById('chk-email');
        const email = emailInput ? emailInput.value.trim() : '';

        if (!email || !email.includes('@')) {
            showToast('Please provide a valid billing email address.', 'error');
            return;
        }

        const btn = document.getElementById('btn-create-order');
        if (btn) btn.disabled = true;

        const effectiveMethod = (currentMethod === 'crypto') ? currentCoin : currentMethod;

        try {
            const resp = await fetch('/api/payment/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email,
                    tier: planParam,
                    method: effectiveMethod,
                    coupon_code: appliedCoupon ? appliedCoupon.code : ''
                })
            });

            const data = await resp.json();

            if (resp.ok && data.success) {
                activeOrder = data.order;
                renderDepositView(data.order);
            } else {
                showToast(data.error || 'Order creation failed', 'error');
            }
        } catch (err) {
            showToast(`Connection error: ${err.message}`, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    };

    function renderDepositView(order) {
        document.getElementById('chk-pane-form').style.display = 'none';
        document.getElementById('chk-pane-deposit').style.display = 'block';

        const amtEl = document.getElementById('chk-dep-amount');
        const addrEl = document.getElementById('chk-dep-address');

        if (amtEl) amtEl.textContent = `${order.crypto_amount} ${order.payment_method.toUpperCase()}`;
        if (addrEl) addrEl.textContent = order.deposit_address;

        const qrTarget = document.getElementById('chk-qrcode-target');
        if (qrTarget) {
            qrTarget.innerHTML = '';
            let uri = order.deposit_address;
            if (order.payment_method === 'ltc') uri = `litecoin:${order.deposit_address}?amount=${order.crypto_amount}`;
            else if (order.payment_method === 'btc') uri = `bitcoin:${order.deposit_address}?amount=${order.crypto_amount}`;
            else if (order.payment_method === 'eth') uri = `ethereum:${order.deposit_address}?value=${order.crypto_amount}`;
            
            try {
                qrcodeInstance = new QRCode(qrTarget, {
                    text: uri,
                    width: 120,
                    height: 120,
                    colorDark: '#030712',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.M
                });
            } catch(e) {}
        }

        startPolling(order.order_id);
    }

    function startPolling(orderId) {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(async () => {
            try {
                const resp = await fetch(`/api/payment/auto-check/${encodeURIComponent(orderId)}`);
                if (resp.ok) {
                    const data = await resp.json();
                    if (data.status === 'approved') {
                        clearInterval(pollInterval);
                        showToast('Payment verified on-chain! Activating platform access...', 'success');
                        setTimeout(() => {
                            window.location.href = '/app';
                        }, 1200);
                    }
                }
            } catch(e) {}
        }, 1500);
    }

    window.checkPaymentNow = async function() {
        if (!activeOrder) return;
        const btn = document.getElementById('btn-scan-now');
        if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';
        
        try {
            const resp = await fetch(`/api/payment/auto-check/${encodeURIComponent(activeOrder.order_id)}`);
            const data = await resp.json();
            if (data.status === 'approved') {
                showToast('Payment Confirmed! Redirecting...', 'success');
                setTimeout(() => window.location.href = '/app', 1000);
            } else {
                showToast('Mempool scan active: Transaction broadcast not yet confirmed on network.', 'info');
            }
        } catch(e) {
            showToast('Scan query error', 'error');
        } finally {
            if (btn) btn.innerHTML = '<i class="fas fa-rotate"></i> Check Payment Now';
        }
    };

    window.cancelCurrentOrder = function() {
        if (pollInterval) clearInterval(pollInterval);
        activeOrder = null;
        document.getElementById('chk-pane-deposit').style.display = 'none';
        document.getElementById('chk-pane-form').style.display = 'block';
    };

    window.copyValue = function(elementId) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const text = el.textContent.trim();
        navigator.clipboard.writeText(text).then(() => {
            showToast('Copied to clipboard!', 'success');
        });
    };

    function showToast(msg, type = 'info') {
        const toast = document.getElementById('chk-toast');
        if (!toast) return;
        toast.textContent = msg;
        toast.style.borderColor = type === 'error' ? '#f43f5e' : (type === 'success' ? '#10b981' : '#3b82f6');
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 3500);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
