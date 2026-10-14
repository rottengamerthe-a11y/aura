// Active experiments
const experiments = new Map();

// Track results
const experimentResults = new Map();

const EXPERIMENT_DEFAULTS = {
  maxParticipants: 10000,
  defaultVariant: 'control',
};

// Define an experiment
function createExperiment(id, { name, description, variants, allocation = null, startDate = null, endDate = null }) {
  // variants is an object like { control: { workReward: 100 }, variant_a: { workReward: 120 }, variant_b: { workReward: 80 } }
  // allocation is optional weights: { control: 50, variant_a: 25, variant_b: 25 } (percentages)
  if (experiments.has(id)) return { error: 'Experiment already exists.' };
  const variantKeys = Object.keys(variants);
  if (variantKeys.length < 2) return { error: 'Need at least 2 variants.' };
  
  const defaultAllocation = {};
  const equalWeight = Math.floor(100 / variantKeys.length);
  variantKeys.forEach(k => { defaultAllocation[k] = equalWeight; });
  
  const experiment = {
    id,
    name: name || id,
    description: description || '',
    variants,
    allocation: allocation || defaultAllocation,
    assignments: new Map(), // userId -> variantKey
    metrics: new Map(), // userId -> { variant, events: [] }
    startDate: startDate || new Date(),
    endDate: endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
    active: true,
    participantCount: 0,
  };
  experiments.set(id, experiment);
  experimentResults.set(id, { variants: {} });
  variantKeys.forEach(k => { experimentResults.get(id).variants[k] = { participants: 0, events: [], totalValue: 0 }; });
  return { success: true, experiment: { id, name: experiment.name, variants: variantKeys } };
}

// Get which variant a user is assigned to (deterministic assignment using userId hash)
function getUserVariant(experimentId, userId) {
  const experiment = experiments.get(experimentId);
  if (!experiment || !experiment.active) return EXPERIMENT_DEFAULTS.defaultVariant;
  
  // Check existing assignment
  if (experiment.assignments.has(userId)) return experiment.assignments.get(userId);
  
  // Deterministic assignment based on userId hash
  let hash = 0;
  const seed = `${experimentId}:${userId}`;
  for (let i = 0; i < seed.length; i++) {
    hash = Math.imul(31, hash) + seed.charCodeAt(i) | 0;
  }
  hash = Math.abs(hash) % 100;
  
  let cumulative = 0;
  const variantKeys = Object.keys(experiment.allocation);
  let assigned = variantKeys[0];
  for (const key of variantKeys) {
    cumulative += experiment.allocation[key];
    if (hash < cumulative) { assigned = key; break; }
  }
  
  experiment.assignments.set(userId, assigned);
  experiment.participantCount++;
  experimentResults.get(experimentId).variants[assigned].participants++;
  return assigned;
}

// Get the actual config value for a user in an experiment
function getExperimentValue(experimentId, userId, key) {
  const variant = getUserVariant(experimentId, userId);
  const experiment = experiments.get(experimentId);
  if (!experiment) return undefined;
  return experiment.variants[variant]?.[key];
}

// Track a metric event for an experiment
function trackEvent(experimentId, userId, eventName, value = 1) {
  const experiment = experiments.get(experimentId);
  if (!experiment || !experiment.active) return;
  
  const variant = getUserVariant(experimentId, userId);
  if (!experiment.metrics.has(userId)) {
    experiment.metrics.set(userId, { variant, events: [] });
  }
  experiment.metrics.get(userId).events.push({ name: eventName, value, timestamp: Date.now() });
  
  const results = experimentResults.get(experimentId);
  if (results?.variants[variant]) {
    results.variants[variant].events.push({ name: eventName, value });
    results.variants[variant].totalValue += value;
  }
}

// Get experiment results summary
function getExperimentResults(experimentId) {
  const experiment = experiments.get(experimentId);
  const results = experimentResults.get(experimentId);
  if (!experiment || !results) return null;
  
  const summary = {
    id: experiment.id,
    name: experiment.name,
    active: experiment.active,
    participantCount: experiment.participantCount,
    variants: {},
  };
  
  for (const [variantKey, data] of Object.entries(results.variants)) {
    const eventCounts = {};
    data.events.forEach(e => { eventCounts[e.name] = (eventCounts[e.name] || 0) + e.value; });
    summary.variants[variantKey] = {
      participants: data.participants,
      avgValue: data.participants > 0 ? Math.round(data.totalValue / data.participants) : 0,
      totalValue: data.totalValue,
      eventBreakdown: eventCounts,
    };
  }
  return summary;
}

// List all experiments
function listExperiments() {
  return Array.from(experiments.values()).map(e => ({
    id: e.id, name: e.name, active: e.active,
    participants: e.participantCount,
    variants: Object.keys(e.variants),
    endDate: e.endDate,
  }));
}

// End an experiment
function endExperiment(experimentId) {
  const experiment = experiments.get(experimentId);
  if (!experiment) return { error: 'Experiment not found.' };
  experiment.active = false;
  return { success: true, results: getExperimentResults(experimentId) };
}

// Pre-configure some default experiments
function initDefaultExperiments() {
  createExperiment('work_rewards', {
    name: 'Work Reward Amounts',
    description: 'Testing different work command reward amounts',
    variants: {
      control: { workBaseMin: 50, workBaseMax: 150 },
      higher: { workBaseMin: 60, workBaseMax: 180 },
      lower: { workBaseMin: 40, workBaseMax: 130 },
    },
    allocation: { control: 34, higher: 33, lower: 33 },
  });
  
  createExperiment('daily_streak_bonus', {
    name: 'Daily Streak Bonus Scaling',
    description: 'Testing how streak bonuses affect retention',
    variants: {
      control: { streakBonusPerDay: 50 },
      aggressive: { streakBonusPerDay: 100 },
      conservative: { streakBonusPerDay: 25 },
    },
  });
  
  createExperiment('crate_drop_rates', {
    name: 'Crate Drop Rate Experiment',
    description: 'Testing different crate legendary drop rates',
    variants: {
      control: { legendaryChance: 0.02 },
      generous: { legendaryChance: 0.04 },
      stingy: { legendaryChance: 0.01 },
    },
  });
}

module.exports = {
  createExperiment, getUserVariant, getExperimentValue, trackEvent,
  getExperimentResults, listExperiments, endExperiment, initDefaultExperiments,
};
