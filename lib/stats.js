// Skills on Edge - Usage Statistics
// Tracks token usage per request with timestamps

// Simple token estimator: ~4 chars per token (rough approximation)
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

const Stats = {
  async record(sentTokens, receivedTokens, providerId, skillId) {
    const { usageLog = [] } = await chrome.storage.local.get('usageLog');

    usageLog.push({
      ts: Date.now(),
      sent: sentTokens,
      received: receivedTokens,
      provider: providerId || '',
      skill: skillId || ''
    });

    // Keep only last 7 days of data
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const trimmed = usageLog.filter(e => e.ts >= cutoff);

    await chrome.storage.local.set({ usageLog: trimmed });
  },

  async getStats() {
    const { usageLog = [] } = await chrome.storage.local.get('usageLog');
    const now = Date.now();

    // Total all-time (within stored window)
    const total = { sent: 0, received: 0, requests: 0 };
    usageLog.forEach(e => {
      total.sent += e.sent;
      total.received += e.received;
      total.requests++;
    });

    // Daily stats (past 7 days)
    const daily = [];
    for (let d = 6; d >= 0; d--) {
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      dayStart.setDate(dayStart.getDate() - d);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const entries = usageLog.filter(e => e.ts >= dayStart.getTime() && e.ts < dayEnd.getTime());
      const label = dayStart.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      daily.push({
        label,
        sent: entries.reduce((s, e) => s + e.sent, 0),
        received: entries.reduce((s, e) => s + e.received, 0),
        requests: entries.length
      });
    }

    // Hourly stats (past 24h)
    const hourly = [];
    for (let h = 23; h >= 0; h--) {
      const hourStart = now - (h + 1) * 60 * 60 * 1000;
      const hourEnd = now - h * 60 * 60 * 1000;
      const entries = usageLog.filter(e => e.ts >= hourStart && e.ts < hourEnd);
      const hourLabel = new Date(hourEnd).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      hourly.push({
        label: hourLabel,
        sent: entries.reduce((s, e) => s + e.sent, 0),
        received: entries.reduce((s, e) => s + e.received, 0),
        requests: entries.length
      });
    }

    return { total, daily, hourly };
  }
};
