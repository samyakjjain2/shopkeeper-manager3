// ============================================================
// auth.js - Showroom Manager Authentication System
// Firebase Phone OTP + Email/Password + Multi-user support
// ============================================================

// ─── STEP 1: APNA FIREBASE CONFIG YAHAN PASTE KARO ──────────
// Firebase Console → Project Settings → Your Apps → Web App
// Agar abhi config nahi hai, to DEMO_MODE=true rahega
// ─────────────────────────────────────────────────────────────
let FIREBASE_CONFIG = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

let DEMO_MODE = true;

let SUPABASE_ACTIVE = false;
window.SUPABASE_ACTIVE = false;

async function initCloudConfig() {
    try {
        const res = await fetch('/api/config');
        if (res.ok) {
            const data = await res.json();
            if (data.firebase) FIREBASE_CONFIG = data.firebase;
        }
    } catch (e) {
        console.log('[CloudConfig] Local server config offline. Running local-only mode.');
    }

    DEMO_MODE = !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey === "YOUR_API_KEY" || FIREBASE_CONFIG.apiKey === "";
}

// ─── FIREBASE SDK DYNAMICALLY LOAD KARO ─────────────────────
let firebaseAuth = null;
let firebaseApp = null;
let recaptchaVerifier = null;
let confirmationResult = null;

async function loadFirebaseSDK() {
    if (DEMO_MODE) return; // skip in demo mode
    return new Promise((resolve, reject) => {
        if (window.firebase) { resolve(); return; }
        const script1 = document.createElement('script');
        script1.src = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js';
        script1.onload = () => {
            const script2 = document.createElement('script');
            script2.src = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js';
            script2.onload = () => {
                firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
                firebaseAuth = firebase.auth();
                resolve();
            };
            script2.onerror = reject;
            document.head.appendChild(script2);
        };
        script1.onerror = reject;
        document.head.appendChild(script1);
    });
}

// ─── USER DATABASE (localStorage) ───────────────────────────
class UserDB {
    static getAll() {
        return JSON.parse(localStorage.getItem('sm_users') || '[]');
    }
    static save(users) {
        localStorage.setItem('sm_users', JSON.stringify(users));
    }
    static findByEmail(email) {
        return this.getAll().find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    }
    static findByPhone(phone) {
        return this.getAll().find(u => u.phone === phone.replace(/\s/g, ''));
    }
    static findById(id) {
        return this.getAll().find(u => u.id === id);
    }
    static create(data) {
        const users = this.getAll();
        const newUser = {
            id: 'u_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            passHash: data.passHash || '',
            createdAt: Date.now()
        };
        users.push(newUser);
        this.save(users);
        return newUser;
    }
}

// ─── SESSION MANAGEMENT ──────────────────────────────────────
class Session {
    static set(user) {
        localStorage.setItem('sm_currentUser', JSON.stringify({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone
        }));
    }
    static get() {
        const raw = localStorage.getItem('sm_currentUser');
        return raw ? JSON.parse(raw) : null;
    }
    static clear() {
        localStorage.removeItem('sm_currentUser');
    }
    static isLoggedIn() {
        return !!this.get();
    }
}
window.Session = Session;
 
// ─── SHOP PROFILE ────────────────────────────────────────────
class ShopProfile {
    static key(userId) { return `sm_shop_${userId}`; }
    static get(userId) {
        const raw = localStorage.getItem(this.key(userId));
        return raw ? JSON.parse(raw) : null;
    }

    static save(userId, profile) {
        const fullProfile = {
            ...profile,
            setupDone: true
        };
        localStorage.setItem(this.key(userId), JSON.stringify(fullProfile));

        // Sync to Node.js backend in the background
        fetch(`/api/profile?userId=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shopName: fullProfile.shopName || "",
                ownerName: fullProfile.ownerName || "",
                shopAddress: fullProfile.shopAddress || "",
                shopPhone: fullProfile.shopPhone || "",
                upiId: fullProfile.upiId || ""
            })
        }).then(res => {
            if (!res.ok) console.warn('[Server Sync] Profile sync failed');
        }).catch(err => {
            console.warn('[Server Sync] Profile sync failed (offline?):', err.message);
        });
    }

    static isSetupDone(userId) {
        const p = this.get(userId);
        return p && p.setupDone === true;
    }
}
window.ShopProfile = ShopProfile;

// ─── SIMPLE PASSWORD HASH (tidak pakai crypto library) ───────
function hashPassword(password) {
    let hash = 0;
    const str = password + "sm_salt_2026";
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return 'h_' + Math.abs(hash).toString(16) + '_' + str.length;
}

// ─── OTP GENERATOR (Demo mode) ───────────────────────────────
function generateDemoOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
let currentDemoOTP = null;
let currentContactForOTP = null;

// ─── MAIN AUTH MANAGER ───────────────────────────────────────
const AuthManager = {
 
    // Register with email + password
    async registerWithEmail(name, email, password) {
        // Fix 4: Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error('Please enter a valid email address (e.g. name@example.com).');
        }
 
        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Registration failed');
            }
            const data = await res.json();
            const user = { ...data.user, token: data.token };
            Session.set(user);
            return user;
        } catch (err) {
            console.warn('[Server Auth] Register failed, trying local UserDB fallback:', err.message);
            if (err.message.includes('already registered')) throw err;
 
            if (UserDB.findByEmail(email)) {
                throw new Error('Yeh email pehle se registered hai. Login karo.');
            }
            const user = UserDB.create({ name, email, passHash: hashPassword(password) });
            Session.set(user);
            return user;
        }
    },
 
    // Register with phone
    async registerWithPhone(name, phone) {
        const cleanPhone = phone.replace(/\s/g, '');
        if (UserDB.findByPhone(cleanPhone)) {
            throw new Error('Yeh phone number pehle se registered hai.');
        }
        const user = { id: 'pending', name, phone: cleanPhone };
        return user;
    },
 
    // Login with email + password
    async loginWithEmail(email, password) {
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Login failed');
            }
            const data = await res.json();
            const user = { ...data.user, token: data.token };
            Session.set(user);
            return user;
        } catch (err) {
            console.warn('[Server Auth] Login failed, trying local UserDB fallback:', err.message);
            if (err.message.includes('Incorrect password') || err.message.includes('not registered')) throw err;
 
            const user = UserDB.findByEmail(email);
            if (!user) throw new Error('Yeh email registered nahi hai. Pehle Sign Up karo.');
            if (user.passHash !== hashPassword(password)) throw new Error('Galat password hai.');
            Session.set(user);
            return user;
        }
    },
 
    // ── FORGOT PASSWORD ──────────────────────────────────────
    // Step 1: Find user and send reset OTP
    async sendResetOTP(contact) {
        const clean = contact.trim();
        let user = null;
 
        // Try email first, then phone
        if (clean.includes('@')) {
            user = UserDB.findByEmail(clean);
        } else {
            const phone = clean.replace(/\D/g, '');
            user = UserDB.findByPhone(phone) || UserDB.findByPhone('+91' + phone);
        }
 
        if (!user) {
            // Check if backend knows about this user (mock details or placeholder)
            user = { id: 'temp_' + Date.now(), email: clean.includes('@') ? clean : '', phone: clean.includes('@') ? '' : clean };
        }
 
        // Store for later use
        window._resetUserId = user.id;
        window._resetUserContact = clean;
        const contactForOTP = user.phone || clean;
        await this.sendOTP(contactForOTP, 'recaptcha-container');
        return user;
    },
 
    // Step 2: Verify OTP and set new password
    async verifyAndResetPassword(otp, newPassword) {
        if (!window._resetUserId) throw new Error('Session expired. Start over.');
        if (newPassword.length < 6) throw new Error('Password kam se kam 6 characters ka hona chahiye.');
 
        // Verify OTP (demo or Firebase)
        if (DEMO_MODE) {
            if (otp !== currentDemoOTP) throw new Error('Galat OTP. Dobara check karo.');
            currentDemoOTP = null;
        } else {
            await confirmationResult.confirm(otp);
        }
 
        // Update password in DB
        if (window._resetUserId && !window._resetUserId.toString().startsWith('temp_')) {
            try {
                await fetch('/api/auth/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: window._resetUserId, newPassword })
                });
            } catch (e) {
                console.warn('[Server Auth] Password reset backend sync failed:', e.message);
            }
        }
 
        // Update password in local DB
        const users = UserDB.getAll();
        const idx = users.findIndex(u => u.id === window._resetUserId);
        if (idx > -1) {
            users[idx].passHash = hashPassword(newPassword);
            UserDB.save(users);
        }
        window._resetUserId = null;
        window._resetUserContact = null;
    },
 
    // Send OTP to phone (Firebase or Demo)
    async sendOTP(phone, recaptchaContainerId) {
        const cleanPhone = phone.startsWith('+') ? phone : '+91' + phone.replace(/\D/g, '');
        currentContactForOTP = cleanPhone;
 
        if (DEMO_MODE) {
            currentDemoOTP = generateDemoOTP();
            console.log('%c📱 DEMO OTP: ' + currentDemoOTP, 'background:#4f46e5;color:white;font-size:20px;padding:8px 16px;border-radius:8px;');
            // Show OTP in a visible notification (demo only)
            showDemoOTPNotification(currentDemoOTP);
            return { demo: true };
        }
 
        // Real Firebase Phone Auth
        await loadFirebaseSDK();
        if (!recaptchaVerifier) {
            recaptchaVerifier = new firebase.auth.RecaptchaVerifier(recaptchaContainerId, {
                size: 'invisible',
                callback: () => { }
            });
        }
        confirmationResult = await firebaseAuth.signInWithPhoneNumber(cleanPhone, recaptchaVerifier);
        return { demo: false };
    },
 
    // Verify OTP
    async verifyOTP(otp) {
        if (DEMO_MODE) {
            if (otp !== currentDemoOTP) throw new Error('Wrong OTP Please check again');
            
            // Try backend phone-login
            try {
                const res = await fetch('/api/auth/phone-login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: currentContactForOTP, name: window._pendingSignupName || 'Shop Owner' })
                });
                if (res.ok) {
                    const data = await res.json();
                    const user = { ...data.user, token: data.token };
                    Session.set(user);
                    currentDemoOTP = null;
                    return user;
                }
            } catch (e) {
                console.warn('[Server Auth] Demo phone login backend sync failed:', e.message);
            }
 
            let user = UserDB.findByPhone(currentContactForOTP);
            if (!user) {
                user = UserDB.create({ phone: currentContactForOTP, name: window._pendingSignupName || 'Shop Owner' });
            }
            Session.set(user);
            currentDemoOTP = null;
            return user;
        }
 
        // Real Firebase OTP verify
        const result = await confirmationResult.confirm(otp);
        const fbUser = result.user;
        
        try {
            const res = await fetch('/api/auth/phone-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: fbUser.phoneNumber, name: window._pendingSignupName || 'Shop Owner' })
            });
            if (res.ok) {
                const data = await res.json();
                const user = { ...data.user, token: data.token };
                Session.set(user);
                return user;
            }
        } catch (e) {
            console.warn('[Server Auth] Phone login backend sync failed:', e.message);
        }
 
        let user = UserDB.findByPhone(fbUser.phoneNumber);
        if (!user) {
            user = UserDB.create({ phone: fbUser.phoneNumber, name: window._pendingSignupName || 'Shop Owner' });
        }
        Session.set(user);
        return user;
    },
 
    // Logout
    logout() {
        Session.clear();
        if (!DEMO_MODE && firebaseAuth) {
            firebaseAuth.signOut().catch(() => { });
        }
        // Fix 5: Full app reset on logout — reload page so no stale data
        window.location.reload();
    },

    getCurrentUser() { return Session.get(); },
    isLoggedIn() { return Session.isLoggedIn(); }
};
window.AuthManager = AuthManager;

// ─── DEMO OTP NOTIFICATION (sirf demo mode mein) ─────────────
function showDemoOTPNotification(otp) {
    const existing = document.getElementById('demo-otp-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'demo-otp-toast';
    toast.innerHTML = `
        <div style="
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: linear-gradient(135deg, #4f46e5, #7c3aed);
            color: white; padding: 16px 28px; border-radius: 16px;
            font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 600;
            z-index: 99999; box-shadow: 0 8px 32px rgba(79,70,229,0.4);
            display: flex; align-items: center; gap: 12px;
            animation: slideDown 0.4s ease;
            border: 1px solid rgba(255,255,255,0.2);
        ">
            <span style="font-size: 24px;">📱</span>
            <div>
                <div style="font-size: 12px; opacity: 0.8; margin-bottom: 2px;">DEMO MODE – Aapka OTP</div>
                <div style="font-size: 28px; letter-spacing: 6px; font-weight: 700;">${otp}</div>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="
                background: rgba(255,255,255,0.2); border: none; color: white;
                width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
                font-size: 16px; margin-left: 8px; display: flex; align-items: center; justify-content: center;
            ">×</button>
        </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 15000);
}

// ─── AUTH UI CONTROLLER ──────────────────────────────────────
const AuthUI = {
    screens: ['auth-wrapper', 'shop-setup-screen'],
    mainApp: 'main-app-wrapper',

    showScreen(screen) {
        // screen: 'signin' | 'signup' | 'otp' | 'shop-setup' | 'app' | 'forgot'
        const authWrapper = document.getElementById('auth-wrapper');
        const shopSetup = document.getElementById('shop-setup-screen');
        const mainApp = document.getElementById('main-app-wrapper');
        const signinPanel = document.getElementById('auth-signin-panel');
        const signupPanel = document.getElementById('auth-signup-panel');
        const otpPanel = document.getElementById('auth-otp-panel');
        const forgotPanel = document.getElementById('auth-forgot-panel');

        // Hide everything first
        if (authWrapper) authWrapper.style.display = 'none';
        if (shopSetup) shopSetup.style.display = 'none';
        if (mainApp) mainApp.style.display = 'none';
        if (signinPanel) signinPanel.style.display = 'none';
        if (signupPanel) signupPanel.style.display = 'none';
        if (otpPanel) otpPanel.style.display = 'none';
        if (forgotPanel) forgotPanel.style.display = 'none';

        // Fix 3: aria-hidden for accessibility — hide dashboard from screen readers when not logged in
        const isAppScreen = (screen === 'app');
        if (mainApp) mainApp.setAttribute('aria-hidden', isAppScreen ? 'false' : 'true');
        if (authWrapper) authWrapper.setAttribute('aria-hidden', isAppScreen ? 'true' : 'false');
        if (shopSetup) shopSetup.setAttribute('aria-hidden', screen === 'shop-setup' ? 'false' : 'true');

        switch (screen) {
            case 'signin':
                authWrapper.style.display = 'flex';
                signinPanel.style.display = 'flex';
                break;
            case 'signup':
                authWrapper.style.display = 'flex';
                signupPanel.style.display = 'flex';
                break;
            case 'otp':
                authWrapper.style.display = 'flex';
                otpPanel.style.display = 'flex';
                break;
            case 'forgot':
                authWrapper.style.display = 'flex';
                if (forgotPanel) {
                    forgotPanel.style.display = 'flex';
                    // Reset to step 1
                    const s1 = document.getElementById('forgot-step-1');
                    const s2 = document.getElementById('forgot-step-2');
                    if (s1) s1.style.display = 'block';
                    if (s2) s2.style.display = 'none';
                }
                break;
            case 'shop-setup':
                shopSetup.style.display = 'flex';
                break;
            case 'app':
                mainApp.style.display = 'block';
                this.updateAppWithUserInfo();
                break;
        }
    },

    updateAppWithUserInfo() {
        const user = Session.get();
        const profile = user ? ShopProfile.get(user.id) : null;
        if (!user) return;

        // Sidebar user info update
        const avatarEl = document.querySelector('.avatar');
        const nameEl = document.querySelector('.user-name');
        const roleEl = document.querySelector('.user-role');
        const logoTextEl = document.querySelector('.logo-text');

        if (profile) {
            const initials = profile.ownerName
                .split(' ').map(w => w[0]).join('').toUpperCase().substr(0, 2);
            if (avatarEl) avatarEl.innerText = initials;
            if (nameEl) nameEl.innerText = profile.ownerName;
            if (roleEl) roleEl.innerText = 'Owner | ' + (user.phone || user.email || '');
            if (logoTextEl) logoTextEl.innerText = profile.shopName.toUpperCase();
        } else {
            if (nameEl) nameEl.innerText = user.name || 'User';
        }

        // Update invoice header details
        const invShopNameEl = document.getElementById('inv-shop-name');
        const invShopAddrEl = document.getElementById('inv-shop-address');
        const invShopPhoneEl = document.getElementById('inv-shop-phone');
        if (profile) {
            if (invShopNameEl) invShopNameEl.innerText = profile.shopName.toUpperCase();
            if (invShopAddrEl) invShopAddrEl.innerText = profile.shopAddress || '';
            if (invShopPhoneEl) invShopPhoneEl.innerText = profile.shopPhone ? `Owner Mobile: ${profile.shopPhone}` : '';
        }

        // Also update barcode tag shop name
        const tagBrandEls = document.querySelectorAll('#tag-brand-name, .tag-shop-name');
        if (profile) {
            tagBrandEls.forEach(el => el.textContent = profile.shopName);
        }

        // Update page subtitle
        const subtitleEl = document.getElementById('header-page-subtitle');
        if (subtitleEl && profile) {
            if (window.LangManager) {
                subtitleEl.innerText = LangManager.t('dashboardSubtitle')
                    .replace('{owner}', profile.ownerName)
                    .replace('{shop}', profile.shopName);
            } else {
                subtitleEl.innerText = `Welcome back, ${profile.ownerName}! Here's how ${profile.shopName} is performing today.`;
            }
        }

        // Fix 9: Update mobile header bar shop name
        const mobileShopName = document.getElementById('mobile-shop-name');
        if (mobileShopName && profile) {
            mobileShopName.textContent = profile.shopName || 'Showroom Manager';
        }
    }
};
window.AuthUI = AuthUI;

// ─── AUTH FORMS EVENT HANDLERS ───────────────────────────────
function initAuthHandlers() {

    // ── SIGN IN FORM (email/password) ──
    const signinEmailForm = document.getElementById('signin-email-form');
    if (signinEmailForm) {
        signinEmailForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('si-email').value.trim();
            const password = document.getElementById('si-password').value;
            const btn = document.getElementById('si-submit-btn');
            setLoading(btn, true);
            try {
                await AuthManager.loginWithEmail(email, password);
                afterLogin();
            } catch (err) {
                showAuthError('signin', err.message);
            } finally { setLoading(btn, false); }
        });
    }

    // ── SIGN IN WITH OTP (phone) ──
    const signinPhoneBtn = document.getElementById('si-send-otp-btn');
    if (signinPhoneBtn) {
        signinPhoneBtn.addEventListener('click', async () => {
            const phone = document.getElementById('si-phone').value.trim();
            if (!phone || phone.length < 10) {
                showAuthError('signin', 'Sahi phone number daalo (10 digits).'); return;
            }
            setLoading(signinPhoneBtn, true);
            try {
                await AuthManager.sendOTP(phone, 'recaptcha-container');
                // Store pending context
                window._pendingLoginPhone = phone;
                AuthUI.showScreen('otp');
                startOTPTimer();
            } catch (err) {
                showAuthError('signin', err.message);
            } finally { setLoading(signinPhoneBtn, false); }
        });
    }

    // ── SIGN UP FORM ──
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('su-name').value.trim();
            const method = document.querySelector('input[name="su-method"]:checked')?.value || 'email';
            const btn = document.getElementById('su-submit-btn');

            setLoading(btn, true);
            try {
                if (method === 'email') {
                    const email = document.getElementById('su-email').value.trim();
                    const password = document.getElementById('su-password').value;
                    const confirm = document.getElementById('su-confirm-password').value;
                    if (password !== confirm) throw new Error('Password aur Confirm Password match nahi karte.');
                    if (password.length < 6) throw new Error('Password kam se kam 6 characters ka hona chahiye.');
                    const user = await AuthManager.registerWithEmail(name, email, password);
                    // Merge name into user object and set session
                    const fullUser = { ...user, name };
                    Session.set(fullUser);
                    // ✅ Set per-user data key immediately so their data is isolated
                    initUserData(fullUser.id);
                    // New user → always go to shop setup first
                    afterLogin();
                } else {
                    const phone = document.getElementById('su-phone').value.trim();
                    await AuthManager.registerWithPhone(name, phone);
                    window._pendingSignupName = name;
                    window._pendingSignupPhone = phone;
                    await AuthManager.sendOTP(phone, 'recaptcha-container');
                    AuthUI.showScreen('otp');
                    startOTPTimer();
                }
            } catch (err) {
                showAuthError('signup', err.message);
            } finally { setLoading(btn, false); }
        });
    }

    // ── OTP VERIFY ──
    const otpVerifyBtn = document.getElementById('otp-verify-btn');
    if (otpVerifyBtn) {
        otpVerifyBtn.addEventListener('click', async () => {
            const otp = getOTPInputValue();
            if (otp.length < 6) { showAuthError('otp', 'Poora 6-digit OTP daalo.'); return; }
            setLoading(otpVerifyBtn, true);
            try {
                const user = await AuthManager.verifyOTP(otp);
                // If came from signup, update name
                if (window._pendingSignupName) {
                    const users = UserDB.getAll();
                    const idx = users.findIndex(u => u.id === user.id);
                    if (idx > -1) { users[idx].name = window._pendingSignupName; UserDB.save(users); }
                    user.name = window._pendingSignupName;
                    Session.set(user);
                    window._pendingSignupName = null;
                    window._pendingSignupPhone = null;
                }
                // ✅ Set per-user data key before routing
                initUserData(user.id);
                afterLogin();
            } catch (err) {
                showAuthError('otp', err.message);
            } finally { setLoading(otpVerifyBtn, false); }
        });
    }

    // ── OTP RESEND ──
    const resendBtn = document.getElementById('otp-resend-btn');
    if (resendBtn) {
        resendBtn.addEventListener('click', async () => {
            const phone = window._pendingLoginPhone || window._pendingSignupPhone;
            if (!phone) return;
            resendBtn.disabled = true;
            try {
                await AuthManager.sendOTP(phone, 'recaptcha-container');
                startOTPTimer();
            } catch (err) { showAuthError('otp', err.message); }
        });
    }

    // ── SHOP SETUP FORM ──
    const shopForm = document.getElementById('shop-setup-form');
    if (shopForm) {
        shopForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const shopName = document.getElementById('setup-shop-name').value.trim();
            const ownerName = document.getElementById('setup-owner-name').value.trim();
            if (!shopName || !ownerName) return;
            const user = Session.get();
            ShopProfile.save(user.id, { shopName, ownerName });
            initUserData(user.id);
            // Create the app instance first time
            initMainApp();
            AuthUI.showScreen('app');
            if (window.app) {
                window.app.loadStateFromStorage();
                window.app.showNotification(`🎉 ${shopName} mein aapka swagat hai, ${ownerName}!`);
            }
        });
    }

    // ── TOGGLE SIGNIN METHOD (email/phone tabs) ──
    document.querySelectorAll('.auth-method-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const method = tab.getAttribute('data-method');
            document.querySelectorAll('.auth-method-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.auth-method-panel').forEach(p => {
                p.style.display = p.getAttribute('data-method') === method ? 'block' : 'none';
            });
        });
    });

    // ── SIGNUP RADIO TOGGLE ──
    document.querySelectorAll('input[name="su-method"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const method = radio.value;
            const emailFields = document.getElementById('su-email-fields');
            const phoneFields = document.getElementById('su-phone-fields');
            if (emailFields) emailFields.style.display = method === 'email' ? 'block' : 'none';
            if (phoneFields) phoneFields.style.display = method === 'phone' ? 'block' : 'none';
        });
    });

    // ── SWITCH LINKS ──
    const goSignup = document.getElementById('go-to-signup');
    const goSignin = document.getElementById('go-to-signin');
    const goSignin2 = document.getElementById('go-to-signin-2');
    const goForgot = document.getElementById('go-to-forgot');
    const goSigninForgot = document.getElementById('go-to-signin-from-forgot');
    if (goSignup) goSignup.addEventListener('click', () => { clearAuthErrors(); AuthUI.showScreen('signup'); });
    if (goSignin) goSignin.addEventListener('click', () => { clearAuthErrors(); AuthUI.showScreen('signin'); });
    if (goSignin2) goSignin2.addEventListener('click', () => { clearAuthErrors(); AuthUI.showScreen('signin'); });
    if (goForgot) goForgot.addEventListener('click', () => { clearAuthErrors(); AuthUI.showScreen('forgot'); });
    if (goSigninForgot) goSigninForgot.addEventListener('click', () => { clearAuthErrors(); AuthUI.showScreen('signin'); });

    // ── FORGOT STEP 1: Send OTP ──
    const forgotSendBtn = document.getElementById('forgot-send-otp-btn');
    if (forgotSendBtn) {
        forgotSendBtn.addEventListener('click', async () => {
            const contact = (document.getElementById('forgot-contact')?.value || '').trim();
            if (!contact) return;
            setLoading(forgotSendBtn, true);
            clearAuthErrors();
            try {
                await AuthManager.sendResetOTP(contact);
                // Show step 2
                document.getElementById('forgot-step-1').style.display = 'none';
                document.getElementById('forgot-step-2').style.display = 'block';
                startOTPTimer();
                // OTP boxes (shared)
                document.querySelectorAll('.otp-box').forEach(b => b.value = '');
            } catch (err) {
                const errEl = document.getElementById('forgot-error');
                if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
            } finally { setLoading(forgotSendBtn, false); }
        });
    }

    // ── FORGOT STEP 2: Verify OTP + New Password ──
    const forgotResetBtn = document.getElementById('forgot-reset-btn');
    if (forgotResetBtn) {
        forgotResetBtn.addEventListener('click', async () => {
            const otp = getOTPInputValue();
            const newPwd = (document.getElementById('forgot-new-password')?.value || '').trim();
            const confPwd = (document.getElementById('forgot-confirm-password')?.value || '').trim();
            if (!otp || otp.length < 6) { showForgotError('6 digit OTP daalo.'); return; }
            if (!newPwd || newPwd !== confPwd) { showForgotError('Passwords match nahi kar rahe.'); return; }
            setLoading(forgotResetBtn, true);
            try {
                await AuthManager.verifyAndResetPassword(otp, newPwd);
                // Show success
                const step2 = document.getElementById('forgot-step-2');
                if (step2) step2.innerHTML = `
                    <div style="text-align:center;padding:32px 0;">
                        <div style="font-size:56px;margin-bottom:16px;">✅</div>
                        <h3 style="color:#10b981;font-size:20px;margin:0 0 8px;">Password Reset Ho Gaya!</h3>
                        <p style="color:#64748b;font-size:14px;margin:0 0 24px;">Ab apne naye password se login karo.</p>
                        <button onclick="AuthUI.showScreen('signin')" style="
                            padding:12px 32px;background:linear-gradient(135deg,#6366f1,#8b5cf6);
                            border:none;border-radius:12px;color:white;font-size:14px;
                            font-weight:700;cursor:pointer;font-family:Outfit,sans-serif;">
                            Login Karo →
                        </button>
                    </div>`;
            } catch (err) { showForgotError(err.message); }
            finally { setLoading(forgotResetBtn, false); }
        });
    }

    // ── OTP INPUT: auto-advance boxes ──
    initOTPBoxes();
}

// ── After login → check if shop setup needed ──
function afterLogin() {
    clearAuthErrors();
    const user = Session.get();
    if (!user) { AuthUI.showScreen('signin'); return; }

    // ✅ Always ensure per-user data key is set
    initUserData(user.id);

    if (!ShopProfile.isSetupDone(user.id)) {
        // New user or incomplete setup → show shop setup
        const ownerInput = document.getElementById('setup-owner-name');
        if (ownerInput && user.name) ownerInput.value = user.name;
        // Apply current language to shop setup screen
        if (window.LangManager) LangManager.apply();
        AuthUI.showScreen('shop-setup');
    } else {
        // Existing user with setup done → go to app
        initMainApp(); // create/re-use app instance
        AuthUI.showScreen('app');
        if (window.app) window.app.loadStateFromStorage();
        // Apply language after app loads
        if (window.LangManager) LangManager.apply();
    }
}

// ── Initialize user-specific data key in localStorage ──
function initUserData(userId) {
    const key = `sm_data_${userId}`;
    const raw = localStorage.getItem(key);
    // Override the key app.js reads so per-user data works
    window._currentUserDataKey = key;
    // If no data yet, don't create - app.js will use defaults
}

// ─── OTP INPUT BOXES ─────────────────────────────────────────
function initOTPBoxes() {
    const boxes = document.querySelectorAll('.otp-box');
    boxes.forEach((box, idx) => {
        box.addEventListener('input', (e) => {
            const val = e.target.value.replace(/\D/g, '');
            e.target.value = val.slice(-1);
            if (val && idx < boxes.length - 1) boxes[idx + 1].focus();
        });
        box.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && idx > 0) boxes[idx - 1].focus();
        });
        box.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
            boxes.forEach((b, i) => { if (text[i]) b.value = text[i]; });
            boxes[Math.min(text.length, boxes.length - 1)].focus();
        });
    });
}

function getOTPInputValue() {
    return Array.from(document.querySelectorAll('.otp-box')).map(b => b.value).join('');
}

// ─── OTP TIMER ───────────────────────────────────────────────
let otpTimerInterval = null;
function startOTPTimer() {
    let seconds = 30;
    const timerEl = document.getElementById('otp-timer-text');
    const resendEl = document.getElementById('otp-resend-btn');
    if (resendEl) resendEl.disabled = true;
    if (timerEl) timerEl.innerText = `Resend in ${seconds}s`;

    clearInterval(otpTimerInterval);
    otpTimerInterval = setInterval(() => {
        seconds--;
        if (timerEl) timerEl.innerText = seconds > 0 ? `Resend in ${seconds}s` : '';
        if (seconds <= 0) {
            clearInterval(otpTimerInterval);
            if (resendEl) resendEl.disabled = false;
        }
    }, 1000);
}

// ─── UI HELPERS ──────────────────────────────────────────────
function setLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
        btn._origText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner"></span> Please wait...';
    } else {
        btn.innerHTML = btn._origText || btn.innerHTML;
    }
}

function showAuthError(screen, message) {
    const errId = screen === 'signin' ? 'signin-error'
        : screen === 'signup' ? 'signup-error'
            : 'otp-error';
    const el = document.getElementById(errId);
    if (el) {
        el.innerText = message;
        el.style.display = 'block';
    }
}

function showForgotError(message) {
    const el = document.getElementById('forgot-error');
    if (el) { el.textContent = message; el.style.display = 'block'; }
}

function clearAuthErrors() {
    ['signin-error', 'signup-error', 'otp-error', 'forgot-error'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.innerText = ''; el.style.display = 'none'; }
    });
}

// ─── BOOT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initCloudConfig();
    } catch (e) {
        console.warn('Cloud config load failed, running in pure local offline mode:', e);
    }

    initAuthHandlers();

    // Check if already logged in
    if (AuthManager.isLoggedIn()) {
        afterLogin();
    } else {
        AuthUI.showScreen('signin');
    }
});
