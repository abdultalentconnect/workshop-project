const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const connection = require('./db');
const util = require('util');
require('dotenv').config();
const nodemailer = require('nodemailer');
const twilio = require('twilio'); // Import Twilio SDK

const app = express();

// CORS configuration for production
const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:4000',
    credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

// ----------------- DB AVAILABILITY MIDDLEWARE -----------------
function requireDb(req, res, next) {
    try {
        const status = typeof connection.getDbStatus === 'function' ? connection.getDbStatus() : { connected: true };
        if (!status.connected) {
            return res.status(503).json({
                success: false,
                message: 'Service temporarily unavailable: database is not connected.',
                hint: 'Please try again later or contact support.'
            });
        }
        return next();
    } catch (e) {
        return res.status(503).json({ success: false, message: 'Service temporarily unavailable' });
    }
}

// ----------------- HEALTH -----------------
app.get('/health', (req, res) => {
    try {
        const dbStatus = typeof connection.getDbStatus === 'function' ? connection.getDbStatus() : { connected: false };
        res.json({ status: 'ok', db: dbStatus });
    } catch (e) {
        res.status(200).json({ status: 'ok', db: { connected: false } });
    }
});

// ----------------- ADMIN LOGIN -----------------
app.post('/admin/login', requireDb, (req, res) => {
    const { email, password } = req.body;
    const sql = "SELECT * FROM admin WHERE email = ? AND password = ?";
    connection.query(sql, [email, password], (err, results) => {
        if (err) return res.status(500).json({ message: "Database error" });
        if (results.length > 0) res.json({ success: true, message: "Login successful" });
        else res.status(401).json({ success: false, message: "Invalid credentials" });
    });
});

// ----------------- GET LATEST EVENT -----------------
app.get('/event', requireDb, (req, res) => {
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
            
            // Convert targetAudience string to array
            if (typeof event.targetAudience === 'string' && event.targetAudience.length > 0) {
                event.targetAudience = event.targetAudience.split(',').map(a => a.trim());
            } else {
                event.targetAudience = [];
            }
            
            // Set default brand values if not set
            event.brandLogo = event.brandLogo || 'HT';
            event.brandName = event.brandName || 'Event';
            
            res.json(event);
        } else {
            res.json({
                title: "",
                date: "",
                time: "",
                about: "",
                features: [],
                price: 0,
                eventLink: "",
                targetAudience: [],
                brandLogo: "HT",
                brandName: "Event"
            });
        }
    });
});

// ----------------- UPDATE EVENT -----------------
app.put('/event', requireDb, (req, res) => {
    const { title, date, time, about, features, price, eventLink, targetAudience, brandLogo, brandName } = req.body;
    const featuresStr = Array.isArray(features) ? features.join(',') : features || '';
    const targetAudienceStr = Array.isArray(targetAudience) ? targetAudience.join(',') : targetAudience || '';

    const sql = `
        UPDATE event_details
        SET title=?, date=?, time=?, about=?, features=?, price=?, eventLink=?, targetAudience=?, brandLogo=?, brandName=?
        WHERE id = (
            SELECT id FROM (SELECT id FROM event_details ORDER BY id DESC LIMIT 1) AS t
        )
    `;

    connection.query(sql, [title, date, time, about, featuresStr, price, eventLink, targetAudienceStr, brandLogo, brandName], (err) => {
        if (err) return res.status(500).json({ success: false, message: "Database error" });
        res.json({ success: true, message: "Latest event updated successfully" });
    });
});

// ----------------- GET REGISTRATIONS -----------------
app.get('/registrations', requireDb, (req, res) => {
    const sql = "SELECT * FROM registration ORDER BY id DESC";
    connection.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: "Database error" });
        res.json(results);
    });
});

// ----------------- REGISTER PARTICIPANT -----------------
app.post('/register', requireDb, (req, res) => {
    const { fullName, email, phone, org, role, amount } = req.body;
    
    // First, check if email already exists
    const checkEmailSql = "SELECT id, status FROM registration WHERE email = ?";
    connection.query(checkEmailSql, [email], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Database error" });
        
        if (results.length > 0) {
            const existingRegistration = results[0];
            
            // If email exists and already paid
            if (existingRegistration.status === 'Paid') {
                return res.status(400).json({ 
                    success: false, 
                    message: "This email is already registered and payment has been completed. You cannot register again with this email.",
                    alreadyPaid: true 
                });
            }
            
            // If email exists but not paid, update the existing record
            if (existingRegistration.status === 'Unpaid') {
                const updateSql = "UPDATE registration SET fullName=?, phone=?, org=?, role=?, amount=? WHERE id=?";
                connection.query(updateSql, [fullName, phone, org, role, amount || null, existingRegistration.id], (updateErr) => {
                    if (updateErr) return res.status(500).json({ success: false, message: "Database error" });
                    res.json({ 
                        success: true, 
                        id: existingRegistration.id, 
                        message: "Registration updated successfully. Please proceed with payment.",
                        updated: true 
                    });
                });
                return;
            }
        }
        
        // If email doesn't exist, create new registration
        const insertSql = "INSERT INTO registration (fullName, email, phone, org, role, amount, status) VALUES (?, ?, ?, ?, ?, ?, 'Unpaid')";
        connection.query(insertSql, [fullName, email, phone, org, role, amount || null], (insertErr, insertResults) => {
            if (insertErr) return res.status(500).json({ success: false, message: "Database error" });
            res.json({ success: true, id: insertResults.insertId, message: "Registration successful. Please proceed with payment." });
        });
    });
});

// Razorpay setup (env-only)
const query = util.promisify(connection.query).bind(connection);

function getActiveRazorpayCredentials() {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_id || !key_secret) {
        throw new Error('Missing Razorpay credentials. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env');
    }
    return { key_id, key_secret };
}

function getRazorpayClient() {
    const creds = getActiveRazorpayCredentials();
    return new Razorpay({ key_id: creds.key_id, key_secret: creds.key_secret });
}

// Create order endpoint
app.post('/create-order', async (req, res) => {
    try {
        const { amount, currency = 'INR', receipt, notes } = req.body;
        if (!amount) return res.status(400).json({ message: 'Amount required' });

        const options = { amount: Number(amount) * 100, currency, receipt: receipt || `rcpt_${Date.now()}`, notes };
        const razorpay = getRazorpayClient();
        const order = await razorpay.orders.create(options);
        const { key_id } = getActiveRazorpayCredentials();
        res.json({
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            key: key_id
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

        const { key_secret } = getActiveRazorpayCredentials();
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
					
					// Fetch registration details for both emails
					const registrationSql = "SELECT fullName, email, phone FROM registration WHERE id = ?";
					connection.query(registrationSql, [registrationId], async (regErr, regResults) => {
						if (regErr) {
							console.error('Failed to fetch registration details for email:', regErr);
							return;
						}
						if (regResults.length === 0) {
							console.error('Registration not found for ID:', registrationId);
							return;
						}
						const candidate = regResults[0];
						
						// 1. Send immediate Payment Successful email
						const paymentSuccessSubject = "✅ Payment Successful – Thank You for Registering!";
						const paymentSuccessHtmlContent = `
							<p>Hi ${candidate.fullName},</p>
							<p>Thank you for registering for the TalentConnect Workshop! 🎉</p>
							<p>We’ve received your payment successfully.<br/>What’s next?</p>
							<ul>
								<li>🔹 You’ll shortly receive a confirmation email with all the event details (topic, date, time & joining link).</li>
								<li>🔹 Keep an eye on your inbox (and check your spam folder, just in case).</li>
								<li>🔹 Block your calendar to make sure you don’t miss out!</li>
							</ul>
							<p>We’re excited to have you join us and can’t wait to help you learn, build, and grow with TalentConnect 🚀.</p>
							<p>If you face any issues, please reach out to us at <a href="mailto:support@talentsconnectss.com">support@talentsconnectss.com</a>.</p>
							<p>See you soon! 🙌</p>
							<p>Warm Regards,<br/>Team TalentConnect<br/>Campus to Cubicle</p>
						`;
						await sendEmail(candidate.email, paymentSuccessSubject, paymentSuccessHtmlContent);
						
						// 2. Delay for 10 seconds before sending the second email
						await new Promise(resolve => setTimeout(resolve, 10000));
						
						// Fetch event details for the second email
						const eventSql = "SELECT title, date, time FROM event_details ORDER BY id DESC LIMIT 1";
						connection.query(eventSql, async (eventErr, eventResults) => {
							if (eventErr) {
								console.error('Failed to fetch event details for confirmation email:', eventErr);
								return;
							}
							if (eventResults.length === 0) {
								console.error('No event details found for confirmation email.');
								return;
							}
							const event = eventResults[0];
							const eventLink = process.env.FRONTEND_URL || 'http://localhost:4000'; // Assuming frontend URL for event link
							const confirmationSubject = "🎉 You’re In! Workshop Registration Confirmed";
							const confirmationHtmlContent = `
								<p>Hi ${candidate.fullName},</p>
								<p>Great news – your spot for the TalentConnect Workshop is confirmed! 🚀</p>
								<p>Here are your details:</p>
								<p>📌 Topic: ${event.title}</p>
								<p>📅 Date: ${event.date}</p>
								<p>⏰ Time: ${event.time}</p>
								<p>🔗 Event Link: <a href="${eventLink}">${eventLink}</a></p>
								<p>👉 Tip: Join at least 10 mins early so you don’t miss anything!</p>
								<p>Get ready for an exciting session filled with practical learning, real-world insights, and Q&A.</p>
								<p>If you face any issues, just mail us at <a href="mailto:support@talentsconnectss.com">support@talentsconnectss.com</a> – we’ve got you covered.</p>
								<p>See you at the workshop! 🙌</p>
								<p>Cheers,<br/>Team TalentConnect<br/>Campus to Cubicle</p>
							`;
							await sendEmail(candidate.email, confirmationSubject, confirmationHtmlContent);
						});
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

// ----------------- SEND WHATSAPP MESSAGE -----------------
app.post('/send-whatsapp', async (req, res) => {
    const { to, message } = req.body; // 'to' should be the recipient's phone number with country code (e.g., +1234567890)

    if (!to || !message) {
        return res.status(400).json({ success: false, message: 'Recipient phone number and message are required.' });
    }

    // Twilio credentials from .env
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER; // e.g., 'whatsapp:+14155238886' or your purchased Twilio number

    // Initialize Twilio client
    const client = new twilio(accountSid, authToken);

    try {
        await client.messages.create({
            body: message,
            from: `whatsapp:${twilioWhatsAppNumber}`, // Your Twilio WhatsApp number (e.g., whatsapp:+17816784772)
            to: `whatsapp:${to}` // Recipient's WhatsApp number
        });

        console.log('WhatsApp message sent successfully via Twilio');
        res.json({ success: true, message: 'WhatsApp message sent successfully via Twilio.' });

    } catch (error) {
        console.error('Error sending WhatsApp message via Twilio:', error.message);
        res.status(500).json({ success: false, message: 'Failed to send WhatsApp message via Twilio.' });
    }
});

// Email transporter setup (supports Gmail, SMTP service, or custom host)
let transporter = null;

try {
    const smtpUrl = process.env.SMTP_URL;
    const smtpService = process.env.SMTP_SERVICE || process.env.EMAIL_SERVICE; // e.g., 'gmail'
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
    const smtpSecureEnv = process.env.SMTP_SECURE;
    const smtpSecure = typeof smtpSecureEnv === 'string' ? smtpSecureEnv.toLowerCase() === 'true' : undefined;

    const emailUser = process.env.EMAIL_USER || process.env.SMTP_USER;
    const emailPass = process.env.EMAIL_PASS || process.env.SMTP_PASS;

    if (smtpUrl) {
        transporter = nodemailer.createTransport(smtpUrl);
    } else if (smtpHost) {
        if (!emailUser || !emailPass) {
            console.error('Email disabled: Missing SMTP_USER/SMTP_PASS (or EMAIL_USER/EMAIL_PASS) for custom SMTP host.');
        } else {
            transporter = nodemailer.createTransport({
                host: smtpHost,
                port: smtpPort || 587,
                secure: typeof smtpSecure === 'boolean' ? smtpSecure : false,
                auth: { user: emailUser, pass: emailPass }
            });
        }
    } else if (smtpService || emailUser || emailPass) {
        // Default to service transport (gmail or others) if any related env is present
        if (!emailUser || !emailPass) {
            console.error('Email disabled: Missing EMAIL_USER/EMAIL_PASS (or SMTP_USER/SMTP_PASS).');
        } else {
            console.log('Creating Gmail transporter with user:', emailUser);
            transporter = nodemailer.createTransport({
                service: smtpService || 'gmail',
                auth: { user: emailUser, pass: emailPass }
            });
            console.log('Gmail transporter created successfully');
        }
    } else {
        console.warn('Email transporter not configured. Set SMTP_URL or SMTP_HOST with credentials, or EMAIL_USER/EMAIL_PASS for Gmail.');
    }
} catch (e) {
    console.error('Failed to configure email transporter:', e);
    transporter = null;
}

async function sendEmail(to, subject, content) {
    try {
        if (!transporter) {
            throw new Error('Email transporter is not configured.');
        }
        console.log('Attempting to send email to:', to);
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

        const fromAddress = (process.env.EMAIL_FROM || process.env.EMAIL_USER || process.env.SMTP_USER || 'no-reply@localhost');
        console.log('Sending email from:', fromAddress);
        const info = await transporter.sendMail({
			from: fromAddress,
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
