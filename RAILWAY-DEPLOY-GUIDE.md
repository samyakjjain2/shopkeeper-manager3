# 🚀 Railway.app Deployment Guide

Apne **Showroom Manager** project ko cloud (Railway.app) par deploy karke live karne ke liye niche diye gaye steps follow karein:

---

## Step 1: Apne Code ko GitHub par Push karein
Railway par deploy karne ka sabse best tarika hai GitHub integration:
1. Ek GitHub account banayein (agar pehle se nahi hai to).
2. GitHub par ek new repository banayein (aap ise private ya public rakh sakte hain).
3. Apne code ko is repository mein push kar dein:
   ```bash
   git init
   git add .
   git commit -m "initial commit for railway"
   git branch -M main
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin main
   ```
   *(Note: `.env` aur `node_modules` file push nahi honi chahiye. Humne `.env` ko secure server par setup karna hai.)*

---

## Step 2: Railway.app par Account banayein
1. **[https://railway.app](https://railway.app)** par jaayein.
2. **Login/Sign Up** karein (apne **GitHub** account ke sath sign in karna sabse aasan hai).

---

## Step 3: Railway par Naya Project Setup karein
1. Railway dashboard par **"New Project"** (top right) button par click karein.
2. Dropdown se **"Deploy from GitHub repo"** select karein.
3. Railway ko apne GitHub account se link hone dein aur fir list se apne `showroom-manager` repository ko select karein.
4. **"Deploy Now"** par click kar dein.

---

## Step 4: Environment Variables Setup karein (Important)
Wahan server start hone se pehle database connection configure karna hoga:
1. Apne project deployment par click karein aur **"Variables"** tab par jaayein.
2. **"Add Variable"** button par click karke niche diye gaye variables add karein:
   - **`DATABASE_URL`**: Apna Neon DB connection string paste karein (wahi link jo `.env` mein save kiya tha).
   - **`JWT_SECRET`**: Koi bhi random secret word (jaise `samyak_garments_secret_key_2026_xyz`).
3. Variables save hote hi Railway project ko automatic dobara rebuild aur redeploy karega.

---

## Step 5: Live Domain/Link Generate karein
Aapki website ko live link dene ke liye:
1. Apne service settings mein **"Settings"** tab par jaayein.
2. Niche scroll karke **"Networking"** section par jaayein.
3. **"Generate Domain"** par click karein.
4. Railway aapko ek free live website link dega (jaise `showroom-manager-production.up.railway.app`).

Ab is domain ko open karke aap apne Showroom Manager website ko duniya mein kahin se bhi access aur use kar sakte hain!
