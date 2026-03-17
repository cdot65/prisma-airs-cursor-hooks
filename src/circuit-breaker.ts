/** Circuit breaker for AIRS API calls */
export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 60_000,
};

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private openedAt = 0;
  private config: CircuitBreakerConfig;
  private onStateChange?: (from: CircuitState, to: CircuitState) => void;

  constructor(
    config: Partial<CircuitBreakerConfig> = {},
    onStateChange?: (from: CircuitState, to: CircuitState) => void,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.onStateChange = onStateChange;
  }

  /** Check if a request should be allowed through */
  shouldAllow(): boolean {
    if (this.state === "closed") return true;

    if (this.state === "open") {
      if (Date.now() - this.openedAt >= this.config.cooldownMs) {
        this.transition("half-open");
        return true; // allow probe request
      }
      return false;
    }

    // half-open: allow probe
    return true;
  }

  /** Record a successful request */
  recordSuccess(): void {
    if (this.state === "half-open") {
      this.transition("closed");
    }
    this.consecutiveFailures = 0;
  }

  /** Record a failed request */
  recordFailure(): void {
    this.consecutiveFailures++;

    if (this.state === "half-open") {
      this.transition("open");
      return;
    }

    if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.transition("open");
    }
  }

  /** Get current state */
  getState(): CircuitState {
    return this.state;
  }

  /** Get consecutive failure count */
  getFailureCount(): number {
    return this.consecutiveFailures;
  }

  private transition(to: CircuitState): void {
    const from = this.state;
    this.state = to;
    if (to === "open") {
      this.openedAt = Date.now();
    }
    if (to === "closed") {
      this.consecutiveFailures = 0;
    }
    this.onStateChange?.(from, to);
  }
}
