// Koko Adventure - Simulated Web3 & Wallet System

const KOKO_TOKEN_ADDRESS = "KoKo111111111111111111111111111111111moon";
const SOL_TO_KOKO_RATE = 2500; // 1 SOL = 2500 KOKO
const MAX_MINED_LIMIT = 100000;

// Application State
window.web3State = {
    connected: false,
    walletAddress: "",
    walletName: "",
    solBalance: 10.00,
    kokoBalance: 0.00,
    minedBalance: 0.00,
    passiveRate: 0.1, // KOKO per second passive
    levelsCompleted: [],
    currentStage: 1,
    upgrades: {
        speed: 1,
        jump: 1,
        maxHp: 3,
        damage: 1,
        hashrate: 1,
        magnet: 1
    }
};

// Initial state load
function loadWeb3State() {
    const saved = localStorage.getItem('koko_adventure_state');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            window.web3State = { ...window.web3State, ...parsed };
        } catch (e) {
            console.error("Error loading web3 state:", e);
        }
    }
    updatePassiveRate();
    syncUI();
}

// Save state helper
function saveWeb3State() {
    localStorage.setItem('koko_adventure_state', JSON.stringify(window.web3State));
}

// Calculate passive mining rate based on level progression & upgrades
function updatePassiveRate() {
    let rate = 0.1; // Base rate
    const cleared = window.web3State.levelsCompleted || [];
    
    // Check milestones
    if (cleared.includes(10)) rate += 0.5;
    if (cleared.includes(20)) rate += 1.0;
    if (cleared.includes(40)) rate += 2.0;
    if (cleared.includes(50)) rate += 5.0;
    if (cleared.includes(75)) rate += 10.0;
    if (cleared.includes(100)) rate += 25.0;

    // Upgrades hashrate bonus
    const upg = window.web3State.upgrades || {};
    if (upg.hashrate > 1) {
        rate += (upg.hashrate - 1) * 2.0;
    }
    
    window.web3State.passiveRate = rate;
    
    // Update dashboard labels
    const rateEl = document.getElementById('mining-rate-val');
    if (rateEl) rateEl.textContent = rate.toFixed(1);

    // Update booster styling
    const milestones = [10, 20, 40, 50];
    milestones.forEach(m => {
        const el = document.getElementById(`booster-${m}`);
        if (el) {
            if (cleared.includes(m)) {
                el.textContent = "Unlocked";
                el.className = "booster-status unlocked";
            } else {
                el.textContent = "Locked";
                el.className = "booster-status locked";
            }
        }
    });
}

// Sync values to DOM elements
function syncUI() {
    // Wallet buttons
    const connectBtn = document.getElementById('connect-wallet-btn');
    const statusText = document.getElementById('wallet-status-text');
    if (connectBtn && statusText) {
        if (window.web3State.connected) {
            connectBtn.classList.add('connected');
            const addr = window.web3State.walletAddress;
            statusText.textContent = `${addr.slice(0, 4)}...${addr.slice(-4)}`;
        } else {
            connectBtn.classList.remove('connected');
            statusText.textContent = "Connect Wallet";
        }
    }

    // Balances
    const solDisplay = document.getElementById('sol-balance-display');
    const kokoDisplay = document.getElementById('koko-balance-display');
    if (solDisplay) solDisplay.textContent = window.web3State.solBalance.toFixed(2);
    if (kokoDisplay) kokoDisplay.textContent = window.web3State.kokoBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

    // Mined Balance and Progress
    const minedDisplay = document.getElementById('dashboard-mined-balance');
    const minedCounter = document.getElementById('mined-counter');
    if (minedDisplay) minedDisplay.textContent = window.web3State.minedBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    if (minedCounter) minedCounter.textContent = Math.floor(window.web3State.minedBalance).toLocaleString();

    // Progress Bar
    const progressPercent = Math.min((window.web3State.minedBalance / MAX_MINED_LIMIT) * 100, 100);
    const progressPercentageEl = document.getElementById('progress-percentage');
    const progressBarInnerEl = document.getElementById('progress-bar-inner');
    if (progressPercentageEl) progressPercentageEl.textContent = `${progressPercent.toFixed(1)}%`;
    if (progressBarInnerEl) progressBarInnerEl.style.width = `${progressPercent}%`;

    // Action button states
    const claimBtn = document.getElementById('claim-to-wallet-btn');
    const swapBtn = document.getElementById('execute-swap-btn');
    
    if (claimBtn) {
        if (!window.web3State.connected) {
            claimBtn.disabled = true;
            claimBtn.textContent = "Connect Wallet to Claim $KOKO";
        } else if (window.web3State.minedBalance <= 0) {
            claimBtn.disabled = true;
            claimBtn.textContent = "No Mined $KOKO to Claim";
        } else {
            claimBtn.disabled = false;
            claimBtn.textContent = `Claim ${Math.floor(window.web3State.minedBalance).toLocaleString()} $KOKO`;
        }
    }

    if (swapBtn) {
        if (!window.web3State.connected) {
            swapBtn.disabled = true;
            swapBtn.textContent = "Connect Wallet to Swap";
        } else {
            swapBtn.disabled = false;
            swapBtn.textContent = "Swap SOL to KOKO";
        }
    }

    // Sync Upgrade Shop UI
    const upg = window.web3State.upgrades || {};
    const totalAvailableKoko = window.web3State.minedBalance + window.web3State.kokoBalance;

    const upgradeConfigs = {
        speed: { max: 5, baseCost: 500, mult: 1.8 },
        jump: { max: 5, baseCost: 500, mult: 1.8 },
        maxHp: { max: 6, baseCost: 1000, mult: 2.2, minLvl: 3 },
        damage: { max: 5, baseCost: 750, mult: 2.0 },
        hashrate: { max: 10, baseCost: 1200, mult: 2.2 },
        magnet: { max: 5, baseCost: 600, mult: 1.8 }
    };

    Object.keys(upgradeConfigs).forEach(type => {
        const cfg = upgradeConfigs[type];
        const curLvl = upg[type] || (type === 'maxHp' ? 3 : 1);
        const cost = Math.floor(cfg.baseCost * Math.pow(cfg.mult, curLvl - (cfg.minLvl || 1)));
        
        const lvlEl = document.getElementById(`upg-${type}-lvl`);
        const costEl = document.getElementById(`cost-${type}`);
        const btn = document.getElementById(`buy-upg-${type}`);

        if (lvlEl) lvlEl.textContent = curLvl;
        if (costEl) costEl.textContent = curLvl >= cfg.max ? "MAX LEVEL" : `${cost.toLocaleString()} $KOKO`;
        
        if (btn) {
            if (curLvl >= cfg.max) {
                btn.disabled = true;
            } else if (totalAvailableKoko < cost) {
                btn.disabled = true;
            } else {
                btn.disabled = false;
            }
        }
    });
}

// Show Tx Modal simulation
function simulateTransaction(title, desc, durationMs, onSuccess) {
    const overlay = document.getElementById('tx-modal-overlay');
    const txTitle = document.getElementById('tx-title');
    const txDesc = document.getElementById('tx-desc');
    const detailsBox = document.getElementById('tx-details-box');
    const txSig = document.getElementById('tx-sig');
    const txStatus = document.getElementById('tx-status');

    if (!overlay) return;

    txTitle.textContent = title;
    txDesc.textContent = desc;
    detailsBox.style.display = "none";
    overlay.classList.add('active');

    // Step 1: Wallet Signature Prompt (simulated)
    setTimeout(() => {
        txDesc.textContent = "Confirming transaction on Solana ledger...";
        detailsBox.style.display = "flex";
        
        // Generate random simulated tx signature
        const randHex = Array.from({length: 32}, () => Math.floor(Math.random()*16).toString(16)).join('');
        txSig.textContent = `tx_${randHex.slice(0, 8)}...${randHex.slice(-8)}`;
        txStatus.textContent = "Confirming...";
        txStatus.className = "text-warning";

        // Step 2: Confirmation
        setTimeout(() => {
            txStatus.textContent = "Success";
            txStatus.className = "text-success";
            txDesc.textContent = "Transaction successfully finalized!";
            
            setTimeout(() => {
                overlay.classList.remove('active');
                if (onSuccess) onSuccess();
            }, 1000);
        }, durationMs - 1200);

    }, 1000);
}

// Passive Mining loop
setInterval(() => {
    if (window.web3State.minedBalance < MAX_MINED_LIMIT) {
        window.web3State.minedBalance = Math.min(
            window.web3State.minedBalance + window.web3State.passiveRate,
            MAX_MINED_LIMIT
        );
        
        // Update values in DOM without full syncUI refresh to prevent inputs focus issues
        const minedDisplay = document.getElementById('dashboard-mined-balance');
        const minedCounter = document.getElementById('mined-counter');
        if (minedDisplay) minedDisplay.textContent = window.web3State.minedBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        if (minedCounter) minedCounter.textContent = Math.floor(window.web3State.minedBalance).toLocaleString();

        const progressPercent = Math.min((window.web3State.minedBalance / MAX_MINED_LIMIT) * 100, 100);
        const progressPercentageEl = document.getElementById('progress-percentage');
        const progressBarInnerEl = document.getElementById('progress-bar-inner');
        if (progressPercentageEl) progressPercentageEl.textContent = `${progressPercent.toFixed(1)}%`;
        if (progressBarInnerEl) progressBarInnerEl.style.width = `${progressPercent}%`;
        
        // Update Claim Button label
        const claimBtn = document.getElementById('claim-to-wallet-btn');
        if (claimBtn && window.web3State.connected && window.web3State.minedBalance > 0) {
            claimBtn.disabled = false;
            claimBtn.textContent = `Claim ${Math.floor(window.web3State.minedBalance).toLocaleString()} $KOKO`;
        }

        saveWeb3State();
    }
}, 1000);

// Set up UI Interaction Listeners
document.addEventListener("DOMContentLoaded", () => {
    loadWeb3State();

    // Tab Switching Logic
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            
            navButtons.forEach(b => b.classList.remove('active'));
            tabPanels.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(target).classList.add('active');
        });
    });

    // Wallet Modal Logic
    const walletOverlay = document.getElementById('wallet-modal-overlay');
    const connectBtn = document.getElementById('connect-wallet-btn');
    const closeWalletBtn = document.getElementById('close-wallet-modal');

    connectBtn.addEventListener('click', () => {
        if (window.web3State.connected) {
            // Disconnect wallet
            window.web3State.connected = false;
            window.web3State.walletAddress = "";
            window.web3State.walletName = "";
            saveWeb3State();
            syncUI();
        } else {
            // Open selection modal
            walletOverlay.classList.add('active');
        }
    });

    closeWalletBtn.addEventListener('click', () => {
        walletOverlay.classList.remove('active');
    });

    // Handle Wallet Options Click
    const walletOptions = document.querySelectorAll('.wallet-option-btn');
    walletOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            const name = opt.getAttribute('data-wallet');
            walletOverlay.classList.remove('active');
            
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

            // Handle Mobile Deep Linking for Phantom
            if (isMobile && name === 'Phantom' && !(window.solana && window.solana.isPhantom)) {
                const cleanUrl = window.location.href.split('?')[0]; // Remove cache version params
                const appUrl = encodeURIComponent(cleanUrl);
                window.location.href = `https://phantom.app/ul/browse/${appUrl}?ref=${appUrl}`;
                return;
            }

            // Try connecting to real Phantom or Solflare if installed
            if (name === 'Phantom' && window.solana && window.solana.isPhantom) {
                window.solana.connect()
                    .then(resp => {
                        const pk = resp.publicKey.toString();
                        window.web3State.connected = true;
                        window.web3State.walletName = "Phantom";
                        window.web3State.walletAddress = pk;
                        saveWeb3State();
                        syncUI();
                    })
                    .catch(err => {
                        console.warn("Real Phantom wallet connection rejected, falling back to simulation.", err);
                        runWalletSimulation(name);
                    });
            } else if (name === 'Solflare' && window.solflare) {
                window.solflare.connect()
                    .then(() => {
                        const pk = window.solflare.publicKey.toString();
                        window.web3State.connected = true;
                        window.web3State.walletName = "Solflare";
                        window.web3State.walletAddress = pk;
                        saveWeb3State();
                        syncUI();
                    })
                    .catch(err => {
                        console.warn("Real Solflare wallet connection rejected, falling back to simulation.", err);
                        runWalletSimulation(name);
                    });
            } else {
                // Fallback to simulation
                runWalletSimulation(name);
            }
        });
    });

    function runWalletSimulation(name) {
        simulateTransaction(`Connecting to ${name}`, `Awaiting authorization approval...`, 2000, () => {
            window.web3State.connected = true;
            window.web3State.walletName = name;
            
            // Generate simulated public key
            const characters = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
            let pk = 'KoKo';
            for(let i=0; i<36; i++) {
                pk += characters.charAt(Math.floor(Math.random() * characters.length));
            }
            window.web3State.walletAddress = pk;
            saveWeb3State();
            syncUI();
        });
    }

    // Claim Mined Coins
    const claimBtn = document.getElementById('claim-to-wallet-btn');
    if (claimBtn) {
        claimBtn.addEventListener('click', () => {
            if (!window.web3State.connected || window.web3State.minedBalance <= 0) return;
            const amountToClaim = Math.floor(window.web3State.minedBalance);
            
            simulateTransaction(
                "Claiming Mined $KOKO",
                `Transferring ${amountToClaim.toLocaleString()} $KOKO tokens to your Solana wallet. Gas fee: 0.002 SOL`,
                3500,
                () => {
                    // Update balances
                    window.web3State.solBalance -= 0.002; // Deduct gas
                    window.web3State.kokoBalance += amountToClaim; // Add KOKO
                    window.web3State.minedBalance -= amountToClaim; // Clear claimed
                    saveWeb3State();
                    syncUI();
                }
            );
        });
    }

    // Victory screen claim btn
    const victoryClaimBtn = document.getElementById('victory-claim-btn');
    if (victoryClaimBtn) {
        victoryClaimBtn.addEventListener('click', () => {
            if (!window.web3State.connected) {
                // Open wallet modal
                walletOverlay.classList.add('active');
                return;
            }
            simulateTransaction(
                "Claiming 100,000 $KOKO Prize",
                "Claiming level completion jackpot of 100,000 $KOKO! Gas fee: 0.005 SOL",
                4000,
                () => {
                    window.web3State.solBalance -= 0.005;
                    window.web3State.kokoBalance += 100000;
                    saveWeb3State();
                    syncUI();
                    alert("100,000 $KOKO successfully transferred to your Solana Wallet!");
                    document.getElementById('victory-screen').classList.remove('active');
                }
            );
        });
    }

    // Token Swap Logic
    const swapPayInput = document.getElementById('swap-pay-amount');
    const swapReceiveInput = document.getElementById('swap-receive-amount');
    const executeSwapBtn = document.getElementById('execute-swap-btn');

    if (swapPayInput && swapReceiveInput) {
        swapPayInput.addEventListener('input', () => {
            const payVal = parseFloat(swapPayInput.value) || 0;
            if (payVal > 0) {
                swapReceiveInput.value = (payVal * SOL_TO_KOKO_RATE).toFixed(2);
            } else {
                swapReceiveInput.value = "";
            }
        });
    }

    if (executeSwapBtn) {
        executeSwapBtn.addEventListener('click', () => {
            const payAmount = parseFloat(swapPayInput.value) || 0;
            if (!window.web3State.connected || payAmount <= 0) return;

            if (payAmount > window.web3State.solBalance) {
                alert("Insufficient Solana ($SOL) Balance!");
                return;
            }

            const receiveAmount = payAmount * SOL_TO_KOKO_RATE;

            simulateTransaction(
                "Swapping on Moonshot Pool",
                `Exchanging ${payAmount} SOL for ${receiveAmount.toLocaleString()} KOKO...`,
                3500,
                () => {
                    window.web3State.solBalance -= payAmount;
                    window.web3State.kokoBalance += receiveAmount;
                    swapPayInput.value = "";
                    swapReceiveInput.value = "";
                    saveWeb3State();
                    syncUI();
                }
            );
        });
    }

    // Copy Token Address
    const copyAddressBtn = document.getElementById('copy-address-btn');
    if (copyAddressBtn) {
        copyAddressBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(KOKO_TOKEN_ADDRESS)
                .then(() => {
                    alert("Koko Token Contract Address copied to clipboard!\n" + KOKO_TOKEN_ADDRESS);
                })
                .catch(err => {
                    console.error("Could not copy text: ", err);
                });
    // Setup Upgrades Shop event listeners
    const upgradeButtons = document.querySelectorAll('.upgrade-buy-btn');
    upgradeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-upgrade');
            if (!type) return;

            const upg = window.web3State.upgrades || {};
            const curLvl = upg[type] || (type === 'maxHp' ? 3 : 1);
            
            const upgradeConfigs = {
                speed: { max: 5, baseCost: 500, mult: 1.8 },
                jump: { max: 5, baseCost: 500, mult: 1.8 },
                maxHp: { max: 6, baseCost: 1000, mult: 2.2, minLvl: 3 },
                damage: { max: 5, baseCost: 750, mult: 2.0 },
                hashrate: { max: 10, baseCost: 1200, mult: 2.2 },
                magnet: { max: 5, baseCost: 600, mult: 1.8 }
            };

            const cfg = upgradeConfigs[type];
            if (!cfg || curLvl >= cfg.max) return;

            const cost = Math.floor(cfg.baseCost * Math.pow(cfg.mult, curLvl - (cfg.minLvl || 1)));
            const totalAvailable = window.web3State.minedBalance + window.web3State.kokoBalance;
            if (totalAvailable < cost) return;

            // Deduct cost from mined balance first, then koko balance
            if (window.web3State.minedBalance >= cost) {
                window.web3State.minedBalance -= cost;
            } else {
                const remainder = cost - window.web3State.minedBalance;
                window.web3State.minedBalance = 0;
                window.web3State.kokoBalance -= remainder;
            }

            // Upgrade level
            if (!window.web3State.upgrades) window.web3State.upgrades = {};
            window.web3State.upgrades[type] = curLvl + 1;
            
            updatePassiveRate();
            saveWeb3State();
            syncUI();

            // Flash effect
            btn.style.transform = "scale(1.08)";
            setTimeout(() => { btn.style.transform = "none"; }, 150);
        });
    });
});

// Attach key functions to window for global access
window.syncUI = syncUI;
window.saveWeb3State = saveWeb3State;
window.updatePassiveRate = updatePassiveRate;
window.simulateTransaction = simulateTransaction;

