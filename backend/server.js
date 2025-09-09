const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const connection = require('./db');
const util = require('util');
require('dotenv').config();

const app = express();

// CORS configuration for production
const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:4000',
    credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

// ----------------- ADMIN LOGIN -----------------
app.post('/admin/login', (req, res) => {
    const { email, password } = req.body;
    const sql = "SELECT * FROM admin WHERE email = ? AND password = ?";
    connection.query(sql, [email, password], (err, results) => {
        if (err) return res.status(500).json({ message: "Database error" });
        if (results.length > 0) res.json({ success: true, message: "Login successful" });
        else res.status(401).json({ success: false, message: "Invalid credentials" });
    });
});

// ----------------- GET LATEST EVENT -----------------
app.get('/event', (req, res) => {
    const sql = "SELECT * FROM event_details ORDER BY id DESC LIMIT 1";
    connection.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: "Database error" });

        if (results.length > 0) {
            const event = results[0];

            // Convert features string to array
            if (typeof event.features === 'string' && event.features.length > 0) {
                event.features = event.features.split(',').map(f => f.trim());
            } else {
                event.features = [];
            }

            event.price = event.price || 0; // added price field
            res.json(event);
        } else {
            res.json({
                title: "",
                date: "",
                time: "",
                about: "",
                features: [],
                price: 0
            });
        }
    });
});

// ----------------- UPDATE EVENT -----------------
app.put('/event', (req, res) => {
    const { title, date, time, about, features, price } = req.body;
    const featuresStr = Array.isArray(features) ? features.join(',') : features || '';

    const sql = `
        UPDATE event_details
        SET title=?, date=?, time=?, about=?, features=?, price=?
        WHERE id = (
            SELECT id FROM (SELECT id FROM event_details ORDER BY id DESC LIMIT 1) AS t
        )
    `;

    connection.query(sql, [title, date, time, about, featuresStr, price], (err) => {
        if (err) return res.status(500).json({ success: false, message: "Database error" });
        res.json({ success: true, message: "Latest event updated successfully" });
    });
});

// ----------------- GET REGISTRATIONS -----------------
app.get('/registrations', (req, res) => {
    const sql = "SELECT * FROM registration ORDER BY id DESC";
    connection.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: "Database error" });
        res.json(results);
    });
});

// ----------------- REGISTER PARTICIPANT -----------------
app.post('/register', (req, res) => {
    const { fullName, email, phone, org, role, amount } = req.body;
    const sql = "INSERT INTO registration (fullName, email, phone, org, role, amount, status) VALUES (?, ?, ?, ?, ?, ?, 'Unpaid')";
    connection.query(sql, [fullName, email, phone, org, role, amount || null], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Database error" });
        res.json({ success: true, id: results.insertId });
    });
});

// Razorpay setup (load credentials from DB when needed)
const query = util.promisify(connection.query).bind(connection);

async function getActiveRazorpayCredentials() {
	try {
		const rows = await query(
			"SELECT key_id, key_secret FROM payment_credentials LIMIT 1"
		);
		if (rows && rows.length > 0) {
			return { key_id: rows[0].key_id, key_secret: rows[0].key_secret };
		}
	} catch (e) {
		console.error('Failed to load Razorpay credentials from DB:', e);
	}
	// Fallback to environment variables if DB row not found
	return {
		key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_RCoCmseFQFOsZV',
		key_secret: process.env.RAZORPAY_KEY_SECRET || 'ywTSC2Rc5Wu9JlAUlYWVNew5'
	};
}

async function getRazorpayClient() {
	const creds = await getActiveRazorpayCredentials();
	return new Razorpay({ key_id: creds.key_id, key_secret: creds.key_secret });
}

// Create order endpoint
app.post('/create-order', async (req, res) => {
    try {
        const { amount, currency = 'INR', receipt, notes } = req.body;
        if (!amount) return res.status(400).json({ message: 'Amount required' });

        const options = { amount: Number(amount) * 100, currency, receipt: receipt || `rcpt_${Date.now()}`, notes };
        const razorpay = await getRazorpayClient();
        const order = await razorpay.orders.create(options);
        res.json({
            id: order.id,
            amount: order.amount,
            currency: order.currency
        });
    } catch (err) {
        console.error('Razorpay order error', err);
        res.status(500).json({ message: 'Failed to create order' });
    }
});

// Verify payment endpoint
app.post('/verify-payment', async (req, res) => {
	try {
		const { razorpay_order_id, razorpay_payment_id, razorpay_signature, registrationId } = req.body;
		if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
			return res.status(400).json({ message: 'Missing fields' });
		}

		const { key_secret } = await getActiveRazorpayCredentials();
		const generatedSignature = crypto
			.createHmac('sha256', key_secret)
			.update(razorpay_order_id + '|' + razorpay_payment_id)
			.digest('hex');

		if (generatedSignature === razorpay_signature) {
			// Mark registration as paid if registrationId provided
			if (registrationId) {
				const updateSql = "UPDATE registration SET status='Paid' WHERE id=?";
				connection.query(updateSql, [registrationId], (err) => {
					if (err) console.error('Failed to update payment status:', err);
				});
			}
			return res.json({ success: true });
		}
		return res.status(400).json({ success: false, message: 'Invalid signature' });
	} catch (err) {
		console.error('Verify error', err);
		res.status(500).json({ message: 'Verification failed' });
	}
});

// start server
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

const server = app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
    console.log(`Environment: ${NODE_ENV}`);
    console.log(`Frontend URL: ${process.env.FRONTEND_URL || ''}`);
});

// Increase max listeners to prevent warnings
server.setMaxListeners(0);
