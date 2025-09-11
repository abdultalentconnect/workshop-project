const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const connection = require('./db');
const util = require('util');
require('dotenv').config();
const nodemailer = require('nodemailer');

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
                price: 0,
                eventLink: ""
            });
        }
    });
});

// ----------------- UPDATE EVENT -----------------
app.put('/event', (req, res) => {
    const { title, date, time, about, features, price, eventLink } = req.body;
    const featuresStr = Array.isArray(features) ? features.join(',') : features || '';

    const sql = `
        UPDATE event_details
        SET title=?, date=?, time=?, about=?, features=?, price=?, eventLink=?
        WHERE id = (
            SELECT id FROM (SELECT id FROM event_details ORDER BY id DESC LIMIT 1) AS t
        )
    `;

    connection.query(sql, [title, date, time, about, featuresStr, price, eventLink], (err) => {
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
		const { razorpay_order_id, razorpay_payment_id, razorpay_signature, registrationId, status } = req.body;

		// If frontend sent an explicit failure/cancel status, send failure email and exit
		if (status && registrationId) {
			const subject = status === 'cancelled' ? "❌ Payment Cancelled: TalentConnect Workshop Registration" : "❌ Payment Failed: TalentConnect Workshop Registration";
			const textContent = `
				<p>Hi,</p>
				<p>Your payment for the TalentConnect Workshop registration was not completed (${status}).<br/>
				Your registration remains unpaid. You can try again anytime.</p>
				<p>If you believe this is an error or need assistance, please contact us at <a href="mailto:support@talentsconnectss.com">support@talentsconnectss.com</a>.</p>
				<p>Cheers,<br/>Team TalentConnect<br/>Campus to Cubicle</p>
			`;
			await sendFailureEmail(registrationId, subject, textContent);
			return res.status(400).json({ success: false, message: status });
		}

		// If essential Razorpay fields are missing, treat as failure when we have a registrationId
		if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
			if (registrationId) {
				await sendFailureEmail(registrationId, "❌ Payment Failed: TalentConnect Workshop Registration", `
					<p>Hi,</p>
					<p>Unfortunately, your payment for the TalentConnect Workshop registration was not successful.<br/>
					Your registration remains unpaid. You can try again anytime.</p>
					<p>If you believe this is an error or need assistance, please contact us at <a href="mailto:support@talentsconnectss.com">support@talentsconnectss.com</a>.</p>
					<p>Cheers,<br/>Team TalentConnect<br/>Campus to Cubicle</p>
				`);
				return res.status(400).json({ success: false, message: 'Missing fields' });
			}
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
				connection.query(updateSql, [registrationId], async (err) => {
					if (err) console.error('Failed to update payment status:', err);
					
					const registrationSql = "SELECT fullName, email, phone FROM registration WHERE id = ?";
					connection.query(registrationSql, [registrationId], async (regErr, regResults) => {
						if (regErr) console.error('Failed to fetch registration details:', regErr);
						else if (regResults.length > 0) {
							const candidate = regResults[0];
							const eventSql = "SELECT title, date, time, eventLink FROM event_details ORDER BY id DESC LIMIT 1";
							connection.query(eventSql, async (eventErr, eventResults) => {
								if (eventErr) console.error('Failed to fetch event details:', eventErr);
								else if (eventResults.length > 0) {
									const event = eventResults[0];
									const actualEventLink = event.eventLink || (process.env.FRONTEND_URL || 'http://localhost:4000');
									const subject = "🎉 You’re In! Workshop Registration Confirmed";
									const textContent = `
										<p>Hi ${candidate.fullName},</p>
										<p>Great news – your spot for the TalentConnect Workshop is confirmed! 🚀</p>
										<p>Here are your details:</p>
										<p>📌 Topic: ${event.title}</p>
										<p>📅 Date: ${event.date}</p>
										<p>⏰ Time: ${event.time}</p>
										<p>🔗 Event Link: <a href="${actualEventLink}">${actualEventLink}</a></p>
										<p>👉 Tip: Join at least 10 mins early so you don’t miss anything!</p>
										<p>Get ready for an exciting session filled with practical learning, real-world insights, and Q&A.</p>
										<p>If you face any issues, just mail us at <a href="mailto:support@talentsconnectss.com">support@talentsconnectss.com</a> – we’ve got you covered.</p>
										<p>See you at the workshop! 🙌</p>
										<p>Cheers,<br/>Team TalentConnect<br/>Campus to Cubicle</p>
									`;
									await sendEmail(candidate.email, subject, textContent);
								}
							});
						}
					});
				});
			}
			return res.json({ success: true });
		}
		
		// Payment verification failed due to invalid signature
		await sendFailureEmail(registrationId, "❌ Payment Failed: TalentConnect Workshop Registration", `
			<p>Hi,</p>
			<p>Unfortunately, your payment for the TalentConnect Workshop registration was not successful.<br/>
			Your registration remains unpaid. You can try again anytime.</p>
			<p>If you believe this is an error or need assistance, please contact us at <a href="mailto:support@talentsconnectss.com">support@talentsconnectss.com</a>.</p>
			<p>Cheers,<br/>Team TalentConnect<br/>Campus to Cubicle</p>
		`);
		return res.status(400).json({ success: false, message: 'Invalid signature' });
	} catch (err) {
		console.error('Verify error', err);
		
		// Optionally send a generic error email if registrationId is available
		if (req.body.registrationId) {
			await sendFailureEmail(req.body.registrationId, "⚠️ Registration Error: TalentConnect Workshop", `
				<p>Hi,</p>
				<p>There was an unexpected error during your registration for the TalentConnect Workshop.<br/>
				Please try again or contact <a href="mailto:support@talentsconnectss.com">support@talentsconnectss.com</a> if the issue persists.</p>
				<p>Cheers,<br/>Team TalentConnect<br/>Campus to Cubicle</p>
			`);
		}
		res.status(500).json({ message: 'Verification failed' });
	}
});

// Email transporter setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function sendEmail(to, subject, content) {
    try {
        let htmlContent;

        // Check if the content already contains HTML tags
        if (/<[a-z][\s\S]*>/i.test(content)) {
            htmlContent = content; // Content is already HTML, use as is
        } else {
            // Process plain text content
            htmlContent = content.replace(/\n\n/g, '</p><p>');
            htmlContent = htmlContent.replace(/\n/g, '<br/>');
            htmlContent = `<p>${htmlContent}</p>`;
        }

        const info = await transporter.sendMail({
			from: process.env.EMAIL_USER,
            to,
            subject,
            html: htmlContent,
        });
        console.log(`Email sent to ${to}`);
        console.log('Nodemailer response:', info); // Add this line
    } catch (error) {
        console.error(`Error sending email to ${to}:`, error);
    }
}

async function sendFailureEmail(registrationId, subject, textContent) {
	if (!registrationId) {
		console.error('sendFailureEmail: No registrationId provided.');
		return;
	}

	const registrationSql = "SELECT fullName, email FROM registration WHERE id = ?";
	const regResults = await query(registrationSql, [registrationId]);

	if (regResults.length > 0) {
		const candidate = regResults[0];
		await sendEmail(candidate.email, subject, textContent);
		// Update registration status to 'Unpaid' for any failure scenario
		const updateSql = "UPDATE registration SET status='Unpaid' WHERE id=?";
		await query(updateSql, [registrationId]);
	} else {
		console.error(`Failed to find registration details for ID: ${registrationId}`);
	}
}

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
