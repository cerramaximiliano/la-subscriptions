// models/Contact.js
const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserGroup", // Si tienes un modelo de grupo de usuarios
      required: false,
    },
    folderIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Folder'
    }],
    name: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: false,
    },
    state: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    zipCode: {
      type: String,
    },
    email: {
      type: String,
    },
    phone: {
      type: String,
    },
    nationality: {
      type: String,
    },
    document: {
      type: String,
    },
    cuit: {
      type: String,
    },
    status: {
      type: String,
    },
    archived: {
      type: Boolean,
      default: false,
    },
    activity: {
      type: String,
    },
    company: {
      type: String,
    },
    fiscal: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Contact", ContactSchema);
