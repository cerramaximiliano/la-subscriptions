  const mongoose = require('mongoose');

  const planConfigSchema = new mongoose.Schema({
    planId: {
      type: String,
      required: true,
      unique: true,
      enum: ['free', 'standard', 'premium']
    },
    stripePriceId: {
      type: String,
      required: true
    },
    stripeProductId: {
      type: String
    },
    name: {
      type: String,
      required: true
    },
    description: String,
    price: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'usd'
    },
    features: {
      maxFolders: Number,
      maxCalculators: Number,
      maxContacts: Number,
      maxStorage: Number,
      advancedAnalytics: Boolean,
      exportReports: Boolean,
      prioritySupport: Boolean,
      taskAutomation: Boolean,
      bulkOperations: Boolean
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  });

  module.exports = mongoose.model('PlanConfig', planConfigSchema);