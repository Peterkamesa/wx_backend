// generate-token.js
require('dotenv').config(); // Load environment variables
const { google } = require('googleapis');
const readline = require('readline');

// Verify environment variables
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('❌ Missing required environment variables:');
    console.error('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? '✓ Set' : '✗ Missing');
    console.error('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? '✓ Set' : '✗ Missing');
    process.exit(1);
}

const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback'
);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function getRefreshToken() {
    try {
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/gmail.send'],
            prompt: 'consent' // Force consent screen to ensure refresh token
        });

        console.log('✅ Authorization URL generated successfully!');
        console.log('\n🔗 Authorize this app by visiting this URL:');
        console.log(authUrl);
        console.log('\n');

        rl.question('Enter the authorization code from the URL: ', async (code) => {
            try {
                const { tokens } = await oAuth2Client.getToken(code.trim());
                
                console.log('\n✅ Tokens generated successfully!');
                console.log('\n📋 Add these to your .env file:');
                console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
                console.log(`GOOGLE_ACCESS_TOKEN=${tokens.access_token}`);
                
                if (tokens.refresh_token) {
                    console.log('\n💡 Refresh token is available!');
                } else {
                    console.log('\n⚠️  No refresh token received. You may need to re-authenticate.');
                }
                
                rl.close();
            } catch (error) {
                console.error('❌ Error exchanging code for tokens:', error.message);
                rl.close();
            }
        });
    } catch (error) {
        console.error('❌ Error generating auth URL:', error.message);
        rl.close();
    }
}

getRefreshToken();