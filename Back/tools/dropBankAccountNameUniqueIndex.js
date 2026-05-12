/**
 * One-time: removes the legacy unique index on bankaccounts.name after the schema
 * no longer marks `name` as unique. Run from Back/: `npm run db:drop-bank-name-unique`
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
}

await mongoose.connect(uri);
try {
    const coll = mongoose.connection.collection('bankaccounts');
    await coll.dropIndex('name_1');
    console.log('Dropped index bankaccounts.name_1');
} catch (e) {
    const msg = String(e.message || e);
    if (/index not found|ns not found/i.test(msg) || e?.code === 27 || e?.codeName === 'IndexNotFound') {
        console.log('Index name_1 already absent — nothing to do.');
    } else {
        console.error(e);
        process.exitCode = 1;
    }
} finally {
    await mongoose.disconnect();
}
