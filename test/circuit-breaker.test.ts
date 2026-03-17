import { describe, it, expect, vi } from "vitest";
import { CircuitBreaker } from "../src/circuit-breaker.js";

describe("CircuitBreaker", () => {
  it("starts in closed state", () => {
    const cb = new CircuitBreaker();
    expect(cb.getState()).toBe("closed");
    expect(cb.shouldAllow()).toBe(true);
  });

  it("opens after reaching failure threshold", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });

    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("closed");

    cb.recordFailure();
    expect(cb.getState()).toBe("open");
    expect(cb.shouldAllow()).toBe(false);
  });

  it("transitions to half-open after cooldown", () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 100 });

    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("open");

    // Simulate cooldown by advancing time
    vi.useFakeTimers();
    vi.advanceTimersByTime(150);

    expect(cb.shouldAllow()).toBe(true);
    expect(cb.getState()).toBe("half-open");

    vi.useRealTimers();
  });

  it("closes on success in half-open state", () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 100 });

    cb.recordFailure();
    cb.recordFailure();

    vi.useFakeTimers();
    vi.advanceTimersByTime(150);
    cb.shouldAllow(); // triggers half-open

    cb.recordSuccess();
    expect(cb.getState()).toBe("closed");
    expect(cb.getFailureCount()).toBe(0);

    vi.useRealTimers();
  });

  it("re-opens on failure in half-open state", () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 100 });

    cb.recordFailure();
    cb.recordFailure();

    vi.useFakeTimers();
    vi.advanceTimersByTime(150);
    cb.shouldAllow(); // triggers half-open

    cb.recordFailure();
    expect(cb.getState()).toBe("open");

    vi.useRealTimers();
  });

  it("resets failure count on success in closed state", () => {
    const cb = new CircuitBreaker({ failureThreshold: 5 });

    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    expect(cb.getFailureCount()).toBe(0);
  });

  it("invokes onStateChange callback", () => {
    const onChange = vi.fn();
    const cb = new CircuitBreaker({ failureThreshold: 2 }, onChange);

    cb.recordFailure();
    cb.recordFailure();

    expect(onChange).toHaveBeenCalledWith("closed", "open");
  });
});
