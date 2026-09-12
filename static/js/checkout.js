// SPECTRE — Minimalist Auto-Detect Checkout Controller
(function() {
    'use strict';

    let currentTier = window.INITIAL_PLAN_ID || 'lifetime';
    let currentAmount = window.INITIAL_PRICE || 99;
    let currentRail = 'ltc';
    let activeOrder = null;
    let paymentConfig = null;
    let scanInterval = null;
    let countdownInterval = null;
    let qrcodeInstance = null;

    const cryptoRates = {
        'ltc': 85.0,
        'btc': 65000.0,
        'eth': 2600.0
    };

    async function loadConfig() {
        try {
            const resp = await fetch('/api/payment/config');
            if (resp.ok) {
                paymentConfig = await resp.json();
            }
        } catch (e) {}
        updateCalcAmount();
    }

    window.selectRail = function(rail) {
        currentRail = rail;
        document.querySelectorAll('.rail-pill').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.rail === rail);
        });
        updateCalcAmount();
    };

    function updateCalcAmount() {
        const calcEl = document.getElementById('chk-calc-amount');
        if (!calcEl) return;

        if (currentRail === 'ltc') {
            const val = (currentAmount / (cryptoRates.ltc || 85.0)).toFixed(4);
            calcEl.textContent = `${val} LTC (~$85/LTC)`;
        } else if (currentRail === 'btc') {
            const val = (currentAmount / (cryptoRates.btc || 65000.0)).toFixed(6);
            calcEl.textContent = `${val} BTC (~$65,000/BTC)`;
        } else if (currentRail === 'eth') {
            const val = (currentAmount / (cryptoRates.eth || 2600.0)).toFixed(5);
            calcEl.textContent = `${val} ETH (~$2,600/ETH)`;
        } else if (currentRail === 'paypal') {
            calcEl.textContent = `$${Number(currentAmount).toFixed(2)} USD (PayPal Direct)`;
        } else if (currentRail === 'cashapp') {
            calcEl.textContent = `$${Number(currentAmount).toFixed(2)} USD (Cash App)`;
        }
    }

    window.setStep = function(step) {
        document.getElementById('chk-pane-config').style.display = (step === 1) ? 'block' : 'none';
        document.getElementById('chk-pane-deposit').style.display = (step === 2) ? 'block' : 'none';
        document.getElementById('chk-pane-approved').style.display = (step === 3) ? 'block' : 'none';

        if (step === 1) {
            if (scanInterval) clearInterval(scanInterval);
            if (countdownInterval) clearInterval(countdownInterval);
        }
    };

    window.generateOrderVault = async function() {
        const emailInput = document.getElementById('chk-email-input');
        const email = emailInput ? emailInput.value.trim() : '';

        if (!email || !email.includes('@') || !email.includes('.')) {
            alert('Please enter a valid operator email address.');
            if (emailInput) emailInput.focus();
            return;
        }

        const btn = document.getElementById('btn-create-order');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Initializing...';
        }

        try {
            const resp = await fetch('/api/payment/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email,
                    plan_id: currentTier,
                    payment_method: currentRail
                })
            });

            const data = await resp.json();
            if (resp.ok && data.success && data.order) {
                activeOrder = data.order;
                renderOrderDetails(activeOrder);
                window.setStep(2);
                startAutoScanner(activeOrder.id);
            } else {
                alert(data.error || 'Failed to initialize payment vault.');
            }
        } catch (err) {
            alert('Connection error: ' + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<span>Continue to Payment</span> <i class="fas fa-arrow-right"></i>`;
            }
        }
    };

    function renderOrderDetails(order) {
        const ordDisp = document.getElementById('chk-order-id-display');
        if (ordDisp) ordDisp.textContent = order.id;

        const amtDisp = document.getElementById('chk-display-amount');
        const addrDisp = document.getElementById('chk-display-addr');
        const addrLbl = document.getElementById('chk-display-addr-label');
        const qrWrap = document.getElementById('chk-qr-wrapper');
        const dirLinkBox = document.getElementById('chk-direct-link-box');
        const extPayLink = document.getElementById('chk-external-pay-link');

        const method = (order.payment_method || 'ltc').toLowerCase();

        if (amtDisp) {
            if (order.crypto_amount) {
                amtDisp.textContent = `${order.crypto_amount} ${method.toUpperCase()}`;
            } else {
                amtDisp.textContent = `$${Number(order.amount_usd).toFixed(2)} USD`;
            }
        }

        if (addrDisp) addrDisp.textContent = order.deposit_address;
        if (addrLbl) addrLbl.textContent = `${method.toUpperCase()} DEPOSIT ADDRESS:`;

        if (method === 'paypal' || method === 'cashapp') {
            if (qrWrap) qrWrap.style.display = 'none';
            if (dirLinkBox && extPayLink) {
                dirLinkBox.style.display = 'block';
                if (method === 'paypal') {
                    extPayLink.href = (paymentConfig && paymentConfig.PAYPAL_LINK) || `mailto:${order.deposit_address}`;
                    extPayLink.innerHTML = `<i class="fa-brands fa-paypal"></i> Pay with PayPal`;
                    extPayLink.style.background = 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)';
                } else {
                    const tag = (order.deposit_address || '').replace('$', '');
                    extPayLink.href = `https://cash.app/$${tag}/${order.amount_usd}`;
                    extPayLink.innerHTML = `<i class="fas fa-dollar-sign"></i> Pay with Cash App`;
                    extPayLink.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                }
            }
        } else {
            if (qrWrap) {
                qrWrap.style.display = 'flex';
                renderQRCode(order);
            }
            if (dirLinkBox) dirLinkBox.style.display = 'none';
        }

        startCountdown(order.expires_at);
    }

    function renderQRCode(order) {
        const target = document.getElementById('chk-qrcode-target');
        if (!target) return;
        target.innerHTML = '';

        const method = (order.payment_method || 'ltc').toLowerCase();
        let uri = order.deposit_address;
        if (method === 'ltc') uri = `litecoin:${order.deposit_address}?amount=${order.crypto_amount}`;
        else if (method === 'btc') uri = `bitcoin:${order.deposit_address}?amount=${order.crypto_amount}`;
        else if (method === 'eth') uri = `ethereum:${order.deposit_address}?value=${order.crypto_amount}`;

        try {
            if (typeof QRCode !== 'undefined') {
                qrcodeInstance = new QRCode(target, {
                    text: uri,
                    width: 160,
                    height: 160,
                    colorDark: '#00f0ff',
                    colorLight: '#0d1117',
                    correctLevel: QRCode.CorrectLevel.M
                });
            } else {
                const img = document.createElement('img');
                img.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(uri)}&color=00f0ff&bgcolor=0d1117`;
                img.alt = 'Scan Deposit Address';
                img.style.width = '160px';
                img.style.height = '160px';
                target.appendChild(img);
            }
        } catch (e) {
            console.warn('QR Code render fallback:', e);
        }
    }

    function startCountdown(expiresAt) {
        if (countdownInterval) clearInterval(countdownInterval);
        const timerEl = document.getElementById('chk-countdown-timer');

        let target = expiresAt ? new Date(expiresAt).getTime() : Date.now() + 30 * 60 * 1000;

        countdownInterval = setInterval(() => {
            const rem = Math.max(0, Math.floor((target - Date.now()) / 1000));
            if (rem <= 0) {
                if (timerEl) timerEl.textContent = 'EXPIRED';
                clearInterval(countdownInterval);
                return;
            }
            const m = String(Math.floor(rem / 60)).padStart(2, '0');
            const s = String(rem % 60).padStart(2, '0');
            if (timerEl) timerEl.textContent = `${m}:${s}`;
        }, 1000);
    }

    // AUTOMATIC NETWORK SCANNER (Checks automatically every 1500ms — NO TXID INPUT NEEDED)
    function startAutoScanner(orderId) {
        if (scanInterval) clearInterval(scanInterval);

        // Immediate first check
        performAutoCheck(orderId);

        // Poll every 1500ms
        scanInterval = setInterval(() => {
            if (!activeOrder || activeOrder.status === 'approved') {
                clearInterval(scanInterval);
                return;
            }
            performAutoCheck(orderId);
        }, 1500);
    }

    async function performAutoCheck(orderId) {
        try {
            const resp = await fetch(`/api/payment/auto-check/${encodeURIComponent(orderId)}`);
            if (resp.ok) {
                const data = await resp.json();
                if (data.success && data.approved) {
                    onOrderApproved(data.order);
                }
            }
        } catch (e) {}
    }

    // Manual "Check Now" button
    window.checkPaymentNow = async function() {
        if (!activeOrder || !activeOrder.id) return;

        const btn = document.getElementById('btn-manual-scan');
        const titleEl = document.getElementById('chk-scan-status-title');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
        }
        if (titleEl) titleEl.textContent = 'Scanning ledger mempool now...';

        try {
            const resp = await fetch(`/api/payment/auto-check/${encodeURIComponent(activeOrder.id)}`);
            const data = await resp.json();
            if (resp.ok && data.success && data.approved) {
                onOrderApproved(data.order);
            } else {
                if (titleEl) titleEl.textContent = 'Listening for incoming transfer...';
            }
        } catch (e) {
            if (titleEl) titleEl.textContent = 'Network check retry...';
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-rotate"></i> Check Now';
            }
        }
    };

    function onOrderApproved(order) {
        if (scanInterval) clearInterval(scanInterval);
        if (countdownInterval) clearInterval(countdownInterval);

        const emailEl = document.getElementById('chk-approved-email');
        if (emailEl) emailEl.textContent = (order && order.email) || 'Your Account';

        window.setStep(3);

        // Auto launch console after 1.2s
        setTimeout(() => {
            window.location.href = '/app';
        }, 1200);
    }

    window.copyDynamicText = function(targetId, btnId, label) {
        const el = document.getElementById(targetId);
        if (!el) return;
        const text = el.innerText || el.textContent;

        navigator.clipboard.writeText(text.trim()).then(() => {
            const btn = document.getElementById(btnId);
            if (btn) {
                const orig = btn.innerHTML;
                btn.innerHTML = `<i class="fas fa-check text-emerald"></i> Copied!`;
                btn.style.borderColor = 'var(--chk-emerald)';
                btn.style.color = 'var(--chk-emerald)';
                setTimeout(() => {
                    btn.innerHTML = orig;
                    btn.style.borderColor = '';
                    btn.style.color = '';
                }, 1500);
            }
        });
    };

    document.addEventListener('DOMContentLoaded', () => {
        loadConfig();
    });

})();
