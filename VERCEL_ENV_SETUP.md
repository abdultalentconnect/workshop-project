# Environment Variables Required for Vercel Deployment

## Database Configuration
- `DB_HOST`: Your database host (e.g., gateway01.us-east-1.prod.aws.tidbcloud.com)
- `DB_USER`: Your database username
- `DB_PASSWORD`: Your database password
- `DB_NAME`: Your database name (e.g., event)
- `DB_PORT`: Your database port (e.g., 4000)

## Server Configuration
- `PORT`: Server port (Vercel will set this automatically)
- `HOST`: Server host (Vercel will set this automatically)
- `NODE_ENV`: Set to "production" for Vercel
- `FRONTEND_URL`: Your Vercel deployment URL (e.g., https://your-app.vercel.app)

## Email Configuration
- `EMAIL_USER`: Your email address for sending emails
- `EMAIL_PASS`: Your email app password or SMTP password
- `EMAIL_FROM`: From email address (optional)

## Razorpay Configuration
- `RAZORPAY_KEY_ID`: Your Razorpay key ID
- `RAZORPAY_KEY_SECRET`: Your Razorpay key secret

## Twilio Configuration (Optional)
- `TWILIO_ACCOUNT_SID`: Your Twilio account SID
- `TWILIO_AUTH_TOKEN`: Your Twilio auth token
- `TWILIO_WHATSAPP_NUMBER`: Your Twilio WhatsApp number

## Admin Configuration (Optional)
- `ADMIN_EMAIL`: Default admin email
- `ADMIN_PASSWORD`: Default admin password

## How to Set Environment Variables in Vercel:
1. Go to your Vercel dashboard
2. Select your project
3. Go to Settings > Environment Variables
4. Add each variable with its corresponding value
5. Make sure to set the environment to "Production" for all variables
6. Redeploy your application

## Security Note:
Never commit sensitive information like passwords, API keys, or database credentials to your repository. Always use environment variables for production deployments.
