// This script clones the production database to the test database
// Run this script manually when needed

// Antarin Ghosal has hosted the test database on MongoDB Atlas
// But in future due to any reason if the test database is deleted or 
// the test database is not accessible then we can use this script to clone the production database to the test database

// To run this script, run the following command:
// npm run clone
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

async function cloneDatabase() {
  // 1. Load URIs from .env and .env.test manually to avoid collisions
  const getUri = (fileName) => {
    const filePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) {
      console.error(`Error: ${fileName} file not found at ${filePath}`);
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/^MONGODB_URI=(.+)$/m);
    return match ? match[1].trim() : null;
  };

  const prodUri = getUri('.env');
  const testUri = getUri('.env.test');

  if (!prodUri || !testUri) {
    console.error('Error: Please ensure both .env and .env.test have MONGODB_URI set.');
    process.exit(1);
  }

  if (prodUri === testUri) {
    console.error('Error: Production URI and Test URI are the same! Aborting to prevent data loss.');
    process.exit(1);
  }

  console.log('--- Database Clone Started ---');
  console.log('Reading from .env and writing to .env.test...');

  try {
    // 2. Connect to both databases
    const sourceConn = await mongoose.createConnection(prodUri).asPromise();
    const targetConn = await mongoose.createConnection(testUri).asPromise();

    console.log('Connected to both databases.');

    // 3. Get collections
    const collections = await sourceConn.db.listCollections().toArray();
    console.log(`Found ${collections.length} collections.`);

    for (const col of collections) {
      const name = col.name;
      
      // Skip system collections
      if (name.startsWith('system.')) continue;

      console.log(`Cloning collection: ${name}...`);

      // Clear target collection first
      await targetConn.db.collection(name).deleteMany({});

      // Get data from source
      const data = await sourceConn.db.collection(name).find({}).toArray();

      if (data.length > 0) {
        // Insert into target
        await targetConn.db.collection(name).insertMany(data);
        console.log(`  Successfully copied ${data.length} documents.`);
      } else {
        console.log(`  Collection ${name} is empty, skipping data copy.`);
      }
    }

    console.log('\n--- Clone Completed Successfully ---');
    
    await sourceConn.close();
    await targetConn.close();
    process.exit(0);
  } catch (error) {
    console.error('\nAn error occurred during cloning:');
    console.error(error);
    process.exit(1);
  }
}

cloneDatabase();
