import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aaqjekyrgboqhrlgcgqg.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhcWpla3lyZ2JvcWhybGdjZ3FnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDYwMzg1NCwiZXhwIjoyMTA2MTc5ODU0fQ.Cp8mqGckZwLuM9cDQwMufZcDXrQEqfAcnmSLvbwjdPc';

async function setupBuckets() {
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('Setting up private storage buckets...');
  const buckets = [
    {
      id: 'inspection-evidence',
      public: false,
      fileSizeLimit: 52428800, // 50MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    },
    {
      id: 'inspection-analysis',
      public: false,
      fileSizeLimit: 20971520, // 20MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    },
    {
      id: 'product-reference-images',
      public: false,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    },
  ];

  for (const b of buckets) {
    const { data, error } = await client.storage.createBucket(b.id, {
      public: b.public,
      fileSizeLimit: b.fileSizeLimit,
      allowedMimeTypes: b.allowedMimeTypes,
    });

    if (error) {
      if (error.message.includes('already exists')) {
        console.log(`  [✓ ALREADY EXISTS] Bucket: ${b.id}`);
      } else {
        console.log(`  [✗ ERROR] Bucket ${b.id}:`, error.message);
      }
    } else {
      console.log(`  [✓ CREATED] Bucket: ${b.id}`);
    }
  }

  // Verify
  const { data: list } = await client.storage.listBuckets();
  console.log('\nCurrent buckets in project:');
  for (const b of list || []) {
    console.log(`  - ${b.id} (public: ${b.public})`);
  }
}

setupBuckets();
