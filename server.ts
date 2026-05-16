import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

// In-memory data store
const state = {
  relays: {
    1: "off",
    2: "off",
    3: "off",
    4: "off"
  },
  sensor: {
    temp: 26.5,
    humidity: 60
  },
  history: [
    { time: "08:00", temp: 24.1, humidity: 65 },
    { time: "09:00", temp: 25.4, humidity: 62 },
    { time: "10:00", temp: 26.5, humidity: 60 }
  ],
  logs: [
    { type: "system", message: "Dashboard initialized", time: new Date().toLocaleTimeString() }
  ],
  telegram: {
    online: true,
    lastCommand: "/start",
    commands: [
      { user: "Admin", command: "/status", time: "10:05" },
      { user: "Admin", command: "/relay1_on", time: "10:10" }
    ]
  },
  esp32: {
    online: true,
    lastSeen: new Date().toISOString()
  }
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  // CORS MUST BE FIRST
  app.use(cors());
  app.use(express.json());

  // Request logging
  app.use((req, res, next) => {
    console.log(`[Server Log] ${req.method} ${req.url}`);
    next();
  });

  // --- API ROUTES ---
  // Ensure these are defined BEFORE any static or vite middleware
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  app.get("/api/dht", (req, res) => {
    state.sensor.temp += (Math.random() - 0.5) * 0.5;
    state.sensor.humidity += (Math.random() - 0.5) * 1;
    res.json(state.sensor);
  });

  app.get("/api/dht/history", (req, res) => {
    console.log("[Server] Hit /api/dht/history");
    res.json(state.history);
  });

  app.get("/api/relay/:id/:action", (req, res) => {
    console.log(`[Server] Hit /api/relay/${req.params.id}/${req.params.action}`);
    const { id, action } = req.params;
    const relayId = parseInt(id) as 1 | 2 | 3 | 4;
    
    if (state.relays.hasOwnProperty(relayId)) {
      const newState = action === "on" ? "on" : "off";
      state.relays[relayId] = newState;
      
      const log = {
        type: "relay",
        message: `Relay ${id} turned ${newState}`,
        time: new Date().toLocaleTimeString()
      };
      state.logs.unshift(log);
      if (state.logs.length > 50) state.logs.pop();
      
      res.json({ status: "success", relay: id, state: newState });
    } else {
      res.status(400).json({ status: "error", message: "Invalid relay ID" });
    }
  });

  app.get("/api/status", (req, res) => {
    console.log("[Server] Hit /api/status");
    res.json({
      esp32: state.esp32,
      telegram: state.telegram,
      api: { online: true }
    });
  });

  app.get("/api/logs", (req, res) => {
    console.log("[Server] Hit /api/logs");
    res.json({
      activity: state.logs,
      telegram: state.telegram.commands
    });
  });

  // Special catch-all for /api that aren't matched
  app.all("/api/*", (req, res) => {
    console.log(`[Server] 404 on API route: ${req.url}`);
    res.status(404).json({ error: "API route not found" });
  });

  // --- VITE MIDDLEWARE ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
