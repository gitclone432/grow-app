import mongoose from 'mongoose';
import BankAccount from '../models/BankAccount.js';

/** Drop legacy DB indexes that no longer match the schema (e.g. unique `name` on bankaccounts). */
async function reconcileModelIndexes() {
    try {
        await BankAccount.syncIndexes();
    } catch (e) {
        console.error('[db] BankAccount.syncIndexes failed:', e?.message || e);
    }
}

export async function connectToDatabase() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not set');
    await mongoose.connect(uri, {
        autoIndex: true,
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 45000,
        maxPoolSize: 20,
    });
    await reconcileModelIndexes();
    return mongoose.connection;
}


