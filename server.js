const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

// Load environment variables
dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'sanyam_garments_secret_key_2026_xyz';

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the showroom-manager directory
app.use(express.static(path.join(__dirname)));

// JWT authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token missing' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// ─── AUTH ENDPOINTS ──────────────────────────────────────────

// Register Email/Password
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    const passHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passHash
      }
    });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: '' }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// Login Email/Password
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required.' });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.passHash) {
      return res.status(400).json({ error: 'Email not registered or invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.passHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect password.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone || '' }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// Login/Register verified Phone Number
app.post('/api/auth/phone-login', async (req, res) => {
  try {
    const { phone, name } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required.' });
    }

    const cleanPhone = phone.replace(/\s/g, '');
    let user = await prisma.user.findUnique({ where: { phone: cleanPhone } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: name || 'Shop Owner',
          phone: cleanPhone
        }
      });
    }

    const token = jwt.sign({ id: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email || '', phone: user.phone }
    });
  } catch (error) {
    console.error('Phone login error:', error);
    res.status(500).json({ error: 'Server error during phone login.' });
  }
});

// ─── PROFILE ENDPOINTS ────────────────────────────────────────

// Save/Update Shop Profile
app.post('/api/profile', async (req, res) => {
  try {
    const userId = req.query.userId;
    const { shopName, ownerName, shopAddress, shopPhone, upiId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });

    const profile = await prisma.profile.upsert({
      where: { id: userId },
      update: {
        shop_name: shopName,
        owner_name: ownerName,
        shop_address: shopAddress || null,
        shop_phone: shopPhone || null,
        upi_id: upiId || null,
        setup_done: true
      },
      create: {
        id: userId,
        shop_name: shopName,
        owner_name: ownerName,
        shop_address: shopAddress || null,
        shop_phone: shopPhone || null,
        upi_id: upiId || null,
        setup_done: true
      }
    });

    res.json({ status: 'ok', profile });
  } catch (error) {
    console.error('Save profile error:', error);
    res.status(500).json({ error: 'Server error saving profile.' });
  }
});

// ─── CONFIG ENDPOINTS ─────────────────────────────────────────

// Get config
app.get('/api/config', (req, res) => {
  // Return firebase credentials as empty strings if not configured. Supabase is completely deleted.
  res.json({
    firebase: {
      apiKey: process.env.FIREBASE_API_KEY || "",
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
      projectId: process.env.FIREBASE_PROJECT_ID || "",
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
      appId: process.env.FIREBASE_APP_ID || ""
    }
  });
});

app.post('/api/config', (req, res) => {
  // Simple stub for UI compatibility - client config updates are local-only or env-managed
  res.json({ status: 'ok' });
});

// ─── DATA SYNC ENDPOINTS ──────────────────────────────────────

// Load all user data (Inventory, Sales, Suppliers, Categories, Profile)
app.get('/api/data', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId || userId === 'default') {
      // Return empty/demo payload template for guest access
      return res.json({
        inventory: [],
        sales: [],
        suppliers: [],
        categories: ["Shirts","T-shirts","Jeans","Jackets","Dresses","Other"],
        upiId: ""
      });
    }

    const [profile, inventory, sales, suppliers, categories] = await Promise.all([
      prisma.profile.findUnique({ where: { id: userId } }),
      prisma.inventory.findMany({ where: { user_id: userId } }),
      prisma.sale.findMany({ where: { user_id: userId } }),
      prisma.supplier.findMany({ where: { user_id: userId } }),
      prisma.category.findMany({ where: { user_id: userId } })
    ]);

    // Format fields to match frontend's expected properties
    const formattedInventory = inventory.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      size: item.size,
      buyPrice: item.buy_price,
      sellPrice: item.sell_price,
      qty: item.qty,
      minAlert: item.min_alert
    }));

    const formattedSales = sales.map(s => {
      let parsedItems = [];
      try {
        parsedItems = typeof s.items === 'string' ? JSON.parse(s.items) : s.items;
      } catch (e) {
        parsedItems = s.items || [];
      }
      return {
        id: s.id,
        items: parsedItems,
        itemId: s.item_id || "",
        itemName: s.item_name || "",
        size: s.size || "",
        qty: s.qty,
        cost: s.cost,
        revenue: s.revenue,
        profit: s.profit,
        discount: s.discount,
        discountPct: s.discount_pct,
        customerName: s.customer_name || "",
        customerPhone: s.customer_phone || "",
        timestamp: Number(s.timestamp)
      };
    });

    const formattedSuppliers = suppliers.map(s => ({
      id: s.id,
      name: s.name,
      contact: s.contact || "",
      amount: s.amount,
      dueDate: s.due_date || "",
      status: s.status
    }));

    const formattedCategories = categories.length > 0 
      ? categories.map(c => c.name) 
      : ["Shirts","T-shirts","Jeans","Jackets","Dresses","Other"];

    res.json({
      profile: profile ? {
        shopName: profile.shop_name,
        ownerName: profile.owner_name,
        shopAddress: profile.shop_address || "",
        shopPhone: profile.shop_phone || "",
        upiId: profile.upi_id || "",
        setupDone: profile.setup_done
      } : null,
      inventory: formattedInventory,
      sales: formattedSales,
      suppliers: formattedSuppliers,
      categories: formattedCategories,
      upiId: profile?.upi_id || ""
    });
  } catch (error) {
    console.error('Load data error:', error);
    res.status(500).json({ error: 'Server error loading dashboard data.' });
  }
});

// Sync/Save all user data (Bulk Upsert/Replace in transaction)
app.post('/api/data', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId || userId === 'default') {
      return res.status(400).json({ error: 'Valid userId is required for syncing.' });
    }

    const { inventory, sales, categories, suppliers, upiId } = req.body;

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(400).json({ error: 'User does not exist.' });
    }

    // Execute synchronizations inside a PostgreSQL transaction to ensure data integrity
    await prisma.$transaction([
      // 1. Clear and write categories
      prisma.category.deleteMany({ where: { user_id: userId } }),
      prisma.category.createMany({
        data: (categories || []).map(catName => ({
          user_id: userId,
          name: catName
        }))
      }),

      // 2. Clear and write inventory
      prisma.inventory.deleteMany({ where: { user_id: userId } }),
      prisma.inventory.createMany({
        data: (inventory || []).map(i => ({
          id: i.id,
          user_id: userId,
          name: i.name,
          category: i.category,
          size: i.size,
          buy_price: parseFloat(i.buyPrice) || 0,
          sell_price: parseFloat(i.sellPrice) || 0,
          qty: parseInt(i.qty) || 0,
          min_alert: parseInt(i.minAlert) || 0
        }))
      }),

      // 3. Clear and write sales
      prisma.sale.deleteMany({ where: { user_id: userId } }),
      prisma.sale.createMany({
        data: (sales || []).map(s => ({
          id: s.id,
          user_id: userId,
          items: s.items || [],
          item_id: s.itemId || null,
          item_name: s.itemName || null,
          size: s.size || null,
          qty: parseInt(s.qty) || 0,
          cost: parseFloat(s.cost) || 0,
          revenue: parseFloat(s.revenue) || 0,
          profit: parseFloat(s.profit) || 0,
          discount: parseFloat(s.discount) || 0,
          discount_pct: parseFloat(s.discountPct) || 0,
          customer_name: s.customerName || null,
          customer_phone: s.customerPhone || null,
          timestamp: BigInt(s.timestamp || Date.now())
        }))
      }),

      // 4. Clear and write suppliers
      prisma.supplier.deleteMany({ where: { user_id: userId } }),
      prisma.supplier.createMany({
        data: (suppliers || []).map(s => ({
          id: s.id,
          user_id: userId,
          name: s.name,
          contact: s.contact || null,
          amount: parseFloat(s.amount) || 0,
          due_date: s.dueDate || null,
          status: s.status || 'pending'
        }))
      }),

      // 5. Update upi_id in Profile
      prisma.profile.upsert({
        where: { id: userId },
        update: {
          upi_id: upiId || null
        },
        create: {
          id: userId,
          shop_name: 'Sanyam Garments',
          owner_name: user.name || 'Owner',
          upi_id: upiId || null,
          setup_done: false // Marks that full shop setup is still pending
        }
      })
    ]);

    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Data sync error:', error);
    res.status(500).json({ error: 'Server error synchronizing data.' });
  }
});

// Fallback index.html route for client side routing or root
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`\n=============================================`);
  console.log(`  SANYAM GARMENTS - Server Running!`);
  console.log(`  Website: http://localhost:${PORT}`);
  console.log(`=============================================\n`);
});
