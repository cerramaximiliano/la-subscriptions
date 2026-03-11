const mongoose = require('mongoose');
const { Schema } = mongoose;

// Esquema mínimo para operar sobre la colección groups desde la-subscriptions
// El modelo completo vive en law-analytics-server/models/Group.js

const groupMemberSchema = new Schema({
  userId: { type: Schema.Types.ObjectId },
  role: String,
  status: { type: String, default: 'active' },
  joinedAt: Date,
  invitedBy: Schema.Types.ObjectId,
  lastActivityAt: { type: Date, default: null }
}, { _id: true });

const groupInvitationSchema = new Schema({
  email: String,
  status: String,
  expiresAt: Date,
  token: String,
  role: String
}, { _id: true });

const groupHistorySchema = new Schema({
  action: String,
  performedBy: Schema.Types.ObjectId,
  targetUser: Schema.Types.ObjectId,
  details: Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const groupSchema = new Schema({
  name: String,
  owner: { type: Schema.Types.ObjectId, index: true },
  status: { type: String, default: 'active', index: true },
  members: { type: [groupMemberSchema], default: [] },
  invitations: { type: [groupInvitationSchema], default: [] },
  history: { type: [groupHistorySchema], default: [] },
  metadata: Schema.Types.Mixed
}, { timestamps: true });

const Group = mongoose.models.Group || mongoose.model('Group', groupSchema);
module.exports = Group;
