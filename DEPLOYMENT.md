# 🚀 Deployment Guide - Waste Level Monitoring Simulator

Complete instructions for deploying the simulator to production environments.

---

## 📋 Table of Contents

1. [Local Deployment](#local-deployment)
2. [Heroku Deployment](#heroku-deployment)
3. [Vercel Deployment](#vercel-deployment)
4. [AWS Deployment](#aws-deployment)
5. [DigitalOcean Deployment](#digitalocean-deployment)

---

## Local Deployment

### Option 1: Manual Setup

```bash
# Install backend dependencies
cd backend
npm install
npm start  # Runs on port 5051

# In another terminal, install frontend dependencies
cd frontend
npm install
npm run dev  # Runs on port 3000
```

### Option 2: Using Setup Script

```bash
# Make script executable
chmod +x setup.sh

# Run setup
./setup.sh

# Follow the instructions printed by the script
```

## Heroku Deployment

### Backend Deployment

```bash
# Install Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# Login to Heroku
heroku login

# Create app
cd backend
heroku create your-app-name-backend

# Set environment variables
heroku config:set NODE_ENV=production

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

### Frontend Deployment (Connect to Backend)

Update `frontend/src/App.jsx`:
```javascript
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//your-app-name-backend.herokuapp.com`;
```

```bash
cd frontend
heroku create your-app-name-frontend
heroku buildpacks:add heroku/nodejs
git push heroku main
```

---

## Vercel Deployment

### Frontend On Vercel

1. Create a Vercel account and open the Vercel dashboard.
2. Click `Add New...` and choose `Project`.
3. Import the `Waste_Simulator` repository from GitHub.
4. Set the project root directory to `frontend`.
5. Leave the framework preset as Vite if Vercel does not auto-detect it.
6. Set the build command to `npm run build`.
7. Set the output directory to `dist`.
8. Do not add a custom server command.
9. Add these environment variables in the Vercel project settings:

```env
VITE_API_URL=https://waste-simulator-backend.onrender.com
VITE_WS_URL=wss://waste-simulator-backend.onrender.com
```

10. Deploy the project.
11. After the first deploy, open the production URL and confirm that `/login`, `/register`, and `/dashboard` all load directly.
12. If direct routes 404, confirm that [frontend/vercel.json](frontend/vercel.json) is included in the deployed build.
13. When the backend URL changes, update `VITE_API_URL` and `VITE_WS_URL` in Vercel and redeploy.

### Add SPA Routing

The frontend is a client-side React Router app, so Vercel needs a rewrite to serve `index.html` for direct `/dashboard`, `/login`, and `/register` hits. This repo includes [frontend/vercel.json](frontend/vercel.json).

### Deploy The Backend Separately

Use Render, Fly.io, or a VPS for the backend. Set these backend env vars:

```env
PORT=5051
JWT_SECRET=replace-with-a-long-random-secret
CORS_ORIGIN=https://waste-simulator-nine.vercel.app,https://waste-simulator-sooty.vercel.app
```

### Render Backend Deployment

Use Render if you want the backend hosted separately with a simple web service and automatic HTTPS.

1. Create a Render account and open the Render dashboard.
2. Click `New +` and choose `Web Service`.
3. Connect your GitHub repository for `Waste_Simulator`.
4. Set the root directory to `backend`.
5. Give the service a name such as `waste-simulator-backend`.
6. Set the runtime to Node.
7. Set the build command to `npm install`.
8. Set the start command to `npm start`.
9. Leave the port as the default Render runtime port; the app reads `process.env.PORT` automatically.
10. Add these environment variables in the Render service settings:

```env
JWT_SECRET=replace-with-a-long-random-secret
CORS_ORIGIN=https://waste-simulator-nine.vercel.app,https://waste-simulator-sooty.vercel.app
```

11. Deploy the service.
12. Copy the Render public URL, for example `https://waste-simulator-backend.onrender.com`.
13. Confirm the backend health endpoint responds at `/api/health`.
14. Confirm WebSocket traffic works against the Render URL.

15. In Vercel, set these frontend environment variables:

```env
VITE_API_URL=https://waste-simulator-backend.onrender.com
VITE_WS_URL=wss://waste-simulator-backend.onrender.com
```

16. Redeploy the frontend on Vercel.

17. Open the Vercel frontend URL and sign in to confirm that login, bin creation, realtime updates, and notifications work.

For local development, keep `frontend/.env.local` pointed at the local API host.

---

## AWS Deployment

### Using AWS Elastic Beanstalk

#### Backend

```bash
# Install EB CLI
pip install awsebcli

cd backend

# Initialize EB application
eb init -p "Node.js 18 running on 64bit Amazon Linux 2" waste-simulator-backend

# Create environment
eb create waste-simulator-backend-env

# Deploy
eb deploy

# View logs
eb logs
```

#### Frontend

```bash
cd frontend

# Build production version
npm run build

# Deploy to S3 + CloudFront using AWS Amplify
npm install -g @aws-amplify/cli
amplify init
amplify add hosting
amplify publish
```

### Using EC2

```bash
# SSH into instance
ssh -i your-key.pem ec2-user@your-instance-ip

# Install Node.js
curl -sL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Clone repository
git clone your-repo-url
cd waste-simulator

# Install and run
cd backend
npm install
npm start &

cd ../frontend
npm install
npm run build
npm install -g serve
serve -s dist -l 3000 &
```

---

## DigitalOcean Deployment

### Using App Platform

```bash
# Install doctl CLI
brew install doctl

# Authenticate
doctl auth init

# Create app
doctl apps create --spec app.yaml
```

### app.yaml

```yaml
name: waste-simulator
services:
  - name: backend
    github:
      repo: your-username/waste-simulator
      branch: main
    build_command: npm install
    run_command: cd backend && npm start
    http_port: 5000
    
  - name: frontend
    github:
      repo: your-username/waste-simulator
      branch: main
    build_command: cd frontend && npm install && npm run build
    run_command: cd frontend && npm install -g serve && serve -s dist -l 3000
    http_port: 3000
```

### Using Droplet

```bash
# SSH into droplet
ssh root@your-droplet-ip

# Install Node.js
curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 (process manager)
sudo npm install -g pm2

# Clone and setup
git clone your-repo-url
cd waste-simulator

# Start backend with PM2
cd backend
npm install
pm2 start server-auth.js --name "waste-backend"

# Start frontend with PM2
cd ../frontend
npm install && npm run build
pm2 serve dist 3000 --spa --name "waste-frontend"

# Save PM2 configuration
pm2 save
pm2 startup
```

---

## Environment Variables

### Backend (.env)

```env
PORT=5051
NODE_ENV=production
DEVICE_ID=BIN-001
DEVICE_LOCATION=Zone 1
INITIAL_WASTE_LEVEL=0
MAX_CAPACITY=100
DEFAULT_ALERT_THRESHOLD=80
DEFAULT_FILL_RATE=5
CHECK_INTERVAL=5000
CORS_ORIGIN=https://your-frontend-domain.com
```

### Frontend (.env)

```env
VITE_API_URL=https://your-backend-url.com
VITE_WS_URL=wss://your-backend-url.com
```

---

## Domain Setup

### Add Custom Domain to Heroku

```bash
# Add domain
heroku domains:add your-domain.com

# Update DNS records with Heroku's nameservers
# See Heroku dashboard for nameservers
```

### Add Custom Domain to Vercel

```bash
# In Vercel Dashboard:
# Settings → Domains → Add
# Follow DNS configuration instructions
```

---

## SSL/TLS Certificates

Most platforms (Heroku, Vercel, AWS) provide free SSL certificates. For others:

### Let's Encrypt with Certbot

```bash
sudo apt-get install certbot
sudo certbot certonly --standalone -d your-domain.com

# For Nginx
sudo certbot certonly --webroot -w /path/to/frontend/dist -d your-domain.com
```

### Configure Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
    }
    
    location /api {
      proxy_pass http://localhost:5051;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Monitoring & Logging

### PM2 Monitoring

```bash
# Install PM2 Plus
pm2 install pm2-logrotate
pm2 install pm2-auto-pull

# Monitor dashboard
pm2 monit

# View logs
pm2 logs
```

### CloudWatch (AWS)

```bash
# CloudWatch logs are automatically available for Elastic Beanstalk
# View in AWS Console or via CLI:
aws logs tail /aws/elasticbeanstalk/waste-simulator/var/log/app.log --follow
```

### New Relic Monitoring

```bash
npm install newrelic

# Add to server-auth.js
require('newrelic');
```

---

## Performance Optimization

### Enable Compression

```javascript
// In server-auth.js
const compression = require('compression');
app.use(compression());
```

### Add Caching Headers

```javascript
app.use((req, res, next) => {
  res.set('Cache-Control', 'public, max-age=3600');
  next();
});
```

### Database Connection Pooling

For future database integration:
```javascript
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

---

## Troubleshooting

### Connection Issues

```bash
# Check if backend is accessible
curl http://backend-url/api/health

# Check WebSocket connection
wscat -c ws://backend-url
```

### CORS Errors

Ensure `CORS_ORIGIN` environment variable matches frontend URL:
```bash
# Backend .env
CORS_ORIGIN=https://your-frontend-url.com
```

### High Memory Usage

```bash
# Limit Node.js memory
NODE_OPTIONS="--max-old-space-size=512" npm start
```

---

## Security Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS/WSS for all connections
- [ ] Set appropriate CORS origins
- [ ] Implement rate limiting
- [ ] Enable HSTS headers
- [ ] Use strong passwords for databases
- [ ] Keep dependencies updated
- [ ] Run security audits: `npm audit`

---

## Rollback Procedure

### Heroku
```bash
heroku releases
heroku rollback v123
```

### Vercel
```bash
# Automatic rollback available in dashboard
# Settings → Deployment History → Rollback
```

---

## Cost Optimization

| Platform | Monthly Cost |
|----------|-------------|
| Heroku (free tier) | $0 (5 dynos sleep) |
| Heroku (production) | $25-50 |
| Vercel (free tier) | $0 |
| DigitalOcean | $5-12 |
| AWS (free tier) | $0-15 |

---

## Support

For deployment issues:
1. Check Render logs in the dashboard
2. Test API: `curl http://localhost:5051/api/health`
3. Check WebSocket: Browser DevTools → Network → WS
4. Monitor resources: `pm2 monit`

---

**Happy deploying!** 🚀
