
// Helper to generate past dates
function getPastDateString(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
}

// Default constants for fresh setups and fallback data
const DEFAULT_CATEGORIES = ["Shirts", "T-shirts", "Jeans", "Jackets", "Dresses", "Other"];

const DEFAULT_INVENTORY = [
    { id: "SG-SHIRT-001", name: "Classic White Cotton Shirt", category: "Shirts", size: "L", buyPrice: 450, sellPrice: 999, qty: 15, minAlert: 5 },
    { id: "SG-JEANS-002", name: "Slim Fit Blue Denim Jeans", category: "Jeans", size: "32", buyPrice: 750, sellPrice: 1699, qty: 12, minAlert: 4 },
    { id: "SG-TSHIRT-003", name: "Premium Black Crewneck Tee", category: "T-shirts", size: "M", buyPrice: 250, sellPrice: 599, qty: 25, minAlert: 8 },
    { id: "SG-JACKET-004", name: "Vintage Leather Bomber Jacket", category: "Jackets", size: "XL", buyPrice: 1800, sellPrice: 3999, qty: 5, minAlert: 2 },
    { id: "SG-DRESS-005", name: "Floral Summer A-Line Dress", category: "Dresses", size: "S", buyPrice: 600, sellPrice: 1299, qty: 10, minAlert: 3 }
];

const DEFAULT_SALES = [
    {
        id: "TXN-1782800000000",
        items: [
            { itemId: "SG-SHIRT-001", itemName: "Classic White Cotton Shirt", size: "L", qty: 2, sellPrice: 999, buyPrice: 450 }
        ],
        itemId: "SG-SHIRT-001",
        itemName: "Classic White Cotton Shirt",
        size: "L",
        qty: 2,
        cost: 900,
        revenue: 1998,
        profit: 1098,
        discount: 0,
        discountPct: 0,
        customerName: "Rohan Verma",
        customerPhone: "9876543210",
        timestamp: Date.now() - 86400000 * 2 // 2 days ago
    },
    {
        id: "TXN-1782801000000",
        items: [
            { itemId: "SG-TSHIRT-003", itemName: "Premium Black Crewneck Tee", size: "M", qty: 3, sellPrice: 599, buyPrice: 250 }
        ],
        itemId: "SG-TSHIRT-003",
        itemName: "Premium Black Crewneck Tee",
        size: "M",
        qty: 3,
        cost: 750,
        revenue: 1797,
        profit: 1047,
        discount: 0,
        discountPct: 0,
        customerName: "Anjali Gupta",
        customerPhone: "8765432109",
        timestamp: Date.now() - 86400000 * 1 // 1 day ago
    }
];

const DEFAULT_SUPPLIERS = [
    { id: "SUP-001", name: "Mahavir Textiles Delhi", contact: "9911223344", amount: 15000, dueDate: getPastDateString(-5), status: "pending" },
    { id: "SUP-002", name: "Surat Saree & Fabric Hub", contact: "9887766554", amount: 8500, dueDate: getPastDateString(-10), status: "pending" }
];


// ─────────────────────────────────────────────────────────────────────────────
// FIX 10: CLOUD SYNC — JSONBin.io (Free cross-device storage)
// Each user gets their own private bin. Bin ID stored in localStorage.
// Gracefully falls back to localStorage if offline or API fails.
// ─────────────────────────────────────────────────────────────────────────────
const CloudSync = {
    // ── JSONBIN.IO SETUP ─────────────────────────────────────────────────────
    // To enable cross-device sync, get a FREE API key from https://jsonbin.io
    // 1. Sign up free at https://jsonbin.io → Dashboard → API Keys → Create Key
    // 2. Copy your Master Key and paste it below replacing the empty string
    // 3. Cloud sync will activate automatically for all users
    // Leave empty to use localStorage-only mode (still works, just no cross-device sync)
    // ────────────────────────────────────────────────────────────────────────
    MASTER_KEY: '', // <-- Paste your JSONBin.io Master Key here
    BASE_URL: 'https://api.jsonbin.io/v3',

    get _isConfigured() { return this.MASTER_KEY && this.MASTER_KEY.length > 10; },

    _binKey(userId) { return `sm_cloud_bin_${userId}`; },

    getBinId(userId) {
        return localStorage.getItem(this._binKey(userId));
    },

    setBinId(userId, binId) {
        localStorage.setItem(this._binKey(userId), binId);
    },

    // Create a new private bin for a new user
    async createBin(userId, initialData) {
        if (!this._isConfigured) return null;
        try {
            const res = await fetch(`${this.BASE_URL}/b`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': this.MASTER_KEY,
                    'X-Bin-Name': `sm-user-${userId}`,
                    'X-Bin-Private': 'true'
                },
                body: JSON.stringify(initialData)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const binId = json.metadata?.id;
            if (binId) {
                this.setBinId(userId, binId);
                this.updateSyncBadge('synced');
                console.log('[CloudSync] Created new bin:', binId);
            }
            return binId;
        } catch (err) {
            console.warn('[CloudSync] Could not create bin (offline?):', err.message);
            this.updateSyncBadge('offline');
            return null;
        }
    },

    // Load data from cloud bin
    async load(userId) {
        if (!this._isConfigured) { this.updateSyncBadge('offline'); return null; }
        const binId = this.getBinId(userId);
        if (!binId) return null;
        try {
            const res = await fetch(`${this.BASE_URL}/b/${binId}/latest`, {
                headers: { 'X-Master-Key': this.MASTER_KEY }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            this.updateSyncBadge('synced');
            return json.record || null;
        } catch (err) {
            console.warn('[CloudSync] Load failed (offline?):', err.message);
            this.updateSyncBadge('offline');
            return null;
        }
    },

    // Save data to cloud bin (debounced to avoid hammering the API)
    _saveTimer: null,
    save(userId, data) {
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this._doSave(userId, data), 1500);
    },

    async _doSave(userId, data) {
        if (!this._isConfigured) return;
        let binId = this.getBinId(userId);
        if (!binId) {
            binId = await this.createBin(userId, data);
            if (!binId) return;
        }
        try {
            this.updateSyncBadge('syncing');
            const res = await fetch(`${this.BASE_URL}/b/${binId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': this.MASTER_KEY
                },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this.updateSyncBadge('synced');
        } catch (err) {
            console.warn('[CloudSync] Save failed (offline?):', err.message);
            this.updateSyncBadge('offline');
        }
    },

    // Update the sync status badge in the sidebar footer
    updateSyncBadge(status) {
        let badge = document.getElementById('cloud-sync-badge');
        if (!badge) return;

        if (window.CloudDbSync) {
            badge.style.display = 'none';
            return;
        }

        const icons = { synced: '\u2601\uFE0F', syncing: '\uD83D\uDD04', offline: '\u26A0\uFE0F' };
        const labels = { synced: 'Synced', syncing: 'Syncing...', offline: this._isConfigured ? 'Offline' : 'Local Only' };
        const colors = { synced: '#10b981', syncing: '#f59e0b', offline: this._isConfigured ? '#ef4444' : '#64748b' };

        badge.innerHTML = `<span style="font-size:11px;color:${colors[status]};font-weight:600;">${icons[status]} ${labels[status]}</span>`;
    }
};
window.CloudSync = CloudSync;

// ─────────────────────────────────────────────────────────────────────────────
// CLOUD SYNC SERVICE (PostgreSQL / Neon DB)
// Performs status indicator updating for backend database connections.
// ─────────────────────────────────────────────────────────────────────────────
const CloudDbSync = {
    updateSyncBadge(status) {
        let badge = document.getElementById('supabase-sync-badge');
        if (!badge) return;

        const icons = { synced: '🟢', syncing: '🟡', offline: '🔴' };
        const labels = { synced: 'Cloud Synced', syncing: 'Syncing...', offline: 'Cloud Offline' };
        const colors = { synced: '#10b981', syncing: '#f59e0b', offline: '#ef4444' };

        badge.innerHTML = `<span style="font-size:11px;color:${colors[status]};font-weight:600;">${icons[status]} ${labels[status]}</span>`;
    }
};
window.CloudDbSync = CloudDbSync;


// --- APP STATE MANAGER ---
class ShowroomApp {
    constructor() {
        this.activeBillItems = [];
        this.html5Qrcode = null;
        // Set defaults immediately so DOM init doesn't crash
        this.inventory = [];
        this.sales = [];
        this.categories = [...DEFAULT_CATEGORIES];
        this.suppliers = [];
        this.upiId = ""; // Fix 7: No hardcoded personal UPI
        this.initDOM();
        const cloudSyncBadge = document.getElementById('cloud-sync-badge');
        if (cloudSyncBadge) cloudSyncBadge.style.display = 'none';
        this.initCharts();
        this.bindEvents();
        // Load data from localStorage, then render
        this.loadStateFromStorage();
        if (window.CloudDbSync) {
            window.CloudDbSync.updateSyncBadge('offline');
        }
    }

    // --- LOCAL STORAGE (per-user data isolation) ---
    // Uses 'sm_data_{userId}' key when user is logged in,
    // falls back to legacy 'sanyamGarmentsData' key.
    _dataKey() {
        return window._currentUserDataKey || 'sanyamGarmentsData';
    }

    async loadStateFromStorage() {
        try {
            let data = {};
            const localKey = this._dataKey();
            const raw = localStorage.getItem(localKey);
            if (raw) {
                data = JSON.parse(raw);
            }
 
            const user = window.Session ? Session.get() : null;
            const userId = user ? user.id : 'default';
 
            if (user) {
                if (window.CloudDbSync) window.CloudDbSync.updateSyncBadge('syncing');
                try {
                    const res = await fetch(`/api/data?userId=${userId}`);
                    if (res.ok) {
                        const serverData = await res.json();
                        if (serverData && (serverData.inventory || serverData.sales)) {
                            data = serverData;
                            localStorage.setItem(localKey, JSON.stringify(data));
                            
                            // Save profile if it exists
                            if (serverData.profile) {
                                localStorage.setItem(`sm_shop_${userId}`, JSON.stringify(serverData.profile));
                                if (window.AuthUI) AuthUI.updateAppWithUserInfo();
                            }
                            if (window.CloudDbSync) window.CloudDbSync.updateSyncBadge('synced');
                        }
                    }
                } catch (err) {
                    console.log('[CloudDbSync] Backend load fallback to local storage:', err.message);
                    if (window.CloudDbSync) window.CloudDbSync.updateSyncBadge('offline');
                }
            }
 
            // For a new user (fresh account), don't load demo data - start empty
            const isNewUser = window._currentUserDataKey && !raw && (!data.inventory || data.inventory.length === 0);
 
            this.inventory = (data.inventory && data.inventory.length > 0)
                ? data.inventory : (isNewUser ? [] : [...DEFAULT_INVENTORY]);
            this.sales = (data.sales && data.sales.length > 0)
                ? data.sales : (isNewUser ? [] : [...DEFAULT_SALES]);
            this.categories = (data.categories && data.categories.length > 0)
                ? data.categories : [...DEFAULT_CATEGORIES];
            this.suppliers = (data.suppliers && data.suppliers.length > 0)
                ? data.suppliers : (isNewUser ? [] : [...DEFAULT_SUPPLIERS]);
            this.upiId = data.upiId || '';
 
            this.renderAll();
            if (!isNewUser) this.showNotification('✅ Data loaded successfully!');
        } catch (e) {
            this.inventory = [...DEFAULT_INVENTORY];
            this.sales = [...DEFAULT_SALES];
            this.categories = [...DEFAULT_CATEGORIES];
            this.suppliers = [];
            this.renderAll();
        }
    }
 
    saveAllData() {
        const data = {
            inventory: this.inventory,
            sales: this.sales,
            categories: this.categories,
            suppliers: this.suppliers,
            upiId: this.upiId
        };
        try {
            localStorage.setItem(this._dataKey(), JSON.stringify(data));
        } catch (e) {
            console.warn('Could not save data to localStorage.');
        }
 
        const user = window.Session ? Session.get() : null;
        const userId = user ? user.id : 'default';
 
        if (user) {
            if (window.CloudDbSync) window.CloudDbSync.updateSyncBadge('syncing');
            fetch(`/api/data?userId=${userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })
            .then(res => {
                if (res.ok) {
                    if (window.CloudDbSync) window.CloudDbSync.updateSyncBadge('synced');
                } else {
                    if (window.CloudDbSync) window.CloudDbSync.updateSyncBadge('offline');
                }
            })
            .catch(err => {
                console.warn('[Server Sync] Save failed:', err.message);
                if (window.CloudDbSync) window.CloudDbSync.updateSyncBadge('offline');
            });
        }
    }

    saveInventory() { this.saveAllData(); }
    saveSales() { this.saveAllData(); }
    saveCategories() { this.saveAllData(); }
    saveSuppliers() { this.saveAllData(); }

    loadUPI() {
        // UPI is loaded from localStorage via loadStateFromStorage()
    }

    saveUPI(upiId) {
        this.upiId = upiId;
        this.saveAllData();
    }

    resetDatabase() {
        if (confirm("Are you sure you want to restore original clothing logs and wipe custom entries?")) {
            this.inventory = [...DEFAULT_INVENTORY];
            this.sales = [...DEFAULT_SALES];
            this.categories = [...DEFAULT_CATEGORIES];
            this.suppliers = [];
            this.saveAllData();
            this.renderAll();
            this.updateCharts();
            this.showNotification("Database reset to demo state successfully.");
        }
    }

    // --- DOM ELEMENT REFERENCES ---
    initDOM() {
        // Tab Nav
        this.menuItems = document.querySelectorAll(".menu-item");
        this.tabContents = document.querySelectorAll(".tab-content");
        this.pageTitle = document.getElementById("header-page-title");
        this.pageSubtitle = document.getElementById("header-page-subtitle");

        // Dashboard Stats
        this.statEarnings = document.getElementById("stat-earnings");
        this.statNetProfit = document.getElementById("stat-net-profit");
        this.statSalesQty = document.getElementById("stat-sales-qty");
        this.statStockQty = document.getElementById("stat-stock-qty");
        this.statInventoryVal = document.getElementById("stat-inventory-val");
        this.statLowStockCount = document.getElementById("stat-low-stock-count");
        this.recentActivityList = document.getElementById("recent-activity-list");

        // Inventory Controls & Table
        this.inventorySearch = document.getElementById("inventory-search");
        this.filterCategory = document.getElementById("filter-category");
        this.filterStock = document.getElementById("filter-stock");
        this.inventoryTbody = document.getElementById("inventory-tbody");

        // Sales Log Table & Lifetime
        this.salesTbody = document.getElementById("sales-tbody");
        this.lifetimeProfit = document.getElementById("lifetime-profit");

        // Alerts Table
        this.alertsTbody = document.getElementById("alerts-tbody");

        // Suppliers Elements
        this.supplierSearch = document.getElementById("supplier-search");
        this.filterSupplierStatus = document.getElementById("filter-supplier-status");
        this.supplierTbody = document.getElementById("supplier-tbody");
        this.statTotalPayables = document.getElementById("stat-total-payables");
        this.statPendingInvoices = document.getElementById("stat-pending-invoices");
        this.supplierModal = document.getElementById("supplier-modal-overlay");
        this.supplierForm = document.getElementById("supplier-form");
        this.editSupplierId = document.getElementById("edit-supplier-id");
        this.supplierNameInput = document.getElementById("supplier-name");
        this.supplierContactInput = document.getElementById("supplier-contact");
        this.supplierAmountInput = document.getElementById("supplier-amount");
        this.supplierDueDateInput = document.getElementById("supplier-due-date");
        this.supplierStatusInput = document.getElementById("supplier-status");
        this.supplierModalTitle = document.getElementById("supplier-modal-title");

        // Settings Elements
        this.categoryForm = document.getElementById("category-form");
        this.newCategoryNameInput = document.getElementById("new-category-name");
        this.categoryListContainer = document.getElementById("category-list-container");
        this.settingsUpiIdInput = document.getElementById("settings-upi-id");
        this.upiSettingsForm = document.getElementById("upi-settings-form");

        // Item Modal Elements
        this.itemModal = document.getElementById("item-modal-overlay");
        this.itemForm = document.getElementById("item-form");
        this.itemModalTitle = document.getElementById("item-modal-title");
        this.editItemId = document.getElementById("edit-item-id");
        this.itemNameInput = document.getElementById("item-name");
        this.itemCategoryInput = document.getElementById("item-category");
        this.itemSizeInput = document.getElementById("item-size");
        this.itemBuyPriceInput = document.getElementById("item-buy-price");
        this.itemSellPriceInput = document.getElementById("item-sell-price");
        this.itemQtyInput = document.getElementById("item-qty");
        this.itemAlertLimitInput = document.getElementById("item-alert-limit");

        // Sale Modal Elements
        this.saleModal = document.getElementById("sale-modal-overlay");
        this.saleForm = document.getElementById("sale-form");
        this.saleCustNameInput = document.getElementById("sale-cust-name");
        this.saleCustPhoneInput = document.getElementById("sale-cust-phone");
        this.saleItemSelect = document.getElementById("sale-item-select");
        this.saleDiscountInput = document.getElementById("sale-discount");
        this.saleTotalCostText = document.getElementById("sale-total-cost");
        this.saleProfitEstText = document.getElementById("sale-profit-est");

        // Multi-item Scanner Elements
        this.saleBarcodeInput = document.getElementById("sale-barcode-input");
        this.addByBarcodeBtn = document.getElementById("add-by-barcode-btn");
        this.cameraScanToggleBtn = document.getElementById("camera-scan-toggle");
        this.cameraScannerContainer = document.getElementById("camera-scanner-container");
        this.billItemsTbody = document.getElementById("bill-items-tbody");
        this.addManualSelectBtn = document.getElementById("add-manual-select-btn");

        // Invoice Modal Elements
        this.invoiceModal = document.getElementById("invoice-modal-overlay");
        this.invIdText = document.getElementById("inv-id");
        this.invDateText = document.getElementById("inv-date");
        this.invCustNameText = document.getElementById("inv-cust-name");
        this.invCustPhoneText = document.getElementById("inv-cust-phone");
        this.invItemsBody = document.getElementById("inv-items-body");
        this.invSubtotalText = document.getElementById("inv-subtotal");
        this.invDiscountText = document.getElementById("inv-discount");
        this.invGstText = document.getElementById("inv-gst");
        this.invGrandtotalText = document.getElementById("inv-grandtotal");
        this.invUpiIdText = document.getElementById("inv-upi-id-text");
        this.closeInvoiceModalBtn = document.getElementById("close-invoice-modal");
        this.cancelInvoiceModalBtn = document.getElementById("cancel-invoice-modal");

        // Barcode Modal Elements
        this.barcodeModal = document.getElementById("barcode-modal-overlay");
        this.tagNameText = document.getElementById("tag-name");
        this.tagSizeText = document.getElementById("tag-size");
        this.tagPriceText = document.getElementById("tag-price");
        this.closeBarcodeModalBtn = document.getElementById("close-barcode-modal");
        this.cancelBarcodeModalBtn = document.getElementById("cancel-barcode-modal");

        // Manual Barcode Form Elements
        this.manualBarcodeForm = document.getElementById("manual-barcode-form");
        this.manualBarNameInput = document.getElementById("manual-bar-name");
        this.manualBarSkuInput = document.getElementById("manual-bar-sku");
        this.manualBarSizeInput = document.getElementById("manual-bar-size");
        this.manualBarPriceInput = document.getElementById("manual-bar-price");

        // Triggers
        this.quickSellTrigger = document.getElementById("quick-sell-trigger");
        this.addItemTrigger = document.getElementById("add-item-trigger");
        this.addSupplierTrigger = document.getElementById("add-supplier-trigger");
        this.closeItemModalBtn = document.getElementById("close-item-modal");
        this.cancelItemModalBtn = document.getElementById("cancel-item-modal");
        this.closeSaleModalBtn = document.getElementById("close-sale-modal");
        this.cancelSaleModalBtn = document.getElementById("cancel-sale-modal");
        this.closeSupplierModalBtn = document.getElementById("close-supplier-modal");
        this.cancelSupplierModalBtn = document.getElementById("cancel-supplier-modal");

        // Quick Action Cards
        this.actionBtnSale = document.getElementById("action-btn-sale");
        this.actionBtnInventory = document.getElementById("action-btn-inventory");
        this.actionBtnAlerts = document.getElementById("action-btn-alerts");
        this.actionBtnReset = document.getElementById("action-btn-reset");
    }

    // --- TAB NAVIGATION ---
    switchTab(tabId) {
        this.menuItems.forEach(item => {
            if (item.getAttribute("data-tab") === tabId) {
                item.classList.add("active");
            } else {
                item.classList.remove("active");
            }
        });

        this.tabContents.forEach(content => {
            if (content.id === tabId) {
                content.classList.add("active");
            } else {
                content.classList.remove("active");
            }
        });

        const L = window.LangManager;
        switch (tabId) {
            case "dashboard":
                this.pageTitle.innerText = L ? L.t('dashboardTitle') : "Dashboard Overview";
                this.pageSubtitle.innerText = L ? L.t('dashboardSubtitle').replace('{owner}', '').replace('{shop}', '') : "Welcome back! Here's how your showroom is performing today.";
                // Let updateAppWithUserInfo fill proper subtitle with name
                if (window.AuthUI) AuthUI.updateAppWithUserInfo();
                this.updateCharts();
                break;
            case "inventory":
                this.pageTitle.innerText = L ? L.t('tabInventoryTitle') : "Clothes Stock Management";
                this.pageSubtitle.innerText = L ? L.t('tabInventorySubtitle') : "List, sort, search and modify garments cataloged in your store.";
                break;
            case "sales":
                this.pageTitle.innerText = L ? L.t('tabSalesTitle') : "Customer Invoices";
                this.pageSubtitle.innerText = L ? L.t('tabSalesSubtitle') : "Full historical list of client bills and transaction receipts.";
                break;
            case "alerts":
                this.pageTitle.innerText = L ? L.t('tabAlertsTitle') : "Reorder Alerts";
                this.pageSubtitle.innerText = L ? L.t('tabAlertsSubtitle') : "A list of clothes that are low in stock and need replenishment.";
                break;
            case "suppliers":
                this.pageTitle.innerText = L ? L.t('tabSuppliersTitle') : "Suppliers Ledger";
                this.pageSubtitle.innerText = L ? L.t('tabSuppliersSubtitle') : "Track distributor lists, payables, and outstanding settlement due dates.";
                break;
            case "settings":
                this.pageTitle.innerText = L ? L.t('settingsTitle') : "Store Configuration & Settings";
                this.pageSubtitle.innerText = L ? L.t('tabSettingsSubtitle') : "Add custom brands/categories, download CSV reports, and manage database.";
                // Refresh profile form + language grid every time user enters Settings
                if (window.initShopProfileSettings) initShopProfileSettings();
                if (window.initLanguageGrid) initLanguageGrid();
                break;
        }
    }

    // --- CHARTS CONFIGURATION ---
    initCharts() {
        const lineCtx = document.getElementById("earningsChart").getContext("2d");
        this.lineChart = new Chart(lineCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Gross revenue (₹)',
                        data: [],
                        borderColor: '#ec4899',
                        backgroundColor: 'rgba(236, 72, 153, 0.1)',
                        borderWidth: 3,
                        tension: 0.35,
                        fill: true
                    },
                    {
                        label: 'Net profit (₹)',
                        data: [],
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 3,
                        tension: 0.35,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#94a3b8',
                            font: { family: 'Outfit', size: 12 }
                        }
                    }
                },
                scales: {
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
                    }
                }
            }
        });

        const doughnutCtx = document.getElementById("stockDistributionChart").getContext("2d");
        this.doughnutChart = new Chart(doughnutCtx, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        '#6366f1', // Indigo
                        '#ec4899', // Pink
                        '#06b6d4', // Cyan
                        '#f59e0b', // Amber
                        '#10b981', // Emerald
                        '#8b5cf6', // Purple Accent
                        '#14b8a6', // Teal
                        '#f43f5e', // Rose
                        '#64748b'  // Slate / Muted
                    ],
                    borderWidth: 2,
                    borderColor: '#0d1124'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#94a3b8',
                            font: { family: 'Outfit', size: 11 },
                            padding: 10
                        }
                    }
                }
            }
        });
    }

    updateCharts() {
        const labels = [];
        const revenueData = [];
        const profitData = [];

        for (let i = 6; i >= 0; i--) {
            const dateStr = getPastDateString(i);
            const dateObj = new Date(dateStr);
            const labelStr = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            labels.push(labelStr);

            const daySales = this.sales.filter(s => {
                const saleDay = new Date(s.timestamp).toISOString().split('T')[0];
                return saleDay === dateStr;
            });

            const dayRev = daySales.reduce((acc, curr) => acc + curr.revenue, 0);
            const dayProf = daySales.reduce((acc, curr) => acc + curr.profit, 0);

            revenueData.push(dayRev);
            profitData.push(dayProf);
        }

        this.lineChart.data.labels = labels;
        this.lineChart.data.datasets[0].data = revenueData;
        this.lineChart.data.datasets[1].data = profitData;
        this.lineChart.update();

        const categoryCounts = {};
        this.categories.forEach(cat => categoryCounts[cat] = 0);

        this.inventory.forEach(item => {
            const cat = categoryCounts.hasOwnProperty(item.category) ? item.category : 'Other';
            if (!categoryCounts.hasOwnProperty(cat)) {
                categoryCounts[cat] = 0;
            }
            categoryCounts[cat] += item.qty;
        });

        const sortedCats = Object.keys(categoryCounts);
        const dataValues = sortedCats.map(cat => categoryCounts[cat]);

        this.doughnutChart.data.labels = sortedCats;
        this.doughnutChart.data.datasets[0].data = dataValues;
        this.doughnutChart.update();
    }

    // --- MAIN RENDER ROUTINE ---
    renderAll() {
        this.populateCategoryDropdowns();
        this.renderDashboardStats();
        this.renderInventoryTable();
        this.renderSalesTable();
        this.renderAlertsTable();
        this.renderSuppliers();
        this.renderCategoryList();
        this.populateSaleDropdown();
        this.updateCharts();

        if (this.settingsUpiIdInput) {
            this.settingsUpiIdInput.value = this.upiId;
        }

        if (window.lucide) {
            lucide.createIcons();
        }
    }

    populateCategoryDropdowns() {
        const filterVal = this.filterCategory.value;
        const itemVal = this.itemCategoryInput.value;

        this.filterCategory.innerHTML = `<option value="all">All Categories</option>` +
            this.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        this.filterCategory.value = filterVal || 'all';

        this.itemCategoryInput.innerHTML = this.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        this.itemCategoryInput.value = itemVal || this.categories[0];
    }

    renderDashboardStats() {
        const startOfToday = new Date().setHours(0, 0, 0, 0);
        const todaySales = this.sales.filter(s => s.timestamp >= startOfToday);

        const todayRevenue = todaySales.reduce((acc, curr) => acc + curr.revenue, 0);
        const todayProfit = todaySales.reduce((acc, curr) => acc + curr.profit, 0);
        const todayQty = todaySales.reduce((acc, curr) => acc + curr.qty, 0);

        const totalStockQty = this.inventory.reduce((acc, curr) => acc + curr.qty, 0);
        const totalInventoryVal = this.inventory.reduce((acc, curr) => acc + (curr.qty * curr.buyPrice), 0);
        const lowStockItems = this.inventory.filter(item => item.qty <= item.minAlert);

        this.statEarnings.innerText = `₹${todayRevenue.toLocaleString('en-IN')}`;
        this.statNetProfit.innerText = `₹${todayProfit.toLocaleString('en-IN')}`;
        this.statSalesQty.innerText = todayQty;
        this.statStockQty.innerText = totalStockQty;
        this.statInventoryVal.innerText = `₹${totalInventoryVal.toLocaleString('en-IN')}`;
        this.statLowStockCount.innerText = lowStockItems.length;

        const sortedSales = [...this.sales].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
        if (sortedSales.length === 0) {
            this.recentActivityList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">${window.LangManager ? LangManager.t('noSalesLogged') : 'No sales logged yet. Click "Create Bill" to start!'}</div>`;
        } else {
            this.recentActivityList.innerHTML = sortedSales.map(s => {
                const elapsed = this.formatRelativeTime(s.timestamp);
                let titleText = `Sold ${s.qty}x <strong>${s.itemName}</strong> (${s.size})`;
                if (s.items && s.items.length > 1) {
                    titleText = `Sold ${s.qty} items: <strong>${s.itemName}</strong> (+${s.items.length - 1} more)`;
                }
                return `
                    <div class="activity-item">
                        <div class="activity-icon sale">
                            <i data-lucide="tag"></i>
                        </div>
                        <div class="activity-details">
                            <div class="activity-title">${titleText}</div>
                            <div class="activity-time">${elapsed}</div>
                        </div>
                        <div class="activity-amount positive">+₹${s.revenue.toLocaleString('en-IN')}</div>
                    </div>
                `;
            }).join('');
        }
    }

    renderInventoryTable() {
        const query = this.inventorySearch.value.toLowerCase();
        const catFilter = this.filterCategory.value;
        const stockFilter = this.filterStock.value;

        const filtered = this.inventory.filter(item => {
            const matchesQuery = item.name.toLowerCase().includes(query) ||
                item.category.toLowerCase().includes(query) ||
                item.size.toLowerCase().includes(query);

            const matchesCat = (catFilter === 'all') || (item.category === catFilter);

            let matchesStock = true;
            if (stockFilter === 'instock') {
                matchesStock = item.qty > item.minAlert;
            } else if (stockFilter === 'low') {
                matchesStock = item.qty <= item.minAlert && item.qty > 0;
            } else if (stockFilter === 'out') {
                matchesStock = item.qty === 0;
            }

            return matchesQuery && matchesCat && matchesStock;
        });

        if (this.inventory.length === 0) {
            this.inventoryTbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 48px; color: var(--text-muted);">
                <div style="margin-bottom:12px;"><i data-lucide="shirt" style="width:40px;height:40px;margin:auto;stroke-width:1.5;color:var(--text-muted);"></i></div>
                <strong>No clothes cataloged yet.</strong><br>
                <span style="font-size:12px;">Start adding stock using the button below.</span><br><br>
                <button class="btn btn-accent" style="margin:auto; display:inline-flex;" onclick="app.openItemModal()"><i data-lucide="plus"></i> Add Your First Clothing Item</button>
            </td></tr>`;
            if (window.lucide) lucide.createIcons();
            return;
        }

        if (filtered.length === 0) {
            this.inventoryTbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 32px; color: var(--text-muted);">No clothing matches found.</td></tr>`;
            return;
        }

        this.inventoryTbody.innerHTML = filtered.map(item => {
            let badgeClass = "badge-success";
            let stockStatus = "In Stock";
            if (item.qty === 0) {
                badgeClass = "badge-danger";
                stockStatus = "Out of Stock";
            } else if (item.qty <= item.minAlert) {
                badgeClass = "badge-warning";
                stockStatus = `Low Stock (${item.qty} left)`;
            }

            const markup = item.sellPrice - item.buyPrice;
            const marginPct = Math.round((markup / item.sellPrice) * 100);

            return `
                <tr>
                    <td>
                        <div style="font-weight: 600; font-size: 15px;">${item.name}</div>
                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">ID: ${item.id}</div>
                    </td>
                    <td><span class="badge badge-indigo">${item.category}</span></td>
                    <td><strong>${item.size}</strong></td>
                    <td>
                        <span class="badge ${badgeClass}">${stockStatus}</span>
                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Min Limit: ${item.minAlert}</div>
                    </td>
                    <td>₹${item.buyPrice.toLocaleString('en-IN')}</td>
                    <td>₹${item.sellPrice.toLocaleString('en-IN')}</td>
                    <td>
                        <span style="color: var(--accent-emerald); font-weight:600;">+₹${markup.toLocaleString('en-IN')}</span>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${marginPct}% profit margin</div>
                    </td>
                    <td>
                        <div class="action-buttons" style="justify-content: flex-end;">
                            <button class="btn-icon" onclick="app.triggerBarcodeItem('${item.id}')" title="Barcode Tag" style="border-color: var(--accent-amber); color: var(--accent-amber);">
                                <i data-lucide="barcode"></i>
                            </button>
                            <button class="btn-icon sell" onclick="app.triggerSellItem('${item.id}')" title="Sell Item">
                                <i data-lucide="shopping-cart"></i>
                            </button>
                            <button class="btn-icon edit" onclick="app.triggerEditItem('${item.id}')" title="Edit Details">
                                <i data-lucide="edit-3"></i>
                            </button>
                            <button class="btn-icon delete" onclick="app.deleteItem('${item.id}')" title="Remove Product">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
    }

    renderSalesTable() {
        const sortedSales = [...this.sales].sort((a, b) => b.timestamp - a.timestamp);
        const lifetimeProfVal = this.sales.reduce((acc, curr) => acc + curr.profit, 0);
        this.lifetimeProfit.innerText = `₹${lifetimeProfVal.toLocaleString('en-IN')}`;

        if (this.sales.length === 0) {
            this.salesTbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 48px; color: var(--text-muted);">
                <div style="margin-bottom:12px;"><i data-lucide="receipt" style="width:40px;height:40px;margin:auto;stroke-width:1.5;color:var(--text-muted);"></i></div>
                <strong>No sales logged yet.</strong><br>
                <span style="font-size:12px;">Log client sales using the "Create Bill" button on top.</span><br><br>
                <button class="btn btn-primary" style="margin:auto; display:inline-flex;" onclick="app.openSaleModal()"><i data-lucide="circle-dollar-sign"></i> Create Your First Bill</button>
            </td></tr>`;
            if (window.lucide) lucide.createIcons();
            return;
        }

        if (sortedSales.length === 0) {
            this.salesTbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">No checkout sales entries recorded yet.</td></tr>`;
            return;
        }

        this.salesTbody.innerHTML = sortedSales.map(s => {
            const dateStr = new Date(s.timestamp).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short'
            });

            let itemDetails = `<span style="font-weight:600;">${s.itemName}</span>`;
            let sizeDetails = `<strong>${s.size}</strong>`;
            if (s.items && s.items.length > 1) {
                itemDetails = `<span style="font-weight:600;">${s.itemName}</span> <small style="color:var(--accent-indigo); font-weight:600;">(+${s.items.length - 1} more)</small>`;
                sizeDetails = `<span style="color:var(--text-muted); font-size:12px;">Mixed</span>`;
            }

            return `
                <tr>
                    <td>
                        <div style="font-size: 13px;">${dateStr}</div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">TX: ${s.id}</div>
                    </td>
                    <td>
                        ${itemDetails}
                        <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
                            Cust: <strong>${s.customerName || 'Cash Customer'}</strong> ${s.customerPhone && s.customerPhone !== 'N/A' ? `(${s.customerPhone})` : ''}
                        </div>
                    </td>
                    <td>${sizeDetails}</td>
                    <td>${s.qty} units</td>
                    <td>₹${s.revenue.toLocaleString('en-IN')}</td>
                    <td><span style="color: var(--accent-emerald); font-weight:600;">₹${s.profit.toLocaleString('en-IN')}</span></td>
                    <td style="text-align: right;">
                        <div style="display:inline-flex; gap:8px; justify-content:flex-end;">
                            <button class="btn btn-secondary" style="padding: 4px 10px; font-size:12px; border-color: var(--accent-cyan); color: var(--accent-cyan);" onclick="app.printInvoice('${s.id}')">
                                <i data-lucide="printer" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Bill
                            </button>
                            <button class="btn btn-secondary btn-danger" style="padding: 4px 10px; font-size:12px;" onclick="app.voidTransaction('${s.id}')">
                                <i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Void
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
    }

    renderAlertsTable() {
        const lowStock = this.inventory.filter(item => item.qty <= item.minAlert);

        if (lowStock.length === 0) {
            this.alertsTbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 48px; color: var(--accent-emerald); font-weight:600;"><i data-lucide="check-circle" style="display:inline-block; vertical-align:middle; margin-right:8px;"></i> All items fully stocked! No alerts.</td></tr>`;
            if (window.lucide) lucide.createIcons();
            return;
        }

        this.alertsTbody.innerHTML = lowStock.map(item => {
            const diff = Math.max(0, (item.minAlert * 2) - item.qty);
            const statusClass = item.qty === 0 ? 'badge-danger' : 'badge-warning';
            const statusText = item.qty === 0 ? 'OUT OF STOCK' : 'LOW STOCK';

            return `
                <tr>
                    <td><span style="font-weight:600;">${item.name}</span></td>
                    <td><span class="badge badge-indigo">${item.category}</span></td>
                    <td><strong>${item.size}</strong></td>
                    <td>
                        <span class="badge ${statusClass}">${statusText} (${item.qty} left)</span>
                    </td>
                    <td><strong>${item.minAlert} units</strong></td>
                    <td><span style="color:var(--accent-amber); font-weight:600;">+${diff} units</span></td>
                    <td style="text-align: right;">
                        <div style="display: inline-flex; align-items: center; gap: 8px;">
                            <input type="number" id="restock-${item.id}" min="1" value="${diff}" class="form-input" style="width:70px; padding: 6px 8px; text-align: center;">
                            <button class="btn btn-primary btn-accent" style="padding: 6px 12px;" onclick="app.restockItem('${item.id}')">
                                <i data-lucide="plus" style="width:14px;height:14px;"></i> Restock
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
    }

    populateSaleDropdown() {
        const inStockItems = this.inventory.filter(item => item.qty > 0);
        this.saleItemSelect.innerHTML = `<option value="">-- Choose Item from Showroom Stock --</option>` +
            inStockItems.map(item => `<option value="${item.id}">${item.name} (${item.size}) - [Stock: ${item.qty}]</option>`).join('');
    }

    // --- SUPPLIERS LEDGER BUSINESS LOGIC ---
    renderSuppliers() {
        const query = this.supplierSearch.value.toLowerCase();
        const statusFilter = this.filterSupplierStatus.value;

        const pendingSuppliers = this.suppliers.filter(s => s.status === 'pending');
        const totalPayables = pendingSuppliers.reduce((acc, curr) => acc + curr.amount, 0);

        this.statTotalPayables.innerText = `₹${totalPayables.toLocaleString('en-IN')}`;
        this.statPendingInvoices.innerText = pendingSuppliers.length;

        const filtered = this.suppliers.filter(s => {
            const matchesQuery = s.name.toLowerCase().includes(query) || s.contact.toLowerCase().includes(query);
            const matchesStatus = (statusFilter === 'all') || (s.status === statusFilter);
            return matchesQuery && matchesStatus;
        });

        if (this.suppliers.length === 0) {
            this.supplierTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 48px; color: var(--text-muted);">
                <div style="margin-bottom:12px;"><i data-lucide="contact-2" style="width:40px;height:40px;margin:auto;stroke-width:1.5;color:var(--text-muted);"></i></div>
                <strong>No supplier contacts logged yet.</strong><br>
                <span style="font-size:12px;">Track payments owed to fabric makers and brands here.</span><br><br>
                <button class="btn btn-accent" style="margin:auto; display:inline-flex;" onclick="app.openSupplierModal()"><i data-lucide="user-plus"></i> Add Your First Supplier Record</button>
            </td></tr>`;
            if (window.lucide) lucide.createIcons();
            return;
        }

        if (filtered.length === 0) {
            this.supplierTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--text-muted);">No suppliers match.</td></tr>`;
            return;
        }

        this.supplierTbody.innerHTML = filtered.map(s => {
            const statusClass = s.status === 'paid' ? 'badge-paid' : 'badge-pending';
            const statusText = s.status === 'paid' ? 'Settled / Paid' : 'Pending Payment';

            const formattedDate = new Date(s.dueDate).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });

            const actionBtn = s.status === 'pending' ?
                `<button class="btn btn-secondary" style="padding: 4px 10px; font-size:12px; border-color:var(--accent-emerald); color:var(--accent-emerald);" onclick="app.settleSupplier('${s.id}')">
                    <i data-lucide="check" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Settle/Pay
                </button>` : '';

            return `
                <tr>
                    <td><div style="font-weight:600; font-size:15px;">${s.name}</div></td>
                    <td><span style="font-size: 13px; color: var(--text-secondary);">${s.contact}</span></td>
                    <td><strong>₹${s.amount.toLocaleString('en-IN')}</strong></td>
                    <td><span style="font-size: 13px;">${formattedDate}</span></td>
                    <td><span class="badge ${statusClass}">${statusText}</span></td>
                    <td>
                        <div class="action-buttons" style="justify-content: flex-end; align-items:center;">
                            ${actionBtn}
                            <button class="btn-icon edit" onclick="app.triggerEditSupplier('${s.id}')" title="Edit Supplier">
                                <i data-lucide="edit-3"></i>
                            </button>
                            <button class="btn-icon delete" onclick="app.deleteSupplier('${s.id}')" title="Delete Entry">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
    }

    openSupplierModal() {
        this.supplierForm.reset();
        this.editSupplierId.value = "";
        this.supplierModalTitle.innerText = "Add Supplier Payment Record";
        this.supplierModal.classList.add("active");
    }

    closeSupplierModal() {
        this.supplierModal.classList.remove("active");
    }

    handleSaveSupplier(e) {
        e.preventDefault();

        const id = this.editSupplierId.value || 's' + Date.now();
        const name = this.supplierNameInput.value.trim();
        const contact = this.supplierContactInput.value.trim();
        const amount = parseFloat(this.supplierAmountInput.value);
        const dueDate = this.supplierDueDateInput.value;
        const status = this.supplierStatusInput.value;

        const idx = this.suppliers.findIndex(s => s.id === id);
        const newSupplier = { id, name, contact, amount, dueDate, status };

        if (idx > -1) {
            this.suppliers[idx] = newSupplier;
            this.showNotification(`Updated distributor record: ${name}`);
        } else {
            this.suppliers.push(newSupplier);
            this.showNotification(`Added supplier invoice: ${name}`);
        }

        this.saveSuppliers();
        this.renderAll();
        this.closeSupplierModal();
    }

    triggerEditSupplier(id) {
        const s = this.suppliers.find(sup => sup.id === id);
        if (!s) return;

        this.editSupplierId.value = s.id;
        this.supplierNameInput.value = s.name;
        this.supplierContactInput.value = s.contact;
        this.supplierAmountInput.value = s.amount;
        this.supplierDueDateInput.value = s.dueDate;
        this.supplierStatusInput.value = s.status;

        this.supplierModalTitle.innerText = "Edit Supplier Details";
        this.supplierModal.classList.add("active");
    }

    settleSupplier(id) {
        const s = this.suppliers.find(sup => sup.id === id);
        if (!s) return;

        if (confirm(`Mark ₹${s.amount.toLocaleString('en-IN')} payable to "${s.name}" as paid?`)) {
            s.status = 'paid';
            this.saveSuppliers();
            this.renderAll();
            this.showNotification(`Payment of ₹${s.amount} to ${s.name} recorded.`);
        }
    }

    deleteSupplier(id) {
        const s = this.suppliers.find(sup => sup.id === id);
        if (!s) return;

        if (confirm(`Remove supplier "${s.name}"? This is permanent.`)) {
            this.suppliers = this.suppliers.filter(sup => sup.id !== id);
            this.saveSuppliers();
            this.renderAll();
            this.showNotification(`Removed supplier: ${s.name}`);
        }
    }

    // --- SETTINGS BRAND & CATEGORIES MANAGER ---
    renderCategoryList() {
        this.categoryListContainer.innerHTML = this.categories.map(cat => {
            const isDefault = ["Shirts", "T-shirts", "Jeans", "Jackets", "Dresses", "Other"].includes(cat);
            const deleteBtn = cat !== 'Other' ?
                `<button class="btn-icon delete" style="border:none; background:none; padding:4px;" onclick="app.deleteCategory('${cat}')" title="Delete Collection">
                    <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                </button>` : '';

            return `
                <div class="category-chip">
                    <span class="category-name">${cat} ${isDefault ? '<small style="color:var(--text-muted); font-weight:normal;">(System)</small>' : ''}</span>
                    ${deleteBtn}
                </div>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
    }

    handleSaveCategory(e) {
        e.preventDefault();
        const catName = this.newCategoryNameInput.value.trim();
        if (!catName) return;

        if (this.categories.some(cat => cat.toLowerCase() === catName.toLowerCase())) {
            alert("This category/brand already exists in your list.");
            return;
        }

        this.categories.push(catName);
        this.saveCategories();
        this.newCategoryNameInput.value = "";
        this.renderAll();
        this.showNotification(`New category added: ${catName}`);
    }

    deleteCategory(catName) {
        if (catName === 'Other') return;

        const itemsUsing = this.inventory.filter(item => item.category === catName);
        if (itemsUsing.length > 0) {
            if (confirm(`Warning: There are ${itemsUsing.length} clothes cataloged under "${catName}". Deleting this category will move those items to "Other". Do you wish to continue?`)) {
                itemsUsing.forEach(item => item.category = 'Other');
                this.saveInventory();
            } else {
                return;
            }
        }

        this.categories = this.categories.filter(cat => cat !== catName);
        this.saveCategories();
        this.renderAll();
        this.showNotification(`Deleted category: ${catName}`);
    }

    handleSaveUpiSettings(e) {
        e.preventDefault();
        const inputVal = this.settingsUpiIdInput.value.trim();
        if (!inputVal) return;

        this.saveUPI(inputVal);

        // Synchronize with the shop profile UPI ID input
        const profileUpiEl = document.getElementById('profile-upi-id');
        if (profileUpiEl) profileUpiEl.value = inputVal;

        // Save to ShopProfile too
        const user = window.Session ? Session.get() : null;
        if (user && window.ShopProfile) {
            const existing = ShopProfile.get(user.id) || {};
            ShopProfile.save(user.id, { ...existing, upiId: inputVal });
        }

        this.renderAll();
        this.showNotification(`UPI ID saved successfully: ${inputVal}`);
    }

    // --- CUSTOMER INVOICES GENERATION ENGINE ---
    printInvoice(id) {
        const trans = this.sales.find(s => s.id === id);
        if (!trans) return;

        this.invIdText.innerText = trans.id.toUpperCase();
        this.invDateText.innerText = new Date(trans.timestamp).toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        this.invCustNameText.innerText = trans.customerName || "Cash Customer";
        this.invCustPhoneText.innerText = trans.customerPhone || "N/A";

        const discountTotal = trans.discount || 0;
        const discountPct = trans.discountPct || 0;
        const finalRevenue = trans.revenue;
        const subtotal = finalRevenue + discountTotal;
        const gstVal = Math.round(finalRevenue * 0.05 * 100) / 100;

        this.invSubtotalText.innerText = `₹${subtotal.toLocaleString('en-IN')}`;
        this.invDiscountText.innerText = discountPct > 0
            ? `-₹${discountTotal.toLocaleString('en-IN')} (${discountPct}%)`
            : `-₹0`;
        this.invGstText.innerText = `₹${gstVal.toLocaleString('en-IN')}`;
        this.invGrandtotalText.innerText = `₹${finalRevenue.toLocaleString('en-IN')}`;

        // Support both multi-item transactions and single-item fallbacks
        const itemsList = trans.items || [
            { itemId: trans.itemId, itemName: trans.itemName, size: trans.size, qty: trans.qty, sellPrice: (trans.revenue + discountTotal) / trans.qty }
        ];

        this.invItemsBody.innerHTML = itemsList.map(item => {
            const itemGross = item.sellPrice * item.qty;
            return `
                <tr style="border-bottom: 1px dotted #ccc;">
                    <td style="padding: 8px 0; font-weight:600; text-align: left;">
                        ${item.itemName}
                        <div style="font-size: 10px; color: #666; font-weight: normal; margin-top:2px;">ID: ${item.itemId}</div>
                    </td>
                    <td style="text-align: center; padding: 8px 0;">${item.size}</td>
                    <td style="text-align: center; padding: 8px 0;">${item.qty}</td>
                    <td style="text-align: right; padding: 8px 0;">₹${itemGross.toLocaleString('en-IN')}</td>
                </tr>
            `;
        }).join('');

        // Populate custom shop profile details at the top of the invoice
        const user = window.Session ? Session.get() : null;
        const profile = user ? (window.ShopProfile ? ShopProfile.get(user.id) : null) : null;
        const shopName = profile ? profile.shopName : "Showroom Manager";
        const shopAddress = profile ? profile.shopAddress : "";
        const shopPhone = profile ? profile.shopPhone : "";

        const billName = document.getElementById('inv-shop-name');
        const billAddr = document.getElementById('inv-shop-address');
        const billPhone = document.getElementById('inv-shop-phone');

        if (billName) billName.textContent = shopName.toUpperCase();
        if (billAddr) billAddr.textContent = shopAddress;
        if (billPhone) billPhone.textContent = shopPhone ? `Owner Mobile: ${shopPhone}` : "";

        // Also update barcode tag shop name
        const tagBrandEls = document.querySelectorAll('#tag-brand-name, .tag-shop-name');
        tagBrandEls.forEach(el => el.textContent = shopName);

        // Generate UPI QR Code dynamically for checkout grand total
        if (this.invUpiIdText) {
            this.invUpiIdText.innerText = this.upiId;
            const payeeName = encodeURIComponent(shopName);
            const upiLink = `upi://pay?pa=${this.upiId}&pn=${payeeName}&am=${finalRevenue.toFixed(2)}&cu=INR`;

            try {
                new QRious({
                    element: document.getElementById('upi-qr-canvas'),
                    value: upiLink,
                    size: 110
                });
            } catch (err) {
                console.error("UPI QR code generation failed", err);
            }
        }

        this.invoiceModal.classList.add("active");
    }

    closeInvoiceModal() {
        this.invoiceModal.classList.remove("active");
    }

    closeInvoiceAndCreateNew() {
        this.closeInvoiceModal();
        this.openSaleModal();
    }

    triggerPrintReceipt() {
        window.print();
        this.closeInvoiceModal();
    }

    // --- BARCODE TAG GENERATOR PIPELINE ---
    triggerBarcodeItem(id) {
        const item = this.inventory.find(i => i.id === id);
        if (!item) return;

        this.tagNameText.innerText = item.name;
        this.tagSizeText.innerText = item.size;
        this.tagPriceText.innerText = `₹${item.sellPrice.toLocaleString('en-IN')}`;

        // Create a unique SKU/Code for the barcode encoding
        const barcodeVal = `${item.id.toUpperCase()}-${item.size}-${item.sellPrice}`;

        try {
            JsBarcode("#barcode-svg", barcodeVal, {
                format: "CODE128",
                width: 1.8,
                height: 40,
                displayValue: true,
                fontSize: 10,
                font: "monospace",
                margin: 0,
                background: "#ffffff",
                lineColor: "#000000"
            });
        } catch (err) {
            console.error("Barcode drawing failed", err);
        }

        this.barcodeModal.classList.add("active");
    }

    handleManualBarcode(e) {
        e.preventDefault();

        const name = this.manualBarNameInput.value.trim();
        const sku = this.manualBarSkuInput.value.trim();
        const size = this.manualBarSizeInput.value.trim();
        const price = parseFloat(this.manualBarPriceInput.value) || 0;

        this.tagNameText.innerText = name;
        this.tagSizeText.innerText = size;
        this.tagPriceText.innerText = `₹${price.toLocaleString('en-IN')}`;

        try {
            JsBarcode("#barcode-svg", sku, {
                format: "CODE128",
                width: 1.8,
                height: 40,
                displayValue: true,
                fontSize: 10,
                font: "monospace",
                margin: 0,
                background: "#ffffff",
                lineColor: "#000000"
            });
        } catch (err) {
            alert("Failed to render barcode. Please check that your custom SKU contains only standard alphanumeric letters or dashes.");
            return;
        }

        this.barcodeModal.classList.add("active");
        this.manualBarcodeForm.reset();
        this.showNotification("Custom barcode tag generated successfully!");
    }

    closeBarcodeModal() {
        this.barcodeModal.classList.remove("active");
    }

    triggerPrintBarcode() {
        window.print();
        this.closeBarcodeModal();
    }

    // --- CSV EXPORT UTILS ---
    exportSalesCSV() {
        if (this.sales.length === 0) {
            alert("No transaction entries available to export.");
            return;
        }

        const headers = ["Timestamp", "Transaction ID", "Garment Name", "Size", "Quantity Sold", "Wholesale Cost", "Retail Price (Revenue)", "Net Profit", "Customer Name", "Customer Phone"];
        const rows = this.sales.map(s => [
            new Date(s.timestamp).toISOString(),
            s.id,
            `"${s.itemName.replace(/"/g, '""')}"`,
            s.size,
            s.qty,
            s.cost,
            s.revenue,
            s.profit,
            s.customerName || "Cash Customer",
            s.customerPhone || "N/A"
        ]);

        const csvContent = "data:text/csv;charset=utf-8,"
            + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        const user = window.Session ? Session.get() : null;
        const profile = user ? (window.ShopProfile ? ShopProfile.get(user.id) : null) : null;
        const shopCleanName = profile ? profile.shopName.replace(/\s+/g, '_') : 'Showroom_Manager';
        link.setAttribute("download", `${shopCleanName}_Sales_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        this.showNotification("CSV sales log exported successfully.");
    }

    // --- EVENT CONTROLLERS ---
    bindEvents() {
        this.menuItems.forEach(item => {
            item.addEventListener("click", () => {
                const tabId = item.getAttribute("data-tab");
                this.switchTab(tabId);
            });
        });

        this.inventorySearch.addEventListener("keyup", () => this.renderInventoryTable());
        this.filterCategory.addEventListener("change", () => this.renderInventoryTable());
        this.filterStock.addEventListener("change", () => this.renderInventoryTable());

        this.supplierSearch.addEventListener("keyup", () => this.renderSuppliers());
        this.filterSupplierStatus.addEventListener("change", () => this.renderSuppliers());

        this.actionBtnSale.addEventListener("click", () => this.openSaleModal());
        this.actionBtnInventory.addEventListener("click", () => this.openItemModal());
        this.actionBtnAlerts.addEventListener("click", () => this.switchTab("alerts"));
        this.actionBtnReset.addEventListener("click", () => this.resetDatabase());

        this.quickSellTrigger.addEventListener("click", () => this.openSaleModal());
        this.addItemTrigger.addEventListener("click", () => this.openItemModal());
        this.addSupplierTrigger.addEventListener("click", () => this.openSupplierModal());

        this.closeItemModalBtn.addEventListener("click", () => this.closeItemModal());
        this.cancelItemModalBtn.addEventListener("click", () => this.closeItemModal());

        this.closeSaleModalBtn.addEventListener("click", () => this.closeSaleModal());
        this.cancelSaleModalBtn.addEventListener("click", () => this.closeSaleModal());

        this.closeSupplierModalBtn.addEventListener("click", () => this.closeSupplierModal());
        this.cancelSupplierModalBtn.addEventListener("click", () => this.closeSupplierModal());

        this.closeInvoiceModalBtn.addEventListener("click", () => this.closeInvoiceModal());
        this.cancelInvoiceModalBtn.addEventListener("click", () => this.closeInvoiceModal());

        this.closeBarcodeModalBtn.addEventListener("click", () => this.closeBarcodeModal());
        this.cancelBarcodeModalBtn.addEventListener("click", () => this.closeBarcodeModal());

        this.itemForm.addEventListener("submit", (e) => this.handleSaveItem(e));
        this.saleForm.addEventListener("submit", (e) => this.handleLogSale(e));
        this.supplierForm.addEventListener("submit", (e) => this.handleSaveSupplier(e));
        this.categoryForm.addEventListener("submit", (e) => this.handleSaveCategory(e));
        this.manualBarcodeForm.addEventListener("submit", (e) => this.handleManualBarcode(e));
        this.upiSettingsForm.addEventListener("submit", (e) => this.handleSaveUpiSettings(e));

        this.saleBarcodeInput.addEventListener("keypress", (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleBarcodeScanSubmit();
            }
        });
        this.addByBarcodeBtn.addEventListener("click", (e) => {
            e.preventDefault();
            this.handleBarcodeScanSubmit();
        });
        this.cameraScanToggleBtn.addEventListener("click", () => this.toggleCameraScanner());
        this.addManualSelectBtn.addEventListener("click", (e) => {
            e.preventDefault();
            this.handleManualSelectAdd();
        });
        this.saleDiscountInput.addEventListener("input", () => this.updateSaleModalCalculation());

        // Fix 9: Mobile hamburger sidebar toggle
        const hamburgerBtn = document.getElementById('hamburger-btn');
        const sidebarEl = document.querySelector('.sidebar');
        const backdropEl = document.getElementById('sidebar-backdrop');

        const openMobileSidebar = () => {
            if (sidebarEl) sidebarEl.classList.add('mobile-open');
            if (backdropEl) backdropEl.classList.add('active');
        };
        const closeMobileSidebar = () => {
            if (sidebarEl) sidebarEl.classList.remove('mobile-open');
            if (backdropEl) backdropEl.classList.remove('active');
        };

        if (hamburgerBtn) hamburgerBtn.addEventListener('click', openMobileSidebar);
        if (backdropEl) backdropEl.addEventListener('click', closeMobileSidebar);

        // Close sidebar when a menu item is clicked on mobile
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', closeMobileSidebar);
        });
    }

    // --- MODAL UTILS ---
    openItemModal() {
        this.itemForm.reset();
        this.editItemId.value = "";
        this.itemModalTitle.innerText = "Add New Clothing Item";
        this.populateCategoryDropdowns();
        this.itemModal.classList.add("active");
    }

    closeItemModal() {
        this.itemModal.classList.remove("active");
    }

    openSaleModal() {
        this.saleForm.reset();
        this.activeBillItems = [];
        this.populateSaleDropdown();
        this.renderBillItemsTable();
        this.updateSaleModalCalculation();

        // Ensure camera scanner is stopped on fresh launch
        this.stopCameraScanner();
        this.cameraScannerContainer.style.display = 'none';

        this.saleModal.classList.add("active");

        // Automatically focus barcode input so keyboard/USB readers can scan instantly
        setTimeout(() => {
            if (this.saleBarcodeInput) {
                this.saleBarcodeInput.focus();
            }
        }, 150);
    }

    closeSaleModal() {
        this.stopCameraScanner();
        this.saleModal.classList.remove("active");
    }

    // Plays a high-quality checkout scan 'beep' sound via Web Audio API
    playScannerBeep() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            oscillator.type = "sine";
            oscillator.frequency.value = 1100; // standard checkout beep pitch

            gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.12);
        } catch (err) {
            console.error("Audio beep synth failed", err);
        }
    }

    // Searches for an item in inventory by its barcode SKU/Code
    findItemByBarcode(barcode) {
        const cleanBarcode = barcode.trim().toUpperCase();
        if (!cleanBarcode) return null;

        // 1. Match item ID directly (case-insensitive)
        let item = this.inventory.find(i => i.id.toUpperCase() === cleanBarcode);
        if (item) return item;

        // 2. Parse tag barcode format ID-SIZE-PRICE (e.g. P1-L-1999)
        const parts = cleanBarcode.split('-');
        if (parts.length >= 1) {
            const possibleId = parts[0];
            item = this.inventory.find(i => i.id.toUpperCase() === possibleId);
            if (item) return item;
        }

        // 3. Fallback: Search name or category for custom settings printed labels
        // Try exact match on a name/code if any
        item = this.inventory.find(i => i.name.toUpperCase().includes(cleanBarcode));
        return item || null;
    }

    // Barcode input box handler (triggered on ENTER key press or Add button click)
    handleBarcodeScanSubmit() {
        const barcode = this.saleBarcodeInput.value.trim();
        this.saleBarcodeInput.value = ''; // clear input immediately to receive next scan
        this.saleBarcodeInput.focus(); // keep focus on field

        if (!barcode) return;

        const item = this.findItemByBarcode(barcode);
        if (!item) {
            alert(`No clothing garment in inventory matches the barcode code: "${barcode}".`);
            return;
        }

        this.addItemToBill(item);
    }

    // Backup manual dropdown add item click handler
    handleManualSelectAdd() {
        const itemId = this.saleItemSelect.value;
        if (!itemId) {
            alert("Please select a garment from the showroom stock list first.");
            return;
        }

        const item = this.inventory.find(i => i.id === itemId);
        // Fix 8: Block out-of-stock items upfront
        if (item) {
            if (item.qty === 0) {
                alert(`"${item.name} (${item.size})" is OUT OF STOCK. Cannot add to bill.`);
                this.saleItemSelect.value = '';
                return;
            }
            this.addItemToBill(item);
            this.saleItemSelect.value = ''; // reset backup select
        }
    }

    // Add item to active checkout list
    addItemToBill(item) {
        const existing = this.activeBillItems.find(i => i.id === item.id);
        const currentQty = existing ? existing.qty : 0;

        if (currentQty >= item.qty) {
            alert(`Cannot check out more of "${item.name} (${item.size})". Only ${item.qty} units are left in showroom inventory.`);
            return;
        }

        if (existing) {
            existing.qty += 1;
        } else {
            this.activeBillItems.push({
                id: item.id,
                name: item.name,
                category: item.category,
                size: item.size,
                sellPrice: item.sellPrice,
                buyPrice: item.buyPrice,
                qty: 1
            });
        }

        this.playScannerBeep();
        this.renderBillItemsTable();
        this.updateSaleModalCalculation();
        this.showNotification(`Added ${item.name} (${item.size}) to bill`);
    }

    // Remove item from active checkout list
    removeItemFromBill(itemId) {
        this.activeBillItems = this.activeBillItems.filter(i => i.id !== itemId);
        this.renderBillItemsTable();
        this.updateSaleModalCalculation();
    }

    // Increase / Decrease quantities inside active checkout list
    changeBillItemQty(itemId, newQty) {
        const item = this.activeBillItems.find(i => i.id === itemId);
        if (!item) return;

        const original = this.inventory.find(i => i.id === itemId);
        if (!original) return;

        if (newQty > original.qty) {
            alert(`Only ${original.qty} units of this item exist in stock.`);
            return;
        }

        if (newQty <= 0) {
            this.removeItemFromBill(itemId);
            return;
        }

        item.qty = newQty;
        this.renderBillItemsTable();
        this.updateSaleModalCalculation();
    }

    // Render active checkout list inside the modal table
    renderBillItemsTable() {
        if (this.activeBillItems.length === 0) {
            this.billItemsTbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">
                        No items scanned yet. Use barcode scanner above.
                    </td>
                </tr>
            `;
            return;
        }

        this.billItemsTbody.innerHTML = this.activeBillItems.map(item => {
            const lineTotal = item.sellPrice * item.qty;
            return `
                <tr>
                    <td style="padding: 10px; font-weight: 500; text-align: left;">
                        <div style="font-weight: 600;">${item.name}</div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top:2px;">ID: ${item.id}</div>
                    </td>
                    <td style="padding: 10px; text-align: center;"><strong>${item.size}</strong></td>
                    <td style="padding: 10px; text-align: right;">₹${item.sellPrice.toLocaleString('en-IN')}</td>
                    <td style="padding: 10px; text-align: center;">
                        <div class="bill-qty-control">
                            <button type="button" class="bill-qty-btn" onclick="app.changeBillItemQty('${item.id}', ${item.qty - 1})">-</button>
                            <span class="bill-qty-val">${item.qty}</span>
                            <button type="button" class="bill-qty-btn" onclick="app.changeBillItemQty('${item.id}', ${item.qty + 1})">+</button>
                        </div>
                    </td>
                    <td style="padding: 10px; text-align: right; font-weight: 600;">₹${lineTotal.toLocaleString('en-IN')}</td>
                    <td style="padding: 10px; text-align: center;">
                        <button type="button" class="btn-icon delete" onclick="app.removeItemFromBill('${item.id}')" title="Remove from Bill" style="width:28px; height:28px; margin: auto;">
                            <i data-lucide="trash-2" style="width:12px; height:12px;"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
    }

    // Calculates and displays dynamic bill calculations
    updateSaleModalCalculation() {
        let grossTotal = 0;
        let totalCostBasis = 0;

        this.activeBillItems.forEach(item => {
            grossTotal += item.sellPrice * item.qty;
            totalCostBasis += item.buyPrice * item.qty;
        });

        const discountPct = Math.min(100, Math.max(0, parseFloat(this.saleDiscountInput.value) || 0));
        const discountAmt = Math.round((grossTotal * discountPct / 100) * 100) / 100;
        const finalCost = Math.max(0, grossTotal - discountAmt);
        const profit = finalCost - totalCostBasis;

        this.saleTotalCostText.innerText = `₹${finalCost.toLocaleString('en-IN')}`;
        let profitText = `Est. Profit: ₹${profit.toLocaleString('en-IN')}`;
        if (discountPct > 0) {
            profitText += ` | Discount: ₹${discountAmt.toLocaleString('en-IN')} (${discountPct}%)`;
        }
        this.saleProfitEstText.innerText = profitText;
    }

    // Camera Barcode Scanning controls
    toggleCameraScanner() {
        if (this.cameraScannerContainer.style.display === 'none') {
            this.startCameraScanner();
        } else {
            this.stopCameraScanner();
        }
    }

    startCameraScanner() {
        this.cameraScannerContainer.style.display = 'block';
        this.cameraScanToggleBtn.innerHTML = `<i data-lucide="camera-off" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> Stop Scanner`;
        if (window.lucide) lucide.createIcons();

        // Start HTML5-QRCode scanner object targeting the viewfinder container
        this.html5Qrcode = new Html5Qrcode("camera-scanner-viewfinder");

        const config = {
            fps: 12,
            qrbox: { width: 260, height: 160 }
        };

        this.html5Qrcode.start(
            { facingMode: "environment" }, // defaults to environmental rear camera
            config,
            (decodedText) => {
                // Success trigger
                const item = this.findItemByBarcode(decodedText);
                if (item) {
                    this.addItemToBill(item);
                } else {
                    this.showNotification(`No item found for barcode scan: ${decodedText}`);
                }
            },
            (error) => {
                // ignore scan cycle errors
            }
        ).catch(err => {
            console.error("Camera launch failed", err);
            alert("Could not load camera. Ensure browser camera permission is allowed.");
            this.stopCameraScanner();
        });
    }

    stopCameraScanner() {
        this.cameraScannerContainer.style.display = 'none';
        this.cameraScanToggleBtn.innerHTML = `<i data-lucide="camera" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> Scan with Camera`;
        if (window.lucide) lucide.createIcons();

        if (this.html5Qrcode) {
            this.html5Qrcode.stop().then(() => {
                this.html5Qrcode = null;
            }).catch(err => {
                console.error("Error shutting down camera scanner", err);
                this.html5Qrcode = null;
            });
        }
    }

    // --- ITEM ACTIONS ---
    handleSaveItem(e) {
        e.preventDefault();

        const id = this.editItemId.value || 'p' + (Date.now());
        const name = this.itemNameInput.value.trim();
        const category = this.itemCategoryInput.value;
        const size = this.itemSizeInput.value;
        const buyPrice = parseFloat(this.itemBuyPriceInput.value);
        const sellPrice = parseFloat(this.itemSellPriceInput.value);
        const qty = parseInt(this.itemQtyInput.value);
        const minAlert = parseInt(this.itemAlertLimitInput.value);

        if (sellPrice < buyPrice) {
            if (!confirm("Your retail selling price is lower than the wholesale purchase cost. Do you want to continue?")) {
                return;
            }
        }

        const itemIdx = this.inventory.findIndex(i => i.id === id);
        const newItem = { id, name, category, size, buyPrice, sellPrice, qty, minAlert };

        if (itemIdx > -1) {
            this.inventory[itemIdx] = newItem;
            this.showNotification(`Successfully edited: ${name}`);
        } else {
            this.inventory.push(newItem);
            this.showNotification(`Added new clothing garment: ${name}`);
        }

        this.saveInventory();
        this.renderAll();
        this.closeItemModal();
    }

    triggerEditItem(id) {
        const item = this.inventory.find(i => i.id === id);
        if (!item) return;

        this.editItemId.value = item.id;
        this.itemNameInput.value = item.name;
        this.itemCategoryInput.value = item.category;
        this.itemSizeInput.value = item.size;
        this.itemBuyPriceInput.value = item.buyPrice;
        this.itemSellPriceInput.value = item.sellPrice;
        this.itemQtyInput.value = item.qty;
        this.itemAlertLimitInput.value = item.minAlert;

        this.itemModalTitle.innerText = "Edit Clothing Details";
        this.itemModal.classList.add("active");
    }

    triggerSellItem(id) {
        this.openSaleModal();
        this.saleItemSelect.value = id;
        this.updateSaleModalCalculation();
    }

    deleteItem(id) {
        const item = this.inventory.find(i => i.id === id);
        if (!item) return;

        if (confirm(`Are you absolutely sure you want to delete "${item.name} (${item.size})"? This is permanent.`)) {
            this.inventory = this.inventory.filter(i => i.id !== id);
            this.saveInventory();
            this.renderAll();
            this.showNotification(`Deleted product: ${item.name}`);
        }
    }

    restockItem(id) {
        const item = this.inventory.find(i => i.id === id);
        if (!item) return;

        const inputEl = document.getElementById(`restock-${id}`);
        const restockVal = parseInt(inputEl.value) || 0;

        if (restockVal <= 0) {
            alert("Please enter a positive quantity to restock.");
            return;
        }

        item.qty += restockVal;
        this.saveInventory();
        this.renderAll();
        this.showNotification(`Restocked ${restockVal} units of ${item.name}!`);
    }

    // --- SALE ACTIONS ---
    handleLogSale(e) {
        e.preventDefault();

        if (this.activeBillItems.length === 0) {
            alert("Please scan or select at least one clothing garment to create a bill.");
            return;
        }

        const discountPct = Math.min(100, Math.max(0, parseFloat(this.saleDiscountInput.value) || 0));
        const customerName = this.saleCustNameInput.value.trim() || "Cash Customer";
        const customerPhone = this.saleCustPhoneInput.value.trim() || "N/A";

        // Double check quantities against active stock in case of concurrent edits
        for (const cartItem of this.activeBillItems) {
            const originalItem = this.inventory.find(i => i.id === cartItem.id);
            if (!originalItem || cartItem.qty > originalItem.qty) {
                alert(`Error: Stock quantity for "${cartItem.name} (${cartItem.size})" is insufficient.`);
                return;
            }
        }

        // Subtract quantities and compile items arrays
        let totalCostBasis = 0;
        let totalGrossRevenue = 0;

        const items = this.activeBillItems.map(cartItem => {
            const originalItem = this.inventory.find(i => i.id === cartItem.id);
            originalItem.qty -= cartItem.qty; // Reduce stock quantity

            totalCostBasis += cartItem.buyPrice * cartItem.qty;
            totalGrossRevenue += cartItem.sellPrice * cartItem.qty;

            return {
                itemId: cartItem.id,
                itemName: cartItem.name,
                size: cartItem.size,
                qty: cartItem.qty,
                buyPrice: cartItem.buyPrice,
                sellPrice: cartItem.sellPrice
            };
        });

        this.saveInventory();

        const discountAmt = Math.round((totalGrossRevenue * discountPct / 100) * 100) / 100;
        const finalRevenue = Math.max(0, totalGrossRevenue - discountAmt);
        const netProfit = finalRevenue - totalCostBasis;

        // Primary first item details for backward compatibility fields
        const first = items[0];

        const saleEntry = {
            id: 't' + Date.now(),
            items: items,
            // Single-item fallback fields for backward compatibility
            itemId: first.itemId,
            itemName: first.itemName,
            size: first.size,
            qty: items.reduce((acc, curr) => acc + curr.qty, 0),
            cost: totalCostBasis,
            revenue: finalRevenue,
            profit: netProfit,
            discount: discountAmt,
            discountPct: discountPct,
            customerName: customerName,
            customerPhone: customerPhone,
            timestamp: Date.now()
        };

        this.sales.push(saleEntry);
        this.saveSales();

        this.renderAll();
        this.closeSaleModal();
        this.showNotification(`Logged bill to ${customerName}. Total: ₹${finalRevenue.toLocaleString('en-IN')}`);

        this.printInvoice(saleEntry.id);
    }

    voidTransaction(id) {
        const trans = this.sales.find(s => s.id === id);
        if (!trans) return;

        if (confirm(`Do you want to VOID transaction ${id}? This returns all transaction items back to stock.`)) {
            // Restore inventory quantities
            if (trans.items && trans.items.length > 0) {
                trans.items.forEach(item => {
                    const original = this.inventory.find(i => i.id === item.itemId);
                    if (original) original.qty += item.qty;
                });
            } else {
                // Single-item fallback logic
                const original = this.inventory.find(i => i.id === trans.itemId);
                if (original) original.qty += trans.qty;
            }

            this.saveInventory();

            this.sales = this.sales.filter(s => s.id !== id);
            this.saveSales();

            this.renderAll();
            this.showNotification(`Voided sale transaction ${id} successfully.`);
        }
    }

    clearAllData() {
        if (confirm("Are you sure you want to WIPE all stock, sales history, and supplier contacts? This will clear the database completely so you can enter your own real showroom details.")) {
            this.inventory = [];
            this.sales = [];
            this.suppliers = [];
            this.categories = [...DEFAULT_CATEGORIES];
            this.saveInventory();
            this.saveSales();
            this.saveSuppliers();
            this.saveCategories();
            this.renderAll();
            this.updateCharts();
            this.showNotification("Showroom database cleared! You have a fresh empty store.");
        }
    }

    // --- DYNAMIC NOTIFIER / TOAST ---
    showNotification(msg) {
        const toast = document.createElement("div");
        toast.style.position = "fixed";
        toast.style.bottom = "24px";
        toast.style.right = "24px";
        toast.style.backgroundColor = "var(--bg-secondary)";
        toast.style.border = "1px solid var(--accent-indigo)";
        toast.style.color = "var(--text-primary)";
        toast.style.padding = "16px 24px";
        toast.style.borderRadius = "var(--border-radius-md)";
        toast.style.boxShadow = "0 10px 25px rgba(99, 102, 241, 0.2)";
        toast.style.zIndex = "2000";
        toast.style.fontWeight = "500";
        toast.style.fontSize = "14px";
        toast.style.animation = "fadeIn 0.3s ease-out";
        toast.innerHTML = `<i data-lucide="check-circle" style="vertical-align:middle; display:inline-block; margin-right:8px; width:16px; height:16px; color:var(--accent-emerald);"></i> ${msg}`;

        document.body.appendChild(toast);
        if (window.lucide) lucide.createIcons();

        setTimeout(() => {
            toast.style.animation = "fadeOut 0.3s ease-in";
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // --- HELPER TIMINGS ---
    formatRelativeTime(timestamp) {
        const diff = Date.now() - timestamp;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return "Just now";
        if (mins < 60) return `${mins}m ago`;

        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;

        const days = Math.floor(hrs / 24);
        return `${days}d ago`;
    }
}

// Global declaration - app is created by auth.js after login
let app;

// Called by auth.js after login + shop setup is complete
function initMainApp() {
    if (!app) {
        app = new ShowroomApp();
    }
    // Initialize settings panel with current user's shop profile
    setTimeout(() => {
        initShopProfileSettings();
        initCloudSettings();
        initLanguageGrid();
    }, 100);
}

// ── CLOUD API SETTINGS ───────────────────────────────────────
function initCloudSettings() {
    const form = document.getElementById('cloud-api-settings-form');
    if (!form) return;

    const fbKeyEl = document.getElementById('settings-fb-api-key');
    const fbDomainEl = document.getElementById('settings-fb-auth-domain');
    const fbProjEl = document.getElementById('settings-fb-project-id');
    const fbBucketEl = document.getElementById('settings-fb-storage-bucket');
    const fbSenderEl = document.getElementById('settings-fb-sender-id');
    const fbAppEl = document.getElementById('settings-fb-app-id');
    const saveMsg = document.getElementById('cloud-settings-save-msg');
 
    // Fetch existing settings
    fetch('/api/config')
        .then(res => res.json())
        .then(data => {
            if (data.firebase) {
                if (fbKeyEl) fbKeyEl.value = data.firebase.apiKey || '';
                if (fbDomainEl) fbDomainEl.value = data.firebase.authDomain || '';
                if (fbProjEl) fbProjEl.value = data.firebase.projectId || '';
                if (fbBucketEl) fbBucketEl.value = data.firebase.storageBucket || '';
                if (fbSenderEl) fbSenderEl.value = data.firebase.messagingSenderId || '';
                if (fbAppEl) fbAppEl.value = data.firebase.appId || '';
            }
        })
        .catch(err => console.log('[CloudSettings] Config loading disabled (running offline/file origin):', err.message));
 
    // Submit listener
    if (!form._handlerAdded) {
        form._handlerAdded = true;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const config = {
                firebase: {
                    apiKey: (fbKeyEl?.value || '').trim(),
                    authDomain: (fbDomainEl?.value || '').trim(),
                    projectId: (fbProjEl?.value || '').trim(),
                    storageBucket: (fbBucketEl?.value || '').trim(),
                    messagingSenderId: (fbSenderEl?.value || '').trim(),
                    appId: (fbAppEl?.value || '').trim()
                }
            };

            fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            })
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    if (saveMsg) {
                        saveMsg.style.display = 'inline-block';
                    }
                    if (app) app.showNotification('🎉 Cloud Configuration Saved! Page will reload to apply changes.');
                    setTimeout(() => window.location.reload(), 2000);
                })
                .catch(err => {
                    alert('Failed to save config: ' + err.message);
                });
        });
    }
}

// ── SHOP PROFILE SETTINGS ────────────────────────────────────
function initShopProfileSettings() {
    const user = window.Session ? Session.get() : null;
    if (!user) return;

    const profile = (window.ShopProfile ? ShopProfile.get(user.id) : null) || {};

    // Fill form fields
    const shopNameEl = document.getElementById('profile-shop-name');
    const ownerNameEl = document.getElementById('profile-owner-name');
    const addressEl = document.getElementById('profile-shop-address');
    const phoneEl = document.getElementById('profile-shop-phone');
    const upiEl = document.getElementById('profile-upi-id');

    if (shopNameEl) shopNameEl.value = profile.shopName || '';
    if (ownerNameEl) ownerNameEl.value = profile.ownerName || '';
    if (addressEl) addressEl.value = profile.shopAddress || '';
    if (phoneEl) phoneEl.value = profile.shopPhone || '';
    if (upiEl && app) upiEl.value = app.upiId || profile.upiId || '';

    // Save handler
    const form = document.getElementById('shop-profile-form');
    if (form && !form._profileHandlerAdded) {
        form._profileHandlerAdded = true;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const newProfile = {
                shopName: (shopNameEl?.value || '').trim(),
                ownerName: (ownerNameEl?.value || '').trim(),
                shopAddress: (addressEl?.value || '').trim(),
                shopPhone: (phoneEl?.value || '').trim(),
                upiId: (upiEl?.value || '').trim(),
            };

            // Save to ShopProfile
            if (window.ShopProfile) {
                const existing = ShopProfile.get(user.id) || {};
                ShopProfile.save(user.id, { ...existing, ...newProfile });
            }

            // Update UPI in app data
            if (app && newProfile.upiId) {
                app.upiId = newProfile.upiId;
                app.saveAllData();
                if (app.settingsUpiIdInput) {
                    app.settingsUpiIdInput.value = newProfile.upiId;
                }
            }

            // Update sidebar & header live
            if (window.AuthUI) AuthUI.updateAppWithUserInfo();

            // Update invoice/bill header if elements exist
            const billName = document.getElementById('inv-shop-name');
            const billAddr = document.getElementById('inv-shop-address');
            if (billName) billName.textContent = newProfile.shopName;
            if (billAddr) billAddr.textContent = newProfile.shopAddress;

            // Also update barcode tag shop name
            const tagBrandEls = document.querySelectorAll('#tag-brand-name, .tag-shop-name');
            tagBrandEls.forEach(el => el.textContent = newProfile.shopName);

            // Show saved message
            const msg = document.getElementById('profile-save-msg');
            if (msg) {
                msg.style.display = 'inline-block';
                setTimeout(() => msg.style.display = 'none', 2500);
            }

            if (app) app.showNotification(`✅ Profile saved! Shop: ${newProfile.shopName}`);
        });
    }
}

// ── LANGUAGE GRID ────────────────────────────────────────────
function initLanguageGrid() {
    const grid = document.getElementById('language-grid');
    if (!grid || !window.LANGUAGES || !window.LangManager) return;

    grid.innerHTML = '';
    const current = LangManager.current;

    Object.entries(LANGUAGES).forEach(([code, lang]) => {
        const isActive = code === current;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = `
            padding: 14px 16px; border-radius: 14px; cursor: pointer;
            font-family: Outfit, sans-serif; font-size: 14px; font-weight: 600;
            display: flex; align-items: center; gap: 10px; text-align: left;
            transition: all 0.2s; width: 100%;
            background: ${isActive ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(232, 15, 15, 0.04)'};
            border: 2px solid ${isActive ? '#6366f1' : 'rgba(255,255,255,0.1)'};
            color: ${isActive ? 'white' : 'var(--text-secondary)'};
            box-shadow: ${isActive ? '0 4px 16px rgba(99,102,241,0.3)' : 'none'};
        `;
        btn.innerHTML = `<span style="font-size:22px;">${lang.flag}</span><span>${lang.name}</span>`;
        if (isActive) btn.innerHTML += ` <span style="margin-left:auto;font-size:16px;">✓</span>`;

        btn.addEventListener('click', () => {
            LangManager.set(code);
            // Re-render grid to update active state
            initLanguageGrid();
            if (app) app.showNotification(`🌐 Language changed to ${lang.name}`);
        });
        grid.appendChild(btn);
    });
}

