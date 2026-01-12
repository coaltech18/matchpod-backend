"use strict";
/**
 * Configurable Match Weights
 * These weights determine the importance of each matching criterion
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchWeights = void 0;
// Load weights from environment variables with defaults
exports.matchWeights = {
    budget: parseFloat(process.env.MATCH_WEIGHT_BUDGET || '0.25'),
    location: parseFloat(process.env.MATCH_WEIGHT_LOCATION || '0.20'),
    lifestyle: parseFloat(process.env.MATCH_WEIGHT_LIFESTYLE || '0.20'),
    schedule: parseFloat(process.env.MATCH_WEIGHT_SCHEDULE || '0.15'),
    cleanliness: parseFloat(process.env.MATCH_WEIGHT_CLEANLINESS || '0.10'),
    pets: parseFloat(process.env.MATCH_WEIGHT_PETS || '0.05'),
    gender: parseFloat(process.env.MATCH_WEIGHT_GENDER || '0.05'),
};
// Validate weights sum to approximately 1.0
const weightsSum = Object.values(exports.matchWeights).reduce((sum, weight) => sum + weight, 0);
if (Math.abs(weightsSum - 1.0) > 0.01) {
    console.warn(`⚠️ Match weights sum to ${weightsSum.toFixed(2)}, expected 1.0. Normalizing...`);
    // Normalize weights
    const normalizedWeights = {};
    for (const [key, value] of Object.entries(exports.matchWeights)) {
        normalizedWeights[key] = value / weightsSum;
    }
    Object.assign(exports.matchWeights, normalizedWeights);
}
console.log('📊 Match Weights Configuration:', exports.matchWeights);
exports.default = exports.matchWeights;
