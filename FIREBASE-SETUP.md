# 🔥 Firebase Setup Guide - Real Phone OTP ke liye

## Step 1: Firebase Console Kholo
1. Browser mein jaao: **https://console.firebase.google.com**
2. Apne Google Account se login karo

## Step 2: Naya Project Banao
1. Click karo **"Add project"**
2. Project naam daalo: `showroom-manager` (ya jo chahiye)
3. Google Analytics → disable karo (optional) → **Continue**
4. Project ban jaayega - **"Continue"** dabao

## Step 3: Web App Register Karo
1. Project dashboard mein, click karo **`</>`** icon (Web)
2. App nickname daalo: `showroom-web`
3. **"Register app"** dabao
4. **Firebase SDK config copy karo** - kuch aisa dikhega:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXX",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

## Step 4: Phone Auth Enable Karo
1. Left sidebar mein jaao: **Authentication** → **Sign-in method**
2. **"Phone"** par click karo
3. **Enable** toggle on karo → **Save**

## Step 5: Auth Domain Authorize Karo (Localhost ke liye)
1. Authentication → **Settings** → **Authorized domains**
2. Check karo ki `localhost` wahan already hai (hona chahiye)

## Step 6: auth.js Mein Config Paste Karo

`auth.js` file kholke **line 10-17** ko update karo:

```javascript
const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyXXXXX...",       // ← apna paste karo
    authDomain:        "your-project.firebaseapp.com",
    projectId:         "your-project-id",
    storageBucket:     "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId:             "1:123456789:web:abcdef"
};
```

**Save karo** - ab `DEMO_MODE` automatically `false` ho jaayega aur real OTP aane lagega! ✅

## ⚠️ Important Notes

- **Free Plan mein** - Firebase Spark plan mein Phone Auth FREE hai India mein
- **Test Numbers** - Development ke liye Firebase Console → Authentication → Phone → "Test phone numbers" mein apna number add kar sakte hain (real SMS nahi jaayega, test OTP use hoga)
- **reCAPTCHA** - Firebase automatically invisible reCAPTCHA handle karta hai

## 📱 Abhi Bina Firebase ke bhi kaam karta hai!
DEMO_MODE mein screen par ek banner mein OTP dikhega. 
Real users ke liye Firebase setup zaruri hai sirf tab jab aap real SMS OTP chahte hain.
