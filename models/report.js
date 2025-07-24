const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    content: {type: String, required: true},
    type: {type: String, required: true, enum: ['METAR', 'SYNOP', 'ACTUALS']},
    station: {
        name: { type: String, required: true },
        number: { type: String, required: true }
    },
    createdAt: {type: Date, default: Date.now},
});

module.exports = mongoose.model('Report', reportSchema);