const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Test MongoDB connection
async function testMongoDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected successfully');
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    return false;
  }
}

// Test Azure Storage
async function testAzureStorage() {
  try {
    const { BlobServiceClient } = require('@azure/storage-blob');
    const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
    await blobServiceClient.getAccountInfo();
    console.log('✅ Azure Storage connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Azure Storage connection failed:', error.message);
    return false;
  }
}

// Test Firebase
async function testFirebase() {
  try {
    const admin = require('firebase-admin');
    const serviceAccount = require('./config/firebase-service-account.json');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log('✅ Firebase Admin SDK initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Firebase connection failed:', error.message);
    return false;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test endpoints
app.get('/test/mongodb', async (req, res) => {
  const isConnected = await testMongoDB();
  res.json({
    mongodb: isConnected ? 'connected' : 'failed',
    uri: process.env.MONGODB_URI ? 'configured' : 'missing'
  });
});

app.get('/test/azure-storage', async (req, res) => {
  const isConnected = await testAzureStorage();
  res.json({
    azureStorage: isConnected ? 'connected' : 'failed',
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING ? 'configured' : 'missing'
  });
});

app.get('/test/firebase', async (req, res) => {
  const isConnected = await testFirebase();
  res.json({
    firebase: isConnected ? 'connected' : 'failed',
    projectId: process.env.FIREBASE_PROJECT_ID || 'missing'
  });
});

// Test all services
app.get('/test/all', async (req, res) => {
  const results = {
    mongodb: await testMongoDB(),
    azureStorage: await testAzureStorage(),
    firebase: await testFirebase(),
    environment: process.env.NODE_ENV || 'development',
    port: PORT
  };
  
  res.json(results);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Test server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test endpoints:`);
  console.log(`   - http://localhost:${PORT}/test/mongodb`);
  console.log(`   - http://localhost:${PORT}/test/azure-storage`);
  console.log(`   - http://localhost:${PORT}/test/firebase`);
  console.log(`   - http://localhost:${PORT}/test/all`);
});
