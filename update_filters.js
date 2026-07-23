const fs = require('fs');
const files = [
  'src/app/(auth)/dashboard/page.tsx',
  'src/app/(auth)/do-akceptacji/page.tsx',
  'src/app/(auth)/faktury/page.tsx',
  'src/app/(auth)/klienci/page.tsx',
  'src/app/(auth)/logs/page.tsx',
  'src/app/actions/search.ts'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // Replace getAllowedNips destructuring
  content = content.replace(
    /const \{ nips, (isAdmin, )?ryczaltNips \} = await getAllowedNips\(\)/g,
    'const { nips, isAdmin, ryczaltNips, demoNips } = await getAllowedNips()'
  );

  // Replace applyNipFilter calls
  content = content.replace(
    /applyNipFilter\(([^,]+),\s*nips,\s*('[^']+'|"[^"]+"),\s*ryczaltNips\)/g,
    'applyNipFilter($1, nips, $2, ryczaltNips, demoNips, isAdmin)'
  );
  
  fs.writeFileSync(file, content, 'utf8');
  console.log('Updated ' + file);
});
