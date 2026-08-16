/**
 * Lightweight Logistic Regression Inference Engine.
 * 
 * Maps a standardized feature vector into a probability (0-1).
 */
export class LogisticRegressionPredictor {
  private weights: number[];
  private bias: number;

  constructor(weights: number[], bias: number) {
    this.weights = weights;
    this.bias = bias;
  }

  public predict(features: number[]): number {
    if (features.length !== this.weights.length) {
      console.warn("Feature length mismatch in ML predictor");
      return 0.5;
    }

    let z = this.bias;
    for (let i = 0; i < features.length; i++) {
      z += features[i] * this.weights[i];
    }

    // Sigmoid function
    return 1 / (1 + Math.exp(-z));
  }
}

/**
 * Hand-tuned initial weights based on standard trading heuristics.
 * Features: [rsiDivergence, volumeSurge, priceVs20Ema, priceVs50Ema, relativeStrength, volatility]
 * 
 * Future improvement: Automatically train these weights via the 
 * Auto-Evaluation engine and swap them out dynamically.
 */
export const defaultModel = new LogisticRegressionPredictor(
  [
    -0.5, // RSI divergence: slight mean reversion, penalty for overbought
    1.2,  // Volume surge: strong momentum indicator
    -1.5, // Price vs 20EMA: negative if too extended above short term average
    0.8,  // Price vs 50EMA: positive for long-term trend alignment
    2.0,  // Relative Strength: strong positive momentum compared to broader market
    -1.0  // Volatility: slight negative penalty for extreme chop
  ],
  0.2 // Baseline bias
);
