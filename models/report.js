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
        sheetType: {
        type: String,
        enum: ['FORM626', 'CSHEET', 'FORM446', 'WX_SUMMARY', 'AGRO18_DEK', null],
        default: null
    },
    sheetId: {
        type: String,
        unique: true,
        sparse: true // Allows null values without affecting uniqueness
    },
    sheetUrl: {
        type: String,
        match: [/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/, 'Please provide a valid URL']
    },
    station: {
        type: String,
        enum: ['Mab-Met', 'Dagoretti', 'JKIA', 'Wilson', null],
        default: null
    },
    month: {  // For WX SUMMARY forms
        type: String,
        enum: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', null],
        default: null
    }
}, {
    // Add discriminator key if you want to use polymorphic behavior
    discriminatorKey: 'recordType',
    ipAddress: String,
    userAgent: String
});

// Adding indexes for better query performance
reportSchema.index({ type: 1, createdAt: -1 });
reportSchema.index({ email: 1, type: 1 });
reportSchema.index({ status: 1 });

reportSchema.index({ sheetId: 1 });
reportSchema.index({ station: 1, sheetType: 1 });
reportSchema.index({ sheetType: 1, month: 1 });

// Pre-save hook for additional processing
reportSchema.pre('save', function(next) {
    if (this.type === 'CONTACT') {
        // Set the content field for contact messages by combining subject and message
        this.content = `Contact Form: ${this.subject || 'No Subject'}\n\n${this.message}`;
    }
    next();
});

module.exports = mongoose.model('Report', reportSchema);