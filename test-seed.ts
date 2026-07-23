require('dotenv').config({ path: '.env.local' });
const { seedDemo } = require('./src/lib/demo-seed'); // Note: demo-seed is TS, I can't require it directly without ts-node.

// Better to write a small TS file and run it with npx tsx
