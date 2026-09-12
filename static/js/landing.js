/**
 * SPECTRE — Landing & Checkout Management Controller
 */
(function() {
    'use strict';

    let currentTier = 'lifetime';
    let currentAmount = 99;
    let currentMethod = 'ltc';
    let paymentConfig = null;

    // Order state machine
    let activeOrder = null;
    let countdownInterval = null;
    let statusPollInterval = null;
    let qrcodeInstance = null;

    // Crypto market cache fallback
    const cryptoRates = {
        'ltc': 85.0,
        'btc': 65000.0,
        'eth': 2600.0
    };

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

        updateEstimatedAmount();
    }

    function updateEstimatedAmount() {
        const estEl = document.getElementById('estimated-crypto-amount');
        if (!estEl) return;

        if (currentMethod === 'ltc') {
            const val = (currentAmount / (cryptoRates.ltc || 85.0)).toFixed(4);
            estEl.innerHTML = `<span style="color:#06b6d4;">${val} LTC</span> <span style="font-size:0.75rem;color:var(--text-muted);">(~${cryptoRates.ltc} USD/LTC)</span>`;
        } else if (currentMethod === 'btc') {
            const val = (currentAmount / (cryptoRates.btc || 65000.0)).toFixed(6);
            estEl.innerHTML = `<span style="color:#f59e0b;">${val} BTC</span> <span style="font-size:0.75rem;color:var(--text-muted);">(~${cryptoRates.btc} USD/BTC)</span>`;
        } else if (currentMethod === 'eth') {
            const val = (currentAmount / (cryptoRates.eth || 2600.0)).toFixed(5);
            estEl.innerHTML = `<span style="color:#a855f7;">${val} ETH</span> <span style="font-size:0.75rem;color:var(--text-muted);">(~${cryptoRates.eth} USD/ETH)</span>`;
        } else if (currentMethod === 'paypal') {
            estEl.innerHTML = `<span style="color:#6366f1;">$${Number(currentAmount).toFixed(2)} USD</span> <span style="font-size:0.75rem;color:var(--text-muted);">(Direct PayPal)</span>`;
        } else if (currentMethod === 'cashapp') {
            estEl.innerHTML = `<span style="color:#10b981;">$${Number(currentAmount).toFixed(2)} USD</span> <span style="font-size:0.75rem;color:var(--text-muted);">(CashApp Cashtag)</span>`;
        } else {
            estEl.innerHTML = `<span style="color:#38bdf8;">$${Number(currentAmount).toFixed(2)} USD</span>`;
        }
    }

    // Step Navigation
    window.goToStep = function(step) {
        for (let s = 1; s <= 4; s++) {
            const pane = document.getElementById(`pane-step-${s}`);
            const indicator = document.getElementById(`step-indicator-${s}`);
            const line = document.getElementById(`step-line-${s}`);

            if (pane) {
                pane.style.display = (s === step) ? 'block' : 'none';
            }
            if (indicator) {
                indicator.classList.toggle('active', s === step);
                indicator.classList.toggle('completed', s < step);
            }
            if (line) {
                line.classList.toggle('active', s < step);
            }
        }
    };

    window.selectPaymentMethod = function(method) {
        currentMethod = method;
        const tabs = document.querySelectorAll('.pmethod-tab');
        tabs.forEach(t => t.classList.toggle('active', t.dataset.method === method));
        updateEstimatedAmount();
    };

    // Step 1 -> Step 2: Create Order in DB & Generate Deposit Instructions
    window.startOrderCreation = async function() {
        const emailInput = document.getElementById('checkout-email-input');
        const email = emailInput ? emailInput.value.trim() : '';

        if (!email || !email.includes('@') || !email.includes('.')) {
            showToast('Please enter a valid operator email address.', 'warning');
            if (emailInput) emailInput.focus();
            return;
        }

        const btn = document.getElementById('btn-create-order');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Initializing Settlement Channel...`;
        }

        try {
            const resp = await fetch('/api/payment/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email,
                    plan_id: currentTier,
                    method: currentMethod
                })
            });
            const data = await resp.json();

            if (resp.ok && data.success) {
                activeOrder = data.order;
                const instr = data.payment_instructions;

                // Populate Step 2 details
                const orderIdEl = document.getElementById('display-order-id');
                if (orderIdEl) orderIdEl.textContent = instr.order_id;

                const sendAmtEl = document.getElementById('display-send-amount');
                if (sendAmtEl) {
                    if (['ltc', 'btc', 'eth'].includes(currentMethod)) {
                        sendAmtEl.textContent = `${instr.crypto_amount} ${currentMethod.toUpperCase()}`;
                    } else {
                        sendAmtEl.textContent = `$${Number(instr.amount_usd).toFixed(2)} USD`;
                    }
                }

                const destLblEl = document.getElementById('display-dest-label');
                if (destLblEl) {
                    destLblEl.textContent = `${currentMethod.toUpperCase()} DESTINATION / RECIPIENT:`;
                }

                const destAddrEl = document.getElementById('display-dest-address');
                if (destAddrEl) {
                    destAddrEl.textContent = instr.deposit_address || 'Check instructions below';
                }

                const ppLinkContainer = document.getElementById('paypal-direct-link-container');
                const ppLinkA = document.getElementById('display-paypal-link');
                if (currentMethod === 'paypal' && instr.paypal_link) {
                    if (ppLinkContainer) ppLinkContainer.style.display = 'block';
                    if (ppLinkA) ppLinkA.href = instr.paypal_link;
                } else if (ppLinkContainer) {
                    ppLinkContainer.style.display = 'none';
                }

                // Render Dynamic QR Code
                renderDynamicQRCode(instr);

                // Start 45-min live countdown
                startCountdown(instr.expires_at);

                // Start status polling
                startStatusPolling(instr.order_id);

                goToStep(2);
                showToast(`Order ${instr.order_id} generated. Awaiting transfer.`, 'check');
            } else {
                showToast(data.error || 'Failed to initialize order channel.', 'error');
            }
        } catch (err) {
            showToast(`Connection error: ${err.message}`, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<span>Generate Deposit Address & Order Reference</span> <i class="fas fa-arrow-right"></i>`;
            }
        }
    };

    function renderDynamicQRCode(instr) {
        const qrContainer = document.getElementById('qrcode-target');
        if (!qrContainer) return;
        qrContainer.innerHTML = '';

        let qrString = '';
        if (instr.method === 'ltc') {
            qrString = `litecoin:${instr.deposit_address}?amount=${instr.crypto_amount}`;
        } else if (instr.method === 'btc') {
            qrString = `bitcoin:${instr.deposit_address}?amount=${instr.crypto_amount}`;
        } else if (instr.method === 'eth') {
            qrString = `ethereum:${instr.deposit_address}?value=${instr.crypto_amount}`;
        } else if (instr.method === 'paypal') {
            qrString = instr.paypal_link || `mailto:${instr.paypal_email}`;
        } else if (instr.method === 'cashapp') {
            qrString = `https://cash.app/${instr.cashapp_tag.replace('$', '')}`;
        } else {
            qrString = instr.deposit_address || instr.order_id;
        }

        try {
            if (typeof QRCode !== 'undefined') {
                qrcodeInstance = new QRCode(qrContainer, {
                    text: qrString,
                    width: 150,
                    height: 150,
                    colorDark: '#06b6d4',
                    colorLight: '#0d1117',
                    correctLevel: QRCode.CorrectLevel.M
                });
            } else {
                const img = document.createElement('img');
                img.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrString)}&color=06b6d4&bgcolor=0d1117`;
                img.alt = 'Scan Settlement Address';
                img.style.width = '150px';
                img.style.height = '150px';
                qrContainer.appendChild(img);
            }
        } catch (e) {
            console.warn('QR Code generation error:', e);
        }
    }

    function startCountdown(expiresAtStr) {
        if (countdownInterval) clearInterval(countdownInterval);
        const timerEl = document.getElementById('display-countdown-timer');

        let targetTime = expiresAtStr ? new Date(expiresAtStr).getTime() : (Date.now() + 45 * 60 * 1000);

        function tick() {
            const now = Date.now();
            const diff = targetTime - now;

            if (diff <= 0) {
                if (timerEl) timerEl.textContent = 'EXPIRED';
                clearInterval(countdownInterval);
                return;
            }

            const mins = Math.floor(diff / (1000 * 60));
            const secs = Math.floor((diff % (1000 * 60)) / 1000);
            if (timerEl) {
                timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
        }

        tick();
        countdownInterval = setInterval(tick, 1000);
    }

    // Step 3 -> Submit Proof
    window.submitOrderProof = async function() {
        if (!activeOrder) {
            showToast('No active order reference found.', 'error');
            goToStep(1);
            return;
        }

        const txInput = document.getElementById('tx-hash-input');
        const notesInput = document.getElementById('tx-notes-input');
        const errBox = document.getElementById('proof-error-msg');
        const txHash = txInput ? txInput.value.trim() : '';
        const notes = notesInput ? notesInput.value.trim() : '';

        if (errBox) errBox.style.display = 'none';

        if (!txHash || txHash.length < 5) {
            if (errBox) {
                errBox.textContent = 'Please enter a valid Transaction Hash (TXID) or transfer reference number.';
                errBox.style.display = 'block';
            }
            if (txInput) txInput.focus();
            return;
        }

        const btn = document.getElementById('btn-submit-proof');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Submitting to Clearance Node...`;
        }

        try {
            const resp = await fetch('/api/payment/submit-proof', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    order_id: activeOrder.id,
                    tx_hash: txHash,
                    notes: notes
                })
            });
            const data = await resp.json();

            if (resp.ok && data.success) {
                activeOrder = data.order;
                const vrOrderEl = document.getElementById('vr-order-id');
                const vrTxEl = document.getElementById('vr-txid-display');
                if (vrOrderEl) vrOrderEl.textContent = activeOrder.id;
                if (vrTxEl) vrTxEl.textContent = txHash;

                goToStep(4);
                showToast('Proof submitted! Node verification monitor active.', 'check');
                startStatusPolling(activeOrder.id);
            } else {
                if (errBox) {
                    errBox.textContent = data.error || 'Failed to submit proof.';
                    errBox.style.display = 'block';
                }
            }
        } catch (err) {
            if (errBox) {
                errBox.textContent = `Error: ${err.message}`;
                errBox.style.display = 'block';
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-shield-check"></i> <span>Verify Settlement & Request Clearance</span>`;
            }
        }
    };

    // Step 4: Real-time Radar Status Poller
    function startStatusPolling(orderId) {
        if (statusPollInterval) clearInterval(statusPollInterval);

        checkCurrentOrderStatus(false);
        statusPollInterval = setInterval(() => {
            checkCurrentOrderStatus(false);
        }, 3500);
    }

    window.checkCurrentOrderStatus = async function(isManual = false) {
        if (!activeOrder || !activeOrder.id) return;

        try {
            const resp = await fetch(`/api/payment/order-status/${encodeURIComponent(activeOrder.id)}`);
            if (!resp.ok) return;

            const data = await resp.json();
            if (data.success && data.order) {
                activeOrder = data.order;
                const status = activeOrder.status;

                const pill = document.getElementById('vr-status-pill');
                const pillText = document.getElementById('vr-pill-text');
                const title = document.getElementById('vr-status-title');
                const desc = document.getElementById('vr-status-desc');

                if (status === 'approved') {
                    if (statusPollInterval) clearInterval(statusPollInterval);
                    if (countdownInterval) clearInterval(countdownInterval);

                    if (pill) {
                        pill.style.background = 'rgba(16, 185, 129, 0.18)';
                        pill.style.borderColor = 'rgba(16, 185, 129, 0.5)';
                        pill.style.color = '#34d399';
                    }
                    if (pillText) pillText.textContent = 'STATUS: CONFIRMED // ACCESS GRANTED';
                    if (title) title.innerHTML = '<span style="color:#10b981;">PAYMENT CONFIRMED & APPROVED</span>';
                    if (desc) desc.textContent = 'Your credential has been elevated. Launching intelligence command console...';

                    showToast('Clearance verified! Launching console...', 'check');
                    setTimeout(() => {
                        window.location.href = data.redirect || '/app';
                    }, 1500);
                } else if (status === 'rejected') {
                    if (statusPollInterval) clearInterval(statusPollInterval);
                    if (pill) {
                        pill.style.background = 'rgba(244, 63, 94, 0.18)';
                        pill.style.borderColor = 'rgba(244, 63, 94, 0.5)';
                        pill.style.color = '#f43f5e';
                    }
                    if (pillText) pillText.textContent = 'STATUS: REJECTED';
                    if (title) title.innerHTML = '<span style="color:#f43f5e;">VERIFICATION REJECTED</span>';
                    if (desc) desc.textContent = `The transaction hash could not be confirmed: ${activeOrder.notes || 'Unconfirmed settlement'}`;
                } else if (status === 'verifying') {
                    if (pillText) pillText.textContent = 'STATUS: VERIFYING (Awaiting Operator Clearance)';
                    if (isManual) showToast('Order is in queue awaiting network confirmation.', 'info');
                } else {
                    if (pillText) pillText.textContent = 'STATUS: PENDING DEPOSIT';
                    if (isManual) showToast('Awaiting deposit transfer.', 'info');
                }
            }
        } catch (e) {
            // Quiet network retry
        }
    };

    window.copyDynamicText = function(elementId, label = 'Data') {
        const el = document.getElementById(elementId);
        if (el) {
            navigator.clipboard.writeText(el.textContent.trim()).then(() => {
                showToast(`${label} copied to clipboard!`, 'check');
            });
        }
    };

    window.copyText = function(elementId, label = 'Address') {
        window.copyDynamicText(elementId, label);
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
        
        if (!activeOrder || activeOrder.status === 'approved' || activeOrder.status === 'rejected') {
            goToStep(1);
        }

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
        const tabs = ['pay', 'plans', 'orders', 'users', 'vault'];
        tabs.forEach(t => {
            const btn = document.getElementById(`tab-btn-admin-${t}`);
            const pane = document.getElementById(`tab-pane-admin-${t}`);
            if (btn) btn.classList.toggle('active', t === tab);
            if (pane) pane.style.display = (t === tab) ? 'block' : 'none';
        });
        if (tab === 'pay') loadAdminSettings();
        if (tab === 'vault') loadAdminVault();
        if (tab === 'plans') loadAdminPlans();
        if (tab === 'orders') loadAdminOrders();
        if (tab === 'users') loadAdminUsers();
    };

    // Admin Orders Management
    window.loadAdminOrders = async function() {
        const tbody = document.getElementById('admin-orders-tbody');
        const badge = document.getElementById('admin-orders-counter');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="7" style="padding:14px;text-align:center;color:var(--text-muted);"><i class="fas fa-circle-notch fa-spin"></i> Loading settlement queue...</td></tr>`;

        try {
            const resp = await fetch('/api/admin/orders');
            const data = await resp.json();

            if (resp.ok && data.orders) {
                const orders = data.orders;

                // Update badge counter
                const pendingCount = orders.filter(o => o.status === 'verifying' || o.status === 'pending').length;
                if (badge) {
                    badge.textContent = pendingCount;
                    badge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
                }

                if (orders.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="7" style="padding:14px;text-align:center;color:var(--text-muted);">No orders found in database.</td></tr>`;
                    return;
                }

                tbody.innerHTML = orders.map(o => {
                    const statusClass = `status-${o.status}`;
                    const txSnippet = o.tx_hash ? `${o.tx_hash.substring(0, 12)}...` : '<span style="color:var(--text-muted);font-style:italic;">None</span>';
                    const isActionable = o.status !== 'approved';

                    return `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
                            <td style="padding:8px 8px;"><code>${escapeHtml(o.id)}</code></td>
                            <td style="padding:8px 8px;font-weight:600;color:var(--text-primary);">${escapeHtml(o.email)}</td>
                            <td style="padding:8px 8px;"><strong style="color:#fcd34d;">$${Number(o.amount).toFixed(2)}</strong> <span style="font-size:0.7rem;color:var(--text-muted);">(${escapeHtml(o.plan_id)})</span></td>
                            <td style="padding:8px 8px;"><span style="color:var(--accent-cyan);font-weight:700;">${escapeHtml(o.payment_method.toUpperCase())}</span> ${o.crypto_amount > 0 ? `<br><code style="font-size:0.7rem;">${o.crypto_amount}</code>` : ''}</td>
                            <td style="padding:8px 8px;">
                                <span title="${escapeHtml(o.tx_hash)}">${txSnippet}</span>
                                ${o.notes ? `<br><small style="color:var(--text-muted);">${escapeHtml(o.notes)}</small>` : ''}
                            </td>
                            <td style="padding:8px 8px;">
                                <span class="status-badge ${statusClass}">${escapeHtml(o.status)}</span>
                            </td>
                            <td style="padding:8px 8px; text-align:right; white-space:nowrap;">
                                ${isActionable ? `
                                    <button type="button" class="btn-admin-approve" onclick="adminApproveOrder('${escapeHtml(o.id)}')">
                                        <i class="fas fa-check"></i> Approve
                                    </button>
                                    <button type="button" class="btn-admin-reject" onclick="adminRejectOrder('${escapeHtml(o.id)}')">
                                        <i class="fas fa-xmark"></i> Reject
                                    </button>
                                ` : `<span style="color:var(--accent-emerald);font-weight:700;font-size:0.72rem;"><i class="fas fa-circle-check"></i> Activated</span>`}
                            </td>
                        </tr>
                    `;
                }).join('');
            }
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" style="padding:14px;text-align:center;color:var(--accent-rose);">Error loading orders: ${escapeHtml(err.message)}</td></tr>`;
        }
    };

    window.adminApproveOrder = async function(orderId) {
        if (!confirm(`Approve order ${orderId} and activate account access?`)) return;

        try {
            const resp = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes: 'Confirmed on blockchain explorer / payment merchant' })
            });
            const data = await resp.json();

            if (resp.ok && data.success) {
                showToast(`Order ${orderId} approved and account elevated!`, 'check');
                loadAdminOrders();
            } else {
                showToast(data.error || 'Failed to approve order', 'error');
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }
    };

    window.adminRejectOrder = async function(orderId) {
        const reason = prompt(`Reason for rejecting order ${orderId}:`, 'Unverified transaction / TXID not found');
        if (reason === null) return;

        try {
            const resp = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: reason })
            });
            const data = await resp.json();

            if (resp.ok && data.success) {
                showToast(`Order ${orderId} marked as rejected.`, 'info');
                loadAdminOrders();
            } else {
                showToast(data.error || 'Failed to reject order', 'error');
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }
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
                setVal('adm-paypal-client-id', s.PAYPAL_CLIENT_ID);
                setVal('adm-paypal-client-secret', s.PAYPAL_CLIENT_SECRET);
                setVal('adm-paypal-mode', s.PAYPAL_MODE || 'live');
                setVal('adm-cashapp-mode', s.CASHAPP_VERIFY_MODE || 'auto_note');
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
            CASHAPP_TAG: getVal('adm-cashapp'),
            PAYPAL_CLIENT_ID: getVal('adm-paypal-client-id'),
            PAYPAL_CLIENT_SECRET: getVal('adm-paypal-client-secret'),
            PAYPAL_MODE: getVal('adm-paypal-mode') || 'live',
            CASHAPP_VERIFY_MODE: getVal('adm-cashapp-mode') || 'auto_note'
        };

        try {
            const resp = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await resp.json();
            if (resp.ok && data.success) {
                showToast('Payment Routing & API Credentials Saved Live!', 'check');
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

    // =========================================================================
    // MASTER ADMIN TREASURY & COLD VAULT CONTROLLERS
    // =========================================================================
    let _vaultData = null;

    window.loadAdminVault = async function() {
        const tbodyWd = document.getElementById('admin-vault-withdrawals-tbody');
        const tbodyWallets = document.getElementById('admin-vault-wallets-tbody');

        try {
            const resp = await fetch('/api/admin/vault/summary');
            const data = await resp.json();
            if (!resp.ok || !data.vault) {
                showToast(data.error || 'Failed loading vault summary', 'error');
                return;
            }

            _vaultData = data.vault;
            const totals = data.vault.totals || {};

            // Update stat cards
            const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };
            setTxt('vault-stat-total-fiat', `$${Number(data.vault.total_fiat_usd || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} <span style="font-size:0.75rem; color:var(--text-muted);">USD</span>`);
            
            const ltc = totals.ltc || { available: 0, fiat_usd_value: 0 };
            setTxt('vault-stat-ltc-bal', `${Number(ltc.available).toFixed(4)} <span style="font-size:0.75rem;">LTC</span>`);
            setTxt('vault-stat-ltc-fiat', `≈ $${Number(ltc.fiat_usd_value || 0).toFixed(2)} USD`);

            const btc = totals.btc || { available: 0, fiat_usd_value: 0 };
            setTxt('vault-stat-btc-bal', `${Number(btc.available).toFixed(6)} <span style="font-size:0.75rem;">BTC</span>`);
            setTxt('vault-stat-btc-fiat', `≈ $${Number(btc.fiat_usd_value || 0).toFixed(2)} USD`);

            const eth = totals.eth || { available: 0, fiat_usd_value: 0 };
            setTxt('vault-stat-eth-bal', `${Number(eth.available).toFixed(5)} <span style="font-size:0.75rem;">ETH</span>`);
            setTxt('vault-stat-eth-fiat', `≈ $${Number(eth.fiat_usd_value || 0).toFixed(2)} USD`);

            // Update withdrawals table
            if (tbodyWd) {
                const wds = data.vault.recent_withdrawals || [];
                if (wds.length === 0) {
                    tbodyWd.innerHTML = `<tr><td colspan="6" style="padding:12px; text-align:center; color:var(--text-muted);">No cold withdrawals recorded yet.</td></tr>`;
                } else {
                    tbodyWd.innerHTML = wds.map(w => `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
                            <td style="padding:6px 8px;"><code>${escapeHtml(w.id)}</code></td>
                            <td style="padding:6px 8px;font-weight:700;color:var(--accent-cyan);">${escapeHtml(w.currency)}</td>
                            <td style="padding:6px 8px;font-weight:700;color:#10b981;">${Number(w.amount).toFixed(6)}</td>
                            <td style="padding:6px 8px;font-family:var(--font-mono);"><span title="${escapeHtml(w.destination_address)}">${escapeHtml(w.destination_address.substring(0, 10))}...${escapeHtml(w.destination_address.substring(w.destination_address.length - 6))}</span></td>
                            <td style="padding:6px 8px;"><code>${escapeHtml(w.tx_hash)}</code></td>
                            <td style="padding:6px 8px;color:var(--text-muted);font-size:0.7rem;">${escapeHtml(w.created_at)}</td>
                        </tr>
                    `).join('');
                }
            }

            // Update custodial wallets table
            if (tbodyWallets) {
                const wls = data.vault.wallets || [];
                if (wls.length === 0) {
                    tbodyWallets.innerHTML = `<tr><td colspan="5" style="padding:12px; text-align:center; color:var(--text-muted);">No generated custodial wallets yet.</td></tr>`;
                } else {
                    tbodyWallets.innerHTML = wls.map(w => `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
                            <td style="padding:6px 8px;font-weight:700;color:var(--accent-cyan);">${escapeHtml(w.currency)}</td>
                            <td style="padding:6px 8px;font-family:var(--font-mono);">${escapeHtml(w.address)}</td>
                            <td style="padding:6px 8px;font-weight:700;color:${w.balance > 0 ? '#10b981' : 'var(--text-muted)'};">${Number(w.balance).toFixed(6)}</td>
                            <td style="padding:6px 8px;"><code>${escapeHtml(w.order_id || 'Direct')}</code></td>
                            <td style="padding:6px 8px;color:var(--text-muted);font-size:0.7rem;">${escapeHtml(w.created_at)}</td>
                        </tr>
                    `).join('');
                }
            }

            window.updateWithdrawMaxPlaceholder();
        } catch (err) {
            showToast(`Error loading vault: ${err.message}`, 'error');
        }
    };

    window.updateWithdrawMaxPlaceholder = function() {
        const curr = document.getElementById('adm-vault-currency')?.value.toLowerCase() || 'ltc';
        const amtInput = document.getElementById('adm-vault-amount');
        if (!_vaultData || !_vaultData.totals || !amtInput) return;
        const available = _vaultData.totals[curr]?.available || 0;
        amtInput.placeholder = `Max: ${Number(available).toFixed(6)}`;
    };

    window.setWithdrawMax = function() {
        const curr = document.getElementById('adm-vault-currency')?.value.toLowerCase() || 'ltc';
        const amtInput = document.getElementById('adm-vault-amount');
        if (!_vaultData || !_vaultData.totals || !amtInput) return;
        const available = _vaultData.totals[curr]?.available || 0;
        amtInput.value = available;
    };

    window.executeAdminWithdrawal = async function() {
        const curr = document.getElementById('adm-vault-currency')?.value || 'LTC';
        const dest = document.getElementById('adm-vault-dest')?.value.trim();
        const amt = parseFloat(document.getElementById('adm-vault-amount')?.value || 0);
        const notes = document.getElementById('adm-vault-notes')?.value.trim() || '';

        if (!dest) {
            showToast('Destination cold address is required.', 'warning');
            return;
        }
        if (amt <= 0) {
            showToast('Withdrawal amount must be greater than 0.', 'warning');
            return;
        }

        if (!confirm(`Confirm cold storage withdrawal of ${amt} ${curr} to ${dest}?`)) return;

        try {
            const resp = await fetch('/api/admin/vault/withdraw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currency: curr,
                    destination_address: dest,
                    amount: amt,
                    notes: notes
                })
            });
            const data = await resp.json();

            if (resp.ok && data.success) {
                showToast(`Cold sweep successful! TX: ${data.tx_hash}`, 'check');
                document.getElementById('admin-vault-withdraw-form')?.reset();
                loadAdminVault();
            } else {
                showToast(data.error || 'Withdrawal failed', 'error');
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }
    };

    window.runAdminPaymentSync = async function() {
        showToast('Initiating automated payment synchronization...', 'info');
        try {
            const resp = await fetch('/api/admin/payments/sync', { method: 'POST' });
            const data = await resp.json();
            if (resp.ok && data.success) {
                const s = data.sync;
                showToast(`Sync complete! Scanned ${s.scanned_count} orders, cleared ${s.cleared_count} new payments!`, 'check');
                loadAdminOrders();
                loadAdminVault();
            } else {
                showToast(data.error || 'Sync failed', 'error');
            }
        } catch (err) {
            showToast(`Sync error: ${err.message}`, 'error');
        }
    };

    window.verifyOnChainNow = async function() {
        if (!activeOrder || !activeOrder.id) {
            showToast('No active order to verify.', 'warning');
            return;
        }

        showToast('Querying blockchain network for incoming transfer...', 'info');
        try {
            const resp = await fetch(`/api/payment/verify-on-chain/${encodeURIComponent(activeOrder.id)}`, { method: 'POST' });
            const data = await resp.json();

            if (resp.ok && data.verified && data.status === 'approved') {
                showToast('Blockchain transfer confirmed on ledger! Account activated.', 'check');
                activeOrder = data.order;
                handleOrderApproved(data.order);
            } else {
                showToast(data.message || 'Deposit not yet confirmed on network. Monitoring...', 'info');
            }
        } catch (err) {
            showToast(`Network check failed: ${err.message}`, 'error');
        }
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
