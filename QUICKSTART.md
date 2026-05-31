# ⚡ Quick Start - 5 Minutes to Running

Get the waste level monitoring simulator up and running in minutes.

---

## 🎯 Prerequisites

- Node.js 16+ ([Download](https://nodejs.org/))
- npm (comes with Node.js)
- Git (optional, for cloning)

---

## ✅ Install & Run

### Local Setup (5 mins)

#### Terminal 1: Backend

```bash
cd backend
npm install
npm start
```

You'll see:
```
✅ Waste Monitoring Simulator Backend
  Server running on port 5051
  WebSocket: ws://localhost:5051
```

#### Terminal 2: Frontend

```bash
cd frontend
npm install
npm run dev
```

You'll see:
```
  ➜  Local:   http://localhost:3000
```

**Open** http://localhost:3000 in your browser ✨

---

## 🎮 Quick Test

1. **Click "Start"** → Watch bin fill gradually
2. **Drag slider** → Manually set waste level
3. **Adjust Fill Speed** → Change how fast it fills
4. **Hit 80%** → See alert trigger (red bin + notification)
5. **Click Reset** → Empty the bin

---

## 🔧 Quick Settings

| Setting | What It Does | Default |
|---------|-------------|---------|
| Waste Level Slider | Set exact waste % | 0-100 |
| Fill Speed | How fast it fills | 5%/min |
| Alert Threshold | Alert trigger point | 80% |

---

## 📋 API Quick Reference

### Start Simulation (WebSocket)
```javascript
ws.send(JSON.stringify({ type: 'START' }));
```

### Get Current State (REST)
```bash
curl http://localhost:5051/api/health
```

### Set Waste Level (REST)
```bash
curl -X POST http://localhost:5051/api/control/set-level \
  -H "Content-Type: application/json" \
  -d '{"level": 50}'
```

---

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Find process using port 5051
lsof -i :5051

# Kill it (macOS/Linux)
kill -9 <PID>
```

### WebSocket Connection Failed
- Check if backend is running on port 5051
- Refresh browser page
- Check browser console (F12)

### Module Not Found
```bash
# Delete node_modules and reinstall
rm -rf node_modules
npm install
```

---

## 📁 File Structure

```
waste-simulator/
├── backend/        ← Express server (port 5051 locally)
│   └── server-auth.js
├── frontend/       ← React app (port 3000)
│   └── src/
└── README.md
```

---

## 🚀 Next Steps

- **Deploy backend**: See [DEPLOYMENT.md](DEPLOYMENT.md)
- **Extend the app**: See [DEVELOPMENT.md](DEVELOPMENT.md)
- **Project overview**: See [README.md](README.md)

---

## 💡 Key Features

✅ Real-time WebSocket updates  
✅ Animated bin visualization  
✅ Manual controls  
✅ Alert notifications  
✅ Event history logging  
✅ REST API endpoints  

---

## 📞 Common Commands

```bash
# Start backend locally
cd backend && npm start

# Start frontend locally
cd frontend && npm run dev
```

---

**You're ready!** Open http://localhost:3000 and start testing 🎉

For more info, check README.md, DEPLOYMENT.md, or DEVELOPMENT.md
