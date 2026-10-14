const { User } = require('../data/models');

// In-memory polls (persisted via periodic save to a simple JSON or managed by admin)
const activePolls = new Map();
let pollIdCounter = 1;

const VOTE_COST = 0; // free to vote
const MIN_VOTES_TO_PASS = 50;
const POLL_DURATION_HOURS = 72; // 3 days
const MAX_ACTIVE_POLLS = 5;
const VOTER_REWARD_AURA = 100; // small reward for participating

// Create a new community poll
function createPoll({ title, description, options, creatorId, durationHours = POLL_DURATION_HOURS }) {
  if (activePolls.size >= MAX_ACTIVE_POLLS) return { error: `Maximum ${MAX_ACTIVE_POLLS} active polls.` };
  if (!options || options.length < 2 || options.length > 6) return { error: 'Polls need 2-6 options.' };
  if (!title || title.length > 100) return { error: 'Title must be 1-100 characters.' };

  const id = `poll_${pollIdCounter++}`;
  const poll = {
    id,
    title,
    description: description || '',
    options: options.map((opt, i) => ({ label: opt, votes: 0, voters: new Set() })),
    creatorId,
    createdAt: new Date(),
    endsAt: new Date(Date.now() + durationHours * 60 * 60 * 1000),
    status: 'active', // active, closed, archived
    totalVotes: 0,
    votedUsers: new Set(),
  };
  activePolls.set(id, poll);
  return { success: true, poll };
}

// Cast a vote
function castVote(userId, pollId, optionIndex) {
  const poll = activePolls.get(pollId);
  if (!poll) return { error: 'Poll not found.' };
  if (poll.status !== 'active') return { error: 'This poll is no longer active.' };
  if (new Date() > poll.endsAt) {
    poll.status = 'closed';
    return { error: 'This poll has ended.' };
  }
  if (poll.votedUsers.has(userId)) return { error: 'You already voted in this poll.' };
  if (optionIndex < 0 || optionIndex >= poll.options.length) return { error: 'Invalid option.' };

  poll.options[optionIndex].votes++;
  poll.options[optionIndex].voters.add(userId);
  poll.votedUsers.add(userId);
  poll.totalVotes++;
  return { success: true, option: poll.options[optionIndex].label, totalVotes: poll.totalVotes, rewardAura: VOTER_REWARD_AURA };
}

// Get poll results
function getPollResults(pollId) {
  const poll = activePolls.get(pollId);
  if (!poll) return null;
  const results = poll.options.map(opt => ({
    label: opt.label,
    votes: opt.votes,
    percentage: poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0,
  }));
  const winner = results.reduce((a, b) => a.votes > b.votes ? a : b);
  const isActive = poll.status === 'active' && new Date() < poll.endsAt;
  const timeRemaining = isActive ? Math.max(0, poll.endsAt - new Date()) : 0;
  const hours = Math.floor(timeRemaining / 3600000);
  const minutes = Math.floor((timeRemaining % 3600000) / 60000);
  return {
    ...poll,
    results,
    winner: poll.status === 'closed' || !isActive ? winner : null,
    isActive,
    timeRemaining: `${hours}h ${minutes}m`,
    votedUsers: undefined, // don't expose
  };
}

// List all active polls
function getActivePolls() {
  const now = new Date();
  const polls = [];
  for (const [id, poll] of activePolls) {
    if (poll.status === 'active' && now < poll.endsAt) {
      polls.push({ id: poll.id, title: poll.title, totalVotes: poll.totalVotes, endsAt: poll.endsAt });
    } else if (poll.status === 'active') {
      poll.status = 'closed';
    }
  }
  return polls;
}

// Close a poll (admin)
function closePoll(pollId) {
  const poll = activePolls.get(pollId);
  if (!poll) return { error: 'Poll not found.' };
  poll.status = 'closed';
  return { success: true, results: getPollResults(pollId) };
}

// Check if a user has voted in a poll
function hasVoted(userId, pollId) {
  const poll = activePolls.get(pollId);
  return poll ? poll.votedUsers.has(userId) : false;
}

// Get all polls a user hasn't voted in
function getUnvotedPolls(userId) {
  return getActivePolls().filter(p => !hasVoted(userId, p.id));
}

// Format a progress bar for vote results
function formatVoteBar(percentage, width = 10) {
  const filled = Math.round((percentage / 100) * width);
  return '▓'.repeat(filled) + '░'.repeat(width - filled);
}

module.exports = {
  createPoll, castVote, getPollResults, getActivePolls, closePoll,
  hasVoted, getUnvotedPolls, formatVoteBar, VOTER_REWARD_AURA,
};
