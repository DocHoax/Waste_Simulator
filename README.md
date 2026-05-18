# 🗑️ Waste Level Monitoring System - Simulator

A comprehensive **real-time waste bin monitoring simulator** built with React, Node.js, and WebSockets. This system demonstrates how waste levels can be tracked, monitored, and alerted in real-time through an intuitive web interface.

---

## 🎯 Features

✅ **Real-Time Monitoring** - WebSocket-powered live updates  
✅ **Animated Bin Visualization** - Color-coded waste level display  
✅ **Auto-Simulation** - Waste fills automatically over time  
✅ **Manual Controls** - Adjust waste level, fill speed, alert threshold  
✅ **Alert System** - Automatic notifications when bin reaches capacity  
✅ **Event History** - Complete audit log of all events  
✅ **Responsive Design** - Works on desktop, tablet, and mobile  
✅ **REST API** - Full REST endpoints alongside WebSocket  
✅ **Production-Ready Code** - Clean architecture, error handling, logging  

---

## 📋 Project Structure

```
waste-simulator/
├── backend/
│   ├── server.js          # Express + WebSocket server
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Main app component
│   │   ├── main.jsx       # Entry point
│   │   ├── index.css      # Global styles
│   │   └── components/
│   │       ├── BinVisualizer.jsx    # Animated bin
│   │       ├── ControlPanel.jsx     # Simulation controls
│   │       ├── StatusPanel.jsx      # Device info & status
│   │       ├── HistoryPanel.jsx     # Event logs
│   │       └── AlertNotification.jsx # Alert notifications
│   ├── index.html         # HTML template
│   ├── vite.config.js     # Vite configuration
│   └── package.json
│
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 16+ 
- **npm** or **yarn**

### Installation

#### 1. Clone/Setup the project
```bash
# Create project directory
mkdir waste-simulator
cd waste-simulator

# Copy backend files
cp backend/server.js ./backend/
cp backend/package.json ./backend/

# Copy frontend files
cp -r frontend/src ./frontend/
cp frontend/*.* ./frontend/
```

#### 2. Setup Backend
```bash
cd backend
npm install
npm start
```

The backend will start on `http://localhost:5000`

```
╔════════════════════════════════════════╗
║   Waste Monitoring Simulator Backend    ║
║   Server running on port 5000          ║
║   WebSocket: ws://localhost:5000       ║
║   HTTP API: http://localhost:5000/api  ║
╚════════════════════════════════════════╝
```

#### 3. Setup Frontend (in another terminal)
```bash
cd frontend
npm install
npm run dev
```

The frontend will start on `http://localhost:3000`

---

## 💻 Usage

### Dashboard View
1. **Open** `http://localhost:3000` in your browser
2. **See** the animated waste bin and current metrics
3. **Control** the simulation with Start/Stop/Reset buttons
4. **Adjust** waste level with the slider
5. **Modify** fill speed and alert threshold

### Simulation Controls

| Control | Function |
|---------|----------|
| **▶️ Start** | Begin automatic waste filling |
| **⏸️ Stop** | Pause the simulation |
| **🔄 Reset** | Empty the bin (0%) |
| **Waste Level Slider** | Manually set waste percentage |
| **Fill Speed Slider** | Adjust fill rate (0-20%/min) |
| **Alert Threshold Slider** | Set alert trigger point |

### Color Coding

- 🟢 **Green (0-50%)** - Normal operation
- 🟡 **Yellow (50-80%)** - Warning - approaching capacity
- 🔴 **Red (80-100%)** - Critical - alert triggered

### Event History

View all events in the **History** tab:
- Filter by event type
- Sort chronologically
- See timestamps and waste levels
- Track alerts, empties, and manual adjustments

---

## 🔌 API Endpoints

### WebSocket Connection
```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:5000');

// Send control messages
ws.send(JSON.stringify({ type: 'START' }));
ws.send(JSON.stringify({ type: 'STOP' }));
ws.send(JSON.stringify({ type: 'RESET' }));
ws.send(JSON.stringify({ type: 'SET_LEVEL', level: 50 }));
ws.send(JSON.stringify({ type: 'SET_FILL_RATE', rate: 5 }));
ws.send(JSON.stringify({ type: 'SET_ALERT_THRESHOLD', threshold: 80 }));
```

### REST API Endpoints

**Get Current State**
```bash
GET /api/state
```

**Get Event History**
```bash
GET /api/events?limit=100
```

**Get Statistics**
```bash
GET /api/stats
```

**Control Endpoints**
```bash
POST /api/control/start
POST /api/control/stop
POST /api/control/reset
POST /api/control/set-level { "level": 50 }
POST /api/control/set-fill-rate { "rate": 5 }
POST /api/control/set-alert-threshold { "threshold": 80 }
```

**Health Check**
```bash
GET /api/health
```

---

## 📊 Simulator State

The simulator maintains this state:

```javascript
{
  binId: 'BIN-001',                 // Device identifier
  location: 'Zone 1',               // Physical location
  currentLevel: 45.5,               // Current waste % (0-100)
  maxCapacity: 100,                 // Max capacity
  alertThreshold: 80,               // Alert trigger %
  fillRate: 5,                      // Fill speed %/min
  isRunning: true,                  // Simulation status
  lastUpdate: '2024-01-15T14:30:22', // Last update time
  status: 'NORMAL',                 // Status: NORMAL/WARNING/ALERT
  events: [],                       // Event history array
  emptyCount: 3,                    // Total empties
  alertCount: 5                     // Total alerts
}
```

---

## 🎨 Customization

### Change Alert Threshold
Use the **Alert Threshold** slider to set when alerts trigger (default: 80%)

### Modify Fill Speed
Use the **Fill Speed** slider to control how fast waste accumulates (default: 5%/min)

### Device Configuration
Edit `backend/server.js` to change:
```javascript
const simulatorState = {
  binId: 'BIN-001',           // Change device ID
  location: 'Zone 1',         // Change location
  maxCapacity: 100,           // Change capacity
  alertThreshold: 80,         // Change default threshold
  fillRate: 5,                // Change default fill rate
  // ...
};
```

---

## 🧪 Test Scenarios

### Scenario 1: Normal Operations
1. Click **Start**
2. Watch waste fill gradually
3. See color changes as it fills
4. Click **Reset** when full

### Scenario 2: Alert Testing
1. Use **Waste Level Slider** → Set to 85%
2. See **Alert** triggered (red bin, notification)
3. Check alert count in footer
4. Click **Reset**

### Scenario 3: Fast Fill
1. Increase **Fill Speed** to 15%/min
2. Click **Start**
3. Watch bin fill quickly
4. Test system responsiveness

### Scenario 4: Custom Alert Level
1. Change **Alert Threshold** to 60%
2. Click **Start**
3. System alerts at 60% instead of 80%

---

## 🔧 Technical Stack

**Frontend:**
- React 18
- TypeScript (ready)
- Tailwind CSS
- Vite
- WebSocket client

**Backend:**
- Node.js
- Express.js
- WebSocket (ws library)
- In-memory state management

**Real-Time:**
- WebSocket for live updates
- REST API for alternative access
- Event-driven architecture

---

## 📱 Browser Support

- Chrome/Edge 88+
- Firefox 78+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

---

## 🚀 Deployment

### Deploy Backend (Heroku)
```bash
cd backend
heroku create your-app-name
git push heroku main
```

### Deploy Frontend (Vercel)
```bash
cd frontend
npm run build
vercel deploy
```

Update WebSocket URL in `frontend/src/App.jsx`:
```javascript
const wsUrl = `wss://your-backend-url`;
```

---

## 📈 Future Enhancements

- [ ] Multiple bin support
- [ ] Location-based views
- [ ] Database persistence
- [ ] Mobile app version
- [ ] Email/SMS alerts
- [ ] Analytics dashboard
- [ ] Predictive fill time
- [ ] Integration with real hardware sensors

---

## 📝 Event Types

| Type | Description |
|------|-------------|
| `LEVEL_UPDATE` | Waste level changed |
| `ALERT_TRIGGERED` | Alert threshold reached |
| `BIN_EMPTIED` | Bin was reset |
| `MANUAL_SET` | User manually adjusted level |
| `SIMULATION_STARTED` | Simulation began |
| `SIMULATION_STOPPED` | Simulation paused |
| `SETTINGS_CHANGED` | Settings modified |

---

## 🐛 Troubleshooting

**WebSocket Connection Failed**
- Ensure backend is running on `localhost:5000`
- Check browser console for errors
- Verify firewall isn't blocking port 5000

**Data Not Updating**
- Refresh the page
- Check browser console (F12)
- Verify WebSocket is connected (green indicator in header)

**Buttons Not Working**
- Check browser console for errors
- Ensure backend server is running
- Try resetting the page

---

## 📄 License

This project is open-source and available for commercial and personal use.

---

## 👨‍💻 Support

For issues, questions, or feedback, please refer to the inline code comments or raise an issue in your repository.

---

**Built with ❤️ for waste management monitoring**

Happy coding! 🚀
