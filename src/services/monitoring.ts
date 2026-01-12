import { Request, Response } from 'express';
import { getRedisClient } from '../redis/client';
import { Logger } from './logger';
import os from 'os';
import v8 from 'v8';

interface MetricData {
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

class MonitoringService {
  private redis = getRedisClient();
  private metrics: Map<string, MetricData[]> = new Map();
  private readonly retentionPeriod = 24 * 60 * 60 * 1000; // 24 hours

  // System metrics collection interval
  private readonly systemMetricsInterval = 60 * 1000; // 1 minute

  constructor() {
    this.startSystemMetricsCollection();
  }

  private startSystemMetricsCollection() {
    setInterval(() => {
      this.collectSystemMetrics();
    }, this.systemMetricsInterval);
  }

  private async collectSystemMetrics() {
    // CPU Usage
    const cpuUsage = os.loadavg()[0];
    await this.recordMetric('system.cpu.usage', cpuUsage);

    // Memory Usage
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    await this.recordMetric('system.memory.used', usedMemory);
    await this.recordMetric('system.memory.total', totalMemory);

    // Node.js Heap Usage
    const heapStats = v8.getHeapStatistics();
    await this.recordMetric('nodejs.heap.used', heapStats.used_heap_size);
    await this.recordMetric('nodejs.heap.total', heapStats.total_heap_size);

    // Event Loop Lag
    const startTime = process.hrtime();
    setImmediate(() => {
      const [seconds, nanoseconds] = process.hrtime(startTime);
      const lag = (seconds * 1e9 + nanoseconds) / 1e6; // Convert to milliseconds
      this.recordMetric('nodejs.eventloop.lag', lag);
    });
  }

  async recordMetric(
    name: string,
    value: number,
    tags: Record<string, string> = {}
  ) {
    const timestamp = Date.now();
    const metric: MetricData = { value, timestamp, tags };

    // Store in memory
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(metric);

    // Clean up old metrics
    this.cleanupOldMetrics(name);

    // Store in Redis for persistence
    await this.redis.zAdd(
      `metrics:${name}`,
      { score: timestamp, value: JSON.stringify({ value, tags }) }
    );

    // Cleanup old Redis metrics
    await this.redis.zRemRangeByScore(
      `metrics:${name}`,
      0,
      timestamp - this.retentionPeriod
    );
  }

  private cleanupOldMetrics(name: string) {
    const metrics = this.metrics.get(name)!;
    const cutoff = Date.now() - this.retentionPeriod;
    const newMetrics = metrics.filter(m => m.timestamp > cutoff);
    this.metrics.set(name, newMetrics);
  }

  // HTTP Request Monitoring
  async monitorRequest(req: Request, res: Response, duration: number) {
    const path = req.route ? req.route.path : req.path;
    const method = req.method;
    const status = res.statusCode;

    // Record request duration
    await this.recordMetric('http.request.duration', duration, {
      path,
      method,
      status: status.toString(),
    });

    // Record request count
    await this.recordMetric('http.request.count', 1, {
      path,
      method,
      status: status.toString(),
    });

    // Record error count
    if (status >= 400) {
      await this.recordMetric('http.error.count', 1, {
        path,
        method,
        status: status.toString(),
      });
    }
  }

  // WebSocket Monitoring
  async monitorWebSocket(event: string, duration: number, success: boolean) {
    await this.recordMetric('websocket.event.duration', duration, {
      event,
      success: success.toString(),
    });

    await this.recordMetric('websocket.event.count', 1, {
      event,
      success: success.toString(),
    });
  }

  // Database Monitoring
  async monitorDatabaseQuery(
    operation: string,
    collection: string,
    duration: number
  ) {
    await this.recordMetric('database.query.duration', duration, {
      operation,
      collection,
    });
  }

  // Cache Monitoring
  async monitorCacheOperation(
    operation: string,
    success: boolean,
    duration: number
  ) {
    await this.recordMetric('cache.operation.duration', duration, {
      operation,
      success: success.toString(),
    });
  }

  // Get metrics for analysis
  async getMetrics(
    name: string,
    startTime: number,
    endTime: number
  ): Promise<MetricData[]> {
    // Get from Redis
    const metrics = await this.redis.zRangeByScore(
      `metrics:${name}`,
      startTime,
      endTime
    );

    return metrics.map((m: any) => {
      const data = JSON.parse(m);
      return {
        value: data.value,
        timestamp: data.timestamp,
        tags: data.tags,
      };
    });
  }

  // Calculate metric statistics
  async getMetricStats(
    name: string,
    startTime: number,
    endTime: number
  ): Promise<{
    min: number;
    max: number;
    avg: number;
    count: number;
    p95: number;
    p99: number;
  }> {
    const metrics = await this.getMetrics(name, startTime, endTime);
    const values = metrics.map(m => m.value);

    if (values.length === 0) {
      return {
        min: 0,
        max: 0,
        avg: 0,
        count: 0,
        p95: 0,
        p99: 0,
      };
    }

    values.sort((a, b) => a - b);
    const p95Index = Math.floor(values.length * 0.95);
    const p99Index = Math.floor(values.length * 0.99);

    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      count: values.length,
      p95: values[p95Index],
      p99: values[p99Index],
    };
  }

  // Alert monitoring
  async checkAlerts() {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    // Check error rate
    const errorStats = await this.getMetricStats(
      'http.error.count',
      fiveMinutesAgo,
      now
    );
    if (errorStats.count > 100) {
      Logger.error('High error rate detected', undefined, undefined);
    }

    // Check response time
    const responseTimeStats = await this.getMetricStats(
      'http.request.duration',
      fiveMinutesAgo,
      now
    );
    if (responseTimeStats.p95 > 1000) {
      Logger.warn('High response time detected', {
        p95: responseTimeStats.p95,
      });
    }

    // Check memory usage
    const memoryStats = await this.getMetricStats(
      'system.memory.used',
      fiveMinutesAgo,
      now
    );
    const totalMemory = os.totalmem();
    if (memoryStats.avg / totalMemory > 0.9) {
      Logger.warn('High memory usage detected', {
        usagePercent: (memoryStats.avg / totalMemory) * 100,
      });
    }
  }
}

// Export singleton instance
export const monitoring = new MonitoringService();
