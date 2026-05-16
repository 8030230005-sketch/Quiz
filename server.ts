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

  app.use(cors());
  app.use(express.json());

  // --- API ROUTES ---
  const apiRouter = express.Router();

  apiRouter.get("/dht", (req, res) => {
    state.sensor.temp += (Math.random() - 0.5) * 0.5;
    state.sensor.humidity += (Math.random() - 0.5) * 1;
    res.json(state.sensor);
  });

  apiRouter.get("/dht/history", (req, res) => {
    res.json(state.history);
  });

  apiRouter.get("/relay/:id/:action", (req, res) => {
    const { id, action } = req.params;
    const relayId = parseInt(id);
    
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

  apiRouter.get("/status", (req, res) => {
    res.json({
      esp32: state.esp32,
      telegram: state.telegram,
      api: { online: true }
    });
  });

  apiRouter.get("/logs", (req, res) => {
    res.json({
      activity: state.logs,
      telegram: state.telegram.commands
    });
  });

  app.use("/api", apiRouter);

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
