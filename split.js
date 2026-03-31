const fs = require('fs');

const code = fs.readFileSync('c:\\Users\\Maxime\\Outils_Elus\\app.js', 'utf8');

const s1_state = `// --- state.js ---
${code.substring(code.indexOf('// --- CONFIG SUPABASE ---'), code.indexOf('// --- MINIMAL ROUTER ---'))}
// FIN STATE
`;

const s_router = `// --- app.js (router) ---
${code.substring(code.indexOf('// --- MINIMAL ROUTER ---'), code.indexOf('// --- RENDER ENGINE ---'))}
// FIN ROUTER
`;

console.log("Length: " + code.length);
