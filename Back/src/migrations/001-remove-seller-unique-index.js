/**
 * Migration: Remove unique index from seller field in UserSellerAssignment
 * 
 * Purpose: Allow many-to-many relationships where one seller can be assigned to multiple users
 * 
 * Before: seller field had unique: true (one seller -> one user)
 * After: seller field has no unique constraint, compound index on (user, seller) prevents duplicates
 * 
 * Run this migration ONCE after deploying the code changes to UserSellerAssignment model
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory of this file and navigate to server root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverRoot = join(__dirname, '..', '..');

// Load .env from server root directory
dotenv.config({ path: join(serverRoot, '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ Error: MONGODB_URI not found in .env file');
    console.error('Please make sure you have a .env file in the server directory with MONGODB_URI defined');
    process.exit(1);
}

async function runMigration() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected successfully');

        const db = mongoose.connection.db;
        const collectionName = 'usersellerassignments';

        // Check if collection exists
        const collections = await db.listCollections({ name: collectionName }).toArray();
        
        if (collections.length === 0) {
            console.log('\n⚠️  Collection "usersellerassignments" does not exist yet.');
            console.log('This is normal if no user-seller assignments have been created.');
            console.log('\n✅ No migration needed - when the collection is created, it will use the new schema with compound index.');
            console.log('You can now safely use the User-Seller Assignment feature.');
            return;
        }

        const collection = db.collection(collectionName);

        console.log('\n=== Checking existing indexes ===');
        const indexes = await collection.indexes();
        console.log('Current indexes:', JSON.stringify(indexes, null, 2));

        // Check if the old seller_1 unique index exists
        const sellerIndexExists = indexes.some(idx => idx.name === 'seller_1');

        if (sellerIndexExists) {
            console.log('\n=== Dropping unique index on seller field ===');
            await collection.dropIndex('seller_1');
            console.log('✓ Successfully dropped seller_1 index');
        } else {
            console.log('\n✓ seller_1 index does not exist (may have already been removed)');
        }

        // Check if compound index exists
        const compoundIndexExists = indexes.some(idx => 
            idx.name === 'user_1_seller_1' || 
            (idx.key.user === 1 && idx.key.seller === 1)
        );

        if (!compoundIndexExists) {
            console.log('\n=== Creating compound unique index on (user, seller) ===');
            await collection.createIndex(
                { user: 1, seller: 1 },
                { unique: true, name: 'user_1_seller_1' }
            );
            console.log('✓ Successfully created compound index user_1_seller_1');
        } else {
            console.log('\n✓ Compound index on (user, seller) already exists');
        }

        console.log('\n=== Final index state ===');
        const finalIndexes = await collection.indexes();
        console.log('Final indexes:', JSON.stringify(finalIndexes, null, 2));

        console.log('\n✅ Migration completed successfully!');
        console.log('You can now assign the same seller to multiple users.');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('\nDatabase connection closed');
        process.exit(0);
    }
}

runMigration();
