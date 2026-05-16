// --- Dashboard Configuration ---
const CONFIG = {
    refreshInterval: 3000,
    apiBase: '/api',
    chartHistoryPoints: 20
};

// --- State Management ---
let state = {
    relays: { 1: false, 2: false, 3: false, 4: false },
    sensorHistory: { labels: [], temp: [], humidity: [] },
    chart: null,
    isInitialLoad: true
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initIcons();
    initClock();
    initChart();
    initEventListeners();
    
    // Add a small delay for server spin-up before initial fetch
    setTimeout(() => {
        fetchData(); 
    }, 2000);
    
    // Auto Refresh Loop
    setInterval(fetchData, CONFIG.refreshInterval);
    
    // Hide loader
    setTimeout(() => {
        document.getElementById('loader').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('loader').style.display = 'none';
        }, 500);
    }, 1500);
});

function initIcons() {
    lucide.createIcons();
}

function initClock() {
    const clockEl = document.getElementById('realtime-clock');
    const update = () => {
        const now = new Date();
        clockEl.textContent = now.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        }) + ' | ' + now.toLocaleTimeString();
    };
    update();
    setInterval(update, 1000);
}

function initEventListeners() {
    // Relay control clicks
    document.querySelectorAll('.relay-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.getAttribute('data-id');
            const currentState = state.relays[id];
            toggleRelay(id, !currentState);
        });
    });
}

// --- API Calls ---

async function fetchData(retries = 3) {
    const endpoints = ['dht', 'status', 'logs'];
    try {
        const results = await Promise.all(
            endpoints.map(async (ep) => {
                const url = `${CONFIG.apiBase}/${ep}`;
                const res = await fetch(url);
                if (!res.ok) {
                    throw new Error(`HTTP error! status: ${res.status} on ${url}`);
                }
                const contentType = res.headers.get("content-type");
                if (!contentType || !contentType.includes("application/json")) {
                    const text = await res.text();
                    console.error(`Expected JSON for ${url} but got content-type: ${contentType}. Body starts with: ${text.substring(0, 50)}`);
                    throw new Error(`Invalid content-type for ${url}`);
                }
                return res.json();
            })
        );

        const [dht, status, logs] = results;
        updateSensorUI(dht);
        updateStatusUI(status);
        updateLogsUI(logs);
        updateChartData(dht);
        
        // Mark API as online
        document.getElementById('api-status').classList.remove('offline');
        document.getElementById('api-status').classList.add('online');
    } catch (error) {
        console.error('Fetch error:', error);
        
        // Detailed error message
        let errorMsg = 'API Connection Error';
        if (error.message.includes('status:')) {
            errorMsg = `Server Error: ${error.message.split(' ').pop()}`;
        } else if (error.message.includes('content-type')) {
            errorMsg = 'Invalid API Response';
        }

        if (retries > 0) {
            console.warn(`Fetch failed, retrying in 1s... (${retries} left)`, error);
            showToast(`${errorMsg} - Retrying...`, 'info');
            setTimeout(() => fetchData(retries - 1), 1000);
            return;
        }
        
        showToast(errorMsg, 'error');
        document.getElementById('api-status').classList.remove('online');
        document.getElementById('api-status').classList.add('offline');
    }
}

async function toggleRelay(id, targetState) {
    const action = targetState ? 'on' : 'off';
    try {
        const response = await fetch(`${CONFIG.apiBase}/relay/${id}/${action}`);
        const data = await response.json();
        
        if (data.status === 'success') {
            state.relays[id] = targetState;
            updateRelayUI(id, targetState);
            showToast(`Relay ${id} turned ${action}`, 'success');
            // Refresh logs immediately
            fetch(`${CONFIG.apiBase}/logs`).then(r => r.json()).then(updateLogsUI);
        }
    } catch (error) {
        showToast('Failed to toggle relay', 'error');
    }
}

// --- UI Updates ---

function updateSensorUI(data) {
    document.getElementById('temp-val').textContent = data.temp.toFixed(1);
    document.getElementById('humidity-val').textContent = Math.round(data.humidity);
}

function updateRelayUI(id, isActive) {
    const card = document.querySelector(`.relay-card[data-id="${id}"]`);
    const statusText = card.querySelector('.relay-status');
    
    if (isActive) {
        card.classList.add('active');
        statusText.textContent = 'ON';
    } else {
        card.classList.remove('active');
        statusText.textContent = 'OFF';
    }

    // Update active count
    const activeCount = Object.values(state.relays).filter(v => v).length;
    document.getElementById('active-relays-count').textContent = activeCount;
    document.getElementById('relays-progress').style.width = `${(activeCount / 4) * 100}%`;
}

function updateStatusUI(data) {
    const espStatus = document.getElementById('esp32-status');
    const botStatus = document.getElementById('bot-status');
    
    if (data.esp32.online) {
        espStatus.textContent = 'ONLINE';
        espStatus.className = 'text-xs text-green-400 font-bold';
    } else {
        espStatus.textContent = 'OFFLINE';
        espStatus.className = 'text-xs text-red-400 font-bold';
    }

    if (data.telegram.online) {
        botStatus.textContent = 'ACTIVE';
        botStatus.className = 'text-xs text-green-400 font-bold';
    } else {
        botStatus.textContent = 'INACTIVE';
        botStatus.className = 'text-xs text-red-400 font-bold';
    }
}

function updateLogsUI(data) {
    // Activity Logs
    const logContainer = document.getElementById('activity-logs');
    logContainer.innerHTML = data.activity.map(log => `
        <div class="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
            <div class="w-2 h-2 rounded-full mt-1.5 ${log.type === 'relay' ? 'bg-accent' : 'bg-green-400'}"></div>
            <div class="flex-1">
                <p class="text-xs font-semibold">${log.message}</p>
                <p class="text-[10px] opacity-40 font-mono">${log.time}</p>
            </div>
        </div>
    `).join('');

    // Telegram Console
    const consoleContainer = document.getElementById('telegram-console');
    consoleContainer.innerHTML = data.telegram.map(cmd => `
        <div class="mb-2">
            <span class="text-gray-500">[${cmd.time}]</span> 
            <span class="text-accent">${cmd.user}:</span> 
            <span class="text-white">${cmd.command}</span>
        </div>
    `).join('');
    
    // Update local relay state if changed remotely
    data.activity.forEach(log => {
        if (log.type === 'relay' && log.message.includes('turned')) {
            const id = log.message.match(/Relay (\d+)/)[1];
            const isActive = log.message.includes('on');
            if (state.relays[id] !== isActive) {
                state.relays[id] = isActive;
                updateRelayUI(id, isActive);
            }
        }
    });
}

// --- Chart logic ---

function initChart() {
    const ctx = document.getElementById('sensorChart').getContext('2d');
    
    // Gradient
    const tempGradient = ctx.createLinearGradient(0, 0, 0, 400);
    tempGradient.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
    tempGradient.addColorStop(1, 'rgba(99, 102, 241, 0)');

    const humGradient = ctx.createLinearGradient(0, 0, 0, 400);
    humGradient.addColorStop(0, 'rgba(34, 211, 238, 0.4)');
    humGradient.addColorStop(1, 'rgba(34, 211, 238, 0)');

    state.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Temperature (°C)',
                    data: [],
                    borderColor: '#6366f1',
                    backgroundColor: tempGradient,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    yAxisID: 'y'
                },
                {
                    label: 'Humidity (%)',
                    data: [],
                    borderColor: '#22d3ee',
                    backgroundColor: humGradient,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: { color: 'rgba(255,255,255,0.3)', font: { family: 'JetBrains Mono', size: 10 } }
                },
                y: {
                    position: 'left',
                    grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
                    ticks: { color: 'rgba(255,255,255,0.3)', font: { family: 'JetBrains Mono', size: 10 } }
                },
                y1: {
                    position: 'right',
                    grid: { display: false },
                    ticks: { color: 'rgba(255,255,255,0.3)', font: { family: 'JetBrains Mono', size: 10 } }
                }
            }
        }
    });
}

function updateChartData(data) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    state.chart.data.labels.push(time);
    state.chart.data.datasets[0].data.push(data.temp);
    state.chart.data.datasets[1].data.push(data.humidity);

    if (state.chart.data.labels.length > CONFIG.chartHistoryPoints) {
        state.chart.data.labels.shift();
        state.chart.data.datasets[0].data.shift();
        state.chart.data.datasets[1].data.shift();
    }

    state.chart.update('none'); // Update without animation for performance
}

// --- Helpers ---

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-message');
    const iconEl = document.getElementById('toast-icon');
    
    msgEl.textContent = message;
    
    if (type === 'success') {
        iconEl.innerHTML = '<i data-lucide="check" class="w-4 h-4 text-green-400"></i>';
        iconEl.className = 'w-8 h-8 rounded-full bg-green-400/20 flex items-center justify-center';
    } else if (type === 'error') {
        iconEl.innerHTML = '<i data-lucide="alert-circle" class="w-4 h-4 text-red-400"></i>';
        iconEl.className = 'w-8 h-8 rounded-full bg-red-400/20 flex items-center justify-center';
    } else {
        iconEl.innerHTML = '<i data-lucide="info" class="w-4 h-4 text-accent"></i>';
        iconEl.className = 'w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center';
    }
    
    lucide.createIcons();
    
    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    
    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 4000);
}
