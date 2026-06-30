# 🐘 Neon PostgreSQL + Prisma Database Setup Guide

This guide details how to configure your free **Neon DB Serverless PostgreSQL** backend and start running the new Node.js Express server.

---

## Step 1: Install Node.js (If not already installed)
1. Go to: **[https://nodejs.org](https://nodejs.org)**.
2. Download and run the **LTS (Long Term Support)** installer for Windows.
3. Proceed with the default settings (ensure the **"Add to PATH"** checkbox is checked).
4. After installation, restart your computer or command prompt.
5. Verify it works by opening a terminal and running:
   ```bash
   node -v
   npm -v
   ```

---

## Step 2: Create a Free PostgreSQL Database on Neon
1. Go to: **[https://neon.tech](https://neon.tech)** and sign up.
2. Click **"New Project"**.
3. Enter a project name (e.g. `showroom-manager`), choose your region, and click **"Create Project"**.
4. In the **Connection Details** popup or sidebar, copy the connection string (ensure the format dropdown is set to `node-postgres` or `Prisma`). It will look like:
   ```text
   postgresql://alex:password@ep-cool-breeze-12345.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

---

## Step 3: Configure Environment Variables
1. Open the file [.env](file:///c:/samyak%20c++/showroom-manager/.env) in your code editor.
2. Replace the placeholder URL in `DATABASE_URL` with the connection string you copied in Step 2:
   ```env
   DATABASE_URL="postgresql://alex:password@ep-cool-breeze-12345.us-east-2.aws.neon.tech/neondb?sslmode=require"
   ```
3. Save the file.

---

## Step 4: Install Dependencies & Setup Tables
Open your command prompt or terminal in the project directory `c:\samyak c++\showroom-manager` and run:

1. **Install Node modules**:
   ```bash
   npm install
   ```
2. **Push the database schema to Neon DB**:
   This command reads your `schema.prisma` file, connects to your Neon DB, and creates all the tables (User, Profile, Inventory, Sale, Supplier, Category) automatically:
   ```bash
   npx prisma db push
   ```

---

## Step 5: Start the App
To run the server and open the app in Chrome:
- Simply double-click **`Sanyam-Garments-Kholo.bat`**.

It will:
1. Start the Node.js Express server in the background on port `3000`.
2. Open Chrome automatically to **`http://localhost:3000`**.

---

## ✅ What's New?
- **Secure Cloud Storage**: Your inventory, bills, supplier payments, and custom categories are saved directly in your own cloud database.
- **Multi-Device Sync**: If you log in with the same email/phone on another computer running the server, all your data will automatically sync.
- **Fast and Resilient**: If your database connection goes offline, the app continues to function using your browser's local cache and syncs updates once connection returns.
