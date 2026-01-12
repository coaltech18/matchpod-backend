/**
 * Configurable Match Weights
 * These weights determine the importance of each matching criterion
 */

export interface MatchWeights {
  budget: number;
  location: number;
  lifestyle: number;
  schedule: number;
  cleanliness: number;
  pets: number;
  gender: number;
}

// Load weights from environment variables with defaults
export const matchWeights: MatchWeights = {
  budget: parseFloat(process.env.MATCH_WEIGHT_BUDGET || '0.25'),
  location: parseFloat(process.env.MATCH_WEIGHT_LOCATION || '0.20'),
  lifestyle: parseFloat(process.env.MATCH_WEIGHT_LIFESTYLE || '0.20'),
  schedule: parseFloat(process.env.MATCH_WEIGHT_SCHEDULE || '0.15'),
  cleanliness: parseFloat(process.env.MATCH_WEIGHT_CLEANLINESS || '0.10'),
  pets: parseFloat(process.env.MATCH_WEIGHT_PETS || '0.05'),
  gender: parseFloat(process.env.MATCH_WEIGHT_GENDER || '0.05'),
};

// Validate weights sum to approximately 1.0
const weightsSum = Object.values(matchWeights).reduce((sum, weight) => sum + weight, 0);
if (Math.abs(weightsSum - 1.0) > 0.01) {
  console.warn(`⚠️ Match weights sum to ${weightsSum.toFixed(2)}, expected 1.0. Normalizing...`);
  
  // Normalize weights
  const normalizedWeights = {} as MatchWeights;
  for (const [key, value] of Object.entries(matchWeights)) {
    normalizedWeights[key as keyof MatchWeights] = value / weightsSum;
  }
  
  Object.assign(matchWeights, normalizedWeights);
}

console.log('📊 Match Weights Configuration:', matchWeights);

export default matchWeights;

