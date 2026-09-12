// SPECTRE Dedicated Checkout Page Logic
(function() {
    'use strict';

    let currentTier = window.INITIAL_PLAN_ID || 'lifetime';
    let currentAmount = window.INITIAL_PRICE || 99;
    let currentRail = 'ltc';
    let activeOrder = null;
    let paymentConfig = null;
    let pollInterval = null;
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
        updateEstimatedAmount();
    }

    window.selectRail = function(rail) {
        currentRail = rail;
        document.querySelectorAll('.rail-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.rail === rail);
        });
        updateEstimatedAmount();
    };

    function updateEstimatedAmount() {
        const estEl = document.getElementById('chk-estimated-amount');
        if (!estEl) return;

        if (currentRail === 'ltc') {
            const val = (currentAmount / (cryptoRates.ltc || 85.0)).toFixed(4);
            estEl.innerHTML = `<span style="color:#00f0ff;">${val} LTC</span> <span style="font-size:0.75rem;color:var(--text-muted);">(~$85 USD/LTC)</span>`;
        } else if (currentRail === 'btc') {
            const val = (currentAmount / (cryptoRates.btc || 65000.0)).toFixed(6);
            estEl.innerHTML = `<span style="color:#f59e0b;">${val} BTC</span> <span style="font-size:0.75rem;color:var(--text-muted);">(~$65,000 USD/BTC)</span>`;
        } else if (currentRail === 'eth') {
            const val = (currentAmount / (cryptoRates.eth || 2600.0)).toFixed(5);
            estEl.innerHTML = `<span style="color:#c084fc;">${val} ETH</span> <span style="font-size:0.75rem;color:var(--text-muted);">(~$2,600 USD/ETH)</span>`;
        } else if (currentRail === 'paypal') {
            estEl.innerHTML = `<span style="color:#818cf8;">$${Number(currentAmount).toFixed(2)} USD</span> <span style="font-size:0.75rem;color:var(--text-muted);">(Direct PayPal)</span>`;
        } else if (currentRail === 'cashapp') {
            estEl.innerHTML = `<span style="color:#10b981;">$${Number(currentAmount).toFixed(2)} USD</span> <span style="font-size:0.75rem;color:var(--text-muted);">(CashApp Cashtag)</span>`;
        }
    }

    function setStep(step) {
        document.getElementById('chk-pane-1').style.display = (step === 1) ? 'block' : 'none';
        document.getElementById('chk-pane-2').style.display = (step === 2) ? 'block' : 'none';
        document.getElementById('chk-pane-3').style.display = (step === 3) ? 'block' : 'none';

        const s1 = document.getElementById('chk-step-ind-1');
        const s2 = document.getElementById('chk-step-ind-2');
        const s3 = document.getElementById('chk-step-ind-3');

        if (s1) {
            s1.classList.toggle('active', step === 1);
            s1.classList.toggle('completed', step > 1);
        }
        if (s2) {
            s2.classList.toggle('active', step === 2);
            s2.classList.toggle('completed', step > 2);
        }
        if (s3) {
            s3.classList.toggle('active', step === 3);
            s3.classList.toggle('completed', step === 3);
        }
    }

    window.generateOrderVault = async function() {
        const email = document.getElementById('chk-email-input').value.trim();
        if (!email || !email.includes('@')) {
            alert('Please provide a valid operator account email address.');
            return;
        }

        const btn = document.getElementById('btn-create-chk-order');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deriving Keypair & Order Vault...';
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
                setStep(2);
                startFastPolling(activeOrder.id);
            } else {
                alert(data.error || 'Failed to initialize payment vault.');
            }
        } catch (err) {
            alert('Network error initializing order: ' + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span>Generate Custodial Vault & Deposit Address</span> <i class="fas fa-arrow-right"></i>';
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
        if (addrLbl) addrLbl.textContent = `${method.toUpperCase()} VAULT DESTINATION ADDRESS:`;

        if (method === 'paypal' || method === 'cashapp') {
            if (qrWrap) qrWrap.style.display = 'none';
            if (dirLinkBox && extPayLink) {
                dirLinkBox.style.display = 'block';
                if (method === 'paypal') {
                    extPayLink.href = (paymentConfig && paymentConfig.PAYPAL_LINK) || `https://paypal.me/${order.deposit_address}`;
                    extPayLink.innerHTML = '<i class="fa-brands fa-paypal"></i> Pay via PayPal Direct Portal';
                } else {
                    const tag = (order.deposit_address || '').replace('$', '');
                    extPayLink.href = `https://cash.app/$${tag}`;
                    extPayLink.innerHTML = '<i class="fas fa-dollar-sign"></i> Open Cash App ($' + tag + ')';
                }
            }
        } else {
            if (qrWrap) qrWrap.style.display = 'flex';
            if (dirLinkBox) dirLinkBox.style.display = 'none';

            const qrTarget = document.getElementById('chk-qrcode-target');
            if (qrTarget) {
                qrTarget.innerHTML = '';
                let qrData = order.deposit_address;
                if (method === 'ltc') qrData = `litecoin:${order.deposit_address}?amount=${order.crypto_amount}`;
                else if (method === 'btc') qrData = `bitcoin:${order.deposit_address}?amount=${order.crypto_amount}`;
                else if (method === 'eth') qrData = `ethereum:${order.deposit_address}`;

                new QRCode(qrTarget, {
                    text: qrData,
                    width: 170,
                    height: 170,
                    colorDark: "#04060a",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.M
                });
            }
        }

        startCountdown(30 * 60);
    }

    function startCountdown(seconds) {
        if (countdownInterval) clearInterval(countdownInterval);
        let rem = seconds;
        const timerEl = document.getElementById('chk-countdown-timer');

        countdownInterval = setInterval(() => {
            rem--;
            if (rem <= 0) {
                clearInterval(countdownInterval);
                if (timerEl) timerEl.textContent = 'EXPIRED';
                return;
            }
            const m = String(Math.floor(rem / 60)).padStart(2, '0');
            const s = String(rem % 60).padStart(2, '0');
            if (timerEl) timerEl.textContent = `${m}:${s}`;
        }, 1000);
    }

    function startFastPolling(orderId) {
        if (pollInterval) clearInterval(pollInterval);
        // Fast polling every 1200ms
        pollInterval = setInterval(async () => {
            if (!activeOrder || activeOrder.status === 'approved') {
                clearInterval(pollInterval);
                return;
            }
            try {
                const resp = await fetch(`/api/payment/order-status/${encodeURIComponent(orderId)}`);
                if (resp.ok) {
                    const data = await resp.json();
                    if (data.success && data.approved) {
                        clearInterval(pollInterval);
                        onOrderConfirmed(data.order);
                    }
                }
            } catch (e) {}
        }, 1200);
    }

    window.submitProofFast = async function() {
        const txInput = document.getElementById('chk-proof-input');
        const errBox = document.getElementById('chk-proof-err');
        const btn = document.getElementById('btn-submit-chk-proof');
        if (errBox) errBox.style.display = 'none';

        const hash = txInput ? txInput.value.trim() : '';
        if (!hash || hash.length < 4) {
            if (errBox) {
                errBox.textContent = 'Please enter a valid transaction hash or transfer reference identifier.';
                errBox.style.display = 'block';
            }
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
        }

        try {
            const resp = await fetch('/api/payment/submit-proof', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    order_id: activeOrder.id,
                    tx_hash: hash
                })
            });

            const data = await resp.json();
            if (resp.ok && data.success) {
                if (data.approved) {
                    onOrderConfirmed(data.order);
                } else {
                    // Check on-chain immediately
                    await verifyOnChainFast();
                }
            } else {
                if (errBox) {
                    errBox.textContent = data.error || 'Proof submission failed.';
                    errBox.style.display = 'block';
                }
            }
        } catch (e) {
            if (errBox) {
                errBox.textContent = 'Network error: ' + e.message;
                errBox.style.display = 'block';
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-shield-check"></i> Verify Settlement';
            }
        }
    };

    window.verifyOnChainFast = async function() {
        if (!activeOrder || !activeOrder.id) return;
        try {
            const resp = await fetch(`/api/payment/verify-on-chain/${encodeURIComponent(activeOrder.id)}`, { method: 'POST' });
            const data = await resp.json();
            if (resp.ok && data.verified) {
                onOrderConfirmed(data.order);
            }
        } catch (e) {}
    };

    function onOrderConfirmed(order) {
        if (pollInterval) clearInterval(pollInterval);
        if (countdownInterval) clearInterval(countdownInterval);

        const tierEl = document.getElementById('chk-confirmed-tier');
        if (tierEl) tierEl.textContent = ((order && order.plan_id) || 'LIFETIME').toUpperCase();

        setStep(3);

        setTimeout(() => {
            window.location.href = '/app';
        }, 1800);
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadConfig();
    });
})();
