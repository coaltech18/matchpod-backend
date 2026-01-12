/**
 * Seed Script: Fake Users for MatchPod Beta
 * 
 * Creates 30 realistic fake users for demo/testing purposes.
 * - 15 seeking_room users
 * - 15 has_room users
 * - All in Bengaluru
 * - Fully onboarded, ready to appear in matches
 * 
 * Usage: npm run seed:beta
 * 
 * This script is IDEMPOTENT - running it multiple times won't create duplicates.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { UserModel } from '../src/models/User';

// ============================================================================
// Configuration
// ============================================================================

const MONGODB_URI = process.env.MONGODB_URI || '';

if (!MONGODB_URI) {
    console.error('❌ Missing MONGODB_URI. Please set it in .env');
    process.exit(1);
}

// Demo photo URLs - rotated among users
const DEMO_PHOTO_POOL = [
    'https://cdn.matchpod.app/demo/user1.jpg',
    'https://cdn.matchpod.app/demo/user2.jpg',
    'https://cdn.matchpod.app/demo/user3.jpg',
    'https://cdn.matchpod.app/demo/user4.jpg',
    'https://cdn.matchpod.app/demo/user5.jpg',
    'https://cdn.matchpod.app/demo/user6.jpg',
];

// Bengaluru areas with coordinates (approximate)
const BENGALURU_AREAS = [
    { name: 'Koramangala', lat: 12.9352, lng: 77.6245 },
    { name: 'HSR Layout', lat: 12.9116, lng: 77.6389 },
    { name: 'Indiranagar', lat: 12.9784, lng: 77.6408 },
    { name: 'Whitefield', lat: 12.9698, lng: 77.7500 },
    { name: 'Electronic City', lat: 12.8399, lng: 77.6770 },
    { name: 'BTM Layout', lat: 12.9166, lng: 77.6101 },
    { name: 'Marathahalli', lat: 12.9591, lng: 77.7010 },
    { name: 'JP Nagar', lat: 12.9063, lng: 77.5857 },
    { name: 'Bellandur', lat: 12.9260, lng: 77.6762 },
    { name: 'Sarjapur', lat: 12.8674, lng: 77.7870 },
];

// Realistic Indian names
const MALE_NAMES = [
    'Arjun Sharma', 'Rahul Verma', 'Aditya Reddy', 'Vikram Menon',
    'Rohan Patel', 'Karthik Iyer', 'Siddharth Nair', 'Aman Gupta',
    'Varun Krishnan', 'Nikhil Rao', 'Pranav Hegde', 'Akash Joshi',
    'Ankit Mehta', 'Shreyas Kumar', 'Ravi Shankar',
];

const FEMALE_NAMES = [
    'Priya Sharma', 'Sneha Reddy', 'Divya Menon', 'Ananya Patel',
    'Kavya Iyer', 'Pooja Nair', 'Megha Gupta', 'Riya Krishnan',
    'Neha Rao', 'Swati Hegde', 'Anjali Joshi', 'Kritika Mehta',
    'Tanvi Kumar', 'Shreya Shankar', 'Deepika Verma',
];

// Occupations
const OCCUPATIONS = [
    'Software Engineer', 'Product Manager', 'Data Analyst', 'UX Designer',
    'Marketing Manager', 'Business Analyst', 'DevOps Engineer', 'Frontend Developer',
    'Backend Developer', 'Full Stack Developer', 'QA Engineer', 'Technical Writer',
    'Consultant', 'Startup Founder', 'Freelancer',
];

// Interests pool
const INTERESTS_POOL = [
    'gaming', 'fitness', 'music', 'movies', 'cooking',
    'reading', 'travel', 'photography', 'art', 'sports',
    'yoga', 'hiking', 'netflix', 'boardgames', 'coffee',
];

// Bio templates
const BIO_TEMPLATES = [
    "Hey! I'm a {occupation} who loves {interest1} and {interest2}. Looking for a chill roommate who respects personal space. 🏠",
    "{occupation} by day, {interest1} enthusiast by night. I'm clean, quiet, and always up for a good conversation over chai. ☕",
    "Just moved to Bengaluru for work. I'm into {interest1}, {interest2}, and good food. Let's make this place feel like home! 🌟",
    "Work hard, play harder! {occupation} who enjoys {interest1} on weekends. Looking for someone easygoing and fun. 😊",
    "Passionate about {interest1} and {interest2}. I'm organized, respectful, and believe in good vibes only. 🙌",
    "🎯 {occupation} | 🏃 {interest1} | 🎵 {interest2} - Looking for a like-minded roommate in Bengaluru!",
];

// ============================================================================
// Helper Functions
// ============================================================================

function randomElement<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomElements<T>(arr: T[], count: number): T[] {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomBool(probability = 0.5): boolean {
    return Math.random() < probability;
}

function generatePhoneNumber(index: number): string {
    // Generate unique fake phone numbers starting with +91 9XXXXXXXXX
    const prefix = '+91';
    const suffix = String(9000000000 + index + 100).padStart(10, '0');
    return `${prefix}${suffix}`;
}

function generateEmail(name: string, index: number): string {
    const sanitizedName = name.toLowerCase().replace(/\s+/g, '.');
    return `${sanitizedName}.fake${index}@matchpod.demo`;
}

function getPhotosForUser(index: number): string[] {
    // Rotate through photo pool, always return 3 unique photos
    const offset = index % DEMO_PHOTO_POOL.length;
    return [
        DEMO_PHOTO_POOL[offset % DEMO_PHOTO_POOL.length],
        DEMO_PHOTO_POOL[(offset + 1) % DEMO_PHOTO_POOL.length],
        DEMO_PHOTO_POOL[(offset + 2) % DEMO_PHOTO_POOL.length],
    ];
}

function generateBio(occupation: string, interests: string[]): string {
    const template = randomElement(BIO_TEMPLATES);
    return template
        .replace('{occupation}', occupation)
        .replace('{interest1}', interests[0] || 'coffee')
        .replace('{interest2}', interests[1] || 'music');
}

function generateBudget(): { min: number; max: number } {
    // Realistic Bengaluru rent ranges
    const minOptions = [10000, 12000, 14000, 15000, 18000, 20000];
    const min = randomElement(minOptions);
    const maxRange = [min + 5000, min + 8000, min + 10000, min + 12000];
    const max = Math.min(randomElement(maxRange), 35000);
    return { min, max };
}

// ============================================================================
// User Generation
// ============================================================================

interface FakeUserData {
    phoneNumber: string;
    name: string;
    email: string;
    age: number;
    gender: 'male' | 'female';
    role: 'seeking_room' | 'has_room';
    city: string;
    occupation: string;
    bio: string;
    budget: { min: number; max: number };
    timeline: 'immediately' | 'soon' | 'flexible';
    lifestyle: {
        smoking: boolean;
        pets: boolean;
        nightOwl: boolean;
        cleanliness: number;
    };
    interests: string[];
    photos: string[];
    photoUrls: string[];
    location: {
        type: 'Point';
        coordinates: [number, number];
    };
    preferences: {
        ageRange: { min: number; max: number };
        distance: number;
        gender: ('male' | 'female' | 'other')[];
    };
    isProfileComplete: boolean;
    isActive: boolean;
    onboardingCompleted: boolean;
    isFake: boolean;
    lastActive: Date;
}

function generateFakeUser(index: number, role: 'seeking_room' | 'has_room'): FakeUserData {
    // Alternate genders
    const isMale = index % 2 === 0;
    const name = isMale ? randomElement(MALE_NAMES) : randomElement(FEMALE_NAMES);
    const gender: 'male' | 'female' = isMale ? 'male' : 'female';

    const occupation = randomElement(OCCUPATIONS);
    const interests = randomElements(INTERESTS_POOL, randomInt(3, 6));
    const area = randomElement(BENGALURU_AREAS);
    const photos = getPhotosForUser(index);

    // Add slight randomness to coordinates (within ~1km)
    const latOffset = (Math.random() - 0.5) * 0.02;
    const lngOffset = (Math.random() - 0.5) * 0.02;

    return {
        phoneNumber: generatePhoneNumber(index),
        name,
        email: generateEmail(name, index),
        age: randomInt(21, 35),
        gender,
        role,
        city: 'Bengaluru',
        occupation,
        bio: generateBio(occupation, interests),
        budget: generateBudget(),
        timeline: randomElement(['immediately', 'soon', 'flexible'] as const),
        lifestyle: {
            smoking: randomBool(0.15), // 15% smokers
            pets: randomBool(0.25),     // 25% have pets
            nightOwl: randomBool(0.4),  // 40% night owls
            cleanliness: randomInt(2, 5),
        },
        interests,
        photos,
        photoUrls: photos,
        location: {
            type: 'Point',
            coordinates: [area.lng + lngOffset, area.lat + latOffset], // [longitude, latitude]
        },
        preferences: {
            ageRange: { min: 18, max: 45 },
            distance: 50,
            gender: ['male', 'female', 'other'],
        },
        isProfileComplete: true,
        isActive: true,
        onboardingCompleted: true,
        isFake: true,
        lastActive: new Date(Date.now() - randomInt(0, 7 * 24 * 60 * 60 * 1000)), // Within last week
    };
}

// ============================================================================
// Main Seed Function
// ============================================================================

async function seedFakeUsers() {
    console.log('\n🌱 MatchPod Beta User Seeding Script');
    console.log('═'.repeat(60));

    try {
        // Connect to MongoDB
        console.log('\n📡 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Check for existing fake users
        const existingFakeUsers = await UserModel.countDocuments({ isFake: true });

        if (existingFakeUsers > 0) {
            console.log(`⚠️  Found ${existingFakeUsers} existing fake users.`);
            console.log('   Skipping seed to maintain idempotency.');
            console.log('   To reseed, first run: db.users.deleteMany({ isFake: true })\n');

            // Show summary of existing fake users
            const byRole = await UserModel.aggregate([
                { $match: { isFake: true } },
                { $group: { _id: '$role', count: { $sum: 1 } } },
            ]);

            console.log('📊 Existing Fake Users by Role:');
            byRole.forEach(r => {
                console.log(`   • ${r._id}: ${r.count}`);
            });

            return {
                created: 0,
                skipped: existingFakeUsers,
                total: existingFakeUsers,
            };
        }

        // Generate 30 fake users
        console.log('🔄 Generating 30 fake users...\n');

        const seekingRoomUsers: FakeUserData[] = [];
        const hasRoomUsers: FakeUserData[] = [];

        // Generate 15 seeking_room users
        for (let i = 0; i < 15; i++) {
            seekingRoomUsers.push(generateFakeUser(i, 'seeking_room'));
        }

        // Generate 15 has_room users
        for (let i = 0; i < 15; i++) {
            hasRoomUsers.push(generateFakeUser(i + 15, 'has_room'));
        }

        const allUsers = [...seekingRoomUsers, ...hasRoomUsers];

        // Insert users
        console.log('💾 Inserting users into database...\n');
        const result = await UserModel.insertMany(allUsers, { ordered: false });

        // Summary
        console.log('═'.repeat(60));
        console.log('✅ SEED COMPLETED SUCCESSFULLY\n');
        console.log('📊 Summary:');
        console.log(`   • Total users created: ${result.length}`);
        console.log(`   • seeking_room: 15`);
        console.log(`   • has_room: 15`);
        console.log(`   • City: Bengaluru`);
        console.log(`   • Photos per user: 3\n`);

        // Sample user preview
        console.log('👤 Sample User Preview:');
        const sample = allUsers[0];
        console.log(`   Name: ${sample.name}`);
        console.log(`   Age: ${sample.age}`);
        console.log(`   Role: ${sample.role}`);
        console.log(`   Occupation: ${sample.occupation}`);
        console.log(`   Budget: ₹${sample.budget.min.toLocaleString()} - ₹${sample.budget.max.toLocaleString()}`);
        console.log(`   Timeline: ${sample.timeline}`);
        console.log(`   Interests: ${sample.interests.join(', ')}`);
        console.log('');

        return {
            created: result.length,
            skipped: 0,
            total: result.length,
        };

    } catch (error: any) {
        if (error.code === 11000) {
            console.error('❌ Duplicate key error. Some users may already exist.');
            console.error('   Run: db.users.deleteMany({ isFake: true }) to clean up.');
        } else {
            console.error('❌ Error seeding users:', error.message);
        }
        throw error;
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Disconnected from MongoDB\n');
    }
}

// ============================================================================
// Run Script
// ============================================================================

seedFakeUsers()
    .then((result) => {
        console.log('🎉 Seeding complete!');
        console.log(`   Created: ${result.created}`);
        console.log(`   Skipped: ${result.skipped}`);
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Seeding failed:', error.message);
        process.exit(1);
    });
