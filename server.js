require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const jwt = require('jsonwebtoken'); 


const app = express();

app.use(express.json());
app.use(express.static(__dirname)); // Serves files from project root

//mongodb connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('MongoDB connected');
})
.catch(err => {
  console.error('MongoDB connection error:', err);
});

// Validate required environment variables
const requiredEnvVars = ['EMAIL_USER', 'EMAIL_PASS', 'MONGODB_URI', 'PORT', 'RECIPIENT_EMAIL'];
requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`Missing required environment variable: rater${varName}`);
    process.exit(1);
  }
});

// Security Middleware
app.use(helmet());

app.use(cors({
  origin: [
    'https://peterkamesa.github.io',  // Remove trailing slash and path
    'https://wxbackend-production.up.railway.app',
    'http://localhost:3001',
    'http://localhost:5501'
  ],
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']  // Important for API requests
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);



// Other Middleware
app.use(morgan('dev'));

app.set('trust proxy', true); // Enable proxy trust first!

app.use((req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';

  if (isProduction && !isSecure) {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});
// report models(report.js)
const Report = require('./models/report');

// email transporter setup
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587, // Alternative ports: 465 or 587
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: true // For testing only
  },

  connectionTimeout: 30000, // Increase timeout to 30 seconds
  greetingTimeout: 30000,
  socketTimeout: 30000
});

const stations = [
    {name: "Mab-Met", number: "63739"},
    {name: "Dagoretti", number: "63741"},
    {name: "JKIA", number: "63740"},
    {name: "Wilson", number: "63742"}
]

app.post('/api/login', async (req, res) => {
    const {station, password } = req.body

    //finding the selected station
    const selectedStation = station.find(s => s.name.toLowerCase() === station.toLowerCase());
    if (!selectedStation) {
        return res.status(401).json({message: 'Invalid station' });
    }
    //checking password if it matches
    const expectedPassword = selectedStation.name.toLowerCase() + selectedStation.number;
    if (password !== expectedPassword) {
        return res.status(401).json({
            message: 'Invalid credentials'
        });
    }
    
    //creating token
    const token = jwt.sign({
        station : selectedStation.name,
        stationNumber: selectedStation.number
    }, SECRET_KEY, {expiresIn: '1h'});
    res.json({token});
});

// GET all METAR reports
app.get('/api/reports/METAR', async (req, res) => {
    try {
        const reports = await Report.find({ type: 'METAR' }).sort({ createdAt: -1 });
        res.json(reports);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// GET all synop reports
app.get('/api/reports/SYNOP', async (req, res) => {
    try {
        const reports = await Report.find({ type: 'SYNOP' }).sort({ createdAt: -1 });
        res.json(reports);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET all ACTUALS reports
app.get('/api/reports/ACTUALS', async (req, res) => {
    try {
        const reports = await Report.find({ type: 'ACTUALS' }).sort({ createdAt: -1 });
        res.json(reports);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// api for deleting METAR reports
app.delete('/api/reports/clear/METAR', async (req, res) => {
    try {
        // Delete all METAR reports and get the result
        const result = await Report.deleteMany({ type: 'METAR' });
        
        // Return information about the deletion
        res.json({
            message: `Successfully deleted ${result.deletedCount} METAR reports`,
            deletedCount: result.deletedCount
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// api for deleting SYNOP reports
app.delete('/api/reports/clear/SYNOP', async (req, res) => {
    try {
        // Delete all METAR reports and get the result
        const result = await Report.deleteMany({ type: 'SYNOP' });
        
        // Return information about the deletion
        res.json({
            message: `Successfully deleted ${result.deletedCount} SYNOP reports`,
            deletedCount: result.deletedCount
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// api for deleting ACTUALS reports
app.delete('/api/reports/clear/ACTUALS', async (req, res) => {
    try {
        // Delete all ACTUAL reports and get the result
        const result = await Report.deleteMany({ type: 'ACTUALS' });
        
        // Return information about the deletion
        res.json({
            message: `Successfully deleted ${result.deletedCount} ACTUALS reports`,
            deletedCount: result.deletedCount
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete a SPECIFIC METAR report by ID
app.delete('/api/reports/clear/METAR/:id', async (req, res) => {
    try {
        const report = await Report.findOneAndDelete({
            _id: req.params.id,
            type: 'METAR' // Ensures we only delete METAR reports
        });
        
        if (!report) {
            return res.status(404).json({ message: 'METAR report not found' });
        }
        
        res.json({
            message: 'METAR report deleted successfully',
            deletedReport: report
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete a SPECIFIC SYNOP report by ID
app.delete('/api/reports/clear/SYNOP/:id', async (req, res) => {
    try {
        const report = await Report.findOneAndDelete({
            _id: req.params.id,
            type: 'SYNOP' // Ensures we only delete synop reports
        });
        
        if (!report) {
            return res.status(404).json({ message: 'SYNOP report not found' });
        }
        
        res.json({
            message: 'SYNOP report deleted successfully',
            deletedReport: report
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete a SPECIFIC ACTUAL report by ID
app.delete('/api/reports/clear/ACTUALS/:id', async (req, res) => {
    try {
        const report = await Report.findOneAndDelete({
            _id: req.params.id,
            type: 'ACTUALS' // Ensures we only delete ACTUALS reports
        });
        
        if (!report) {
            return res.status(404).json({ message: 'ACTUALS report not found' });
        }
        
        res.json({
            message: 'ACTUALS report deleted successfully',
            deletedReport: report
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// API endpoint to submit and save a report
app.post('/api/reports', async (req, res) => {
    try {
        const{content, type} = req.body;
        const report = new Report({
            content,
            type,
        });
        await report.save();
        res.status(201).json({ success: true, message: 'Report saved successfully' });

    } catch (error) {
        res.status(500).json({ error:'Error saving report', error: error.message });
    }
});

//sending report via email
app.post('/api/send-report', async (req, res) => {
    const { to, subject, content } = req.body;
    try {
        await transporter.sendMail({
            from: `"Weather System"<${process.env.EMAIL_USER}>`,
            to,
            subject,
            text: content,
            html: `<pre>${content}</pre>`,
        });


        res.json({ success: true, message: 'Report sent successfully' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ success: false, message: 'Error sending report', error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
