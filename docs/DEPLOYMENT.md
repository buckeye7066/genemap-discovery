# Deployment Guide

## Architecture Overview

- **Frontend**: Vercel (apps/web)
- **Backend API**: Railway (services/api)
- **Database**: PostgreSQL on Railway
- **DNS**: GoDaddy
- **Payments**: Stripe

## Railway Deployment (Backend API)

### 1. Create Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init
```

### 2. Add PostgreSQL Database

1. Go to Railway dashboard
2. Click "New" → "Database" → "PostgreSQL"
3. Copy `DATABASE_URL` from environment variables

### 3. Configure Environment Variables

In Railway dashboard, add these variables:

```env
DATABASE_URL=<from Railway Postgres>
JWT_SECRET=<generate with: openssl rand -base64 32>
JWT_REFRESH_SECRET=<generate with: openssl rand -base64 32>
COOKIE_SECRET=<generate with: openssl rand -base64 32>
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
STRIPE_SECRET_KEY=<from Stripe dashboard>
STRIPE_WEBHOOK_SECRET=<from Stripe webhook setup>
STRIPE_PRICE_MONTHLY=price_xxx
STRIPE_PRICE_YEARLY=price_xxx
STRIPE_PRICE_TEAM_MONTHLY=price_xxx
STRIPE_PRICE_TEAM_YEARLY=price_xxx
STRIPE_PRICE_DEPT_MONTHLY=price_xxx
STRIPE_PRICE_DEPT_YEARLY=price_xxx
STRIPE_PRICE_ENT_MONTHLY=price_xxx
STRIPE_PRICE_ENT_YEARLY=price_xxx
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
```

### 4. Deploy API

```bash
# Link to Railway project
railway link

# Deploy
cd services/api
railway up
```

### 5. Run Database Migrations

```bash
# Generate Prisma client
railway run pnpm db:generate

# Push schema to database
railway run pnpm db:push
```

### 6. Get API URL

Railway will provide a URL like: `https://your-service.railway.app`

## Vercel Deployment (Frontend)

### 1. Install Vercel CLI

```bash
npm install -g vercel
```

### 2. Configure Environment Variables

Create `.env.production` in `apps/web`:

```env
VITE_API_URL=https://your-api.railway.app
```

### 3. Configure Vercel Project

Create `vercel.json` in project root:

```json
{
  "buildCommand": "pnpm build:web",
  "outputDirectory": "apps/web/dist",
  "installCommand": "pnpm install",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://your-api.railway.app/:path*"
    }
  ]
}
```

### 4. Deploy to Vercel

```bash
# Login
vercel login

# Deploy
vercel --prod
```

## GoDaddy DNS Configuration

### 1. Point Domain to Vercel

1. Log into GoDaddy
2. Go to DNS Management for your domain
3. Add/Update these records:

```
Type    Name    Value                           TTL
A       @       76.76.21.21                     600
CNAME   www     cname.vercel-dns.com            600
```

### 2. Configure Domain in Vercel

1. Go to Vercel project settings
2. Navigate to "Domains"
3. Add your custom domain
4. Follow verification instructions

## Stripe Configuration

### 1. Create Products and Prices

In Stripe Dashboard:

1. **Individual Monthly**: Create recurring price ($9.99/month)
2. **Individual Yearly**: Create recurring price ($99/year)
3. **Team Monthly**: $7.99/month
4. **Team Yearly**: $79.99/year
5. **Department Monthly**: $6.99/month
6. **Department Yearly**: $69.99/year
7. **Enterprise Monthly**: $5.99/month
8. **Enterprise Yearly**: $59.99/year

Copy all price IDs to Railway environment variables.

### 2. Set Up Webhook

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-api.railway.app/billing/webhook`
3. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy webhook signing secret to Railway env var `STRIPE_WEBHOOK_SECRET`

### 3. Test Webhooks

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local API
stripe listen --forward-to localhost:3000/billing/webhook

# Trigger test event
stripe trigger checkout.session.completed
```

## Cookie and CORS Notes

### Production Configuration

For cookies to work across domains:

1. **Same Domain** (Recommended):
   - Frontend: `https://app.yourdomain.com`
   - API: `https://api.yourdomain.com`
   - Set `sameSite: 'lax'` in cookie options

2. **Different Domains** (Not recommended):
   - Requires `sameSite: 'none'` and `secure: true`
   - Browser restrictions may apply

### CORS Headers

API automatically sets:
```
Access-Control-Allow-Origin: <from CORS_ORIGINS>
Access-Control-Allow-Credentials: true
```

### Testing Locally

```bash
# Terminal 1: Start API
cd services/api
pnpm dev

# Terminal 2: Start Frontend
cd apps/web
pnpm dev

# Frontend: http://localhost:5173
# API: http://localhost:3000
```

Update frontend `.env.local`:
```env
VITE_API_URL=http://localhost:3000
```

## Health Checks

### API Health
```bash
curl https://your-api.railway.app/health
# Expected: {"status":"ok","timestamp":"2024-01-28T..."}
```

### Database Connection
```bash
# Via Railway CLI
railway run pnpm db:studio
# Opens Prisma Studio to browse database
```

### Stripe Webhooks
Check Stripe Dashboard → Developers → Webhooks for delivery status

## Troubleshooting

### Cookies Not Working

1. Check `CORS_ORIGINS` includes frontend domain
2. Verify `secure: true` in production
3. Check browser DevTools → Application → Cookies
4. Ensure no browser extensions blocking cookies

### Database Connection Errors

1. Verify `DATABASE_URL` is correct
2. Check Railway database is running
3. Run `railway run pnpm db:generate`

### Stripe Webhook Failures

1. Check webhook signing secret is correct
2. Verify endpoint URL is correct
3. Check Railway logs for errors
4. Test with Stripe CLI locally

## Monitoring

### Railway Logs
```bash
railway logs
```

### Vercel Logs
```bash
vercel logs
```

### Database Monitoring
Use Railway dashboard to monitor:
- Connection count
- Query performance
- Storage usage

## Backup and Recovery

See `docs/BACKUP.md` for backup procedures.

## Security Checklist

- [ ] All environment variables set
- [ ] Secrets not committed to git
- [ ] CORS origins restricted to production domains
- [ ] Stripe webhooks secured with signing secret
- [ ] Database backups enabled on Railway
- [ ] SSL/TLS enabled (automatic on Vercel/Railway)
- [ ] Rate limiting configured
- [ ] Error messages don't leak secrets
