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
const { google } = require('googleapis');
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);


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
const requiredEnvVars = ['EMAIL_USER', 'EMAIL_USER2', 'EMAIL_PASS', 'MONGODB_URI', 'PORT', 'RECIPIENT_EMAIL', 'JWT_SECRET'];
requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`Missing required environment variable: rater${varName}`);
    process.exit(1);
  }
});

let sheetsAuth = null;
try {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    sheetsAuth = new google.auth.JWT(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') || process.env.GOOGLE_PRIVATE_KEY,
      ['https://www.googleapis.com/auth/drive']
    );
  }
} catch (error) {
  console.error('Google Auth initialization failed:', error);
}
// Security Middleware
app.use(helmet());

app.use(cors({
  origin: [
    'https://peterkamesa.github.io',
    'https://wxbackend-production.up.railway.app',
    'http://localhost:3001',
    'http://127.0.0.1:5502',
    'https://script.google.com',
    'https://docs.google.com',
    'https://www.googleapis.com',
    'http://127.0.0.1:5500'
  ],
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Authorization, Content-Type']  // Important for API requests
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

// Station model (no need to store in DB since we have fixed stations)
const predefinedStations = [
    {name: "Mab-Met", number: "63739", password: "mab-met63739"},
    {name: "Dagoretti", number: "63741", password: "dagoretti63741"},
    {name: "JKIA", number: "63740", password: "jkia63740"},
    {name: "Wilson", number: "63742", password: "wilson63742"}
];

// Modified login route
app.post('/api/login', async (req, res) => {
    try {
        const { station, password } = req.body;
        
        // Validate input
        if (!station || !password) {
            return res.status(400).json({ message: 'Station name and password are required' });
        }
        
        // Find station in predefined list
        const stationData = predefinedStations.find(s => s.name === station);
        if (!stationData) {
            return res.status(401).json({ message: 'Invalid station' });
        }
        
        // Check password (station name + number)
        if (password !== stationData.password) {
            return res.status(401).json({ message: 'Invalid password' });
        }
        
        // Generate token
        const token = jwt.sign(
            { stationId: stationData.number, name: stationData.name, role: 'station'},
            process.env.JWT_SECRET || 'your_jwt_secret',
            { expiresIn: '24h' }
        );
        
        res.json({ 
            token, 
            station: { 
                name: stationData.name, 
                number: stationData.number 
            } 
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Authentication Middleware
/*
const authenticate = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) throw new Error();
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).send({ error: 'Please authenticate' });
  }
};*/


// Contact Form Endpoint
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        
        // Basic validation
        if (!name || !email || !message) {
            return res.status(400).json({ 
                success: false,
                message: 'Name, email, and message are required' 
            });
        }
        
        // Creating new contact message using my Report schema
        const newContact = new Report({
            type: 'CONTACT',
            name,
            email,
            subject,
            message,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });
        
        await newContact.save();
        // Send email notification
    const mailOptions = {
      from: process.env.EMAIL_USER, // Your email address
      to: process.env.RECIPIENT_EMAIL, // Your email address
      subject: `New Contact Form Submission: ${subject || 'No Subject'}`,
      text: `
        New contact form submission:
        
        Name: ${name}
        Email: ${email}
        Subject: ${subject || 'No Subject'}
        Message: ${message}
        
        Received at: ${new Date().toLocaleString()}
        IP Address: ${req.ip}
      `,
      html: `
        <h1>New contact form submission</h1>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Subject:</strong> ${subject || 'No Subject'}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
        <hr>
        <p><small>Received at: ${new Date().toLocaleString()}</small></p>
        <p><small>IP Address: ${req.ip}</small></p>
      `
    };

    await transporter.sendMail(mailOptions);

        
        res.status(201).json({ 
            success: true,
            message: 'Thank you for your message! We will get back to you soon.' 
        });
    } catch (error) {
        console.error('Error saving contact:', error);
        res.status(500).json({ 
            success: false,
            message: 'An error occurred while sending your message try again!' 
        });
    }
});

// GET all contacts
app.get('/api/contact', async (req, res) => {
    try {
        const reports = await Report.find({ type: 'CONTACT' }).sort({ createdAt: -1 });
        res.json(reports);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


app.post('/api/sheets', async (req, res) => {
  try {
    const { station, formType, sheetId } = req.body;
    
    // Use Report model instead of Sheet
    const sheetRecord = new Report({
      type: 'SHEET',
      sheetType: formType,
      sheetId,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
      station,
      status: 'ACTIVE',
      createdAt: new Date()
    });
    
    await sheetRecord.save();
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving sheet:', err);
    res.status(500).json({ error: err.message });
  }
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

// api end point for saving reports
app.post('/api/reports', async (req, res) => {
  try{
    const{ content, type, station, sheetType, sheetId, sheetUrl, month } = req.body;
    const report = new Report({
      content,
      type,
      station,
      sheetType,
      sheetId,
      sheetUrl,
      month,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    await report.save();
    res.status(201).json({ success: true, message: 'Report saved successfully'});
  }catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save report', error: error.message });
  }
});

// Get all sheet reports for a specific station
app.get('/api/sheets/station/:stationId', async (req, res) => {
    try {
        const reports = await Report.find({ 
            station: req.params.stationId,
            sheetType: { $ne: null }
        }).sort({ createdAt: -1 });
        
        res.json(reports);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get reports by sheet type
app.get('/api/sheets/type/:sheetType', async (req, res) => {
    try {
        const reports = await Report.find({ 
            sheetType: req.params.sheetType 
        }).sort({ createdAt: -1 });
        
        res.json(reports);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get station-specific C/SHEET
app.get('/api/sheets/csheet', async (req, res) => {
  try {
    const { station } = req.query;
    
    if (!station) {
      return res.status(400).json({ error: 'Station parameter is required' });
    }
    
    console.log(`Fetching C/SHEET for station: ${station}`);

        // Using static template
    const staticSheets = {
      'Mab-Met': 'https://docs.google.com/spreadsheets/d/1Cmf1zDCOH9z1SZPwd-vNDx5vkWEs0nzhN3x-fXH1SlQ/edit',
      'Dagoretti': 'https://docs.google.com/spreadsheets/d/1PbDT6sRo8TLqShtDOlhEEwLRTHdxRN1xRCvrB9Dzrco/edit',
      'JKIA': 'https://docs.google.com/spreadsheets/d/1bO0gyuZQfmAJV46GSiB-kKKaR6ACAAHQwEVUtXCfEHk/edit',
      'Wilson': 'https://docs.google.com/spreadsheets/d/1nT94BRte0a3ckxJUr2RcfykOw03XEpRYZ0ESncKsWYc/edit'
    };

    const sheetUrl = staticSheets[station] || staticSheets['Mab-Met'];
    
    res.json({
      success: true,
      station: station,
      sheetType: 'CSHEET',
      sheetId: '1Cmf1zDCOH9z1SZPwd-vNDx5vkWEs0nzhN3x-fXH1SlQ',
      sheetUrl: sheetUrl,
      message: 'Using template sheet'
    });
    
  } catch (error) {
    console.error('Error in C/SHEET endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});
    
    /*
    // Find the sheet in database
    const sheet = await Report.findOne({
      sheetType: 'CSHEET',
      station: station
    }).sort({ createdAt: -1 });
    
    if (sheet) {
      console.log(`Found existing C/SHEET for ${station}: ${sheet.sheetId}`);
      return res.json(sheet);
    }
    
    console.log(`No existing C/SHEET found for ${station}, creating new one...`);
    
    // Create a new copy if doesn't exist
    try {
      const newSheet = await createNewSheetCopy('CSHEET', station);
      console.log(`Created new C/SHEET for ${station}: ${newSheet.sheetId}`);
      return res.json(newSheet);
    } catch (error) {
      console.error('Error creating new sheet:', error);
      return res.status(500).json({ 
        error: 'Failed to create new sheet',
        details: error.message 
      });
    }
    
  } catch (error) {
    console.error('Error in C/SHEET endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});*/

// Save sheet endpoint (FIXED - no authentication)
app.post('/api/sheets/save', async (req, res) => {
  try {
    const { station, sheetType, sheetId } = req.body;
    
    if (!station || !sheetType || !sheetId) {
      return res.status(400).json({ error: 'Station, sheetType, and sheetId are required' });
    }
    
    // Find or create the record
    let existing = await Report.findOne({
      sheetId,
      station,
      sheetType
    });
    
    if (!existing) {
      // Create a new record if it doesn't exist
      existing = new Report({
        type: 'SHEET',
        sheetType,
        sheetId,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
        station,
        status: 'ACTIVE'
      });
    }
    
    // Update the record
    existing.updatedAt = new Date();
    await existing.save();
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error saving sheet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to create new sheet copies
async function createNewSheetCopy(sheetType, station) {
  try {
    if (!sheetsAuth) {
      throw new Error('Google Sheets authentication not configured');
    }
    
    const templateIds = {
      'FORM626': '13rvm1nltX1Gteu4N4qj13LpGPYYz2EUs7eEOEZwbzuo',
      'CSHEET': '1Cmf1zDCOH9z1SZPwd-vNDx5vkWEs0nzhN3x-fXH1SlQ',
      'FORM446': '1GBhOZBzNZNNtrGP5jVgjnSbLou4daP6Gw5EnRS_diUE',
      'WX_SUMMARY': '1xo2b0cLtw7wZhEy3ZdkFDIIhz4ZeA0cO'
    };
    
    if (!templateIds[sheetType]) {
      throw new Error(`Unknown sheet type: ${sheetType}`);
    }
    
    const drive = google.drive({ version: 'v3', auth: sheetsAuth });
    
    const copyResponse = await drive.files.copy({
      fileId: templateIds[sheetType],
      requestBody: {
        name: `${station} - ${sheetType} - ${new Date().toISOString().split('T')[0]}`
      }
    });
    
    await drive.permissions.create({
      fileId: copyResponse.data.id,
      requestBody: {
        role: 'writer',
        type: 'anyone'
      }
    });
    
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${copyResponse.data.id}/edit`;
    
    const report = new Report({
      type: 'SHEET',
      sheetType,
      sheetId: copyResponse.data.id,
      sheetUrl,
      station,
      status: 'ACTIVE'
    });
    
    await report.save();
    return report;
    
  } catch (error) {
    console.error('Error creating new sheet copy:', error);
    throw error; // Re-throw to be handled by the caller
  }
}

// Get station-specific form626
app.get('/api/sheets/form626', async (req, res) => {
  try {
    const { station } = req.query;
    
    if (!station) {
      return res.status(400).json({ error: 'Station parameter is required' });
    }
    
    console.log(`Fetching FORM626 for station: ${station}`);

       // Using static template
    const staticSheets = {
      'Mab-Met': 'https://docs.google.com/spreadsheets/d/1fjJGi7txP1xiPyq-taM9Z7zY6joQ0sVRtKAnUyTq6QY/edit',
      'Dagoretti': 'https://docs.google.com/spreadsheets/d/1Bfi6E5WKiMeGhInwD7J3sm60XgBFfIiIU06MyQFzWTk/edit',
      'JKIA': 'https://docs.google.com/spreadsheets/d/1_njsLqKEci4oMvz1Tk2NDn00Wb_fgfJSVD0x1bb8Kao/edit',
      'Wilson': 'https://docs.google.com/spreadsheets/d/12wxnp9aPb_4VXTufH9MHdiiUsoz26acDBSfKJQEKPFE/edit'
    };

    const sheetUrl = staticSheets[station] || staticSheets['Mab-Met'];
    
    res.json({
      success: true,
      station: station,
      sheetType: 'FORM626',
      sheetId: '1fjJGi7txP1xiPyq-taM9Z7zY6joQ0sVRtKAnUyTq6QY',
      sheetUrl: sheetUrl,
      message: 'Using template sheet'
    });
    
  } catch (error) {
    console.error('Error in FORM626 endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// Get station-specific agro18 dekad
app.get('/api/sheets/agro18_dek', async (req, res) => {
  try {
    const { station } = req.query;
    
    if (!station) {
      return res.status(400).json({ error: 'Station parameter is required' });
    }
    
    console.log(`Fetching AGRO18 DEKAD for station: ${station}`);

        // Using static template
    const staticSheets = {
      'Mab-Met': 'https://docs.google.com/spreadsheets/d/1GBhOZBzNZNNtrGP5jVgjnSbLou4daP6Gw5EnRS_diUE/edit',
      'Dagoretti': 'https://docs.google.com/spreadsheets/d/1tTDapJPc0wp1_NXQv5U8Fn4gdzHHT61a5-Ay7bCMiMI/edit',
      'JKIA': 'https://docs.google.com/spreadsheets/d/1mDkYzWHtB8TD-SrmJRPMh7tEQEf3Rd_joKeTwQOBzfA/edit',
      'Wilson': 'https://docs.google.com/spreadsheets/d/17jQ1EfuFsNlLAJ5RhjZj6ZqAMnWeio8EWleXpIFWTAk/edit'
    };

    const sheetUrl = staticSheets[station] || staticSheets['Mab-Met'];
    
    res.json({
      success: true,
      station: station,
      sheetType: 'AGRO18_DEK',
      sheetId: '1GBhOZBzNZNNtrGP5jVgjnSbLou4daP6Gw5EnRS_diUE',
      sheetUrl: sheetUrl,
      message: 'Using template sheet'
    });
    
  } catch (error) {
    console.error('Error in AGRO18_DEK endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// Get station-specific form446
app.get('/api/sheets/form446', async (req, res) => {
  try {
    const { station } = req.query;
    
    if (!station) {
      return res.status(400).json({ error: 'Station parameter is required' });
    }
    
    console.log(`Fetching form446 for station: ${station}`);

        // Using static template
    const staticSheets = {
      'Mab-Met': 'https://docs.google.com/spreadsheets/d/1AOVxn1lbp7qRuz5aocKgmxxzJAjcoXsmy7zYXI_JRxg/edit',
      'Dagoretti': 'https://docs.google.com/spreadsheets/d/1fI3EY_2Tw7HNPP1TxTNAN4jTsbGb0RSv79b5oMraZFY/edit',
      'JKIA': 'https://docs.google.com/spreadsheets/d/1unigPQPIEjlXIQqu-MCqzW9GZ3S82YaBKRzhEUIAh4I/edit',
      'Wilson': 'https://docs.google.com/spreadsheets/d/1Fq-nA7CI076Ao75FiGO4CsBeSOUT7hfqSPipZ0tpetg/edit'
    };

    const sheetUrl = staticSheets[station] || staticSheets['Mab-Met'];
    
    res.json({
      success: true,
      station: station,
      sheetType: 'FORM446',
      sheetId: '1AOVxn1lbp7qRuz5aocKgmxxzJAjcoXsmy7zYXI_JRxg',
      sheetUrl: sheetUrl,
      message: 'Using template sheet'
    });
    
  } catch (error) {
    console.error('Error in FORM446 endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// Get station-specific WEATHER SUMMARY
app.get('/api/sheets/wxsummary', async (req, res) => {
  try {
    const { station } = req.query;
    
    if (!station) {
      return res.status(400).json({ error: 'Station parameter is required' });
    }
    
    console.log(`Fetching weather summary for station: ${station}`);

        // Using static template
    const staticSheets = {
      'Mab-Met': 'https://docs.google.com/document/d/1kdLVF1bvKzFfRLVwMg5_Owl8IkpC2M3YkUgB5KzzrXM/edit',
      'Dagoretti': 'https://docs.google.com/document/d/1q3Yy5YVWX-2tLKESm9rJBzwjXz8KRkeEHFclrg7G0b4/edit',
      'JKIA': 'https://docs.google.com/document/d/16e-Z97HWRPyaTbdNUbgcv6cRcgpHcJYef7KX0OVkHVo/edit',
      'Wilson': 'https://docs.google.com/document/d/1lah_FXTdp2bfVRI_cFBnIDGMscivouPkskWGKd4aS60/edit'
    };

    const sheetUrl = staticSheets[station] || staticSheets['Mab-Met'];
    
    res.json({
      success: true,
      station: station,
      sheetType: 'WX_SUMMARY',
      sheetId: '1kdLVF1bvKzFfRLVwMg5_Owl8IkpC2M3YkUgB5KzzrXM',
      sheetUrl: sheetUrl,
      message: 'Using template sheet'
    });
    
  } catch (error) {
    console.error('Error in WX SUMMARY endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
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

//sending report via email USING SENDGRID
/*
app.post('/api/send-report', async (req, res) => {
  try {
    const { to, subject, content } = req.body;
    
    const msg = {
      to: to,
      from: process.env.EMAIL_USER2,
      subject: subject,
      text: content,
      html: `<pre>${content}</pre>`,
    };

    await sgMail.send(msg);
    res.json({ success: true, message: 'Report sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error sending report'
    });
  }
});*/

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
