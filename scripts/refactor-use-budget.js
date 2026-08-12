const fs = require('fs');
const path = require('path');

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      processFile(fullPath);
    }
  }
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Regex to match: const { a, b, c } = useBudget();
  // Also handles multi-line destructuring
  const regex = /const\s*\{\s*([^}]+)\s*\}\s*=\s*useBudget\(\s*\);/g;
  
  if (!content.includes('useBudget')) return;

  // Skip the provider itself
  if (filePath.includes('budget-provider.tsx') || filePath.includes('store.ts')) return;

  const newContent = content.replace(regex, (match, inner) => {
    changed = true;
    const vars = inner.split(',').map(s => s.trim()).filter(s => s.length > 0);
    
    // We want to generate: s => ({ a: s.a, b: s.b })
    const mapping = vars.map(v => {
      // Handle aliases like: a: aliasA
      if (v.includes(':')) {
         const [key, alias] = v.split(':').map(x => x.trim());
         return `${key}: s.${key}`;
      }
      return `${v}: s.${v}`;
    }).join(', ');

    return `const { ${inner} } = useBudget(useShallow((s) => ({ ${mapping} })));`;
  });

  if (changed) {
    // Add import { useShallow } from 'zustand/react/shallow';
    if (!newContent.includes('zustand/react/shallow')) {
      // Find last import
      const lastImportIndex = newContent.lastIndexOf('import ');
      if (lastImportIndex !== -1) {
        const endOfLine = newContent.indexOf('\n', lastImportIndex);
        content = newContent.slice(0, endOfLine + 1) + 'import { useShallow } from "zustand/react/shallow";\n' + newContent.slice(endOfLine + 1);
      } else {
        content = 'import { useShallow } from "zustand/react/shallow";\n' + newContent;
      }
    } else {
      content = newContent;
    }
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Refactored:', filePath);
  }
}

const targetDir = path.join(__dirname, '../src');
processDirectory(targetDir);
