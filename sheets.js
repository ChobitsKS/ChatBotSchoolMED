const { google } = require('googleapis');
const path = require('path');
require('dotenv').config();

// Initialize the sheets API
const getSheetsService = () => {
  let authOptions = {
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  };

  // Option 1: Load from Environment Variable (Best for Render/Cloud)
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    try {
      authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    } catch (e) {
      console.error('Failed to parse GOOGLE_CREDENTIALS_JSON');
    }
  }
  // Option 2: Load from File (Best for Local)
  else {
    authOptions.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'credentials.json');
  }

  const auth = new google.auth.GoogleAuth(authOptions);

  return google.sheets({ version: 'v4', auth });
};

async function findAnswerInSheet(query) {
  try {
    const sheets = getSheetsService();
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const range = 'Sheet1!A:B'; // Assuming Question in A, Answer in B

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return null;
    }

    // Simple keyword search
    // In a real app, you might want more sophisticated matching (fuzzy search, etc.)
    const lowerQuery = query.toLowerCase();

    // Skip header row if exists (optional logic, usually row 0 is header)
    const dataRows = rows.slice(1);

    const match = dataRows.find(row => {
      const question = row[0] ? row[0].toString().toLowerCase() : '';
      return question.includes(lowerQuery) || lowerQuery.includes(question);
    });

    if (match && match[1]) {
      return match[1];
    }

    return null;

  } catch (error) {
    console.error('The API returned an error: ' + error);
    throw error;
  }
}

module.exports = {
  findAnswerInSheet
};
