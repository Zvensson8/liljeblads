// Shared retry utility with exponential backoff for edge functions

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

const defaultOptions: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  shouldRetry: (error: unknown) => {
    // Retry on network errors and 5xx server errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('network') || 
             message.includes('timeout') ||
             message.includes('503') ||
             message.includes('502') ||
             message.includes('504');
    }
    return true;
  }
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: Error = new Error('No attempts made');
  
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === opts.maxAttempts || !opts.shouldRetry(error, attempt)) {
        throw lastError;
      }
      
      // Exponential backoff with jitter
      const delay = Math.min(
        opts.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500,
        opts.maxDelayMs
      );
      
      console.log(`Retry attempt ${attempt}/${opts.maxAttempts} after ${delay}ms:`, lastError.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Circuit breaker for protecting against cascading failures
export interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
  threshold: number;
  resetTimeoutMs: number;
}

export function createCircuitBreaker(threshold = 5, resetTimeoutMs = 60000): CircuitBreakerState {
  return {
    failures: 0,
    lastFailure: 0,
    isOpen: false,
    threshold,
    resetTimeoutMs
  };
}

export function checkCircuitBreaker(state: CircuitBreakerState): void {
  if (state.isOpen) {
    if (Date.now() - state.lastFailure > state.resetTimeoutMs) {
      // Reset circuit breaker after timeout
      state.isOpen = false;
      state.failures = 0;
      console.log('Circuit breaker reset - service recovering');
    } else {
      throw new Error('AI-tjänsten är tillfälligt otillgänglig. Försök igen om en stund.');
    }
  }
}

export function recordSuccess(state: CircuitBreakerState): void {
  state.failures = 0;
  state.isOpen = false;
}

export function recordFailure(state: CircuitBreakerState): void {
  state.failures++;
  state.lastFailure = Date.now();
  
  if (state.failures >= state.threshold) {
    state.isOpen = true;
    console.error(`Circuit breaker opened after ${state.failures} failures`);
  }
}
