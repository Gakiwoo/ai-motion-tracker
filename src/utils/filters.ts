/**
 * 信号处理工具类
 *
 * 提供运动检测算法中常用的信号滤波和数据结构。
 * 所有 Counter 统一从此模块导入，避免重复定义。
 */

// ── 简易 1D Kalman 滤波器 ──

export class KalmanFilter1D {
  private x = 0;    // 状态估计
  private p = 1;    // 估计误差协方差
  private readonly q: number;  // 过程噪声
  private readonly r: number;  // 测量噪声

  constructor(processNoise = 0.01, measurementNoise = 0.1) {
    this.q = processNoise;
    this.r = measurementNoise;
  }

  /**
   * 输入一个测量值，返回滤波后的估计值
   */
  filter(measurement: number): number {
    // 预测
    const xPred = this.x;
    const pPred = this.p + this.q;
    // 更新
    const k = pPred / (pPred + this.r);  // Kalman 增益
    this.x = xPred + k * (measurement - xPred);
    this.p = (1 - k) * pPred;
    return this.x;
  }

  /**
   * 重置滤波器状态到指定初始值
   */
  reset(value: number): void {
    this.x = value;
    this.p = 1;
  }

  /** 当前状态估计值 */
  get state(): number { return this.x; }
}

// ── 滑动窗口（固定长度的环形缓冲区）──

export class SlidingWindow {
  private readonly buffer: number[] = [];
  constructor(private readonly maxSize: number = 30) {}

  push(value: number): void {
    this.buffer.push(value);
    if (this.buffer.length > this.maxSize) this.buffer.shift();
  }

  mean(): number {
    if (this.buffer.length === 0) return 0;
    return this.buffer.reduce((s, v) => s + v, 0) / this.buffer.length;
  }

  variance(): number {
    if (this.buffer.length < 2) return Infinity;
    const m = this.mean();
    return this.buffer.reduce((s, v) => s + (v - m) ** 2, 0) / this.buffer.length;
  }

  min(): number {
    if (this.buffer.length === 0) return 0;
    return Math.min(...this.buffer);
  }

  max(): number {
    if (this.buffer.length === 0) return 0;
    return Math.max(...this.buffer);
  }

  last(): number | undefined {
    return this.buffer[this.buffer.length - 1];
  }

  /** 窗口内的数据数组（只读引用） */
  get data(): readonly number[] { return this.buffer; }

  get size(): number { return this.buffer.length; }
  get capacity(): number { return this.maxSize; }

  clear(): void { this.buffer.length = 0; }

  get isFull(): boolean { return this.buffer.length >= this.maxSize; }
}
