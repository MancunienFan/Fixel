const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  entity: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  entityLabel: {
    type: String,
    trim: true,
    default: ''
  },
  utilisateur: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'utilisateur',
    index: true
  },
  role: {
    type: String,
    trim: true,
    default: ''
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: {
    createdAt: 'createdAt',
    updatedAt: false
  }
});

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
