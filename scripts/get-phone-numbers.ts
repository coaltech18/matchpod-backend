import 'dotenv/config';
import mongoose from 'mongoose';
import { UserModel } from '../src/models/User';

const MONGODB_URI = process.env.MONGODB_URI || '';

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI. Please set it in .env');
  process.exit(1);
}

async function getPhoneNumbers() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Fetch all users with phone numbers
    const users = await UserModel.find(
      { phone: { $exists: true, $ne: null } },
      { phone: 1, name: 1, email: 1, role: 1, _id: 1 }
    ).lean();

    console.log(`Found ${users.length} users with phone numbers:\n`);
    console.log('═'.repeat(80));
    
    users.forEach((user, index) => {
      console.log(`${index + 1}. Phone: ${user.phone}`);
      console.log(`   Name: ${user.name || 'N/A'}`);
      console.log(`   Email: ${user.email || 'N/A'}`);
      console.log(`   Role: ${user.role || 'N/A'}`);
      console.log(`   ID: ${user._id}`);
      console.log('─'.repeat(80));
    });

    // Also show just phone numbers for easy copying
    console.log('\n📱 Phone Numbers Only:');
    console.log('═'.repeat(80));
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.phone}`);
    });

    console.log(`\n✅ Total: ${users.length} phone numbers`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

getPhoneNumbers();

