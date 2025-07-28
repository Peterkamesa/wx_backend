const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    // Original report fields
    content: {
        type: String, 
        required: function() { return this.type !== 'CONTACT'; },
        trim: true
    },
    type: {
        type: String,
        required: true,
        enum: ['METAR', 'SYNOP', 'ACTUALS', 'CONTACT'],
        uppercase: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    
    // Fields specific to contact messages (only used when type='CONTACT')
    name: {
        type: String,
        required: function() { return this.type === 'CONTACT'; },
        trim: true
    },
    email: {
        type: String,
        required: function() { return this.type === 'CONTACT'; },
        trim: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
    },
    subject: {
        type: String,
        trim: true
    },
    message: {
        type: String,
        required: function() { return this.type === 'CONTACT'; },
        trim: true
    },
    
    // Common metadata fields
    status: {
        type: String,
        enum: ['NEW', 'PROCESSED', 'ARCHIVED'],
        default: 'NEW'
    },
    ipAddress: String,
    userAgent: String
});

// Adding indexes for better query performance
reportSchema.index({ type: 1, createdAt: -1 });
reportSchema.index({ email: 1, type: 1 });
reportSchema.index({ status: 1 });

// Pre-save hook for additional processing
reportSchema.pre('save', function(next) {
    if (this.type === 'CONTACT') {
        // Set the content field for contact messages by combining subject and message
        this.content = `Contact Form: ${this.subject || 'No Subject'}\n\n${this.message}`;
    }
    next();
});

module.exports = mongoose.model('Report', reportSchema);