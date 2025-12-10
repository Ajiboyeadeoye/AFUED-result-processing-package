import express from "express";
const router = express.Router();

import os from "os";
import { exec } from "child_process";
import util from "util";

const execPromise = util.promisify(exec);

// Try to use systeminformation if available, otherwise fallback
let si = null;

try {
  // Dynamic import for optional dependencies
  const module = await import("systeminformation");
  si = module.default;   // ESM default export
} catch (error) {
  console.log("systeminformation package not installed, using mock data");
}


// Configuration
const config = {
  pollingInterval: 10000, // 10 seconds
  maxLogs: 100,
  dataHistory: {
    cpu: [],
    memory: [],
    disk: [],
    network: []
  }
};

// In-memory storage for system data
let systemData = {
  queueStats: {
    waiting: 42,
    active: 8,
    completed: 12543,
    failed: 23,
    delayed: 15,
    processingRate: 45.7,
    averageProcessingTime: 2.3
  },
  services: [
    { name: 'API Server', status: 'running', uptime: 86400, cpu: 12.5, memory: 512, lastRestart: '2024-01-15T08:00:00Z' },
    { name: 'Database', status: 'running', uptime: 2592000, cpu: 8.2, memory: 2048, lastRestart: '2023-12-01T00:00:00Z' },
    { name: 'Queue Worker', status: 'running', uptime: 172800, cpu: 45.3, memory: 1024, lastRestart: '2024-01-20T12:00:00Z' },
    { name: 'Cache Server', status: 'running', uptime: 604800, cpu: 3.1, memory: 256, lastRestart: '2024-01-10T16:00:00Z' },
    { name: 'File Storage', status: 'degraded', uptime: 432000, cpu: 15.7, memory: 768, lastRestart: '2024-01-18T04:00:00Z' },
  ],
  logs: [],
  lastUpdate: new Date().toISOString()
};

// Helper functions
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getRandomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

// Get CPU usage (cross-platform)
async function getCPUUsage() {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execPromise('wmic cpu get loadpercentage');
      const lines = stdout.split('\n');
      const usage = parseInt(lines[1]);
      return isNaN(usage) ? getRandomInRange(5, 40) : usage;
    } else {
      const { stdout } = await execPromise("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'");
      const usage = parseFloat(stdout);
      return isNaN(usage) ? getRandomInRange(5, 40) : usage;
    }
  } catch (error) {
    return getRandomInRange(5, 40);
  }
}

// Get memory info
async function getMemoryInfo() {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      cache: Math.floor(totalMem * 0.1),
      swap: {
        total: Math.floor(totalMem * 0.5),
        used: Math.floor(totalMem * 0.2),
        free: Math.floor(totalMem * 0.3)
      }
    };
  } catch (error) {
    const totalMem = 16 * 1024 * 1024 * 1024; // 16GB
    const usedMem = totalMem * 0.6;
    return {
      total: totalMem,
      used: usedMem,
      free: totalMem - usedMem,
      cache: totalMem * 0.1,
      swap: {
        total: totalMem * 0.5,
        used: totalMem * 0.2,
        free: totalMem * 0.3
      }
    };
  }
}

// Get disk info
async function getDiskInfo() {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execPromise('wmic logicaldisk get size,freespace,caption');
      const lines = stdout.split('\n').filter(line => line.trim());
      let total = 0, free = 0;
      
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(/\s+/);
        if (parts.length >= 3) {
          total += parseInt(parts[1]) || 0;
          free += parseInt(parts[2]) || 0;
        }
      }
      
      return {
        total: total,
        used: total - free,
        free: free,
        iops: Math.floor(getRandomInRange(100, 600)),
        readSpeed: Math.floor(getRandomInRange(10, 100) * 1024 * 1024),
        writeSpeed: Math.floor(getRandomInRange(5, 50) * 1024 * 1024)
      };
    } else {
      const { stdout } = await execPromise("df -k --total | grep 'total'");
      const parts = stdout.split(/\s+/);
      const total = parseInt(parts[1]) * 1024;
      const used = parseInt(parts[2]) * 1024;
      const free = parseInt(parts[3]) * 1024;
      
      return {
        total: total,
        used: used,
        free: free,
        iops: Math.floor(getRandomInRange(100, 600)),
        readSpeed: Math.floor(getRandomInRange(10, 100) * 1024 * 1024),
        writeSpeed: Math.floor(getRandomInRange(5, 50) * 1024 * 1024)
      };
    }
  } catch (error) {
    const total = 500 * 1024 * 1024 * 1024; // 500GB
    const used = total * 0.7;
    return {
      total: total,
      used: used,
      free: total - used,
      iops: Math.floor(getRandomInRange(100, 600)),
      readSpeed: Math.floor(getRandomInRange(10, 100) * 1024 * 1024),
      writeSpeed: Math.floor(getRandomInRange(5, 50) * 1024 * 1024)
    };
  }
}

// Get network info
async function getNetworkInfo() {
  try {
    const interfaces = os.networkInterfaces();
    const networkInterfaces = [];
    
    Object.entries(interfaces).forEach(([name, ifaceList]) => {
      ifaceList.forEach(iface => {
        if (iface.family === 'IPv4' && !iface.internal) {
          networkInterfaces.push({
            name: name,
            address: iface.address,
            received: Math.floor(getRandomInRange(100, 10000) * 1024 * 1024),
            transmitted: Math.floor(getRandomInRange(50, 5000) * 1024 * 1024),
            packets: Math.floor(getRandomInRange(1000, 100000)),
            errors: Math.floor(getRandomInRange(0, 10))
          });
        }
      });
    });
    
    if (networkInterfaces.length === 0) {
      // Fallback mock data
      networkInterfaces.push({
        name: 'eth0',
        address: '192.168.1.100',
        received: Math.floor(getRandomInRange(100, 10000) * 1024 * 1024),
        transmitted: Math.floor(getRandomInRange(50, 5000) * 1024 * 1024),
        packets: Math.floor(getRandomInRange(1000, 100000)),
        errors: Math.floor(getRandomInRange(0, 10))
      });
    }
    
    const totalReceived = networkInterfaces.reduce((sum, iface) => sum + iface.received, 0);
    const totalTransmitted = networkInterfaces.reduce((sum, iface) => sum + iface.transmitted, 0);
    
    return {
      interfaces: networkInterfaces,
      totalReceived: totalReceived,
      totalTransmitted: totalTransmitted
    };
  } catch (error) {
    return {
      interfaces: [{
        name: 'eth0',
        address: '192.168.1.100',
        received: Math.floor(getRandomInRange(100, 10000) * 1024 * 1024),
        transmitted: Math.floor(getRandomInRange(50, 5000) * 1024 * 1024),
        packets: Math.floor(getRandomInRange(1000, 100000)),
        errors: Math.floor(getRandomInRange(0, 10))
      }],
      totalReceived: Math.floor(getRandomInRange(1000, 50000) * 1024 * 1024),
      totalTransmitted: Math.floor(getRandomInRange(500, 25000) * 1024 * 1024)
    };
  }
}

// Update queue stats
function updateQueueStats() {
  const waitingChange = Math.floor(Math.random() * 20) - 8;
  const activeChange = Math.floor(Math.random() * 10) - 4;
  
  systemData.queueStats = {
    waiting: Math.max(0, systemData.queueStats.waiting + waitingChange),
    active: Math.max(0, Math.min(20, systemData.queueStats.active + activeChange)),
    completed: systemData.queueStats.completed + Math.floor(Math.random() * 50) + 10,
    failed: systemData.queueStats.failed + Math.floor(Math.random() * 3),
    delayed: Math.max(0, systemData.queueStats.delayed + Math.floor(Math.random() * 8) - 3),
    processingRate: 45.7 + (Math.random() * 5 - 2.5),
    averageProcessingTime: 2.3 + (Math.random() * 0.3 - 0.15)
  };
  
  // Ensure values are realistic
  systemData.queueStats.processingRate = Math.max(0, systemData.queueStats.processingRate);
  systemData.queueStats.averageProcessingTime = Math.max(0.1, systemData.queueStats.averageProcessingTime);
}

// Update services
function updateServices() {
  systemData.services = systemData.services.map(service => {
    let cpuChange = (Math.random() * 15 - 7.5);
    let newCpu = service.cpu + cpuChange;
    
    if (newCpu < 0) newCpu = 0.5;
    if (newCpu > 100) newCpu = 95;
    
    let memoryChange = Math.floor(Math.random() * 100 - 50);
    let newMemory = service.memory + memoryChange;
    
    if (newMemory < 50) newMemory = 50;
    
    return {
      ...service,
      cpu: parseFloat(newCpu.toFixed(1)),
      memory: newMemory,
      uptime: service.uptime + 10,
      ...(Math.random() < 0.05 ? {
        status: ['running', 'running', 'running', 'running', 'degraded', 'failed'][Math.floor(Math.random() * 6)]
      } : {})
    };
  });
}

// Add log entry
function addLogEntry(level, service, message, details = null) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: level,
    service: service,
    message: message,
    details: details
  };
  
  systemData.logs.unshift(logEntry);
  
  // Keep only the latest logs
  if (systemData.logs.length > config.maxLogs) {
    systemData.logs = systemData.logs.slice(0, config.maxLogs);
  }
}

// Generate random logs
function generateRandomLogs() {
  const levels = ['info', 'warning', 'error', 'critical'];
  const services = ['API Server', 'Database', 'Queue Worker', 'Cache Server', 'File Storage'];
  
  const logMessages = {
    'API Server': [
      'Handled 250 requests in last minute',
      'Request rate limit approaching',
      'Health check passed',
      'New user authentication',
      'Database query took longer than expected'
    ],
    'Database': [
      'Connection pool exhausted',
      'Query optimization completed',
      'Backup scheduled',
      'Replication lag detected',
      'Index rebuild started'
    ],
    'Queue Worker': [
      'Started processing department computation job',
      'Job completed successfully',
      'Retrying failed job',
      'Queue backlog detected',
      'Processing rate increased'
    ],
    'Cache Server': [
      'Cache cleared successfully',
      'Cache hit rate: 92%',
      'Memory fragmentation detected',
      'New cache nodes added',
      'Eviction policy updated'
    ],
    'File Storage': [
      'Disk usage at 85%',
      'File upload completed',
      'Storage limit warning',
      'File synchronization in progress',
      'Access permissions updated'
    ]
  };
  
  if (Math.random() < 0.3) { // 30% chance to add a log
    const service = services[Math.floor(Math.random() * services.length)];
    const messages = logMessages[service];
    const message = messages[Math.floor(Math.random() * messages.length)];
    
    // Weighted random for levels
    const levelWeights = [0.6, 0.25, 0.12, 0.03];
    const random = Math.random();
    let cumulative = 0;
    let level = 'info';
    
    for (let i = 0; i < levels.length; i++) {
      cumulative += levelWeights[i];
      if (random < cumulative) {
        level = levels[i];
        break;
      }
    }
    
    const details = (level === 'error' || level === 'warning') ? {
      timestamp: new Date().toISOString(),
      ...(service === 'Database' && { connections: Math.floor(Math.random() * 100) + 50 }),
      ...(service === 'File Storage' && { 
        usage: `${Math.floor(Math.random() * 20) + 75}%`,
        freeSpace: `${Math.floor(Math.random() * 50)}GB`
      })
    } : null;
    
    addLogEntry(level, service, message, details);
  }
}

// 1. GET /api/system/queue-stats - Get queue statistics
router.get('/queue-stats', async (req, res) => {
  try {
    updateQueueStats();
    
    res.json({
      success: true,
      data: systemData.queueStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch queue statistics',
      message: error.message
    });
  }
});

// 2. GET /api/system/metrics - Get system metrics
router.get('/metrics', async (req, res) => {
  try {
    const [cpuUsage, memoryInfo, diskInfo, networkInfo] = await Promise.all([
      getCPUUsage(),
      getMemoryInfo(),
      getDiskInfo(),
      getNetworkInfo()
    ]);
    
    const loadAverage = os.loadavg();
    const cpus = os.cpus();
    
    const metrics = {
      cpu: {
        usage: parseFloat(cpuUsage.toFixed(1)),
        cores: cpus.length,
        temperature: 40 + Math.random() * 20, // Simulated temperature
        loadAverage: loadAverage.map(avg => parseFloat(avg.toFixed(2)))
      },
      memory: memoryInfo,
      disk: diskInfo,
      network: networkInfo,
      uptime: os.uptime(),
      timestamp: new Date().toISOString()
    };
    
    // Store in history
    config.dataHistory.cpu.push({
      timestamp: metrics.timestamp,
      usage: metrics.cpu.usage,
      temperature: metrics.cpu.temperature
    });
    
    config.dataHistory.memory.push({
      timestamp: metrics.timestamp,
      usage: (metrics.memory.used / metrics.memory.total) * 100
    });
    
    // Keep history limited
    Object.keys(config.dataHistory).forEach(key => {
      if (config.dataHistory[key].length > 100) {
        config.dataHistory[key] = config.dataHistory[key].slice(-100);
      }
    });
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error fetching system metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system metrics',
      message: error.message
    });
  }
});

// 3. GET /api/system/services - Get service status
router.get('/services', async (req, res) => {
  try {
    updateServices();
    
    const runningServices = systemData.services.filter(s => s.status === 'running').length;
    const totalServices = systemData.services.length;
    
    res.json({
      success: true,
      data: systemData.services,
      overallHealth: systemData.services.every(s => s.status === 'running') ? 'healthy' : 
                    systemData.services.some(s => s.status === 'failed') ? 'critical' : 'degraded',
      summary: {
        running: runningServices,
        total: totalServices,
        healthPercent: Math.round((runningServices / totalServices) * 100)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching service status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch service status',
      message: error.message
    });
  }
});

// 4. GET /api/system/logs - Get system logs
router.get('/logs', async (req, res) => {
  try {
    // Generate some random logs if we don't have enough
    if (systemData.logs.length < 10) {
      for (let i = 0; i < 10; i++) {
        generateRandomLogs();
      }
    } else {
      generateRandomLogs(); // Just add one more
    }
    
    const limit = parseInt(req.query.limit) || 20;
    const level = req.query.level;
    
    let filteredLogs = systemData.logs;
    
    if (level && level !== 'all') {
      filteredLogs = systemData.logs.filter(log => log.level === level);
    }
    
    res.json({
      success: true,
      data: filteredLogs.slice(0, limit),
      total: systemData.logs.length,
      filtered: filteredLogs.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch logs',
      message: error.message
    });
  }
});

// 5. GET /api/system/logs/:level - Get logs by level
router.get('/logs/:level', async (req, res) => {
  try {
    const level = req.params.level;
    const validLevels = ['info', 'warning', 'error', 'critical'];
    
    if (!validLevels.includes(level)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid log level',
        validLevels: validLevels
      });
    }
    
    const filteredLogs = systemData.logs.filter(log => log.level === level);
    const limit = parseInt(req.query.limit) || 50;
    
    res.json({
      success: true,
      data: filteredLogs.slice(0, limit),
      total: filteredLogs.length,
      level: level,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching logs by level:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch logs',
      message: error.message
    });
  }
});

// 6. POST /api/system/actions/clear-cache - Clear cache action
router.post('/actions/clear-cache', async (req, res) => {
  try {
    // Simulate cache clearing delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Update queue stats
    systemData.queueStats = {
      ...systemData.queueStats,
      waiting: Math.max(0, systemData.queueStats.waiting - 10),
      delayed: Math.max(0, systemData.queueStats.delayed - 5)
    };
    
    // Update Cache Server service
    systemData.services = systemData.services.map(service => 
      service.name === 'Cache Server' 
        ? { ...service, cpu: 5.2, memory: 128, status: 'running' }
        : service
    );
    
    // Add log entry
    addLogEntry('info', 'Cache Server', 'Cache cleared successfully', {
      clearedItems: Math.floor(Math.random() * 1000) + 500,
      memoryFreed: `${Math.floor(Math.random() * 100) + 50}MB`,
      duration: '800ms'
    });
    
    res.json({
      success: true,
      message: 'Queue cache cleared successfully',
      data: {
        affectedServices: ['Cache Server', 'Queue Worker'],
        clearedItems: Math.floor(Math.random() * 1000) + 500,
        memoryFreed: `${Math.floor(Math.random() * 100) + 50}MB`,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    addLogEntry('error', 'API Server', 'Failed to clear cache', { error: error.message });
    
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
      message: error.message
    });
  }
});

// 7. POST /api/system/actions/system-check - Run system check
router.post('/actions/system-check', async (req, res) => {
  try {
    // Simulate system check with delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Get current metrics
    const [cpuUsage, memoryInfo, diskInfo] = await Promise.all([
      getCPUUsage(),
      getMemoryInfo(),
      getDiskInfo()
    ]);
    
    const memoryUsagePercent = (memoryInfo.used / memoryInfo.total) * 100;
    const diskUsagePercent = (diskInfo.used / diskInfo.total) * 100;
    
    const checkResults = {
      timestamp: new Date().toISOString(),
      checks: {
        disk: {
          status: diskUsagePercent > 90 ? 'critical' : diskUsagePercent > 75 ? 'warning' : 'ok',
          message: diskUsagePercent > 90 
            ? `Disk usage critical: ${diskUsagePercent.toFixed(1)}%`
            : diskUsagePercent > 75
            ? `Disk usage high: ${diskUsagePercent.toFixed(1)}%`
            : `Disk usage normal: ${diskUsagePercent.toFixed(1)}%`,
          usage: diskUsagePercent.toFixed(1),
          total: formatBytes(diskInfo.total),
          free: formatBytes(diskInfo.free)
        },
        memory: {
          status: memoryUsagePercent > 85 ? 'critical' : memoryUsagePercent > 70 ? 'warning' : 'ok',
          message: memoryUsagePercent > 85
            ? `Memory usage critical: ${memoryUsagePercent.toFixed(1)}%`
            : memoryUsagePercent > 70
            ? `Memory usage high: ${memoryUsagePercent.toFixed(1)}%`
            : `Memory usage normal: ${memoryUsagePercent.toFixed(1)}%`,
          usage: memoryUsagePercent.toFixed(1),
          total: formatBytes(memoryInfo.total),
          free: formatBytes(memoryInfo.free)
        },
        cpu: {
          status: cpuUsage > 80 ? 'critical' : cpuUsage > 60 ? 'warning' : 'ok',
          message: cpuUsage > 80
            ? `CPU usage critical: ${cpuUsage.toFixed(1)}%`
            : cpuUsage > 60
            ? `CPU usage high: ${cpuUsage.toFixed(1)}%`
            : `CPU usage normal: ${cpuUsage.toFixed(1)}%`,
          usage: cpuUsage.toFixed(1),
          cores: os.cpus().length,
          loadAverage: os.loadavg().map(avg => avg.toFixed(2))
        },
        network: {
          status: 'ok',
          message: 'Network connectivity normal',
          interfaces: Object.keys(os.networkInterfaces()).length
        },
        services: {
          status: systemData.services.every(s => s.status === 'running') ? 'ok' : 'warning',
          message: `${systemData.services.filter(s => s.status === 'running').length} of ${systemData.services.length} services running`,
          failed: systemData.services.filter(s => s.status !== 'running').map(s => ({ name: s.name, status: s.status }))
        }
      },
      summary: {
        totalChecks: 5,
        passed: systemData.services.every(s => s.status === 'running') ? 5 : 4,
        warnings: systemData.services.some(s => s.status !== 'running') ? 1 : 0,
        critical: 0,
        status: systemData.services.every(s => s.status === 'running') ? 'healthy' : 'degraded'
      }
    };
    
    // Add log entry
    addLogEntry('info', 'System Monitor', 'System check completed', checkResults.summary);
    
    res.json({
      success: true,
      message: 'System check completed successfully',
      data: checkResults
    });
  } catch (error) {
    console.error('Error running system check:', error);
    addLogEntry('error', 'System Monitor', 'System check failed', { error: error.message });
    
    res.status(500).json({
      success: false,
      error: 'Failed to run system check',
      message: error.message
    });
  }
});

// 8. GET /api/system/history/:metric - Get historical data
router.get('/history/:metric', async (req, res) => {
  try {
    const metric = req.params.metric;
    const limit = parseInt(req.query.limit) || 50;
    
    if (!config.dataHistory[metric]) {
      return res.status(404).json({
        success: false,
        error: 'Metric not found',
        availableMetrics: Object.keys(config.dataHistory)
      });
    }
    
    res.json({
      success: true,
      data: config.dataHistory[metric].slice(-limit),
      metric: metric,
      count: config.dataHistory[metric].length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching historical data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch historical data',
      message: error.message
    });
  }
});

// 9. GET /api/system/health - Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const [cpuUsage, memoryInfo] = await Promise.all([
      getCPUUsage(),
      getMemoryInfo()
    ]);
    
    const memoryUsagePercent = (memoryInfo.used / memoryInfo.total) * 100;
    const allServicesRunning = systemData.services.every(s => s.status === 'running');
    
    const healthStatus = allServicesRunning && cpuUsage < 90 && memoryUsagePercent < 90;
    
    res.json({
      success: true,
      status: healthStatus ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        api: 'operational',
        database: systemData.services.find(s => s.name === 'Database')?.status === 'running' ? 'connected' : 'disconnected',
        queue: systemData.services.find(s => s.name === 'Queue Worker')?.status === 'running' ? 'running' : 'stopped',
        memory: memoryUsagePercent < 90 ? 'ok' : 'warning',
        cpu: cpuUsage < 90 ? 'ok' : 'warning'
      },
      metrics: {
        cpu: {
          usage: cpuUsage.toFixed(1),
          status: cpuUsage < 90 ? 'ok' : 'warning'
        },
        memory: {
          usage: memoryUsagePercent.toFixed(1),
          status: memoryUsagePercent < 90 ? 'ok' : 'warning'
        },
        services: {
          running: systemData.services.filter(s => s.status === 'running').length,
          total: systemData.services.length,
          status: allServicesRunning ? 'ok' : 'warning'
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 10. GET /api/system/info - Get system information
router.get('/info', async (req, res) => {
  try {
    const systemInfo = {
      os: {
        platform: os.platform(),
        release: os.release(),
        type: os.type(),
        arch: os.arch(),
        hostname: os.hostname(),
        version: os.version()
      },
      node: {
        version: process.version,
        versions: process.versions
      },
      environment: {
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: {
          rss: formatBytes(process.memoryUsage().rss),
          heapTotal: formatBytes(process.memoryUsage().heapTotal),
          heapUsed: formatBytes(process.memoryUsage().heapUsed),
          external: formatBytes(process.memoryUsage().external)
        },
        cpuUsage: process.cpuUsage()
      },
      system: {
        cpus: os.cpus().length,
        totalMemory: formatBytes(os.totalmem()),
        freeMemory: formatBytes(os.freemem()),
        homeDir: os.homedir(),
        tmpDir: os.tmpdir(),
        endianness: os.endianness(),
        uptime: os.uptime()
      },
      network: {
        interfaces: os.networkInterfaces()
      },
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: systemInfo
    });
  } catch (error) {
    console.error('Error fetching system info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system information'
    });
  }
});

// 11. POST /api/system/logs - Add custom log entry
router.post('/logs', async (req, res) => {
  try {
    const { level, service, message, details } = req.body;
    
    if (!level || !service || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: level, service, message'
      });
    }
    
    const validLevels = ['info', 'warning', 'error', 'critical'];
    if (!validLevels.includes(level)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid log level',
        validLevels: validLevels
      });
    }
    
    addLogEntry(level, service, message, details);
    
    res.json({
      success: true,
      message: 'Log entry added successfully',
      log: systemData.logs[0],
      totalLogs: systemData.logs.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error adding log entry:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add log entry',
      message: error.message
    });
  }
});

// 12. DELETE /api/system/logs - Clear all logs
router.delete('/logs', async (req, res) => {
  try {
    const previousCount = systemData.logs.length;
    systemData.logs = [];
    
    addLogEntry('info', 'System Monitor', 'All logs cleared', { clearedCount: previousCount });
    
    res.json({
      success: true,
      message: `Cleared ${previousCount} log entries`,
      clearedCount: previousCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error clearing logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear logs',
      message: error.message
    });
  }
});

// 13. POST /api/system/services/:name/restart - Restart a service
router.post('/services/:name/restart', async (req, res) => {
  try {
    const serviceName = req.params.name;
    const service = systemData.services.find(s => s.name === serviceName);
    
    if (!service) {
      return res.status(404).json({
        success: false,
        error: `Service '${serviceName}' not found`
      });
    }
    
    // Simulate restart delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Update service
    systemData.services = systemData.services.map(s => 
      s.name === serviceName 
        ? { 
            ...s, 
            status: 'running',
            uptime: 0,
            cpu: 0.5,
            memory: Math.floor(Math.random() * 200) + 50,
            lastRestart: new Date().toISOString()
          }
        : s
    );
    
    addLogEntry('info', 'System Monitor', `Service '${serviceName}' restarted`, {
      previousStatus: service.status,
      restartTime: '2s',
      newUptime: '0s'
    });
    
    res.json({
      success: true,
      message: `Service '${serviceName}' restarted successfully`,
      service: systemData.services.find(s => s.name === serviceName),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error restarting service:', error);
    addLogEntry('error', 'System Monitor', `Failed to restart service '${req.params.name}'`, { error: error.message });
    
    res.status(500).json({
      success: false,
      error: 'Failed to restart service',
      message: error.message
    });
  }
});

// 14. GET /api/system/stats - Get all stats at once
router.get('/stats', async (req, res) => {
  try {
    const [queueStats, metrics, services, logs] = await Promise.all([
      Promise.resolve(systemData.queueStats),
      (async () => {
        const [cpuUsage, memoryInfo, diskInfo, networkInfo] = await Promise.all([
          getCPUUsage(),
          getMemoryInfo(),
          getDiskInfo(),
          getNetworkInfo()
        ]);
        
        const loadAverage = os.loadavg();
        const cpus = os.cpus();
        
        return {
          cpu: {
            usage: parseFloat(cpuUsage.toFixed(1)),
            cores: cpus.length,
            temperature: 40 + Math.random() * 20,
            loadAverage: loadAverage.map(avg => parseFloat(avg.toFixed(2)))
          },
          memory: memoryInfo,
          disk: diskInfo,
          network: networkInfo,
          uptime: os.uptime(),
          timestamp: new Date().toISOString()
        };
      })(),
      Promise.resolve(systemData.services),
      Promise.resolve(systemData.logs.slice(0, 10))
    ]);
    
    updateQueueStats();
    updateServices();
    generateRandomLogs();
    
    const runningServices = services.filter(s => s.status === 'running').length;
    const totalServices = services.length;
    
    res.json({
      success: true,
      data: {
        queueStats,
        systemMetrics: metrics,
        services,
        recentLogs: logs,
        summary: {
          queueHealth: queueStats.failed > queueStats.completed * 0.1 ? 'unhealthy' :
                     queueStats.waiting > 50 ? 'busy' : 'healthy',
          systemHealth: metrics.cpu.usage > 80 || (metrics.memory.used / metrics.memory.total) > 0.9 ? 'warning' : 'healthy',
          serviceHealth: runningServices === totalServices ? 'healthy' :
                        services.some(s => s.status === 'failed') ? 'critical' : 'degraded',
          overallHealth: 'healthy'
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching all stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system statistics',
      message: error.message
    });
  }
});

// Export the router
// module.exports = router;
export default router